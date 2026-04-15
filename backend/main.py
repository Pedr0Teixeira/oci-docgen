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
    collect_database_task,
    collect_full_infrastructure_task,
    collect_new_host_task,
    collect_waf_report_task,
)
from schemas import GenerateDocRequest, TaskCreationResponse, TaskStatusResponse

logging.basicConfig(level=logging.INFO)


# Map OCI error substrings to i18n keys so the frontend can translate them.
# Patterns are checked in order; first match wins.
_OCI_ERROR_MAP = [
    ("OCI_ERR:tenancy_id_not_found",          "OCI_ERR:tenancy_id_not_found"),
    ("OCI_ERR:identity_client_init_failed",   "OCI_ERR:identity_client_init_failed"),
    ("OCI_ERR:compute_client_init_failed",    "OCI_ERR:compute_client_init_failed"),
    ("not a private key",                     "OCI_ERR:invalid_private_key"),
    ("passphrase is incorrect",               "OCI_ERR:invalid_passphrase"),
    ("Could not deserialize key data",        "OCI_ERR:invalid_key_format"),
    ("AuthenticationError",                   "OCI_ERR:auth_failed"),
    ("404",                                   "OCI_ERR:not_found"),
    ("401",                                   "OCI_ERR:unauthorized"),
    ("403",                                   "OCI_ERR:forbidden"),
]

def _translate_oci_error(msg: str) -> str:
    """Returns an OCI_ERR: key if the message matches a known pattern, else the raw message."""
    for pattern, key in _OCI_ERROR_MAP:
        if pattern in msg:
            return key
    return msg

app = FastAPI(
    title="OCI DocGen API",
    version="2.3.0",
    description="API para automatizar a coleta de dados da OCI e gerar documentação de infraestrutura.",
)

_allowed_origins = os.environ.get("ALLOWED_ORIGINS", "*").split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def on_startup():
    auth.init_db()


# --- Auth helpers ---

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


# --- Auth Pydantic models ---

class AuthRequest(BaseModel):
    username: str
    password: str


# --- Auth endpoints ---

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
    return {"token": token, "username": user["username"], "user_id": user["id"], "is_admin": False}


@app.post("/api/auth/login", summary="Login")
async def login(body: AuthRequest):
    """Authenticate with username + password and receive a session token."""
    user = auth.authenticate_user(body.username, body.password)
    if not user:
        raise HTTPException(401, "Usuário ou senha inválidos.")

    token = auth.create_session(user["id"])
    return {"token": token, "username": user["username"], "user_id": user["id"], "is_admin": bool(user.get("is_admin", 0)), "force_password_change": bool(user.get("force_password_change", 0))}


@app.post("/api/auth/logout", summary="Logout")
async def logout(request: Request):
    token = _get_token(request)
    if token:
        auth.delete_session(token)
    return {"ok": True}


@app.get("/api/auth/me", summary="Sessão atual")
async def me(request: Request):
    user = _optional_user(request)
    if not user:
        raise HTTPException(401, "Não autenticado.")
    return {"username": user["username"], "user_id": user["id"], "is_admin": bool(user.get("is_admin", 0))}


# --- Admin helper ---

def _require_admin(request: Request) -> dict:
    user = _optional_user(request)
    if not user:
        raise HTTPException(401, "Não autenticado.")
    if not user.get("is_admin"):
        raise HTTPException(403, "Acesso negado. Apenas administradores.")
    return user


# --- Admin endpoints ---

@app.get("/api/admin/users", summary="Listar usuários (admin)")
async def admin_list_users(request: Request):
    _require_admin(request)
    return auth.list_users()


@app.patch("/api/admin/users/{user_id}/role", summary="Alterar papel do usuário (admin)")
async def admin_set_role(user_id: int, request: Request):
    me = _require_admin(request)
    body = await request.json()
    is_admin = bool(body.get("is_admin", False))
    if me["id"] == user_id and not is_admin:
        raise HTTPException(400, "Você não pode remover sua própria permissão de admin.")
    # The built-in "admin" account is a permanent superadmin — its role can never be changed.
    target = auth.get_user_by_id(user_id)
    if target and target.get("username") == "admin":
        raise HTTPException(400, "As permissões do usuário 'admin' são permanentes e não podem ser alteradas.")
    ok = auth.set_user_role(user_id, is_admin)
    if not ok:
        raise HTTPException(404, "Usuário não encontrado.")
    return {"ok": True}


