"""Autenticação e autorização (RBAC) para o CRM."""

from __future__ import annotations

import hashlib
import hmac
import json
import os
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any

from sqlalchemy import create_engine, text

from config import DEMO_MODE, get_db_url
import demo_data


PBKDF2_ITERATIONS = 120_000


# Todas as páginas disponíveis no sistema
ALL_PAGES: list[str] = [
    "Dashboard", "Atendimentos", "Resumo por data", "Técnicos", "Clientes", "Usuários", "WhatsApp", "Sobre",
]

# Todas as ações possíveis
ALL_ACTIONS: list[str] = [
    "attendance:create", "attendance:update", "attendance:delete",
    "client:create", "client:update",
    "technician:create", "technician:update", "technician:delete",
]

ROLE_ALLOWED_PAGES: dict[str, list[str]] = {
    "gerente": ["Dashboard", "Atendimentos", "Resumo por data", "Técnicos", "Clientes", "Usuários", "WhatsApp", "Sobre"],
    "atendente": ["Dashboard", "Atendimentos", "Resumo por data", "Clientes", "Sobre"],
    "tecnico": ["Dashboard", "Atendimentos", "Resumo por data", "Sobre"],
}

ROLE_DEFAULT_ACTIONS: dict[str, list[str]] = {
    "gerente": [
        "attendance:create", "attendance:update", "attendance:delete",
        "client:create", "client:update",
        "technician:create", "technician:update", "technician:delete",
    ],
    "atendente": ["attendance:create", "attendance:update", "client:create", "client:update"],
    "tecnico": ["attendance:update"],
}


@dataclass
class AuthUser:
    id: int
    username: str
    full_name: str
    role: str
    is_active: bool
    allowed_pages: list[str] | None = field(default=None)  # None = usa padrão do role
    can_actions: list[str] | None = field(default=None)    # None = usa padrão do role


def _engine():
    return create_engine(get_db_url(), pool_pre_ping=True)


def _hash_password(password: str, salt: bytes | None = None) -> str:
    if salt is None:
        salt = os.urandom(16)
    derived = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        salt,
        PBKDF2_ITERATIONS,
    )
    return f"pbkdf2_sha256${PBKDF2_ITERATIONS}${salt.hex()}${derived.hex()}"


def _verify_password(password: str, stored_hash: str) -> bool:
    try:
        scheme, iterations, salt_hex, hash_hex = stored_hash.split("$", 3)
        if scheme != "pbkdf2_sha256":
            return False
        test = hashlib.pbkdf2_hmac(
            "sha256",
            password.encode("utf-8"),
            bytes.fromhex(salt_hex),
            int(iterations),
        )
        return hmac.compare_digest(test.hex(), hash_hex)
    except Exception:
        return False


def _migrate_database() -> None:
    """Não necessário com PostgreSQL — schema criado via supabase_schema.sql."""
    pass


def initialize_auth_database() -> None:
    """Schema já criado no Supabase. Apenas faz seed de usuários padrão se vazio."""
    engine = _engine()
    with engine.connect() as conn:
        total = conn.execute(text("SELECT COUNT(*) FROM users")).scalar()
        if total and total > 0:
            return
        now = datetime.now().isoformat(timespec="seconds")
        seed_users = [
            ("gerente",   "Gerente",   "gerente",   _hash_password("gerente123")),
            ("atendente", "Atendente", "atendente", _hash_password("atendente123")),
            ("tecnico",   "Técnico",   "tecnico",   _hash_password("tecnico123")),
        ]
        for uname, fname, role, pw_hash in seed_users:
            conn.execute(
                text(
                    "INSERT INTO users (username, full_name, role, password_hash, is_active, created_at)"
                    " VALUES (:u, :f, :r, :p, TRUE, :now)"
                    " ON CONFLICT (username) DO NOTHING"
                ),
                {"u": uname, "f": fname, "r": role, "p": pw_hash, "now": now},
            )
        conn.commit()


def authenticate_user(username: str, password: str) -> AuthUser | None:
    uname = username.strip().lower()
    if not uname or not password:
        return None

    engine = _engine()
    with engine.connect() as conn:
        row = conn.execute(
            text("SELECT * FROM users WHERE username = :u LIMIT 1"),
            {"u": uname},
        ).mappings().fetchone()

        if row is None or not row["is_active"]:
            return None
        if not _verify_password(password, row["password_hash"]):
            return None

        conn.execute(
            text("UPDATE users SET last_login = :ts WHERE id = :id"),
            {"ts": datetime.now().isoformat(timespec="seconds"), "id": row["id"]},
        )
        conn.commit()

        raw_pages = row["allowed_pages"]
        raw_actions = row["can_actions"]
        return AuthUser(
            id=int(row["id"]),
            username=str(row["username"]),
            full_name=str(row["full_name"]),
            role=str(row["role"]),
            is_active=bool(row["is_active"]),
            allowed_pages=json.loads(raw_pages) if raw_pages else None,
            can_actions=json.loads(raw_actions) if raw_actions else None,
        )


def get_allowed_pages(role: str, user_allowed_pages: list[str] | None = None) -> list[str]:
    if user_allowed_pages is not None:
        return user_allowed_pages
    return ROLE_ALLOWED_PAGES.get(role, ["Sobre"])


