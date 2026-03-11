# ==============================================================================
# auth.py — Authentication, session management, and metrics for OCI DocGen.
#     Tables: users, sessions, doc_generations, groups, user_groups,
#             user_profiles, feedback
# ==============================================================================

import hashlib
import logging
import sqlite3
import uuid
from datetime import datetime, timedelta
from typing import Optional

DB_PATH = "oci_docgen.db"


# ==============================================================================
# Database bootstrap
# ==============================================================================

def init_db() -> None:
    """Create tables and run migrations. Called once at FastAPI startup."""
    conn = _conn()

    # --- Table creation (idempotent) ---
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
    ]
    for stmt in create_stmts:
        try:
            conn.execute(stmt)
        except Exception:
            pass

    # --- Column migrations for pre-existing databases ---
    # Each ALTER is wrapped individually so one failure doesn't block the rest.
    migrations = [
        "ALTER TABLE users ADD COLUMN is_admin              INTEGER DEFAULT 0",
        "ALTER TABLE users ADD COLUMN force_password_change INTEGER DEFAULT 0",
        "ALTER TABLE groups ADD COLUMN allowed_doc_types    TEXT    DEFAULT ''",
    ]
    for migration in migrations:
        try:
            conn.execute(migration)
        except Exception:
            pass  # Column already exists — safe to ignore

    conn.commit()
    conn.close()
    logging.info("OCI DocGen DB initialised at %s", DB_PATH)


def _conn() -> sqlite3.Connection:
    c = sqlite3.connect(DB_PATH)
    c.row_factory = sqlite3.Row
    return c


# ==============================================================================
# Password helpers
# ==============================================================================

def _hash(password: str) -> str:
    return hashlib.sha256(password.encode("utf-8")).hexdigest()


# ==============================================================================
# User management
# ==============================================================================

def create_user(username: str, password: str) -> Optional[dict]:
    """Returns the new user dict, or None if username already exists."""
    try:
        conn = _conn()
        conn.execute(
            "INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)",
            (username.strip(), _hash(password), datetime.utcnow().isoformat()),
        )
        conn.commit()
        row = conn.execute(
            "SELECT * FROM users WHERE username = ?", (username.strip(),)
        ).fetchone()
        conn.close()
        return dict(row) if row else None
    except sqlite3.IntegrityError:
        return None  # Username taken


def authenticate_user(username: str, password: str) -> Optional[dict]:
    """Returns user dict if credentials match, else None."""
    conn = _conn()
    row = conn.execute(
        "SELECT * FROM users WHERE username = ? AND password_hash = ?",
        (username.strip(), _hash(password)),
    ).fetchone()
    conn.close()
    return dict(row) if row else None


# ==============================================================================
# Session management
# ==============================================================================

def create_session(user_id: int) -> str:
    """Creates and persists a new session token, returning it."""
    token = str(uuid.uuid4())
    conn = _conn()
    conn.execute(
        "INSERT INTO sessions (token, user_id, created_at) VALUES (?, ?, ?)",
        (token, user_id, datetime.utcnow().isoformat()),
    )
    conn.commit()
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
    conn.execute("DELETE FROM sessions WHERE token = ?", (token,))
    conn.commit()
    conn.close()


# ==============================================================================
# Password management
# ==============================================================================

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
    if len(new_password) < 6:
        return False, "Senha precisa ter pelo menos 6 caracteres."

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


# ==============================================================================
# Metrics logging
# ==============================================================================

def log_generation(
    doc_type: str,
    compartment: str,
    region: str,
    user_id: Optional[int] = None,
) -> None:
    """Record every document generation — anonymous or authenticated."""
    conn = _conn()
    conn.execute(
        """INSERT INTO doc_generations (user_id, doc_type, compartment, region, generated_at)
           VALUES (?, ?, ?, ?, ?)""",
        (user_id, doc_type, compartment or "N/A", region or "N/A",
         datetime.utcnow().isoformat()),
    )
    conn.commit()
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

    # Build a lookup dict from the sparse results
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

    # per_user breakdown (global only)
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


# ==============================================================================
# User roles (is_admin flag)
# ==============================================================================

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


# ==============================================================================
# Groups
# ==============================================================================

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


def create_group(name: str) -> Optional[dict]:
    try:
        conn = _conn()
        conn.execute(
            "INSERT INTO groups (name, allowed_doc_types) VALUES (?, ?)",
            (name.strip(), ""),
        )
        conn.commit()
        row = conn.execute(
            "SELECT * FROM groups WHERE name = ?", (name.strip(),)
        ).fetchone()
        conn.close()
        return dict(row) if row else None
    except Exception:
        return None


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
        return None  # No group membership → no restrictions
    allowed = set()
    for g in groups:
        types_str = g.get("allowed_doc_types") or ""
        for t in types_str.split(","):
            t = t.strip()
            if t:
                allowed.add(t)
    return sorted(allowed)


# ==============================================================================
# User profiles
# ==============================================================================

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


# ==============================================================================
# Feedback
# ==============================================================================

def add_feedback(user_id: Optional[int], category: str, message: str) -> dict:
    """Stores a new feedback entry. Returns the created record's id."""
    conn = _conn()
    cursor = conn.execute(
        """INSERT INTO feedback (user_id, category, message, status, created_at)
           VALUES (?, ?, ?, 'open', ?)""",
        (user_id, category, message, datetime.utcnow().isoformat()),
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