@app.delete("/api/admin/users/{user_id}", summary="Deletar usuário (admin)")
async def admin_delete_user(user_id: int, request: Request):
    me = _require_admin(request)
    if me["id"] == user_id:
        raise HTTPException(400, "Você não pode deletar sua própria conta.")
    ok = auth.delete_user(user_id)
    if not ok:
        raise HTTPException(404, "Usuário não encontrado.")
    return {"ok": True}


@app.patch("/api/admin/users/{user_id}/password", summary="Redefinir senha (admin)")
async def admin_reset_password(user_id: int, request: Request):
    _require_admin(request)
    body = await request.json()
    new_pass = body.get("password", "")
    if len(new_pass) < 6:
        raise HTTPException(400, "Senha precisa ter pelo menos 6 caracteres.")
    ok = auth.update_user_password(user_id, new_pass)
    if not ok:
        raise HTTPException(404, "Usuário não encontrado.")
    return {"ok": True}


@app.get("/api/admin/groups", summary="Listar grupos (admin)")
async def admin_list_groups(request: Request):
    _require_admin(request)
    return auth.list_groups()


@app.post("/api/admin/groups", summary="Criar grupo (admin)")
async def admin_create_group(request: Request):
    _require_admin(request)
    body = await request.json()
    name = (body.get("name") or "").strip()
    if not name:
        raise HTTPException(400, "Nome do grupo é obrigatório.")
    group, err = auth.create_group(name)
    if err == "duplicate":
        raise HTTPException(409, "Grupo já existe.")
    if err or not group:
        raise HTTPException(500, "Erro ao criar grupo.")
    return group


@app.delete("/api/admin/groups/{group_id}", summary="Deletar grupo (admin)")
async def admin_delete_group(group_id: int, request: Request):
    _require_admin(request)
    ok = auth.delete_group(group_id)
    if not ok:
        raise HTTPException(404, "Grupo não encontrado.")
    return {"ok": True}


@app.post("/api/admin/groups/{group_id}/users/{user_id}", summary="Adicionar usuário ao grupo (admin)")
async def admin_add_user_to_group(group_id: int, user_id: int, request: Request):
    _require_admin(request)
    auth.assign_user_to_group(user_id, group_id)
    return {"ok": True}


@app.delete("/api/admin/groups/{group_id}/users/{user_id}", summary="Remover usuário do grupo (admin)")
async def admin_remove_user_from_group(group_id: int, user_id: int, request: Request):
    _require_admin(request)
    auth.remove_user_from_group(user_id, group_id)
    return {"ok": True}


@app.get("/api/my-permissions", summary="Obter doc types permitidos para o usuário logado")
async def get_my_permissions(request: Request):
    """
    Returns the allowed doc types for the currently authenticated user.
    - Admin users: all types allowed (no restrictions).
    - Non-admin in groups: union of allowed_doc_types across their groups.
    - Non-admin in no groups: all types allowed.
    - Anonymous (no token): only 'new_host' allowed.
    """
    ALL_TYPES = ["full_infra", "new_host", "kubernetes", "waf_report", "database"]
    token = (request.headers.get("Authorization") or "").replace("Bearer ", "").strip()
    user = auth.get_session_user(token) if token else None

    if not user:
        return {"allowed": ["new_host"], "is_admin": False, "is_anonymous": True}

    if user.get("is_admin"):
        return {"allowed": ALL_TYPES, "is_admin": True, "is_anonymous": False}

    allowed = auth.get_user_allowed_doc_types(user["id"])
    if allowed is None:
        # In no groups → no restrictions
        return {"allowed": ALL_TYPES, "is_admin": False, "is_anonymous": False}

    return {"allowed": allowed, "is_admin": False, "is_anonymous": False}


@app.put("/api/admin/groups/{group_id}/permissions", summary="Definir permissões do grupo (admin)")
async def admin_set_group_permissions(group_id: int, request: Request):
    _require_admin(request)
    body = await request.json()
    doc_types = body.get("doc_types", [])
    auth.set_group_doc_permissions(group_id, doc_types)
    return {"ok": True}


