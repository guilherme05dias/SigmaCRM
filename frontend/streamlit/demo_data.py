from __future__ import annotations

from datetime import date, datetime, timedelta
from typing import Any

import pandas as pd
import streamlit as st


DEMO_KEY = "_servicocrm_demo_store"


def _now() -> str:
    return datetime.now().isoformat(timespec="seconds")


def _day(days_delta: int = 0, hour: int = 9, minute: int = 0) -> str:
    base = datetime.combine(date.today() + timedelta(days=days_delta), datetime.min.time())
    return base.replace(hour=hour, minute=minute).isoformat(timespec="seconds")


def _initial_store() -> dict[str, list[dict[str, Any]]]:
    now = _now()
    technicians = [
        {"id": 1, "name": "André", "specialty": "Suporte técnico", "phone": "(11) 98888-1001", "email": "andre@servicocrm.local", "active": True, "created_at": now, "updated_at": now},
        {"id": 2, "name": "Bruna", "specialty": "Redes e infraestrutura", "phone": "(11) 98888-1002", "email": "bruna@servicocrm.local", "active": True, "created_at": now, "updated_at": now},
        {"id": 3, "name": "Carlos", "specialty": "Sistemas fiscais", "phone": "(11) 98888-1003", "email": "carlos@servicocrm.local", "active": True, "created_at": now, "updated_at": now},
        {"id": 4, "name": "Fernanda", "specialty": "PDV e impressoras", "phone": "(11) 98888-1004", "email": "fernanda@servicocrm.local", "active": False, "created_at": now, "updated_at": now},
    ]
    clients = [
        {"id": 1, "name": "Empresa A", "company": "Empresa A Ltda", "phone": "(11) 3000-1000", "email": "ti@empresa-a.local", "city": "São Paulo", "segment": "Varejo", "notes": "Cliente prioritário.", "status": "Ativo", "created_at": now, "updated_at": now},
        {"id": 2, "name": "Empresa B", "company": "Empresa B Serviços", "phone": "(11) 3000-2000", "email": "suporte@empresa-b.local", "city": "Osasco", "segment": "Serviços", "notes": "", "status": "Ativo", "created_at": now, "updated_at": now},
        {"id": 3, "name": "Empresa C", "company": "Empresa C Comércio", "phone": "(11) 3000-3000", "email": "admin@empresa-c.local", "city": "Guarulhos", "segment": "Comércio", "notes": "Negociação de contrato mensal.", "status": "Em negociação", "created_at": now, "updated_at": now},
    ]
    attendances = [
        {"id": 1, "protocol": f"ATD{date.today():%Y%m%d}-001", "title": "PDV sem emissão de cupom", "description": "Verificado serviço fiscal e reiniciado módulo SAT.", "technician_id": 1, "client_id": 1, "status": "Concluído", "priority": "Alta", "channel": "WhatsApp", "service_type": "Remoto", "opened_at": _day(0, 8, 40), "due_date": date.today().isoformat(), "solved_at": _day(0, 9, 25), "time_spent_hours": 1.0, "equipment": "PDV Caixa 02", "category": "Fiscal", "next_action": "", "resolution": "Serviço normalizado e cupom emitido em teste.", "customer_rating": 5, "created_at": _day(0, 8, 40), "updated_at": _day(0, 9, 25)},
        {"id": 2, "protocol": f"ATD{date.today():%Y%m%d}-002", "title": "Impressora sem comunicação", "description": "Cliente relata falha intermitente na impressora térmica.", "technician_id": 2, "client_id": 2, "status": "Em andamento", "priority": "Média", "channel": "Telefone", "service_type": "Presencial", "opened_at": _day(0, 10, 5), "due_date": date.today().isoformat(), "solved_at": None, "time_spent_hours": 0.5, "equipment": "Epson TM-T20", "category": "Impressora", "next_action": "Trocar cabo USB e validar porta.", "resolution": "", "customer_rating": 0, "created_at": _day(0, 10, 5), "updated_at": _day(0, 10, 40)},
        {"id": 3, "protocol": f"ATD{date.today() - timedelta(days=1):%Y%m%d}-001", "title": "Lentidão no sistema", "description": "Análise inicial apontou uso alto de memória no servidor local.", "technician_id": 3, "client_id": 3, "status": "Aguardando cliente", "priority": "Baixa", "channel": "E-mail", "service_type": "Remoto", "opened_at": _day(-1, 15, 10), "due_date": (date.today() + timedelta(days=1)).isoformat(), "solved_at": None, "time_spent_hours": 1.5, "equipment": "Servidor local", "category": "Performance", "next_action": "Aguardar janela autorizada para reinício.", "resolution": "Orientado fechamento de processos ociosos.", "customer_rating": 0, "created_at": _day(-1, 15, 10), "updated_at": _day(-1, 16, 25)},
    ]
    conversations = [
        {"id": 1, "contact_name": "Marina - Empresa A", "contact_number": "5511999991000", "first_message_at": _day(0, 8, 32), "last_message_at": _day(0, 9, 28), "message_count": 4, "our_message_count": 2, "status": "resolvido", "linked_attendance_id": 1, "notes": "Chamado resolvido em atendimento remoto.", "created_at": _day(0, 8, 32), "updated_at": _day(0, 9, 28)},
        {"id": 2, "contact_name": "Roberto - Empresa B", "contact_number": "5511988882000", "first_message_at": _day(0, 10, 0), "last_message_at": _day(0, 10, 18), "message_count": 3, "our_message_count": 1, "status": "em_andamento", "linked_attendance_id": 2, "notes": "", "created_at": _day(0, 10, 0), "updated_at": _day(0, 10, 18)},
    ]
    messages = [
        {"id": 1, "conversation_id": 1, "contact_number": "5511999991000", "direction": "in", "body": "Bom dia, o caixa parou de emitir cupom.", "timestamp": _day(0, 8, 32), "wa_message_id": "demo-1"},
        {"id": 2, "conversation_id": 1, "contact_number": "5511999991000", "direction": "out", "body": "Vou acessar e validar o serviço fiscal.", "timestamp": _day(0, 8, 35), "wa_message_id": "demo-2"},
        {"id": 3, "conversation_id": 1, "contact_number": "5511999991000", "direction": "out", "body": "Serviço reiniciado. Pode testar a emissão?", "timestamp": _day(0, 9, 20), "wa_message_id": "demo-3"},
        {"id": 4, "conversation_id": 1, "contact_number": "5511999991000", "direction": "in", "body": "Funcionou, obrigado.", "timestamp": _day(0, 9, 28), "wa_message_id": "demo-4"},
        {"id": 5, "conversation_id": 2, "contact_number": "5511988882000", "direction": "in", "body": "A impressora parou novamente.", "timestamp": _day(0, 10, 0), "wa_message_id": "demo-5"},
        {"id": 6, "conversation_id": 2, "contact_number": "5511988882000", "direction": "out", "body": "Vou encaminhar visita para troca de cabo e teste da porta.", "timestamp": _day(0, 10, 12), "wa_message_id": "demo-6"},
        {"id": 7, "conversation_id": 2, "contact_number": "5511988882000", "direction": "in", "body": "Combinado, pode vir no período da tarde.", "timestamp": _day(0, 10, 18), "wa_message_id": "demo-7"},
    ]
    users = [
        {"id": 0, "username": "demo", "full_name": "Acesso demo", "role": "gerente", "password_hash": "", "is_active": True, "allowed_pages": None, "can_actions": None, "created_at": now, "last_login": now},
    ]
    return {
        "technicians": technicians,
        "clients": clients,
        "attendances": attendances,
        "whatsapp_conversations": conversations,
        "whatsapp_messages": messages,
        "users": users,
    }