def can_access_page(role: str, page: str, user_allowed_pages: list[str] | None = None) -> bool:
    return page in get_allowed_pages(role, user_allowed_pages)


def can_manage(role: str, action: str, user_can_actions: list[str] | None = None) -> bool:
    if user_can_actions is not None:
        return action in user_can_actions
    return action in ROLE_DEFAULT_ACTIONS.get(role, [])


def user_to_session_dict(user: AuthUser) -> dict[str, Any]:
    return {
        "id": user.id,
        "username": user.username,
        "full_name": user.full_name,
        "role": user.role,
        "is_active": user.is_active,
        "allowed_pages": user.allowed_pages,
        "can_actions": user.can_actions,
    }


def list_users() -> list[dict]:
    """Retorna todos os usuários."""
    if DEMO_MODE:
        return demo_data.list_users()
    engine = _engine()
    with engine.connect() as conn:
        rows = conn.execute(
            text(
                "SELECT id, username, full_name, role, is_active, created_at, last_login,"
                " allowed_pages, can_actions FROM users ORDER BY id"
            )
        ).mappings().fetchall()
        return [dict(r) for r in rows]


def create_user(username: str, full_name: str, role: str, password: str) -> AuthUser:
    """Cria novo usuário."""
    uname = username.strip().lower()
    if not uname or not full_name.strip() or not password:
        raise ValueError("Todos os campos são obrigatórios.")
    if DEMO_MODE:
        row = demo_data.create_user(uname, full_name, role, password)
        return AuthUser(
            id=int(row["id"]),
            username=str(row["username"]),
            full_name=str(row["full_name"]),
            role=str(row["role"]),
            is_active=bool(row["is_active"]),
        )
    now = datetime.now().isoformat(timespec="seconds")
    pw_hash = _hash_password(password)
    engine = _engine()
    with engine.connect() as conn:
        row = conn.execute(
            text(
                "INSERT INTO users (username, full_name, role, password_hash, is_active, created_at)"
                " VALUES (:u, :f, :r, :p, TRUE, :now) RETURNING id"
            ),
            {"u": uname, "f": full_name.strip(), "r": role, "p": pw_hash, "now": now},
        ).fetchone()
        conn.commit()
        new_id = row[0] if row else 0
    return AuthUser(
        id=new_id, username=uname, full_name=full_name.strip(), role=role, is_active=True
    )


def update_user(
    user_id: int,
    *,
    full_name: str | None = None,
    role: str | None = None,
    is_active: bool | None = None,
    allowed_pages: list[str] | None = None,
    can_actions: list[str] | None = None,
    clear_allowed_pages: bool = False,
    clear_can_actions: bool = False,
) -> bool:
    """Atualiza campos do usuário. Passe None para não alterar."""
    set_parts: list[str] = []
    params: dict[str, Any] = {"uid": user_id}

    if full_name is not None:
        set_parts.append("full_name = :full_name")
        params["full_name"] = full_name.strip()
    if role is not None:
        set_parts.append("role = :role")
        params["role"] = role
    if is_active is not None:
        set_parts.append("is_active = :is_active")
        params["is_active"] = is_active
    if allowed_pages is not None:
        set_parts.append("allowed_pages = :allowed_pages")
        params["allowed_pages"] = json.dumps(allowed_pages, ensure_ascii=False)
    elif clear_allowed_pages:
        set_parts.append("allowed_pages = NULL")
    if can_actions is not None:
        set_parts.append("can_actions = :can_actions")
        params["can_actions"] = json.dumps(can_actions, ensure_ascii=False)
    elif clear_can_actions:
        set_parts.append("can_actions = NULL")

    if not set_parts:
        return False

    if DEMO_MODE:
        updates: dict[str, Any] = {}
        for part in set_parts:
            if part.startswith("full_name"):
                updates["full_name"] = params["full_name"]
            elif part.startswith("role"):
                updates["role"] = params["role"]
            elif part.startswith("is_active"):
                updates["is_active"] = params["is_active"]
            elif part.startswith("allowed_pages = :"):
                updates["allowed_pages"] = params["allowed_pages"]
            elif part == "allowed_pages = NULL":
                updates["allowed_pages"] = None
            elif part.startswith("can_actions = :"):
                updates["can_actions"] = params["can_actions"]
            elif part == "can_actions = NULL":
                updates["can_actions"] = None
        return demo_data.update_user(user_id, **updates)

    engine = _engine()
    with engine.connect() as conn:
        result = conn.execute(
            text(f"UPDATE users SET {', '.join(set_parts)} WHERE id = :uid"),
            params,
        )
        conn.commit()
        return result.rowcount > 0


def change_password(user_id: int, new_password: str) -> bool:
    """Redefine a senha de um usuário."""
    if not new_password:
        raise ValueError("Senha não pode estar em branco.")
    if DEMO_MODE:
        return True
    pw_hash = _hash_password(new_password)
    engine = _engine()
    with engine.connect() as conn:
        result = conn.execute(
            text("UPDATE users SET password_hash = :pw WHERE id = :uid"),
            {"pw": pw_hash, "uid": user_id},
        )
        conn.commit()
        return result.rowcount > 0