# --- Tenancy Profile endpoints ---

@app.get("/api/profiles", summary="Listar Tenancy Profiles disponíveis para o usuário")
async def list_profiles(request: Request):
    user = _optional_user(request)
    is_admin = user.get("is_admin", False) if user else False
    if user:
        # include_inactive=True so the frontend can show inactive profiles as
        # locked/disabled items in the selector instead of silently hiding them.
        profiles = auth.get_profiles_for_user(user["id"], is_admin, include_inactive=True)
    else:
        # Anonymous users: only public profiles
        all_profiles = auth.list_tenancy_profiles()
        profiles = [p for p in all_profiles if p.get("is_public")]
    return profiles


@app.get("/api/admin/profiles", summary="Listar todos os Tenancy Profiles (admin)")
async def admin_list_profiles(request: Request):
    _require_admin(request)
    return auth.list_tenancy_profiles(include_inactive=True)


@app.post("/api/admin/profiles", summary="Criar Tenancy Profile (admin)")
async def admin_create_profile(request: Request):
    user = _require_admin(request)
    body = await request.json()
    name = (body.get("name") or "").strip()
    auth_method = (body.get("auth_method") or "API_KEY").upper()
    if not name:
        raise HTTPException(400, "Nome é obrigatório.")
    if auth_method not in ("API_KEY", "INSTANCE_PRINCIPAL"):
        raise HTTPException(400, "auth_method deve ser API_KEY ou INSTANCE_PRINCIPAL.")

    profile, err = auth.create_tenancy_profile(
        name=name,
        auth_method=auth_method,
        region=body.get("region", ""),
        created_by=user["id"],
        is_public=bool(body.get("is_public", False)),
        visibility=body.get("visibility", "by_group"),
        tenancy_name=body.get("tenancy_name"),
        tenancy_ocid=body.get("tenancy_ocid"),
        user_ocid=body.get("user_ocid"),
        fingerprint=body.get("fingerprint"),
        private_key_pem=body.get("private_key_pem"),
    )
    if err == "duplicate":
        raise HTTPException(409, "Já existe um profile com esse nome.")
    if err or not profile:
        raise HTTPException(500, "Erro ao criar profile.")
    return profile


@app.patch("/api/admin/profiles/{profile_id}", summary="Atualizar Tenancy Profile (admin)")
async def admin_update_profile(profile_id: int, request: Request):
    _require_admin(request)
    body = await request.json()
    updated = auth.update_tenancy_profile(
        profile_id=profile_id,
        name=body.get("name"),
        auth_method=body.get("auth_method"),
        region=body.get("region"),
        tenancy_name=body.get("tenancy_name"),
        is_public=body.get("is_public"),
        is_active=body.get("is_active"),
        visibility=body.get("visibility"),
        tenancy_ocid=body.get("tenancy_ocid"),
        user_ocid=body.get("user_ocid"),
        fingerprint=body.get("fingerprint"),
        private_key_pem=body.get("private_key_pem"),
    )
    if not updated:
        raise HTTPException(404, "Profile não encontrado.")
    return auth.get_tenancy_profile(profile_id)


@app.delete("/api/admin/profiles/{profile_id}", summary="Remover Tenancy Profile (admin)")
async def admin_delete_profile(profile_id: int, request: Request):
    _require_admin(request)
    auth.delete_tenancy_profile(profile_id)
    return {"ok": True}


@app.get("/api/admin/profiles/{profile_id}/groups", summary="Grupos com acesso ao profile (admin)")
async def admin_get_profile_groups(profile_id: int, request: Request):
    _require_admin(request)
    return auth.get_profile_groups(profile_id)


@app.put("/api/admin/profiles/{profile_id}/groups", summary="Definir grupos com acesso ao profile (admin)")
async def admin_set_profile_groups(profile_id: int, request: Request):
    _require_admin(request)
    body = await request.json()
    group_ids = body.get("group_ids", [])
    auth.set_profile_groups(profile_id, group_ids)
    return {"ok": True}


