import base64
import hashlib
import logging
import os
import sqlite3
import uuid
from datetime import datetime, timedelta
from typing import Optional

from cryptography.fernet import Fernet

_data_dir = os.environ.get("DATA_DIR", os.path.dirname(os.path.abspath(__file__)))
DB_PATH = os.path.join(_data_dir, "oci_docgen.db")


# --- Encryption helpers ---

def _get_fernet() -> Fernet:
    """
    Returns a Fernet instance keyed from the SECRET_KEY environment variable.
    The key is SHA-256 hashed and base64url-encoded to always produce a valid
    32-byte Fernet key regardless of the raw SECRET_KEY length.
    """
    raw = os.environ.get("SECRET_KEY", "dev-insecure-change-in-production")
    derived = base64.urlsafe_b64encode(hashlib.sha256(raw.encode()).digest())
    return Fernet(derived)


def encrypt_value(plaintext: str) -> str:
    """Encrypts a string and returns a base64-encoded ciphertext string."""
    return _get_fernet().encrypt(plaintext.encode()).decode()


def decrypt_value(ciphertext: str) -> str:
    """Decrypts a base64-encoded ciphertext string back to plaintext."""
    return _get_fernet().decrypt(ciphertext.encode()).decode()


# --- Database bootstrap ---

def init_db() -> None:
    """Create tables and run migrations. Called once at FastAPI startup."""
    conn = _conn()
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA busy_timeout=30000")

    # All CREATE TABLE statements are idempotent (IF NOT EXISTS).
    create_stmts = [
        """CREATE TABLE IF NOT EXISTS users (
            id                    INTEGER PRIMARY KEY AUTOINCREMENT,
            username              TEXT UNIQUE NOT NULL,
            password_hash         TEXT NOT NULL,
            created_at            TEXT NOT NULL,
            is_admin              INTEGER DEFAULT 0,
            force_password_change INTEGER DEFAULT 0
        )""",
        """CREATE TABLE IF NOT EXISTS sessions (
            token      TEXT PRIMARY KEY,
            user_id    INTEGER NOT NULL,
            created_at TEXT NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users(id)
        )""",
        """CREATE TABLE IF NOT EXISTS doc_generations (
            id           INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id      INTEGER,
            doc_type     TEXT NOT NULL,
            compartment  TEXT,
            region       TEXT,
            generated_at TEXT NOT NULL
        )""",
        """CREATE TABLE IF NOT EXISTS groups (
            id                INTEGER PRIMARY KEY AUTOINCREMENT,
            name              TEXT UNIQUE NOT NULL,
            allowed_doc_types TEXT DEFAULT ''
        )""",
        """CREATE TABLE IF NOT EXISTS user_groups (
            user_id  INTEGER NOT NULL,
            group_id INTEGER NOT NULL,
            PRIMARY KEY (user_id, group_id),
            FOREIGN KEY (user_id)  REFERENCES users(id),
            FOREIGN KEY (group_id) REFERENCES groups(id)
        )""",
        """CREATE TABLE IF NOT EXISTS user_profiles (
            user_id    INTEGER PRIMARY KEY,
            first_name TEXT DEFAULT '',
            last_name  TEXT DEFAULT '',
            email      TEXT DEFAULT '',
            phone      TEXT DEFAULT '',
            notes      TEXT DEFAULT '',
            FOREIGN KEY (user_id) REFERENCES users(id)
        )""",
        """CREATE TABLE IF NOT EXISTS feedback (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id    INTEGER,
            category   TEXT DEFAULT 'outro',
            message    TEXT NOT NULL,
            status     TEXT DEFAULT 'open',
            created_at TEXT NOT NULL
        )""",
        """CREATE TABLE IF NOT EXISTS tenancy_profiles (
            id                    INTEGER PRIMARY KEY AUTOINCREMENT,
            name                  TEXT UNIQUE NOT NULL,
            auth_method           TEXT NOT NULL DEFAULT 'API_KEY',
            tenancy_ocid          TEXT,
            user_ocid             TEXT,
            fingerprint           TEXT,
            private_key_encrypted TEXT,
            region                TEXT,
            is_active             INTEGER DEFAULT 1,
            is_public             INTEGER DEFAULT 0,
            created_by            INTEGER,
            created_at            TEXT NOT NULL,
            FOREIGN KEY (created_by) REFERENCES users(id)
        )""",
        """CREATE TABLE IF NOT EXISTS group_profiles (
            group_id   INTEGER NOT NULL,
            profile_id INTEGER NOT NULL,
            PRIMARY KEY (group_id, profile_id),
            FOREIGN KEY (group_id)   REFERENCES groups(id),
            FOREIGN KEY (profile_id) REFERENCES tenancy_profiles(id)
        )""",
        """CREATE TABLE IF NOT EXISTS user_profile_assignments (
            user_id    INTEGER NOT NULL,
            profile_id INTEGER NOT NULL,
            PRIMARY KEY (user_id, profile_id),
            FOREIGN KEY (user_id)    REFERENCES users(id),
            FOREIGN KEY (profile_id) REFERENCES tenancy_profiles(id)
        )""",
        """CREATE TABLE IF NOT EXISTS announcements (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            title       TEXT NOT NULL,
            message     TEXT NOT NULL DEFAULT '',
            type        TEXT NOT NULL DEFAULT 'info',
            expires_at  TEXT,
            created_by  INTEGER,
            created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
            is_active   INTEGER NOT NULL DEFAULT 1
        )""",
    ]
    for stmt in create_stmts:
        try:
            conn.execute(stmt)
        except Exception:
            pass

    # Schema migrations — each ALTER is wrapped individually so a column-already-exists
    # error on one statement does not prevent the remaining migrations from running.
    migrations = [
        "ALTER TABLE users ADD COLUMN is_admin              INTEGER DEFAULT 0",
        "ALTER TABLE users ADD COLUMN force_password_change INTEGER DEFAULT 0",
        "ALTER TABLE groups ADD COLUMN allowed_doc_types    TEXT    DEFAULT ''",
        # visibility: admin_only | all_users | by_group | by_user
        "ALTER TABLE tenancy_profiles ADD COLUMN visibility TEXT DEFAULT 'by_group'",
        "ALTER TABLE tenancy_profiles ADD COLUMN tenancy_name TEXT DEFAULT ''",
    ]
    for migration in migrations:
        try:
            conn.execute(migration)
        except Exception:
            pass  # Column already exists — safe to ignore

    try:
        conn.commit()
    finally:
        conn.close()
    logging.info("OCI DocGen DB initialised at %s", DB_PATH)

    # Seed the default admin account only when the database is new.
    _seed_default_admin()


