"""Consultas de leitura e escrita dos dados do WhatsApp no PostgreSQL (Supabase).

O bridge Node.js insere mensagens diretamente na tabela whatsapp_messages via REST API.
Este modulo apenas consulta e atualiza os dados.
"""

from __future__ import annotations

from datetime import datetime, timedelta

import pandas as pd
from sqlalchemy import create_engine, text

from config import DEMO_MODE, get_db_url
import demo_data


def _engine():
    return create_engine(get_db_url(), pool_pre_ping=True)


# --- Compatibilidade com codigo legado ---

def import_new_messages() -> int:
    """Nao-op: o bridge Node.js insere diretamente no Supabase."""
    return 0


def tables_exist() -> bool:
    if DEMO_MODE:
        return True
    engine = _engine()
    with engine.connect() as conn:
        row = conn.execute(
            text(
                "SELECT COUNT(*) FROM information_schema.tables"
                " WHERE table_schema='public' AND table_name='whatsapp_conversations'"
            )
        ).scalar()
        return bool(row and row > 0)


# --- Leitura ---

def load_conversations(days=None, status=None):
    if DEMO_MODE:
        return demo_data.load_conversations(days=days, status=status)
    clauses = []
    params = {}
    if days:
        since = (datetime.now() - timedelta(days=days)).strftime("%Y-%m-%d %H:%M:%S")
        clauses.append("last_message_at >= :since")
        params["since"] = since
    if status and status != "Todos":
        clauses.append("status = :status")
        params["status"] = status
    where = ("WHERE " + " AND ".join(clauses)) if clauses else ""
    query = f"""
        SELECT id, contact_name, contact_number, first_message_at, last_message_at,
               message_count, our_message_count, status, linked_attendance_id, notes
        FROM whatsapp_conversations
        {where}
        ORDER BY last_message_at DESC
    """
    engine = _engine()
    with engine.connect() as conn:
        return pd.read_sql(text(query), conn, params=params)


def load_messages(conversation_id: int):
    if DEMO_MODE:
        return demo_data.load_messages(conversation_id)
    engine = _engine()
    with engine.connect() as conn:
        return pd.read_sql(
            text(
                "SELECT direction, body, timestamp FROM whatsapp_messages"
                " WHERE conversation_id = :cid ORDER BY timestamp ASC"
            ),
            conn,
            params={"cid": conversation_id},
        )


def load_summary_stats(days: int = 30) -> dict:
    if DEMO_MODE:
        return demo_data.load_summary_stats(days)
    since = (datetime.now() - timedelta(days=days)).strftime("%Y-%m-%d %H:%M:%S")
    engine = _engine()
    with engine.connect() as conn:
        row = conn.execute(
            text(
                "SELECT COUNT(*) AS total_conversas,"
                " COALESCE(SUM(message_count),0) AS total_mensagens,"
                " COALESCE(SUM(CASE WHEN status='resolvido' THEN 1 ELSE 0 END),0) AS resolvidos,"
                " COALESCE(SUM(CASE WHEN status='aberto' THEN 1 ELSE 0 END),0) AS abertos,"
                " COALESCE(SUM(CASE WHEN linked_attendance_id IS NOT NULL THEN 1 ELSE 0 END),0) AS vinculados"
                " FROM whatsapp_conversations WHERE last_message_at >= :since"
            ),
            {"since": since},
        ).mappings().fetchone()
        return dict(row) if row else {}


# --- Escrita ---

def update_conversation_status(conversation_id: int, status: str) -> None:
    if DEMO_MODE:
        demo_data.update_conversation_status(conversation_id, status)
        return
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    engine = _engine()
    with engine.connect() as conn:
        conn.execute(
            text("UPDATE whatsapp_conversations SET status=:s, updated_at=:ts WHERE id=:cid"),
            {"s": status, "ts": now, "cid": conversation_id},
        )
        conn.commit()


def link_attendance(conversation_id: int, attendance_id) -> None:
    if DEMO_MODE:
        demo_data.link_attendance(conversation_id, attendance_id)
        return
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    engine = _engine()
    with engine.connect() as conn:
        conn.execute(
            text("UPDATE whatsapp_conversations SET linked_attendance_id=:aid, updated_at=:ts WHERE id=:cid"),
            {"aid": attendance_id, "ts": now, "cid": conversation_id},
        )
        conn.commit()


def save_notes(conversation_id: int, notes: str) -> None:
    if DEMO_MODE:
        demo_data.save_notes(conversation_id, notes)
        return
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    engine = _engine()
    with engine.connect() as conn:
        conn.execute(
            text("UPDATE whatsapp_conversations SET notes=:n, updated_at=:ts WHERE id=:cid"),
            {"n": notes.strip(), "ts": now, "cid": conversation_id},
        )
        conn.commit()
