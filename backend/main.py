# OCI DocGen
# Autor: Pedro Teixeira
# Data: 01 de Setembro de 2025
# Descrição: API principal (backend) construída com FastAPI para servir os dados da OCI e gerar os documentos.

import json
import os
import traceback
from typing import List

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

import doc_generator
import oci_connector
from schemas import MultiDocRequest

# --- Configuração da Aplicação FastAPI ---
app = FastAPI(
    title="OCI DocGen API",
    version="1.4.0",
    description="API para automatizar a coleta de dados da OCI e gerar documentação de infraestrutura."
)

# --- Configuração do CORS (Cross-Origin Resource Sharing) ---
# Permite que o frontend (rodando em um endereço diferente) se comunique com esta API.
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
    """Retorna uma lista de todas as regiões da OCI disponíveis na tenancy."""
    return oci_connector.list_regions()


@app.get("/api/{region}/compartments", summary="Listar Compartimentos em uma Região")
async def get_compartments(region: str):
    """Retorna uma lista hierárquica de compartimentos a partir da raiz (tenancy)."""
    return oci_connector.list_compartments(region)


@app.get("/api/{region}/instances/{compartment_id}", summary="Listar Instâncias em um Compartimento")
async def get_instances(region: str, compartment_id: str):
    """Retorna uma lista de instâncias ativas (RUNNING) dentro de um compartimento específico."""
    return oci_connector.list_instances_in_compartment(region, compartment_id)


@app.get("/api/{region}/instance-details/{instance_id}", summary="Obter Detalhes de uma Instância")
async def get_details(region: str, instance_id: str):
    """
    Coleta e retorna detalhes abrangentes de uma instância específica, incluindo
    rede, armazenamento e configurações de backup.
    """
    try:
        return oci_connector.get_instance_details(region, instance_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao buscar detalhes da instância: {e}")


@app.post("/api/generate-document", summary="Gerar Documento de Infraestrutura")
async def create_document(
    json_data: str = Form(...),
    architecture_files: List[UploadFile] = File([]),
    antivirus_files: List[UploadFile] = File([])
):
    """
    Recebe os dados das instâncias (em formato JSON) e anexos de imagem para
    gerar um arquivo .docx e retorná-lo para download.
    """
    try:
        # 1. Desserializa a string JSON recebida do formulário para o modelo Pydantic.
        request_data = MultiDocRequest(**json.loads(json_data))

        # 2. Lê os bytes de cada arquivo de imagem enviado de forma assíncrona.
        architecture_image_bytes_list = [await f.read() for f in architecture_files]
        antivirus_image_bytes_list = [await f.read() for f in antivirus_files]

        # 3. Chama a função geradora, passando os dados das instâncias e as listas de bytes das imagens.
        file_path = doc_generator.generate_documentation(
            all_instances_data=request_data.instances_data,
            architecture_image_bytes_list=architecture_image_bytes_list,
            antivirus_image_bytes_list=antivirus_image_bytes_list
        )

        # 4. Retorna o arquivo gerado para o cliente.
        return FileResponse(
            path=file_path,
            filename=os.path.basename(file_path),
            media_type='application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        )
    except Exception as e:
        # Captura exceções para fornecer um erro claro no lado do cliente.
        traceback.print_exc()  # Loga o traceback completo no console do servidor para depuração.
        raise HTTPException(status_code=500, detail=f"Erro interno ao gerar o documento: {e}")