@app.get("/api/admin/groups/{group_id}/profiles", summary="Profiles de um grupo (admin)")
async def admin_get_group_profiles(group_id: int, request: Request):
    _require_admin(request)
    return auth.get_group_profiles(group_id)


@app.put("/api/admin/groups/{group_id}/profiles", summary="Definir profiles de um grupo (admin)")
async def admin_set_group_profiles(group_id: int, request: Request):
    _require_admin(request)
    body = await request.json()
    profile_ids = body.get("profile_ids", [])
    auth.set_group_profiles(group_id, profile_ids)
    return {"ok": True}

@app.get("/api/admin/profiles/{profile_id}/key", summary="Obter chave PEM decriptada (admin)")
async def admin_get_profile_key(profile_id: int, request: Request):
    _require_admin(request)
    profile = auth.get_tenancy_profile(profile_id, decrypt_key=True)
    if not profile:
        raise HTTPException(status_code=404, detail="Profile não encontrado.")
    key = profile.get("private_key_pem") or ""
    return {"private_key_pem": key}


@app.get("/api/admin/profiles/{profile_id}/users", summary="Usuários atribuídos diretamente ao profile")
async def admin_get_profile_users(profile_id: int, request: Request):
    _require_admin(request)
    return auth.get_user_profile_assignments(profile_id)


@app.put("/api/admin/profiles/{profile_id}/users", summary="Definir usuários diretos do profile")
async def admin_set_profile_users(profile_id: int, request: Request):
    _require_admin(request)
    body = await request.json()
    user_ids = body.get("user_ids", [])
    auth.set_user_profile_assignments(profile_id, user_ids)
    return {"ok": True}


# --- Metrics endpoint ---

@app.get("/api/metrics", summary="Métricas de geração (admin)")
async def get_metrics(request: Request):
    """Admin-only: global metrics with time series and per-user stats."""
    _require_admin(request)
    return auth.get_metrics(user_id=None)


@app.get("/api/admin/generations/regions", summary="Regiões distintas nas gerações (admin)")
async def list_generation_regions(request: Request):
    """Admin-only: distinct region codes present in doc_generations."""
    _require_admin(request)
    return auth.get_distinct_regions()


@app.get("/api/admin/generations", summary="Listar gerações com filtros e paginacao (admin)")
async def list_generations(
    request: Request,
    page: int = 1,
    per_page: int = 25,
    doc_type: Optional[str] = None,
    username: Optional[str] = None,
    region: Optional[str] = None,
    search: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
):
    """Admin-only: paginated, filterable list of all doc generations."""
    _require_admin(request)
    per_page = max(10, min(per_page, 100))
    return auth.get_generations_list(
        page=page,
        per_page=per_page,
        doc_type=doc_type or None,
        username=username or None,
        region=region or None,
        search=search or None,
        date_from=date_from or None,
        date_to=date_to or None,
    )


# --- Announcements ---

@app.get("/api/announcements", summary="Listar avisos ativos (todos os usuarios)")
async def get_active_announcements(request: Request):
    # Accessible to all authenticated users (admins included)
    user = _optional_user(request)
    if not user:
        raise HTTPException(401, "Nao autenticado.")
    return auth.list_announcements(active_only=True)


@app.get("/api/admin/announcements", summary="Listar todos os avisos (admin)")
async def admin_list_announcements(request: Request):
    _require_admin(request)
    return auth.list_announcements(active_only=False)


@app.post("/api/admin/announcements", summary="Criar aviso (admin)")
async def admin_create_announcement(request: Request):
    user = _require_admin(request)
    body = await request.json()
    title = (body.get("title") or "").strip()
    if not title:
        raise HTTPException(400, "Titulo e obrigatorio.")
    ann = auth.create_announcement(
        title=title,
        message=body.get("message", ""),
        type_=body.get("type", "info"),
        expires_at=body.get("expires_at") or None,
        created_by=user["id"],
    )
    return ann


@app.patch("/api/admin/announcements/{ann_id}", summary="Atualizar aviso (admin)")
async def admin_update_announcement(ann_id: int, request: Request):
    _require_admin(request)
    body = await request.json()
    updated = auth.update_announcement(
        ann_id,
        title=body.get("title"),
        message=body.get("message"),
        type=body.get("type"),
        expires_at=body.get("expires_at"),
        is_active=body.get("is_active"),
    )
    if not updated:
        raise HTTPException(404, "Aviso nao encontrado.")
    return updated


