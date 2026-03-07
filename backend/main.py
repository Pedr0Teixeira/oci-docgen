# ==============================================================================
# PT-BR: Servidor FastAPI da aplicação OCI DocGen.
#        Expõe endpoints REST para listagem de regiões/compartimentos,
#        início de coletas assíncronas e geração de documentos .docx.
# EN: FastAPI server for the OCI DocGen application.
#     Exposes REST endpoints for listing regions/compartments,
#     starting asynchronous collections, and generating .docx documents.
# ==============================================================================

import json
import logging
import os
import traceback
from typing import List

from celery.result import AsyncResult
from fastapi import Body, FastAPI, File, Form, HTTPException, Response, UploadFile
from fastapi.middleware.cors import CORSMiddleware

import doc_generator
import oci_connector
from celery_worker import (
    celery_app,
    collect_full_infrastructure_task,
    collect_new_host_task,
    collect_waf_report_task,
)
from schemas import GenerateDocRequest, TaskCreationResponse, TaskStatusResponse

logging.basicConfig(level=logging.INFO)


# ==============================================================================
# PT-BR: Configuração da aplicação FastAPI e middleware CORS.
#        CORS permite que o frontend em localhost acesse a API local.
# EN: FastAPI application configuration and CORS middleware setup.
#     CORS allows the localhost frontend to access the local API.
# ==============================================================================

