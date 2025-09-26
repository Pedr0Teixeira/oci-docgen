# OCI DocGen
# Author: Pedro Teixeira
# Date: September 26, 2025
# Description: Main API (backend) built with FastAPI to serve OCI data and generate documents.

# --- Standard Library Imports ---
import json
import logging
import os
import traceback
from typing import List

# --- Third-Party Imports ---
from fastapi import FastAPI, File, Form, HTTPException, Response, UploadFile
from fastapi.middleware.cors import CORSMiddleware

# --- Local Application Imports ---
import doc_generator
import oci_connector
from schemas import GenerateDocRequest, InfrastructureData, NewHostRequest

# --- Logging Configuration ---
logging.basicConfig(level=logging.INFO)

# --- FastAPI Application Configuration ---
app = FastAPI(
    title="OCI DocGen API",
    version="1.6.0",
    description="API para automatizar a coleta de dados da OCI e gerar documentação de infraestrutura."
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


@app.get("/api/{region}/instances/{compartment_id}", summary="Listar Instâncias em um Compartimento")
async def get_instances(region: str, compartment_id: str):
    """Lists all running or stopped instances within a specific compartment."""
    return oci_connector.list_instances_in_compartment(region, compartment_id)


@app.post("/api/{region}/new-host-details", summary="Obter Detalhes de Instâncias Específicas e VGs Associados", response_model=InfrastructureData)
async def get_new_host_data(region: str, request: NewHostRequest):
    """
    Fetches detailed information for a specific list of instances,
    tailored for the 'New Host' documentation flow.
    """
    try:
        infra_details = oci_connector.get_new_host_details(
            region=region,
            compartment_id=request.compartment_id,
            compartment_name=request.compartment_name,
            instance_ids=request.instance_ids
        )
        return infra_details
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Erro ao buscar detalhes das instâncias: {e}")


@app.post("/api/{region}/infrastructure-details/{compartment_id}", summary="Obter Detalhes da Infraestrutura de um Compartimento", response_model=InfrastructureData)
async def get_infrastructure_data(region: str, compartment_id: str):
    """Fetches comprehensive infrastructure details from a given compartment."""
    try:
        infra_details = oci_connector.get_infrastructure_details(region, compartment_id)
        return infra_details
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Erro ao buscar detalhes da infraestrutura: {e}")


@app.post("/api/generate-document", summary="Gerar Documento de Infraestrutura ou Novo Host")
async def create_document(
    json_data: str = Form(...),
    architecture_files: List[UploadFile] = File([]),
    antivirus_files: List[UploadFile] = File([])
):
    """
    Generates a .docx document from the provided infrastructure data and optional image files.
    """
    logging.info("Endpoint /api/generate-document foi chamado.")
    try:
        # --- Data Parsing and File Handling ---
        request_data = GenerateDocRequest(**json.loads(json_data))
        architecture_image_bytes_list = [await f.read() for f in architecture_files]
        antivirus_image_bytes_list = [await f.read() for f in antivirus_files]

        # --- Document Generation ---
        logging.info("Chamando doc_generator.generate_documentation...")
        file_path = doc_generator.generate_documentation(
            doc_type=request_data.doc_type,
            infra_data=request_data.infra_data,
            responsible_name=request_data.responsible_name,
            architecture_image_bytes_list=architecture_image_bytes_list,
            antivirus_image_bytes_list=antivirus_image_bytes_list
        )
        logging.info(f"doc_generator retornou o caminho do arquivo: {file_path}")

        # --- File Response Preparation ---
        if not os.path.exists(file_path):
            logging.error(f"ERRO CRÍTICO: O arquivo {file_path} não foi encontrado no disco após a geração.")
            raise HTTPException(status_code=500, detail=f"Arquivo gerado não encontrado no servidor: {file_path}")

        logging.info(f"Arquivo {file_path} encontrado. Lendo o conteúdo para envio.")
        with open(file_path, "rb") as f:
            file_content = f.read()

        file_name = os.path.basename(file_path)
        headers = {'Content-Disposition': f'attachment; filename="{file_name}"'}

        return Response(
            content=file_content,
            media_type='application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            headers=headers
        )

    except Exception as e:
        logging.error("Ocorreu uma exceção no endpoint /api/generate-document.")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Erro interno ao gerar o documento: {e}")