@app.delete("/api/admin/announcements/{ann_id}", summary="Excluir aviso (admin)")
async def admin_delete_announcement(ann_id: int, request: Request):
    _require_admin(request)
    if not auth.delete_announcement(ann_id):
        raise HTTPException(404, "Aviso nao encontrado.")
    return {"ok": True}


# --- Profile connection validation ---

@app.post("/api/admin/profiles/validate", summary="Validar credenciais de um Tenancy Profile (admin)")
async def validate_profile_credentials(request: Request):
    """
    Validates OCI credentials inline or from an existing saved profile.
    When profile_id is supplied without an inline private_key_pem, the saved
    (decrypted) key is loaded from the database. This covers the edit-mode
    case where the PEM is stored but not re-transmitted to the browser.
    Returns {"ok": true, "region_count": N} on success, or raises HTTP 422/503.
    """
    _require_admin(request)
    body = await request.json()

    auth_method = (body.get("auth_method") or "API_KEY").upper()

    # Resolve private key: inline takes priority; fall back to saved profile key
    private_key_pem = body.get("private_key_pem") or ""
    profile_id = body.get("profile_id")
    if not private_key_pem and profile_id:
        saved = auth.get_tenancy_profile(int(profile_id), decrypt_key=True)
        if saved:
            private_key_pem = saved.get("private_key_pem") or ""

    profile = {
        "auth_method":     auth_method,
        "tenancy_ocid":    body.get("tenancy_ocid") or "",
        "user_ocid":       body.get("user_ocid") or "",
        "fingerprint":     body.get("fingerprint") or "",
        "private_key_pem": private_key_pem,
        "region":          body.get("region") or "",
        "name":            body.get("name") or "validate",
    }

    if auth_method == "API_KEY":
        missing = [f for f in ("tenancy_ocid", "user_ocid", "fingerprint", "private_key_pem")
                   if not profile.get(f)]
        if missing:
            raise HTTPException(422, f"Campos obrigatórios ausentes: {', '.join(missing)}")

    try:
        regions = oci_connector.list_regions(profile)
        return {"ok": True, "region_count": len(regions)}
    except ConnectionError as e:
        raise HTTPException(503, _translate_oci_error(str(e)))
    except Exception as e:
        raise HTTPException(503, _translate_oci_error(str(e)))


# --- Query endpoints ---

@app.get("/api/regions", summary="Listar Regiões Disponíveis")
async def get_regions(profile_id: Optional[int] = None, request: Request = None):
    if not profile_id:
        raise HTTPException(400, "profile_id é obrigatório.")
    profile = auth.get_tenancy_profile(profile_id, decrypt_key=True)
    if not profile:
        raise HTTPException(404, "Profile não encontrado.")
    try:
        return oci_connector.list_regions(profile)
    except ConnectionError as e:
        raise HTTPException(503, _translate_oci_error(str(e)))


@app.get("/api/{region}/compartments", summary="Listar Compartimentos em uma Região")
async def get_compartments(region: str, profile_id: Optional[int] = None):
    if not profile_id:
        raise HTTPException(400, "profile_id é obrigatório.")
    profile = auth.get_tenancy_profile(profile_id, decrypt_key=True)
    if not profile:
        raise HTTPException(404, "Profile não encontrado.")
    try:
        return oci_connector.list_compartments(region, profile)
    except ConnectionError as e:
        raise HTTPException(503, str(e))


@app.get("/api/{region}/instances/{compartment_id}", summary="Listar Instâncias em um Compartimento")
async def get_instances(region: str, compartment_id: str, profile_id: Optional[int] = None):
    profile = auth.get_tenancy_profile(profile_id, decrypt_key=True) if profile_id else None
    return oci_connector.list_instances_in_compartment(region, compartment_id, profile)


# --- Async collection ---

