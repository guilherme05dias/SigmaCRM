"""
migrate_to_supabase.py
Migra todos os dados do SQLite local para o Supabase (PostgreSQL).

Uso:
  1. Preencha .streamlit/secrets.toml com os dados do Supabase.
  2. Execute:  python migrate_to_supabase.py

O script:
  - Le cada tabela do SQLite (crm_tecnicos.db)
  - Insere no PostgreSQL respeitando constraints (ON CONFLICT DO NOTHING)
  - Migra tambem as conversas e mensagens do WhatsApp, se existirem
"""

import sqlite3
from pathlib import Path

from sqlalchemy import create_engine, text

# Importa get_db_url — precisa de .streamlit/secrets.toml preenchido
from config import get_db_url

SQLITE_PATH = Path(__file__).parent / "crm_tecnicos.db"
SCHEMA_PATH = Path(__file__).parent.parent.parent / "database" / "supabase" / "migrations" / "20260601000100_initial_schema.sql"


def sqlite_conn():
    conn = sqlite3.connect(SQLITE_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def apply_schema(pg) -> None:
    """Aplica o schema PostgreSQL idempotente antes de migrar dados."""
    print(f"Aplicando schema: {SCHEMA_PATH.name}")
    sql = SCHEMA_PATH.read_text(encoding="utf-8")
    raw = pg.raw_connection()
    try:
        with raw.cursor() as cursor:
            cursor.execute(sql)
        raw.commit()
    finally:
        raw.close()
    print("  -> Schema pronto.")


def migrate():
    print("Conectando ao Supabase...")
    pg = create_engine(get_db_url(), pool_pre_ping=True)
    apply_schema(pg)

    if not SQLITE_PATH.exists():
        print(f"SQLite nao encontrado em: {SQLITE_PATH}")
        print("Schema aplicado; nada a migrar.")
        return

    print(f"SQLite origem: {SQLITE_PATH}")
    sq = sqlite_conn()

    # ── Técnicos ────────────────────────────────────────────────────────────────
    rows = sq.execute("SELECT * FROM technicians").fetchall()
    print(f"Tecnicos: {len(rows)} registros")
    with pg.connect() as conn:
        for r in rows:
            conn.execute(
                text(
                    "INSERT INTO technicians (id, name, specialty, phone, email, active, created_at)"
                    " VALUES (:id, :name, :spec, :phone, :email, :active, :created_at)"
                    " ON CONFLICT (id) DO NOTHING"
                ),
                {
                    "id": r["id"], "name": r["name"],
                    "spec": r["specialty"] or "", "phone": r["phone"] or "",
                    "email": r["email"] or "",
                    "active": bool(r["active"]) if r["active"] is not None else True,
                    "created_at": r["created_at"],
                },
            )
        conn.commit()
    print("  -> Tecnicos migrados.")

    # ── Clientes ────────────────────────────────────────────────────────────────
    rows = sq.execute("SELECT * FROM clients").fetchall()
    print(f"Clientes: {len(rows)} registros")
    with pg.connect() as conn:
        for r in rows:
            conn.execute(
                text(
                    "INSERT INTO clients (id, name, company, phone, email, city, segment, notes, status, created_at)"
                    " VALUES (:id, :name, :company, :phone, :email, :city, :segment, :notes, :status, :created_at)"
                    " ON CONFLICT (id) DO NOTHING"
                ),
                {
                    "id": r["id"], "name": r["name"],
                    "company": r["company"] or "", "phone": r["phone"] or "",
                    "email": r["email"] or "", "city": r["city"] or "",
                    "segment": r["segment"] or "", "notes": r["notes"] or "",
                    "status": r["status"] or "Ativo", "created_at": r["created_at"],
                },
            )
        conn.commit()
    print("  -> Clientes migrados.")

    # ── Atendimentos ────────────────────────────────────────────────────────────
    rows = sq.execute("SELECT * FROM attendances").fetchall()
    print(f"Atendimentos: {len(rows)} registros")
    with pg.connect() as conn:
        for r in rows:
            conn.execute(
                text(
                    "INSERT INTO attendances"
                    " (id, protocol, title, description, technician_id, client_id, status, priority,"
                    "  channel, service_type, opened_at, due_date, solved_at, time_spent_hours,"
                    "  equipment, category, next_action, resolution, customer_rating, created_at, updated_at)"
                    " VALUES"
                    " (:id, :protocol, :title, :desc, :tech_id, :cli_id, :status, :priority,"
                    "  :channel, :stype, :opened, :due, :solved, :hours,"
                    "  :equip, :cat, :next, :res, :rating, :created, :updated)"
                    " ON CONFLICT (id) DO NOTHING"
                ),
                {
                    "id": r["id"], "protocol": r["protocol"], "title": r["title"],
                    "desc": r["description"] or "", "tech_id": r["technician_id"],
                    "cli_id": r["client_id"], "status": r["status"],
                    "priority": r["priority"], "channel": r["channel"],
                    "stype": r["service_type"], "opened": r["opened_at"],
                    "due": r["due_date"], "solved": r["solved_at"],
                    "hours": r["time_spent_hours"] or 0,
                    "equip": r["equipment"] or "", "cat": r["category"] or "",
                    "next": r["next_action"] or "", "res": r["resolution"] or "",
                    "rating": r["customer_rating"] or 0,
                    "created": r["created_at"], "updated": r["updated_at"],
                },
            )
        conn.commit()
    print("  -> Atendimentos migrados.")

    # ── Usuários ────────────────────────────────────────────────────────────────
    rows = sq.execute("SELECT * FROM users").fetchall()
    print(f"Usuarios: {len(rows)} registros")
    with pg.connect() as conn:
        for r in rows:
            conn.execute(
                text(
                    "INSERT INTO users"
                    " (id, username, full_name, role, password_hash, is_active, allowed_pages, can_actions, created_at, last_login)"
                    " VALUES"
                    " (:id, :uname, :fname, :role, :pw, :active, :pages, :actions, :created, :login)"
                    " ON CONFLICT (id) DO NOTHING"
                ),
                {
                    "id": r["id"], "uname": r["username"], "fname": r["full_name"],
                    "role": r["role"], "pw": r["password_hash"],
                    "active": bool(r["is_active"]),
                    "pages": r["allowed_pages"], "actions": r["can_actions"],
                    "created": r["created_at"], "login": r["last_login"],
                },
            )
        conn.commit()
    print("  -> Usuarios migrados.")

    # ── WhatsApp conversas ───────────────────────────────────────────────────────
    try:
        rows = sq.execute("SELECT * FROM whatsapp_conversations").fetchall()
    except Exception:
        rows = []
    print(f"WhatsApp conversas: {len(rows)} registros")
    with pg.connect() as conn:
        for r in rows:
            conn.execute(
                text(
                    "INSERT INTO whatsapp_conversations"
                    " (id, contact_name, contact_number, first_message_at, last_message_at,"
                    "  message_count, our_message_count, status, linked_attendance_id, notes, created_at, updated_at)"
                    " VALUES"
                    " (:id, :name, :num, :first, :last, :mc, :omc, :status, :att_id, :notes, :created, :updated)"
                    " ON CONFLICT (id) DO NOTHING"
                ),
                {
                    "id": r["id"], "name": r["contact_name"], "num": r["contact_number"],
                    "first": r["first_message_at"], "last": r["last_message_at"],
                    "mc": r["message_count"], "omc": r["our_message_count"],
                    "status": r["status"] or "aberto",
                    "att_id": r["linked_attendance_id"], "notes": r["notes"],
                    "created": r["created_at"], "updated": r["updated_at"],
                },
            )
        conn.commit()
    print("  -> Conversas migradas.")

    # ── WhatsApp mensagens ────────────────────────────────────────────────────────
    try:
        rows = sq.execute("SELECT * FROM whatsapp_messages").fetchall()
    except Exception:
        rows = []
    print(f"WhatsApp mensagens: {len(rows)} registros")
    with pg.connect() as conn:
        for r in rows:
            conn.execute(
                text(
                    "INSERT INTO whatsapp_messages"
                    " (id, conversation_id, contact_number, direction, body, timestamp, wa_message_id)"
                    " VALUES (:id, :conv_id, :num, :dir, :body, :ts, :wa_id)"
                    " ON CONFLICT (id) DO NOTHING"
                ),
                {
                    "id": r["id"], "conv_id": r["conversation_id"],
                    "num": r["contact_number"], "dir": r["direction"],
                    "body": r["body"], "ts": r["timestamp"],
                    "wa_id": r["wa_message_id"],
                },
            )
        conn.commit()
    print("  -> Mensagens migradas.")

    # Sincronizar sequences do PostgreSQL para evitar conflito de IDs
    with pg.connect() as conn:
        for table, col in [
            ("technicians", "id"), ("clients", "id"), ("attendances", "id"),
            ("users", "id"), ("whatsapp_conversations", "id"), ("whatsapp_messages", "id"),
        ]:
            conn.execute(text(
                f"SELECT setval(pg_get_serial_sequence('{table}', '{col}'),"
                f" COALESCE((SELECT MAX({col}) FROM {table}), 1))"
            ))
        conn.commit()

    sq.close()
    print("\nMigracao concluida com sucesso!")


if __name__ == "__main__":
    migrate()
