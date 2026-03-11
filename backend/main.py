# ==============================================================================
# main.py — FastAPI server for OCI DocGen
# Changes from previous version:
#   - Added SQLite-backed auth: /api/auth/register, /api/auth/login, /api/auth/logout, /api/auth/me
#   - Added /api/metrics endpoint (personal when authenticated, global when anonymous)
#   - /api/generate-document now logs each generation to the metrics DB (auth optional)
#   - DB is initialised at startup via auth.init_db()
# ==============================================================================

import json
import logging
import os
import traceback
from typing import List, Optional

from celery.result import AsyncResult
from fastapi import Body, FastAPI, File, Form, HTTPException, Request, Response, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

import auth
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
# App + CORS
# ==============================================================================

app = FastAPI(
    title="OCI DocGen API",
    version="2.3.0",
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


@app.on_event("startup")
async def on_startup():
    auth.init_db()


# ==============================================================================
# Auth helpers
# ==============================================================================

def _get_token(request: Request) -> Optional[str]:
    """Extract Bearer token from Authorization header."""
    header = request.headers.get("Authorization", "")
    if header.startswith("Bearer "):
        return header[7:].strip()
    return None


def _optional_user(request: Request) -> Optional[dict]:
    """Return authenticated user dict if a valid Bearer token is present, else None."""
    token = _get_token(request)
    return auth.get_session_user(token) if token else None


# ==============================================================================
# Auth Pydantic models
# ==============================================================================

class AuthRequest(BaseModel):
    username: str
    password: str


# ==============================================================================
# Auth endpoints  (all under /api/auth/*)
# ==============================================================================

@app.post("/api/auth/register", summary="Criar conta")
async def register(body: AuthRequest):
    """
    Creates a new account. Returns a session token on success.
    Username must be unique and >= 3 chars; password >= 6 chars.
    """
    if len(body.username.strip()) < 3:
        raise HTTPException(400, "Username precisa ter pelo menos 3 caracteres.")
    if len(body.password) < 6:
        raise HTTPException(400, "Senha precisa ter pelo menos 6 caracteres.")

    user = auth.create_user(body.username, body.password)
    if not user:
        raise HTTPException(409, "Username já está em uso.")

    token = auth.create_session(user["id"])
    return {"token": token, "username": user["username"], "user_id": user["id"]}


@app.post("/api/auth/login", summary="Login")
async def login(body: AuthRequest):
    """Authenticate with username + password and receive a session token."""
    user = auth.authenticate_user(body.username, body.password)
    if not user:
        raise HTTPException(401, "Usuário ou senha inválidos.")

    token = auth.create_session(user["id"])
    return {"token": token, "username": user["username"], "user_id": user["id"]}


@app.post("/api/auth/logout", summary="Logout")
async def logout(request: Request):
    """Invalidate the current session token."""
    token = _get_token(request)
    if token:
        auth.delete_session(token)
    return {"ok": True}


@app.get("/api/auth/me", summary="Sessão atual")
async def me(request: Request):
    """Return the currently authenticated user, or 401 if not logged in."""
    user = _optional_user(request)
    if not user:
        raise HTTPException(401, "Não autenticado.")
    return {"username": user["username"], "user_id": user["id"]}


# ==============================================================================
# Metrics endpoint
# ==============================================================================

@app.get("/api/metrics", summary="Métricas de geração")
async def get_metrics(request: Request):
    """
    Returns document generation metrics.
    Authenticated → personal metrics for the logged-in user.
    Anonymous     → global aggregate metrics (all users + anonymous).
    """
    user = _optional_user(request)
    return auth.get_metrics(user_id=user["id"] if user else None)


# ==============================================================================
# Query endpoints (unchanged)
# ==============================================================================

@app.get("/api/regions", summary="Listar Regiões Disponíveis")
async def get_regions():
    return oci_connector.list_regions()


@app.get("/api/{region}/compartments", summary="Listar Compartimentos em uma Região")
async def get_compartments(region: str):
    return oci_connector.list_compartments(region)


@app.get("/api/{region}/instances/{compartment_id}", summary="Listar Instâncias em um Compartimento")
async def get_instances(region: str, compartment_id: str):
    return oci_connector.list_instances_in_compartment(region, compartment_id)


# ==============================================================================
# Async collection (unchanged)
# ==============================================================================

@app.post(
    "/api/start-collection",
    status_code=202,
    response_model=TaskCreationResponse,
    summary="Iniciar Coleta de Dados em Background",
)
async def start_data_collection(payload: dict = Body(...)):
    collection_type = payload.get("type")
    doc_type        = payload.get("doc_type")
    region          = payload.get("region")

    if not all([collection_type, doc_type, region]):
        raise HTTPException(400, "Campos obrigatórios ausentes: 'type', 'doc_type' ou 'region'.")

    try:
        if collection_type == "full_infra":
            compartment_id = payload.get("compartment_id")
            if not compartment_id:
                raise HTTPException(400, "Falta 'compartment_id' para full_infra.")
            task = collect_full_infrastructure_task.delay(region, compartment_id, doc_type)

        elif collection_type == "new_host":
            details = payload.get("details")
            if not details:
                raise HTTPException(400, "Falta 'details' para new_host.")
            task = collect_new_host_task.delay(region, details, doc_type)

        elif collection_type == "waf_report":
            compartment_id   = payload.get("compartment_id")
            compartment_name = payload.get("compartment_name", "N/A")
            if not compartment_id:
                raise HTTPException(400, "Falta 'compartment_id' para waf_report.")
            task = collect_waf_report_task.delay(region, compartment_id, compartment_name)

        else:
            raise HTTPException(400, f"Tipo inválido: {collection_type}")

        return {"task_id": task.id}

    except HTTPException:
        raise
    except Exception as exc:
        traceback.print_exc()
        raise HTTPException(500, f"Erro ao iniciar a tarefa: {exc}")


@app.get(
    "/api/collection-status/{task_id}",
    response_model=TaskStatusResponse,
    summary="Verificar Status da Coleta",
)
async def get_collection_status(task_id: str):
    task_result = AsyncResult(task_id, app=celery_app)

    if task_result.state == "PROGRESS":
        return {"task_id": task_id, "status": "PROGRESS", "result": task_result.info}
    if task_result.state == "PENDING":
        return {"task_id": task_id, "status": "PENDING",  "result": None}
    if task_result.state == "FAILURE":
        logging.error(f"Task {task_id} failed.\n{task_result.traceback}")
        return {"task_id": task_id, "status": "FAILURE",  "result": None}

    return {"task_id": task_id, "status": "SUCCESS", "result": task_result.result}


# ==============================================================================
# Document generation (now logs to metrics DB)
# ==============================================================================

@app.post("/api/generate-document", summary="Gerar Documento de Infraestrutura")
async def create_document(
    request: Request,
    json_data: str = Form(...),
    section_images: List[UploadFile] = File([]),
):
    """
    Generates a .docx document.
    Also records the generation in the metrics DB — authenticated user or anonymous.
    The Authorization header is optional; omitting it generates the doc as 'anônimo'.
    """
    logging.info("Endpoint /api/generate-document called.")
    try:
        request_data = GenerateDocRequest(**json.loads(json_data))

        all_bytes = [await f.read() for f in section_images]
        cursor = 0
        resolved_sections = []
        for meta in request_data.image_sections:
            chunk = all_bytes[cursor: cursor + meta.file_count]
            cursor += meta.file_count
            resolved_sections.append({
                "name":       meta.name,
                "position":   meta.position,
                "images":     chunk,
                "text_above": meta.text_above,
                "text_below": meta.text_below,
            })

        file_path = doc_generator.generate_documentation(
            doc_type=request_data.doc_type,
            infra_data=request_data.infra_data,
            responsible_name=request_data.responsible_name,
            image_sections=resolved_sections,
            lang=request_data.lang,
        )

        if not os.path.exists(file_path):
            raise HTTPException(500, f"Arquivo gerado não encontrado: {file_path}")

        # Log generation — works for both authenticated and anonymous users
        user = _optional_user(request)
        auth.log_generation(
            doc_type=request_data.doc_type,
            compartment=request_data.infra_data.get("compartment_name", "N/A"),
            region=request_data.infra_data.get("region", "N/A"),
            user_id=user["id"] if user else None,
        )

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
        raise HTTPException(500, f"Erro interno ao gerar documento: {exc}")