@app.post(
    "/api/start-collection",
    status_code=202,
    response_model=TaskCreationResponse,
    summary="Iniciar Coleta de Dados em Background",
)
async def start_data_collection(request: Request, payload: dict = Body(...)):
    collection_type = payload.get("type")
    doc_type        = payload.get("doc_type")
    region          = payload.get("region")

    if not all([collection_type, doc_type, region]):
        raise HTTPException(400, "Campos obrigatórios ausentes: 'type', 'doc_type' ou 'region'.")

    # new_host is the only collection type allowed without authentication.
    # full_infra, waf_report and kubernetes require a valid session token
    # because they perform a full compartment scan and return sensitive
    # infrastructure data.
    if collection_type != "new_host":
        user = _optional_user(request)
        if not user:
            raise HTTPException(401, "Autenticação obrigatória para este tipo de coleta.")

    try:
        profile_id = payload.get("profile_id") or None

        # Guard: if a profile_id was provided, ensure it exists and is active
        # before dispatching the Celery task. Prevents collection using a profile
        # that was deactivated after the user loaded the generator page.
        if profile_id is not None:
            profile_check = auth.get_tenancy_profile(int(profile_id))
            if not profile_check:
                raise HTTPException(404, "Tenancy Profile não encontrado.")
            if not profile_check.get("is_active"):
                raise HTTPException(403, "Tenancy Profile desativado. Ative-o antes de iniciar a coleta.")

        if collection_type == "full_infra":
            # Multi-compartment: accept "compartments" list or legacy "compartment_id" string
            compartments_raw = payload.get("compartments")
            compartment_id = payload.get("compartment_id")
            if compartments_raw:
                compartments = [
                    {"id": c["compartment_id"], "name": c.get("compartment_name", "N/A")}
                    for c in compartments_raw
                ]
            elif compartment_id:
                compartments = [{"id": compartment_id, "name": payload.get("compartment_name", "N/A")}]
            else:
                raise HTTPException(400, "Falta 'compartments' ou 'compartment_id' para full_infra.")
            include_standalone = payload.get("include_standalone", True)
            task = collect_full_infrastructure_task.delay(region, compartments, doc_type, include_standalone, profile_id)

        elif collection_type == "new_host":
            details = payload.get("details")
            if not details:
                raise HTTPException(400, "Falta 'details' para new_host.")
            task = collect_new_host_task.delay(region, details, doc_type, profile_id)

        elif collection_type == "waf_report":
            compartment_id   = payload.get("compartment_id")
            compartment_name = payload.get("compartment_name", "N/A")
            if not compartment_id:
                raise HTTPException(400, "Falta 'compartment_id' para waf_report.")
            task = collect_waf_report_task.delay(region, compartment_id, compartment_name, profile_id)

        elif collection_type == "database":
            compartment_id   = payload.get("compartment_id")
            compartment_name = payload.get("compartment_name", "N/A")
            if not compartment_id:
                raise HTTPException(400, "Falta 'compartment_id' para database.")
            task = collect_database_task.delay(region, compartment_id, compartment_name, profile_id)

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
    if task_result.state == "IAM_ERROR":
        return {"task_id": task_id, "status": "FAILURE", "result": task_result.info}
    if task_result.state == "FAILURE":
        logging.error(f"Task {task_id} failed.\n{task_result.traceback}")
        return {"task_id": task_id, "status": "FAILURE",  "result": None}

    return {"task_id": task_id, "status": "SUCCESS", "result": task_result.result}