def store() -> dict[str, list[dict[str, Any]]]:
    if DEMO_KEY not in st.session_state:
        st.session_state[DEMO_KEY] = _initial_store()
    return st.session_state[DEMO_KEY]


def _next_id(table: str) -> int:
    rows = store()[table]
    return (max((int(row["id"]) for row in rows), default=0) + 1)


def _frame(table: str, columns: list[str]) -> pd.DataFrame:
    return pd.DataFrame(store()[table], columns=columns)


def load_technicians(active_only: bool = False) -> pd.DataFrame:
    df = _frame("technicians", ["id", "name", "specialty", "phone", "email", "active", "created_at", "updated_at"])
    if active_only and not df.empty:
        df = df[df["active"] == True]
    return df.sort_values("name").reset_index(drop=True)


def load_clients(active_first: bool = True) -> pd.DataFrame:
    df = _frame("clients", ["id", "name", "company", "phone", "email", "city", "segment", "notes", "status", "created_at", "updated_at"])
    if df.empty:
        return df
    if active_first:
        df = df.assign(_active_order=df["status"].ne("Ativo").astype(int)).sort_values(["_active_order", "name"]).drop(columns=["_active_order"])
    else:
        df = df.sort_values("name")
    return df.reset_index(drop=True)


def load_attendances() -> pd.DataFrame:
    rows: list[dict[str, Any]] = []
    technicians = {row["id"]: row for row in store()["technicians"]}
    clients = {row["id"]: row for row in store()["clients"]}
    for att in store()["attendances"]:
        tech = technicians.get(att["technician_id"], {})
        client = clients.get(att["client_id"], {})
        rows.append({
            **att,
            "technician": tech.get("name", ""),
            "client": client.get("name", ""),
            "company": client.get("company", ""),
            "client_phone": client.get("phone", ""),
            "client_email": client.get("email", ""),
            "city": client.get("city", ""),
        })
    columns = [
        "id", "protocol", "title", "description", "technician_id", "client_id",
        "status", "priority", "channel", "service_type", "opened_at", "due_date",
        "solved_at", "time_spent_hours", "equipment", "category", "next_action",
        "resolution", "customer_rating", "technician", "client", "company",
        "client_phone", "client_email", "city", "created_at", "updated_at",
    ]
    df = pd.DataFrame(rows, columns=columns)
    if not df.empty:
        df = df.sort_values(["opened_at", "id"], ascending=[False, False])
    return df.reset_index(drop=True)