app = FastAPI(
    title="OCI DocGen API",
    version="2.2.0",
    description="API para automatizar a coleta de dados da OCI e gerar documentação de infraestrutura.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost",
        "http://localhost:5500",
        "http://127.0.0.1:5500",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ==============================================================================
# PT-BR: Endpoints de Consulta (GET) — Regiões, Compartimentos e Instâncias
# EN: Query Endpoints (GET) — Regions, Compartments, and Instances
# ==============================================================================

@app.get("/api/regions", summary="Listar Regiões Disponíveis")
async def get_regions():
    """
    PT-BR: Retorna todas as regiões OCI disponíveis para o tenancy autenticado.
    EN: Returns all OCI regions available for the authenticated tenancy.
    """
    return oci_connector.list_regions()


@app.get("/api/{region}/compartments", summary="Listar Compartimentos em uma Região")
async def get_compartments(region: str):
    """
    PT-BR: Retorna todos os compartimentos do tenancy em estrutura hierárquica.
    EN: Returns all compartments in the tenancy as a hierarchical structure.
    """
    return oci_connector.list_compartments(region)


@app.get("/api/{region}/instances/{compartment_id}", summary="Listar Instâncias em um Compartimento")
async def get_instances(region: str, compartment_id: str):
    """
    PT-BR: Retorna todas as instâncias (running/stopped) de um compartimento.
    EN: Returns all instances (running/stopped) within a specific compartment.
    """
    return oci_connector.list_instances_in_compartment(region, compartment_id)


# ==============================================================================
# PT-BR: Endpoint de Início de Coleta Assíncrona
# EN: Asynchronous Collection Start Endpoint
# ==============================================================================

@app.post(
    "/api/start-collection",
    status_code=202,
    response_model=TaskCreationResponse,
    summary="Iniciar Coleta de Dados em Background",
)
async def start_data_collection(payload: dict = Body(...)):
    """
    PT-BR: Inicia uma tarefa Celery de coleta de dados em background.
           Retorna um task_id para polling de status. Suporta três tipos:
           - full_infra: coleta completa de infraestrutura
           - new_host: coleta de instâncias específicas
           - waf_report: coleta de políticas WAF e recursos associados
    EN: Starts a background Celery data collection task.
        Returns a task_id for status polling. Supports three types:
        - full_infra: full infrastructure collection
        - new_host: specific instance collection
        - waf_report: WAF policy and associated resources collection
    """
    collection_type = payload.get("type")
    doc_type = payload.get("doc_type")
    region = payload.get("region")

    if not all([collection_type, doc_type, region]):
        raise HTTPException(
            status_code=400,
            detail="Missing required fields: 'type', 'doc_type', or 'region'.",
        )

    try:
        if collection_type == "full_infra":
            compartment_id = payload.get("compartment_id")
            if not compartment_id:
                raise HTTPException(status_code=400, detail="Missing 'compartment_id' for full_infra.")
            task = collect_full_infrastructure_task.delay(region, compartment_id, doc_type)

        elif collection_type == "new_host":
            details = payload.get("details")
            if not details:
                raise HTTPException(status_code=400, detail="Missing 'details' for new_host.")
            task = collect_new_host_task.delay(region, details, doc_type)

        elif collection_type == "waf_report":
            compartment_id = payload.get("compartment_id")
            compartment_name = payload.get("compartment_name", "N/A")
            if not compartment_id:
                raise HTTPException(status_code=400, detail="Missing 'compartment_id' for waf_report.")
            task = collect_waf_report_task.delay(region, compartment_id, compartment_name)

        else:
            raise HTTPException(status_code=400, detail=f"Invalid collection type: {collection_type}")

        return {"task_id": task.id}

    except HTTPException:
        raise
    except Exception as exc:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Erro ao iniciar a tarefa: {exc}")


# ==============================================================================
# PT-BR: Endpoint de Verificação de Status de Tarefa
# EN: Task Status Check Endpoint
# ==============================================================================

@app.get(
    "/api/collection-status/{task_id}",
    response_model=TaskStatusResponse,
    summary="Verificar Status da Coleta",
)
async def get_collection_status(task_id: str):
    """
    PT-BR: Verifica o status de uma tarefa Celery em background.
           Retorna PENDING, PROGRESS, SUCCESS ou FAILURE com resultado/metadados.
    EN: Checks the status of a background Celery task.
        Returns PENDING, PROGRESS, SUCCESS, or FAILURE with result/metadata.
    """
    task_result = AsyncResult(task_id, app=celery_app)

    if task_result.state == "PROGRESS":
        return {"task_id": task_id, "status": "PROGRESS", "result": task_result.info}

    if task_result.state == "PENDING":
        return {"task_id": task_id, "status": "PENDING", "result": None}

    if task_result.state == "FAILURE":
        logging.error(f"Task {task_id} failed. Traceback:\n{task_result.traceback}")
        return {"task_id": task_id, "status": "FAILURE", "result": None}

    return {"task_id": task_id, "status": "SUCCESS", "result": task_result.result}


# ==============================================================================
# PT-BR: Endpoint de Geração de Documento .docx
# EN: .docx Document Generation Endpoint
# ==============================================================================

@app.post("/api/generate-document", summary="Gerar Documento de Infraestrutura")
async def create_document(
    json_data: str = Form(...),
    architecture_files: List[UploadFile] = File([]),
    antivirus_files: List[UploadFile] = File([]),
):
    """
    PT-BR: Gera um documento .docx a partir dos dados de infraestrutura coletados
           e dos arquivos de imagem opcionais (arquitetura e antivírus).
    EN: Generates a .docx document from collected infrastructure data
        and optional image files (architecture diagrams and antivirus screenshots).
    """
    logging.info("Endpoint /api/generate-document called.")
    try:
        request_data = GenerateDocRequest(**json.loads(json_data))
        architecture_bytes = [await f.read() for f in architecture_files]
        antivirus_bytes = [await f.read() for f in antivirus_files]

        file_path = doc_generator.generate_documentation(
            doc_type=request_data.doc_type,
            infra_data=request_data.infra_data,
            responsible_name=request_data.responsible_name,
            architecture_image_bytes_list=architecture_bytes,
            antivirus_image_bytes_list=antivirus_bytes,
            lang=request_data.lang,
        )

        if not os.path.exists(file_path):
            logging.error(f"Generated file not found on disk: {file_path}")
            raise HTTPException(status_code=500, detail=f"Generated file not found: {file_path}")

        with open(file_path, "rb") as fh:
            file_content = fh.read()

        return Response(
            content=file_content,
            media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            headers={"Content-Disposition": f'attachment; filename="{os.path.basename(file_path)}"'},
        )

    except HTTPException:
        raise
    except Exception as exc:
        logging.error("Exception in /api/generate-document endpoint.")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Internal error generating document: {exc}")