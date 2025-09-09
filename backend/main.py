# OCI DocGen
# Autor: Pedro Teixeira
# Data: 09 de Setembro de 2025
# Descrição: API principal (backend) construída com FastAPI para servir os dados da OCI e gerar os documentos.

import json
import os
import traceback
from typing import List, Optional

from fastapi import FastAPI, File, Form, HTTPException, UploadFile, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
import logging

import doc_generator
import oci_connector
from schemas import GenerateDocRequest, InfrastructureData, NewHostRequest

# Configuração do logging
logging.basicConfig(level=logging.INFO)

# --- Configuração da Aplicação FastAPI ---
app = FastAPI(
    title="OCI DocGen API",
    version="1.6.0", # Versão atualizada
    description="API para automatizar a coleta de dados da OCI e gerar documentação de infraestrutura."
)

# --- Configuração do CORS (Cross-Origin Resource Sharing) ---
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


# --- Endpoints da API ---

@app.get("/api/regions", summary="Listar Regiões Disponíveis")
async def get_regions():
    return oci_connector.list_regions()


@app.get("/api/{region}/compartments", summary="Listar Compartimentos em uma Região")
async def get_compartments(region: str):
    return oci_connector.list_compartments(region)


@app.get("/api/{region}/instances/{compartment_id}", summary="Listar Instâncias em um Compartimento")
async def get_instances(region: str, compartment_id: str):
    return oci_connector.list_instances_in_compartment(region, compartment_id)


# --- NOVO ENDPOINT PARA "NOVO HOST" ---
@app.post("/api/{region}/new-host-details", summary="Obter Detalhes de Instâncias Específicas e VGs Associados", response_model=InfrastructureData)
async def get_new_host_data(region: str, request: NewHostRequest):
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
    logging.info("Endpoint /api/generate-document foi chamado.")
    try:
        request_data = GenerateDocRequest(**json.loads(json_data))
        architecture_image_bytes_list = [await f.read() for f in architecture_files]
        antivirus_image_bytes_list = [await f.read() for f in antivirus_files]
        
        logging.info("Chamando doc_generator.generate_documentation...")
        
        file_path = doc_generator.generate_documentation(
            doc_type=request_data.doc_type,
            infra_data=request_data.infra_data,
            responsible_name=request_data.responsible_name,
            architecture_image_bytes_list=architecture_image_bytes_list,
            antivirus_image_bytes_list=antivirus_image_bytes_list
        )
        
        logging.info(f"doc_generator retornou o caminho do arquivo: {file_path}")

        if not os.path.exists(file_path):
            logging.error(f"ERRO CRÍTICO: O arquivo {file_path} não foi encontrado no disco após a geração.")
            raise HTTPException(status_code=500, detail=f"Arquivo gerado não encontrado no servidor: {file_path}")
        
        logging.info(f"Arquivo {file_path} encontrado. Lendo o conteúdo para envio.")
        
        with open(file_path, "rb") as f:
            file_content = f.read()

        file_name = os.path.basename(file_path)
        headers = {
            'Content-Disposition': f'attachment; filename="{file_name}"'
        }
        
        return Response(
            content=file_content,
            media_type='application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            headers=headers
        )

    except Exception as e:
        logging.error("Ocorreu uma exceção no endpoint /api/generate-document.")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Erro interno ao gerar o documento: {e}")