def get_or_create_client(name: str, company: str, phone: str, email: str, city: str, segment: str, status: str = "Ativo") -> int:
    clean_name = name.strip()
    for client in store()["clients"]:
        if client["name"].strip().lower() == clean_name.lower():
            return int(client["id"])
    return create_client({
        "name": clean_name,
        "company": company.strip(),
        "phone": phone.strip(),
        "email": email.strip(),
        "city": city.strip(),
        "segment": segment.strip(),
        "notes": "",
        "status": status,
    })


def generate_protocol() -> str:
    base = f"ATD{date.today():%Y%m%d}"
    count = sum(1 for row in store()["attendances"] if str(row["protocol"]).startswith(base))
    return f"{base}-{count + 1:03d}"


def create_technician(data: dict[str, Any]) -> int:
    row = {
        "id": _next_id("technicians"),
        "name": data.get("name", "").strip(),
        "specialty": data.get("specialty", "").strip(),
        "phone": data.get("phone", "").strip(),
        "email": data.get("email", "").strip(),
        "active": bool(data.get("active", True)),
        "created_at": _now(),
        "updated_at": _now(),
    }
    store()["technicians"].append(row)
    return int(row["id"])


def set_technician_active(technician_id: int, active: bool) -> None:
    for row in store()["technicians"]:
        if int(row["id"]) == int(technician_id):
            row["active"] = bool(active)
            row["updated_at"] = _now()
            return


def delete_technician(technician_id: int) -> None:
    store()["technicians"] = [row for row in store()["technicians"] if int(row["id"]) != int(technician_id)]


def create_client(data: dict[str, Any]) -> int:
    row = {
        "id": _next_id("clients"),
        "name": data.get("name", "").strip(),
        "company": data.get("company", "").strip(),
        "phone": data.get("phone", "").strip(),
        "email": data.get("email", "").strip(),
        "city": data.get("city", "").strip(),
        "segment": data.get("segment", "").strip(),
        "notes": data.get("notes", "").strip(),
        "status": data.get("status", "Ativo"),
        "created_at": _now(),
        "updated_at": _now(),
    }
    store()["clients"].append(row)
    return int(row["id"])


def update_client(client_id: int, **updates: Any) -> None:
    for row in store()["clients"]:
        if int(row["id"]) == int(client_id):
            row.update({k: v for k, v in updates.items() if v is not None})
            row["updated_at"] = _now()
            return


