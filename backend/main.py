# --- Standard Library Imports ---
import json
import logging
import os
import traceback
from typing import Any, List

# --- Third-Party Imports ---
from celery.result import AsyncResult
from fastapi import Body, FastAPI, File, Form, HTTPException, Response, UploadFile
from fastapi.middleware.cors import CORSMiddleware

# --- Local Application Imports ---
import doc_generator
import oci_connector
from celery_worker import (
    celery_app,
    collect_full_infrastructure_task,
    collect_new_host_task,
)
from schemas import GenerateDocRequest, TaskCreationResponse, TaskStatusResponse

# --- Logging Configuration ---
logging.basicConfig(level=logging.INFO)

# --- FastAPI Application Configuration ---
app = FastAPI(
    title="OCI DocGen API",
    version="2.2.0",  # Version bumped for contextual progress
    description="API para automatizar a coleta de dados da OCI e gerar documentação de infraestrutura.",
)

# --- CORS (Cross-Origin Resource Sharing) Configuration ---
origins = [
    "http://localhost",
    "http://localhost:5500",
    "http://127.0.0.1:5500",
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# --- API Endpoints ---
@app.get("/api/regions", summary="Listar Regiões Disponíveis")
async def get_regions():
    """Lists all available OCI regions."""
    return oci_connector.list_regions()


@app.get("/api/{region}/compartments", summary="Listar Compartimentos em uma Região")
async def get_compartments(region: str):
    """Lists all compartments in a hierarchical structure for a given region."""
    return oci_connector.list_compartments(region)


@app.get(
    "/api/{region}/instances/{compartment_id}",
    summary="Listar Instâncias em um Compartimento",
)
async def get_instances(region: str, compartment_id: str):
    """Lists all running or stopped instances within a specific compartment."""
    return oci_connector.list_instances_in_compartment(region, compartment_id)


@app.post(
    "/api/start-collection",
    status_code=202,
    response_model=TaskCreationResponse,
    summary="Iniciar Coleta de Dados em Background",
)
async def start_data_collection(payload: dict = Body(...)):
    """
    Starts a background data collection task based on the specified type.
    Returns a task ID for status polling.
    """
    collection_type = payload.get("type")
    doc_type = payload.get("doc_type")  # Captures the document context
    region = payload.get("region")

    if not all([collection_type, doc_type, region]):
        raise HTTPException(
            status_code=400,
            detail="Missing 'type', 'doc_type', or 'region' in payload.",
        )

    try:
        if collection_type == "full_infra":
            compartment_id = payload.get("compartment_id")
            if not compartment_id:
                raise HTTPException(
                    status_code=400, detail="Missing 'compartment_id' for full_infra."
                )
            # Pass doc_type to the Celery task
            task = collect_full_infrastructure_task.delay(
                region, compartment_id, doc_type
            )
            return {"task_id": task.id}

        elif collection_type == "new_host":
            details = payload.get("details")
            if not details:
                raise HTTPException(
                    status_code=400, detail="Missing 'details' for new_host."
                )
            # Pass doc_type to the Celery task
            task = collect_new_host_task.delay(region, details, doc_type)
            return {"task_id": task.id}

        else:
            raise HTTPException(
                status_code=400, detail=f"Invalid collection type: {collection_type}"
            )

    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Erro ao iniciar a tarefa: {e}")


@app.get(
    "/api/collection-status/{task_id}",
    response_model=TaskStatusResponse,
    summary="Verificar Status da Coleta",
)
async def get_collection_status(task_id: str):
    """
    Checks the status of a background collection task.
    Returns 'PENDING', 'PROGRESS', 'SUCCESS', or 'FAILURE' and the result/meta if available.
    """
    task_result = AsyncResult(task_id, app=celery_app)

    if task_result.state == "PROGRESS":
        return {
            "task_id": task_id,
            "status": "PROGRESS",
            "result": task_result.info,
        }
    elif task_result.state == "PENDING":
        return {"task_id": task_id, "status": "PENDING", "result": None}
    elif task_result.state == "FAILURE":
        logging.error(f"Task {task_id} failed with traceback: {task_result.traceback}")
        return {"task_id": task_id, "status": "FAILURE", "result": None}

    return {
        "task_id": task_id,
        "status": "SUCCESS",
        "result": task_result.result,
    }


@app.post(
    "/api/generate-document",
    summary="Gerar Documento de Infraestrutura ou Novo Host",
)
async def create_document(
    json_data: str = Form(...),
    architecture_files: List[UploadFile] = File([]),
    antivirus_files: List[UploadFile] = File([]),
):
    """
    Generates a .docx document from the provided infrastructure data and optional image files.
    """
    logging.info("Endpoint /api/generate-document was called.")
    try:
        # --- Data Parsing and File Handling ---
        request_data = GenerateDocRequest(**json.loads(json_data))
        architecture_image_bytes_list = [await f.read() for f in architecture_files]
        antivirus_image_bytes_list = [await f.read() for f in antivirus_files]

        # --- Document Generation ---
        logging.info("Calling doc_generator.generate_documentation...")
        file_path = doc_generator.generate_documentation(
            doc_type=request_data.doc_type,
            infra_data=request_data.infra_data,
            responsible_name=request_data.responsible_name,
            architecture_image_bytes_list=architecture_image_bytes_list,
            antivirus_image_bytes_list=antivirus_image_bytes_list,
            lang=request_data.lang,
        )
        logging.info(f"doc_generator returned file path: {file_path}")

        # --- File Response Preparation ---
        if not os.path.exists(file_path):
            logging.error(
                f"CRITICAL ERROR: File {file_path} not found on disk after generation."
            )
            raise HTTPException(
                status_code=500,
                detail=f"Generated file not found on server: {file_path}",
            )

        logging.info(f"File {file_path} found. Reading content for response.")
        with open(file_path, "rb") as f:
            file_content = f.read()

        file_name = os.path.basename(file_path)
        headers = {"Content-Disposition": f'attachment; filename="{file_name}"'}

        return Response(
            content=file_content,
            media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            headers=headers,
        )

    except Exception as e:
        logging.error("An exception occurred in /api/generate-document endpoint.")
        traceback.print_exc()
        raise HTTPException(
            status_code=500, detail=f"Internal error generating document: {e}"
        )