def _seed_default_admin() -> None:
    """Creates the default admin user if no users exist in the database."""
    conn = _conn()
    count = conn.execute("SELECT COUNT(*) FROM users").fetchone()[0]
    conn.close()
    if count > 0:
        return
    conn = _conn()
    try:
        conn.execute(
            """INSERT INTO users (username, password_hash, created_at, is_admin, force_password_change)
               VALUES (?, ?, ?, 1, 1)""",
            ("admin", _hash("Admin@1234!"), datetime.utcnow().isoformat() + "Z"),
        )
        conn.commit()
        logging.info("Default admin created (username: admin). Change the password on first login.")
    except Exception as e:
        logging.error("Failed to seed default admin: %s", e)
    finally:
        conn.close()


def _conn() -> sqlite3.Connection:
    c = sqlite3.connect(DB_PATH, timeout=30, check_same_thread=False)
    c.row_factory = sqlite3.Row
    return c


# --- Password helpers ---

def _hash(password: str) -> str:
    return hashlib.sha256(password.encode("utf-8")).hexdigest()


# --- User management ---

def create_user(username: str, password: str) -> Optional[dict]:
    """Returns the new user dict, or None if username already exists."""
    try:
        conn = _conn()
        conn.execute(
            "INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)",
            (username.strip(), _hash(password), datetime.utcnow().isoformat() + "Z"),
        )
        conn.commit()
        row = conn.execute(
            "SELECT * FROM users WHERE username = ?", (username.strip(),)
        ).fetchone()
        conn.close()
        return dict(row) if row else None
    except sqlite3.IntegrityError:
        return None


def authenticate_user(username: str, password: str) -> Optional[dict]:
    """Returns user dict if credentials match, else None."""
    conn = _conn()
    row = conn.execute(
        "SELECT * FROM users WHERE username = ? AND password_hash = ?",
        (username.strip(), _hash(password)),
    ).fetchone()
    conn.close()
    return dict(row) if row else None


# --- Session management ---

def create_session(user_id: int) -> str:
    """Creates and persists a new session token, returning it."""
    token = str(uuid.uuid4())
    conn = _conn()
    try:
        conn.execute(
            "INSERT INTO sessions (token, user_id, created_at) VALUES (?, ?, ?)",
            (token, user_id, datetime.utcnow().isoformat() + "Z"),
        )
        conn.commit()
    finally:
        conn.close()
    return token


def get_session_user(token: str) -> Optional[dict]:
    """
    Returns the user dict for a valid session token, else None.
    Includes is_admin and force_password_change so callers don't need
    a separate query.
    """
    if not token:
        return None
    conn = _conn()
    row = conn.execute(
        """SELECT u.id, u.username, u.created_at,
                  COALESCE(u.is_admin, 0)              AS is_admin,
                  COALESCE(u.force_password_change, 0) AS force_password_change
             FROM users u
             JOIN sessions s ON u.id = s.user_id
            WHERE s.token = ?""",
        (token,),
    ).fetchone()
    conn.close()
    return dict(row) if row else None


