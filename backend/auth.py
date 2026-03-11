# ==============================================================================
# auth.py — Authentication & Metrics for OCI DocGen
# Requires no extra pip packages beyond Python stdlib.
# Tables: users, sessions, doc_generations
# ==============================================================================

import hashlib
import logging
import sqlite3
import uuid
from datetime import datetime
from typing import Optional

DB_PATH = "oci_docgen.db"


# ==============================================================================
# Database bootstrap
# ==============================================================================

def init_db() -> None:
    """Create tables if they don't exist yet. Called once at FastAPI startup."""
    conn = _conn()
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS users (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            username      TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            created_at    TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS sessions (
            token       TEXT PRIMARY KEY,
            user_id     INTEGER NOT NULL,
            created_at  TEXT NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users(id)
        );

        CREATE TABLE IF NOT EXISTS doc_generations (
            id           INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id      INTEGER,
            doc_type     TEXT NOT NULL,
            compartment  TEXT,
            region       TEXT,
            generated_at TEXT NOT NULL
        );
    """)
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
        row = conn.execute("SELECT * FROM users WHERE username = ?", (username.strip(),)).fetchone()
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
    """Returns the user dict for a valid session token, else None."""
    if not token:
        return None
    conn = _conn()
    row = conn.execute(
        """SELECT u.id, u.username, u.created_at
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
            f"""SELECT g.id, g.doc_type, g.compartment, g.region, g.generated_at,
                       COALESCE(u.username, 'anônimo') AS username
                  FROM doc_generations g
                  LEFT JOIN users u ON g.user_id = u.id
                 ORDER BY g.generated_at DESC LIMIT 12""",
        ).fetchall()
    else:
        recent = conn.execute(
            f"SELECT id, doc_type, compartment, region, generated_at FROM doc_generations "
            f"{where} ORDER BY generated_at DESC LIMIT 12",
            args,
        ).fetchall()

    conn.close()

    return {
        "total": total,
        "this_month": this_month,
        "by_type": [{"type": r["doc_type"], "count": r["count"]} for r in by_type],
        "recent": [dict(r) for r in recent],
    }