def create_attendance(data: dict[str, Any]) -> int:
    now = _now()
    row = {
        "id": _next_id("attendances"),
        "protocol": data.get("protocol") or generate_protocol(),
        "title": data.get("title", "").strip(),
        "description": data.get("description", "").strip(),
        "technician_id": int(data.get("technician_id")),
        "client_id": int(data.get("client_id")),
        "status": data.get("status", "Novo"),
        "priority": data.get("priority", "Média"),
        "channel": data.get("channel", "Telefone"),
        "service_type": data.get("service_type", "Remoto"),
        "opened_at": data.get("opened_at") or now,
        "due_date": data.get("due_date"),
        "solved_at": data.get("solved_at"),
        "time_spent_hours": float(data.get("time_spent_hours") or 0),
        "equipment": data.get("equipment", "").strip(),
        "category": data.get("category", "").strip(),
        "next_action": data.get("next_action", "").strip(),
        "resolution": data.get("resolution", "").strip(),
        "customer_rating": int(data.get("customer_rating") or 0),
        "created_at": now,
        "updated_at": now,
    }
    store()["attendances"].append(row)
    return int(row["id"])


def update_attendance_by_protocol(protocol: str, status: str, resolution: str, next_action: str, time_spent_hours: float, solved_at: str | None) -> None:
    for row in store()["attendances"]:
        if row["protocol"] == protocol:
            row["status"] = status
            row["resolution"] = resolution.strip()
            row["next_action"] = next_action.strip()
            row["time_spent_hours"] = float(time_spent_hours)
            row["solved_at"] = solved_at
            row["updated_at"] = _now()
            return


def delete_attendance(attendance_id: int) -> None:
    store()["attendances"] = [row for row in store()["attendances"] if int(row["id"]) != int(attendance_id)]


def list_users() -> list[dict[str, Any]]:
    return [dict(row) for row in store()["users"]]


def create_user(username: str, full_name: str, role: str, password: str) -> dict[str, Any]:
    row = {
        "id": _next_id("users"),
        "username": username.strip().lower(),
        "full_name": full_name.strip(),
        "role": role,
        "password_hash": "",
        "is_active": True,
        "allowed_pages": None,
        "can_actions": None,
        "created_at": _now(),
        "last_login": None,
    }
    store()["users"].append(row)
    return dict(row)


def update_user(user_id: int, **updates: Any) -> bool:
    for row in store()["users"]:
        if int(row["id"]) == int(user_id):
            for key, value in updates.items():
                if key in row:
                    row[key] = value
            return True
    return False


def load_conversations(days=None, status=None) -> pd.DataFrame:
    df = _frame("whatsapp_conversations", ["id", "contact_name", "contact_number", "first_message_at", "last_message_at", "message_count", "our_message_count", "status", "linked_attendance_id", "notes", "created_at", "updated_at"])
    if df.empty:
        return df
    if days:
        since = datetime.now() - timedelta(days=days)
        df = df[pd.to_datetime(df["last_message_at"]) >= since]
    if status and status != "Todos":
        df = df[df["status"] == status]
    return df.sort_values("last_message_at", ascending=False).reset_index(drop=True)


def load_messages(conversation_id: int) -> pd.DataFrame:
    df = _frame("whatsapp_messages", ["id", "conversation_id", "contact_number", "direction", "body", "timestamp", "wa_message_id"])
    if df.empty:
        return pd.DataFrame(columns=["direction", "body", "timestamp"])
    df = df[df["conversation_id"] == int(conversation_id)]
    return df.sort_values("timestamp")[["direction", "body", "timestamp"]].reset_index(drop=True)


def load_summary_stats(days: int = 30) -> dict[str, int]:
    df = load_conversations(days=days)
    if df.empty:
        return {"total_conversas": 0, "total_mensagens": 0, "resolvidos": 0, "abertos": 0, "vinculados": 0}
    return {
        "total_conversas": int(len(df)),
        "total_mensagens": int(df["message_count"].sum()),
        "resolvidos": int((df["status"] == "resolvido").sum()),
        "abertos": int((df["status"] == "aberto").sum()),
        "vinculados": int(df["linked_attendance_id"].notna().sum()),
    }


def update_conversation_status(conversation_id: int, status: str) -> None:
    for row in store()["whatsapp_conversations"]:
        if int(row["id"]) == int(conversation_id):
            row["status"] = status
            row["updated_at"] = _now()
            return


def link_attendance(conversation_id: int, attendance_id) -> None:
    for row in store()["whatsapp_conversations"]:
        if int(row["id"]) == int(conversation_id):
            row["linked_attendance_id"] = attendance_id
            row["updated_at"] = _now()
            return


def save_notes(conversation_id: int, notes: str) -> None:
    for row in store()["whatsapp_conversations"]:
        if int(row["id"]) == int(conversation_id):
            row["notes"] = notes.strip()
            row["updated_at"] = _now()
            return