def delete_session(token: str) -> None:
    conn = _conn()
    try:
        conn.execute("DELETE FROM sessions WHERE token = ?", (token,))
        conn.commit()
    finally:
        conn.close()


# --- Password management ---

def _validate_password_complexity(password: str) -> Optional[str]:
    """
    Returns an error message if the password does not meet complexity requirements,
    or None if it is valid.
    Requirements: 8+ chars, 1 uppercase, 1 lowercase, 1 digit, 1 special character.
    """
    import re
    if len(password) < 8:
        return "Senha deve ter pelo menos 8 caracteres."
    if not re.search(r"[A-Z]", password):
        return "Senha deve conter pelo menos uma letra maiuscula."
    if not re.search(r"[a-z]", password):
        return "Senha deve conter pelo menos uma letra minuscula."
    if not re.search(r"\d", password):
        return "Senha deve conter pelo menos um numero."
    if not re.search(r"[^A-Za-z0-9]", password):
        return "Senha deve conter pelo menos um caractere especial."
    return None


def change_password(
    user_id: int,
    current_password: str,
    new_password: str,
    skip_verify: bool = False,
) -> tuple:
    """
    Changes the user's password.
    Returns (True, None) on success or (False, error_message) on failure.
    skip_verify=True skips the current-password check (used on first login).
    """
    err = _validate_password_complexity(new_password)
    if err:
        return False, err

    conn = _conn()
    if not skip_verify:
        row = conn.execute(
            "SELECT password_hash FROM users WHERE id = ?", (user_id,)
        ).fetchone()
        conn.close()
        if not row or row["password_hash"] != _hash(current_password):
            return False, "Senha atual incorreta."
        conn = _conn()

    conn.execute(
        "UPDATE users SET password_hash = ?, force_password_change = 0 WHERE id = ?",
        (_hash(new_password), user_id),
    )
    conn.commit()
    conn.close()
    return True, None


def update_user_password(user_id: int, new_password: str) -> bool:
    """Admin-only: forcibly resets a user's password without checking current one."""
    conn = _conn()
    cursor = conn.execute(
        "UPDATE users SET password_hash = ? WHERE id = ?",
        (_hash(new_password), user_id),
    )
    conn.commit()
    conn.close()
    return cursor.rowcount > 0


# --- Metrics logging ---

def log_generation(
    doc_type: str,
    compartment: str,
    region: str,
    user_id: Optional[int] = None,
) -> None:
    """Record every document generation — anonymous or authenticated."""
    conn = _conn()
    try:
        conn.execute(
            """INSERT INTO doc_generations (user_id, doc_type, compartment, region, generated_at)
               VALUES (?, ?, ?, ?, ?)""",
            (user_id, doc_type, compartment or "N/A", region or "N/A",
             datetime.utcnow().isoformat() + "Z"),
        )
        conn.commit()
    finally:
        conn.close()


def get_metrics(user_id: Optional[int] = None) -> dict:
    """
    When user_id is set   → personal metrics for that user.
    When user_id is None  → global aggregate (all users + anonymous).
    """
    conn = _conn()
    where  = "WHERE user_id = ?" if user_id is not None else ""
    args   = (user_id,) if user_id is not None else ()
    and_kw = "AND" if where else "WHERE"

    total = conn.execute(
        f"SELECT COUNT(*) FROM doc_generations {where}", args
    ).fetchone()[0]

    this_month = conn.execute(
        f"SELECT COUNT(*) FROM doc_generations {where} "
        f"{and_kw} generated_at >= date('now','start of month')",
        args,
    ).fetchone()[0]

    by_type = conn.execute(
        f"SELECT doc_type, COUNT(*) AS count FROM doc_generations {where} "
        f"GROUP BY doc_type ORDER BY count DESC",
        args,
    ).fetchall()

    if user_id is None:
        recent = conn.execute(
            """SELECT g.id, g.doc_type, g.compartment, g.region, g.generated_at,
                      COALESCE(u.username, 'anônimo') AS username
                 FROM doc_generations g
                 LEFT JOIN users u ON g.user_id = u.id
                ORDER BY g.generated_at DESC LIMIT 12"""
        ).fetchall()
    else:
        recent = conn.execute(
            f"SELECT id, doc_type, compartment, region, generated_at "
            f"FROM doc_generations {where} ORDER BY generated_at DESC LIMIT 12",
            args,
        ).fetchall()

    # Fetch sparse rows then fill all 90 days so the frontend's slice(-N) period
    # filter always receives a complete dense array regardless of data gaps.
    sparse_rows = conn.execute(
        f"""SELECT date(generated_at) AS day,
                   SUM(CASE WHEN doc_type='new_host'   THEN 1 ELSE 0 END) AS new_host,
                   SUM(CASE WHEN doc_type='full_infra' THEN 1 ELSE 0 END) AS full_infra,
                   SUM(CASE WHEN doc_type='kubernetes' THEN 1 ELSE 0 END) AS kubernetes,
                   SUM(CASE WHEN doc_type='waf_report' THEN 1 ELSE 0 END) AS waf_report
              FROM doc_generations {where}
             {and_kw} generated_at >= date('now', '-89 days')
             GROUP BY day
             ORDER BY day ASC""",
        args,
    ).fetchall()

    sparse_map = {r["day"]: dict(r) for r in sparse_rows}

    # Build a complete dense array: today back 89 days = 90 entries
    today = datetime.utcnow().date()
    time_series_rows = []
    for offset in range(89, -1, -1):  # 89 days ago → today
        d = (today - timedelta(days=offset)).isoformat()
        row = sparse_map.get(d, {
            "day": d, "new_host": 0, "full_infra": 0,
            "kubernetes": 0, "waf_report": 0,
        })
        time_series_rows.append(dict(row))

    # Per-user breakdown is only available for global (non-filtered) metrics.
    per_user: list = []
    if user_id is None:
        per_user = conn.execute(
            """SELECT COALESCE(u.username, 'anônimo') AS username,
                      COALESCE(g.user_id, 0) AS user_id,
                      COUNT(*) AS count
                 FROM doc_generations g
                 LEFT JOIN users u ON g.user_id = u.id
                GROUP BY g.user_id
                ORDER BY count DESC
                LIMIT 10"""
        ).fetchall()

    conn.close()
    return {
        "total":      total,
        "this_month": this_month,
        "by_type":    [{"type": r["doc_type"], "count": r["count"]} for r in by_type],
        "recent":     [dict(r) for r in recent],
        "time_series": time_series_rows,
        "per_user":    [dict(r) for r in per_user],
    }