# --- Document generation ---

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

        all_bytes: list[bytes] = [await f.read() for f in section_images]
        cursor = 0
        resolved_sections = []
        for meta in request_data.image_sections:
            chunk = [all_bytes[i] for i in range(cursor, cursor + meta.file_count)]
            cursor += meta.file_count
            resolved_sections.append({
                "name":       meta.name,
                "position":   meta.position,
                "images":     chunk,
                "text_above": meta.text_above,
                "text_below": meta.text_below,
            })

        # Letterhead bytes appended after section files — order: header, footer, cover.
        resolved_letterhead = None
        lh_meta = request_data.letterhead
        if lh_meta:
            header_bytes: Optional[bytes] = None
            footer_bytes: Optional[bytes] = None
            cover_bytes:  Optional[bytes] = None
            if lh_meta.enabled and lh_meta.header_file_count == 1 and cursor < len(all_bytes):
                header_bytes = all_bytes[cursor]; cursor += 1
            if lh_meta.enabled and lh_meta.footer_file_count == 1 and cursor < len(all_bytes):
                footer_bytes = all_bytes[cursor]; cursor += 1
            if lh_meta.cover_image_file_count == 1 and cursor < len(all_bytes):
                cover_bytes = all_bytes[cursor]; cursor += 1
            resolved_letterhead = {
                "enabled": lh_meta.enabled,
                "header":  header_bytes,
                "footer":  footer_bytes,
                "cover":   cover_bytes,
            }

        file_path = doc_generator.generate_documentation(
            doc_type=request_data.doc_type,
            infra_data=request_data.infra_data,
            responsible_name=request_data.responsible_name,
            image_sections=resolved_sections,
            lang=request_data.lang,
            compartment_name=request_data.compartment_name,
            letterhead=resolved_letterhead,
        )

        if not os.path.exists(file_path):
            raise HTTPException(500, f"Arquivo gerado não encontrado: {file_path}")

        # Log generation — works for both authenticated and anonymous users
        user = _optional_user(request)
        auth.log_generation(
            doc_type=request_data.doc_type,
            compartment=request_data.compartment_name or "N/A",
            region=request_data.region or "N/A",
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

# --- Change password endpoint ---

class ChangePasswordRequest(BaseModel):
    current_password: str = ""
    new_password: str
    force: bool = False  # True = skip current_password check (first login)


@app.post("/api/auth/change-password", summary="Alterar senha")
async def change_password(body: ChangePasswordRequest, request: Request):
    user = _optional_user(request)
    if not user:
        raise HTTPException(401, "Não autenticado.")
    ok, err = auth.change_password(user["id"], body.current_password, body.new_password, skip_verify=body.force)
    if not ok:
        raise HTTPException(400, err)
    return {"ok": True}


# --- User profile endpoints ---

class ProfileRequest(BaseModel):
    first_name: str = ""
    last_name: str = ""
    email: str = ""
    phone: str = ""
    notes: str = ""


@app.get("/api/users/profile", summary="Obter perfil do usuário")
async def get_profile(request: Request):
    user = _optional_user(request)
    if not user:
        raise HTTPException(401, "Não autenticado.")
    profile = auth.get_user_profile(user["id"])
    return {"username": user["username"], **profile}


@app.put("/api/users/profile", summary="Atualizar perfil do usuário")
async def update_profile(body: ProfileRequest, request: Request):
    user = _optional_user(request)
    if not user:
        raise HTTPException(401, "Não autenticado.")
    auth.upsert_user_profile(user["id"], body.first_name, body.last_name, body.email, body.phone, body.notes)
    return {"ok": True}


# --- Feedback endpoints ---

class FeedbackRequest(BaseModel):
    category: str = "outro"
    message: str


@app.post("/api/feedback", summary="Enviar feedback")
async def submit_feedback(body: FeedbackRequest, request: Request):
    if not body.message or len(body.message.strip()) < 3:
        raise HTTPException(400, "Mensagem muito curta.")
    user = _optional_user(request)
    result = auth.add_feedback(user["id"] if user else None, body.category, body.message.strip())
    return result


@app.get("/api/feedback", summary="Listar feedback (admin)")
async def list_feedback(request: Request, status: Optional[str] = None):
    _require_admin(request)
    return auth.list_feedback(status)


@app.patch("/api/feedback/{feedback_id}", summary="Atualizar status do feedback (admin)")
async def update_feedback(feedback_id: int, request: Request):
    _require_admin(request)
    body = await request.json()
    status = body.get("status", "open")
    ok = auth.update_feedback_status(feedback_id, status)
    if not ok:
        raise HTTPException(404, "Feedback não encontrado.")
    return {"ok": True}


# --- Per-user generation logs ---

@app.get("/api/admin/users/{user_id}/logs", summary="Logs de geração por usuário (admin)")
async def get_user_logs(user_id: int, request: Request):
    _require_admin(request)
    logs = auth.get_user_generation_logs(user_id=user_id if user_id > 0 else None)
    return logs

@app.get("/api/health", summary="Health check", include_in_schema=False)
async def health():
    return {"status": "ok"}