def get_user_generation_logs(user_id: Optional[int] = None) -> list:
    """
    Returns generation logs filtered by user.
    user_id=None  → anonymous (no user) generations only.
    user_id > 0   → generations for that specific user.
    """
    conn = _conn()
    if user_id is not None:
        rows = conn.execute(
            """SELECT g.id, g.doc_type, g.compartment, g.region, g.generated_at,
                      COALESCE(u.username, 'anônimo') AS username
                 FROM doc_generations g
                 LEFT JOIN users u ON g.user_id = u.id
                WHERE g.user_id = ?
                ORDER BY g.generated_at DESC""",
            (user_id,),
        ).fetchall()
    else:
        rows = conn.execute(
            """SELECT g.id, g.doc_type, g.compartment, g.region, g.generated_at,
                      'anônimo' AS username
                 FROM doc_generations g
                WHERE g.user_id IS NULL
                ORDER BY g.generated_at DESC"""
        ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


# --- User roles ---

def set_user_admin(user_id: int, is_admin: bool) -> None:
    """Legacy name kept for compatibility."""
    conn = _conn()
    conn.execute(
        "UPDATE users SET is_admin = ? WHERE id = ?",
        (1 if is_admin else 0, user_id),
    )
    conn.commit()
    conn.close()


def set_user_role(user_id: int, is_admin: bool) -> bool:
    """Used by main.py admin endpoints. Returns True if a row was updated."""
    conn = _conn()
    cursor = conn.execute(
        "UPDATE users SET is_admin = ? WHERE id = ?",
        (1 if is_admin else 0, user_id),
    )
    conn.commit()
    conn.close()
    return cursor.rowcount > 0


def get_user_by_id(user_id: int) -> Optional[dict]:
    """Returns a minimal user dict (id, username) for the given id, or None."""
    conn = _conn()
    row = conn.execute("SELECT id, username FROM users WHERE id = ?", (user_id,)).fetchone()
    conn.close()
    return dict(row) if row else None


def get_all_users() -> list:
    conn = _conn()
    # Separate subqueries avoid cross-join explosion between user_groups and doc_generations.
    rows = conn.execute(
        """SELECT u.id, u.username, u.created_at,
                  COALESCE(u.is_admin, 0) AS is_admin,
                  COALESCE(g.groups, '')  AS groups,
                  COALESCE(d.doc_count, 0) AS doc_count
             FROM users u
             LEFT JOIN (
                 SELECT ug.user_id,
                        GROUP_CONCAT(gr.name, ',') AS groups
                   FROM user_groups ug
                   JOIN groups gr ON gr.id = ug.group_id
                  GROUP BY ug.user_id
             ) g ON g.user_id = u.id
             LEFT JOIN (
                 SELECT user_id, COUNT(*) AS doc_count
                   FROM doc_generations
                  GROUP BY user_id
             ) d ON d.user_id = u.id
            ORDER BY u.created_at DESC"""
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def list_users() -> list:
    """Alias for get_all_users — used by main.py admin endpoints."""
    return get_all_users()


def delete_user(user_id: int) -> bool:
    conn = _conn()
    conn.execute("DELETE FROM sessions    WHERE user_id  = ?", (user_id,))
    conn.execute("DELETE FROM user_groups WHERE user_id  = ?", (user_id,))
    conn.execute("DELETE FROM users       WHERE id       = ?", (user_id,))
    conn.commit()
    conn.close()
    return True


# --- Groups ---

def list_groups() -> list:
    conn = _conn()
    rows = conn.execute(
        """SELECT g.id, g.name, g.allowed_doc_types,
                  COUNT(ug.user_id) AS member_count
             FROM groups g
             LEFT JOIN user_groups ug ON g.id = ug.group_id
            GROUP BY g.id
            ORDER BY g.name"""
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def create_group(name: str) -> tuple[Optional[dict], Optional[str]]:
    """
    Returns (group_dict, None) on success.
    Returns (None, "duplicate") if the name already exists.
    Returns (None, "error") for any other failure.
    """
    conn = _conn()
    result: tuple[Optional[dict], Optional[str]] = (None, "error")
    try:
        conn.execute(
            "INSERT INTO groups (name, allowed_doc_types) VALUES (?, ?)",
            (name.strip(), ""),
        )
        conn.commit()
        row = conn.execute(
            "SELECT * FROM groups WHERE name = ?", (name.strip(),)
        ).fetchone()
        result = (dict(row) if row else None), None
    except sqlite3.IntegrityError:
        result = None, "duplicate"
    except Exception:
        result = None, "error"
    finally:
        conn.close()
    return result


def delete_group(group_id: int) -> bool:
    conn = _conn()
    conn.execute("DELETE FROM user_groups WHERE group_id = ?", (group_id,))
    conn.execute("DELETE FROM groups      WHERE id       = ?", (group_id,))
    conn.commit()
    conn.close()
    return True


def assign_user_to_group(user_id: int, group_id: int) -> None:
    conn = _conn()
    try:
        conn.execute(
            "INSERT OR IGNORE INTO user_groups (user_id, group_id) VALUES (?, ?)",
            (user_id, group_id),
        )
        conn.commit()
    except Exception:
        pass
    conn.close()


def remove_user_from_group(user_id: int, group_id: int) -> None:
    conn = _conn()
    conn.execute(
        "DELETE FROM user_groups WHERE user_id = ? AND group_id = ?",
        (user_id, group_id),
    )
    conn.commit()
    conn.close()


def get_user_groups(user_id: int) -> list:
    conn = _conn()
    rows = conn.execute(
        """SELECT g.id, g.name, g.allowed_doc_types
             FROM groups g
             JOIN user_groups ug ON g.id = ug.group_id
            WHERE ug.user_id = ?""",
        (user_id,),
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def set_group_doc_permissions(group_id: int, doc_types: list) -> None:
    conn = _conn()
    conn.execute(
        "UPDATE groups SET allowed_doc_types = ? WHERE id = ?",
        (",".join(doc_types), group_id),
    )
    conn.commit()
    conn.close()


def get_user_allowed_doc_types(user_id: int) -> Optional[list]:
    """
    Returns the union of allowed_doc_types across all groups the user belongs to.
    Returns None  → user is in NO groups (no restrictions, all types allowed).
    Returns []    → user is in groups but none grant any specific type.
    Returns [...]  → explicit list of permitted doc types.
    """
    groups = get_user_groups(user_id)
    if not groups:
        return None  # No group membership means no doc-type restrictions.
    allowed = set()
    for g in groups:
        types_str = g.get("allowed_doc_types") or ""
        for t in str(types_str).split(","):
            t = t.strip()
            if t:
                allowed.add(t)
    return sorted(allowed)


# --- User profiles ---

def get_user_profile(user_id: int) -> dict:
    """Returns the profile for a user, with empty defaults if not yet set."""
    conn = _conn()
    row = conn.execute(
        "SELECT first_name, last_name, email, phone, notes FROM user_profiles WHERE user_id = ?",
        (user_id,),
    ).fetchone()
    conn.close()
    if row:
        return dict(row)
    return {"first_name": "", "last_name": "", "email": "", "phone": "", "notes": ""}


def upsert_user_profile(
    user_id: int,
    first_name: str,
    last_name: str,
    email: str,
    phone: str,
    notes: str,
) -> None:
    """Inserts or updates a user's profile record."""
    conn = _conn()
    conn.execute(
        """INSERT INTO user_profiles (user_id, first_name, last_name, email, phone, notes)
           VALUES (?, ?, ?, ?, ?, ?)
           ON CONFLICT(user_id) DO UPDATE SET
               first_name = excluded.first_name,
               last_name  = excluded.last_name,
               email      = excluded.email,
               phone      = excluded.phone,
               notes      = excluded.notes""",
        (user_id, first_name, last_name, email, phone, notes),
    )
    conn.commit()
    conn.close()


# --- Feedback ---

def add_feedback(user_id: Optional[int], category: str, message: str) -> dict:
    """Stores a new feedback entry. Returns the created record's id."""
    conn = _conn()
    cursor = conn.execute(
        """INSERT INTO feedback (user_id, category, message, status, created_at)
           VALUES (?, ?, ?, 'open', ?)""",
        (user_id, category, message, datetime.utcnow().isoformat() + "Z"),
    )
    feedback_id = cursor.lastrowid
    conn.commit()
    conn.close()
    return {"id": feedback_id, "ok": True}


def list_feedback(status: Optional[str] = None) -> list:
    """Returns all feedback entries, optionally filtered by status."""
    conn = _conn()
    if status:
        rows = conn.execute(
            """SELECT f.id, f.category, f.message, f.status, f.created_at,
                      COALESCE(u.username, 'anônimo') AS username
                 FROM feedback f
                 LEFT JOIN users u ON f.user_id = u.id
                WHERE f.status = ?
                ORDER BY f.created_at DESC""",
            (status,),
        ).fetchall()
    else:
        rows = conn.execute(
            """SELECT f.id, f.category, f.message, f.status, f.created_at,
                      COALESCE(u.username, 'anônimo') AS username
                 FROM feedback f
                 LEFT JOIN users u ON f.user_id = u.id
                ORDER BY f.created_at DESC"""
        ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def update_feedback_status(feedback_id: int, status: str) -> bool:
    """Updates the status of a feedback entry. Returns True if found."""
    conn = _conn()
    cursor = conn.execute(
        "UPDATE feedback SET status = ? WHERE id = ?", (status, feedback_id)
    )
    conn.commit()
    conn.close()
    return cursor.rowcount > 0

# --- Tenancy Profiles ---

def create_tenancy_profile(
    name: str,
    auth_method: str,
    region: str,
    created_by: int,
    is_public: bool = False,
    visibility: str = "by_group",
    tenancy_name: Optional[str] = None,
    tenancy_ocid: Optional[str] = None,
    user_ocid: Optional[str] = None,
    fingerprint: Optional[str] = None,
    private_key_pem: Optional[str] = None,
) -> tuple[Optional[dict], Optional[str]]:
    """
    Creates a tenancy profile. Private key is encrypted before storage.
    visibility: admin_only | all_users | by_group | by_user
    Returns (profile_dict, None) on success or (None, error_str) on failure.
    """
    valid_vis = {"admin_only", "all_users", "by_group", "by_user"}
    if visibility not in valid_vis:
        visibility = "by_group"
    conn = _conn()
    result: tuple[Optional[dict], Optional[str]] = (None, "error")
    try:
        encrypted_key = encrypt_value(private_key_pem) if private_key_pem else None
        conn.execute(
            """INSERT INTO tenancy_profiles
               (name, auth_method, tenancy_name, tenancy_ocid, user_ocid, fingerprint,
                private_key_encrypted, region, is_active, is_public, visibility, created_by, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)""",
            (name.strip(), auth_method.upper(), tenancy_name or '', tenancy_ocid, user_ocid, fingerprint,
             encrypted_key, region, 1 if is_public else 0, visibility, created_by,
             datetime.utcnow().isoformat() + "Z"),
        )
        conn.commit()
        row = conn.execute(
            "SELECT id, name, auth_method, tenancy_name, tenancy_ocid, user_ocid, fingerprint, "
            "region, is_active, is_public, visibility, created_by, created_at "
            "FROM tenancy_profiles WHERE name = ?", (name.strip(),)
        ).fetchone()
        result = (dict(row) if row else None), None
    except sqlite3.IntegrityError:
        result = None, "duplicate"
    except Exception as e:
        logging.error("create_tenancy_profile error: %s", e)
        result = None, "error"
    finally:
        conn.close()
    return result


def list_tenancy_profiles(include_inactive: bool = False) -> list:
    """Returns all profiles without the encrypted private key."""
    conn = _conn()
    where = "" if include_inactive else "WHERE is_active = 1"
    rows = conn.execute(
        f"""SELECT id, name, auth_method, tenancy_name, tenancy_ocid, user_ocid, fingerprint,
                   region, is_active, is_public, visibility, created_by, created_at
              FROM tenancy_profiles {where}
             ORDER BY name"""
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def get_tenancy_profile(profile_id: int, decrypt_key: bool = False) -> Optional[dict]:
    """
    Returns a single profile by id.
    Set decrypt_key=True only when credentials are needed for OCI calls.
    """
    conn = _conn()
    row = conn.execute(
        """SELECT id, name, auth_method, tenancy_name, tenancy_ocid, user_ocid, fingerprint,
                  private_key_encrypted, region, is_active, is_public, visibility, created_by, created_at
             FROM tenancy_profiles WHERE id = ?""",
        (profile_id,),
    ).fetchone()
    conn.close()
    if not row:
        return None
    profile: dict = dict(row)
    if decrypt_key and profile.get("private_key_encrypted"):
        try:
            profile["private_key_pem"] = decrypt_value(profile["private_key_encrypted"])
        except Exception:
            profile["private_key_pem"] = None
    profile.pop("private_key_encrypted", None)
    return profile


def update_tenancy_profile(
    profile_id: int,
    name: Optional[str] = None,
    auth_method: Optional[str] = None,
    region: Optional[str] = None,
    tenancy_name: Optional[str] = None,
    is_public: Optional[bool] = None,
    is_active: Optional[bool] = None,
    visibility: Optional[str] = None,
    tenancy_ocid: Optional[str] = None,
    user_ocid: Optional[str] = None,
    fingerprint: Optional[str] = None,
    private_key_pem: Optional[str] = None,
) -> bool:
    """Partial update — only non-None fields are changed."""
    conn = _conn()
    fields: list = []
    values: list = []
    if name is not None:
        fields.append("name = ?"); values.append(name.strip())
    if auth_method is not None:
        fields.append("auth_method = ?"); values.append(auth_method.upper())
    if region is not None:
        fields.append("region = ?"); values.append(region)
    if tenancy_name is not None:
        fields.append("tenancy_name = ?"); values.append(tenancy_name)
    if is_public is not None:
        fields.append("is_public = ?"); values.append(1 if is_public else 0)
    if is_active is not None:
        fields.append("is_active = ?"); values.append(1 if is_active else 0)
    if visibility is not None:
        valid_vis = {"admin_only", "all_users", "by_group", "by_user"}
        fields.append("visibility = ?"); values.append(visibility if visibility in valid_vis else "by_group")
    if tenancy_ocid is not None:
        fields.append("tenancy_ocid = ?"); values.append(tenancy_ocid)
    if user_ocid is not None:
        fields.append("user_ocid = ?"); values.append(user_ocid)
    if fingerprint is not None:
        fields.append("fingerprint = ?"); values.append(fingerprint)
    if private_key_pem is not None:
        fields.append("private_key_encrypted = ?")
        values.append(encrypt_value(private_key_pem))
    if not fields:
        conn.close()
        return False
    values.append(profile_id)
    cursor = conn.execute(
        f"UPDATE tenancy_profiles SET {', '.join(fields)} WHERE id = ?", values
    )
    conn.commit()
    conn.close()
    return cursor.rowcount > 0


def delete_tenancy_profile(profile_id: int) -> bool:
    conn = _conn()
    conn.execute("DELETE FROM group_profiles             WHERE profile_id = ?", (profile_id,))
    conn.execute("DELETE FROM user_profile_assignments   WHERE profile_id = ?", (profile_id,))
    conn.execute("DELETE FROM tenancy_profiles           WHERE id         = ?", (profile_id,))
    conn.commit()
    conn.close()
    return True


def get_profiles_for_user(user_id: int, is_admin: bool, include_inactive: bool = False) -> list:
    """
    Returns profiles accessible to a user based on visibility tier:
    - admin_only  → only admins
    - all_users   → any authenticated user
    - by_group    → users in assigned groups
    - by_user     → users explicitly assigned
    Admins always see all active profiles.

    When include_inactive=True the is_active filter is removed so that inactive
    profiles are also returned (still marked with is_active=0). Used by the
    generator endpoint so the frontend can show them as locked/disabled items.
    """
    active_filter = "" if include_inactive else "WHERE is_active = 1"
    conn = _conn()
    if is_admin:
        rows = conn.execute(
            f"""SELECT id, name, auth_method, tenancy_name, tenancy_ocid, region, is_active, is_public, visibility
                  FROM tenancy_profiles {active_filter} ORDER BY name"""
        ).fetchall()
    else:
        where_clause = (
            """WHERE tp.visibility != 'admin_only'
                 AND (
                     tp.visibility = 'all_users'
                     OR (tp.visibility = 'by_group'  AND ug.user_id = ?)
                     OR (tp.visibility = 'by_user'   AND ua.user_id = ?)
                 )"""
            if include_inactive else
            """WHERE tp.is_active = 1
                 AND tp.visibility != 'admin_only'
                 AND (
                     tp.visibility = 'all_users'
                     OR (tp.visibility = 'by_group'  AND ug.user_id = ?)
                     OR (tp.visibility = 'by_user'   AND ua.user_id = ?)
                 )"""
        )
        rows = conn.execute(
            f"""SELECT DISTINCT tp.id, tp.name, tp.auth_method, tp.tenancy_name, tp.tenancy_ocid, tp.region,
                               tp.is_active, tp.is_public, tp.visibility
                 FROM tenancy_profiles tp
                 LEFT JOIN group_profiles gp          ON tp.id = gp.profile_id
                 LEFT JOIN user_groups ug             ON gp.group_id = ug.group_id
                 LEFT JOIN user_profile_assignments ua ON tp.id = ua.profile_id
                {where_clause}
                ORDER BY tp.name""",
            (user_id, user_id),
        ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def set_user_profile_assignments(profile_id: int, user_ids: list) -> None:
    """Replaces all direct user assignments for a profile."""
    conn = _conn()
    conn.execute("DELETE FROM user_profile_assignments WHERE profile_id = ?", (profile_id,))
    for uid in user_ids:
        conn.execute(
            "INSERT OR IGNORE INTO user_profile_assignments (user_id, profile_id) VALUES (?, ?)",
            (uid, profile_id),
        )
    conn.commit()
    conn.close()


def get_user_profile_assignments(profile_id: int) -> list:
    """Returns users directly assigned to a profile."""
    conn = _conn()
    rows = conn.execute(
        """SELECT u.id, u.username
             FROM users u
             JOIN user_profile_assignments ua ON u.id = ua.user_id
            WHERE ua.profile_id = ?
            ORDER BY u.username""",
        (profile_id,),
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def get_profile_groups(profile_id: int) -> list:
    """Returns all groups that have access to a given tenancy profile."""
    conn = _conn()
    rows = conn.execute(
        """SELECT g.id, g.name
             FROM groups g
             JOIN group_profiles gp ON g.id = gp.group_id
            WHERE gp.profile_id = ?
            ORDER BY g.name""",
        (profile_id,),
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def set_profile_groups(profile_id: int, group_ids: list) -> None:
    """Replaces all group assignments for a profile with the given list."""
    conn = _conn()
    conn.execute("DELETE FROM group_profiles WHERE profile_id = ?", (profile_id,))
    for gid in group_ids:
        conn.execute(
            "INSERT OR IGNORE INTO group_profiles (group_id, profile_id) VALUES (?, ?)",
            (int(gid), profile_id),
        )
    conn.commit()
    conn.close()


def set_group_profiles(group_id: int, profile_ids: list) -> None:
    """Replaces all profile assignments for a group."""
    conn = _conn()
    conn.execute("DELETE FROM group_profiles WHERE group_id = ?", (group_id,))
    for pid in profile_ids:
        conn.execute(
            "INSERT OR IGNORE INTO group_profiles (group_id, profile_id) VALUES (?, ?)",
            (group_id, pid),
        )
    conn.commit()
    conn.close()


def get_group_profiles(group_id: int) -> list:
    conn = _conn()
    rows = conn.execute(
        """SELECT tp.id, tp.name, tp.auth_method, tp.region
             FROM tenancy_profiles tp
             JOIN group_profiles gp ON tp.id = gp.profile_id
            WHERE gp.group_id = ?
            ORDER BY tp.name""",
        (group_id,),
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]

# --- Announcements ---

def list_announcements(active_only: bool = False) -> list:
    """Returns all announcements, newest first. Optionally filter to active & non-expired."""
    conn = _conn()
    if active_only:
        rows = conn.execute(
            """SELECT * FROM announcements
                WHERE is_active = 1
                  AND (expires_at IS NULL OR expires_at > strftime('%Y-%m-%dT%H:%M:%SZ','now'))
                ORDER BY created_at DESC"""
        ).fetchall()
    else:
        rows = conn.execute(
            "SELECT * FROM announcements ORDER BY created_at DESC"
        ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def create_announcement(title: str, message: str, type_: str,
                        expires_at: str | None, created_by: int) -> dict:
    """Creates a new announcement and returns it."""
    conn = _conn()
    cur = conn.execute(
        """INSERT INTO announcements (title, message, type, expires_at, created_by)
           VALUES (?, ?, ?, ?, ?)""",
        (title, message, type_, expires_at, created_by),
    )
    conn.commit()
    row = conn.execute("SELECT * FROM announcements WHERE id = ?", (cur.lastrowid,)).fetchone()
    conn.close()
    return dict(row)


def update_announcement(ann_id: int, **kwargs) -> dict | None:
    """Updates fields of an announcement. Accepts title, message, type, expires_at, is_active."""
    allowed = {"title", "message", "type", "expires_at", "is_active"}
    fields  = {k: v for k, v in kwargs.items() if k in allowed and v is not None}
    if not fields:
        return get_announcement(ann_id)
    set_clause = ", ".join(f"{k} = ?" for k in fields)
    conn = _conn()
    conn.execute(
        f"UPDATE announcements SET {set_clause} WHERE id = ?",
        list(fields.values()) + [ann_id],
    )
    conn.commit()
    row = conn.execute("SELECT * FROM announcements WHERE id = ?", (ann_id,)).fetchone()
    conn.close()
    return dict(row) if row else None


def delete_announcement(ann_id: int) -> bool:
    conn = _conn()
    cur = conn.execute("DELETE FROM announcements WHERE id = ?", (ann_id,))
    conn.commit()
    conn.close()
    return cur.rowcount > 0


def get_announcement(ann_id: int) -> dict | None:
    conn = _conn()
    row = conn.execute("SELECT * FROM announcements WHERE id = ?", (ann_id,)).fetchone()
    conn.close()
    return dict(row) if row else None
