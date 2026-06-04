"""
Repositórios que usam Google Sheets como backend.
Mesma interface dos repositórios SQLite para compatibilidade com services.py.
"""

import logging
from datetime import datetime
from typing import Any, Dict, List, Optional

import pandas as pd

from google_sheets import (
    ATTENDANCE_HEADERS,
    CLIENT_HEADERS,
    SHEET_ATTENDANCES,
    SHEET_CLIENTS,
    SHEET_TECHNICIANS,
    TECHNICIAN_HEADERS,
    SheetsRepository,
    Spreadsheet,
)
from models import AttendanceSchema, ClientSchema, TechnicianSchema

logger = logging.getLogger(__name__)


class SheetsTechnicianRepository:
    def __init__(self, spreadsheet: Spreadsheet):
        self._repo = SheetsRepository(spreadsheet, SHEET_TECHNICIANS, TECHNICIAN_HEADERS)

    def get_all(self, active_only: bool = False) -> pd.DataFrame:
        df = self._repo.get_dataframe()
        if df.empty:
            return df
        # Converter active para int
        if "active" in df.columns:
            df["active"] = pd.to_numeric(df["active"], errors="coerce").fillna(1).astype(int)
        if active_only:
            df = df[df["active"] == 1]
        return df.sort_values("name").reset_index(drop=True)

    def get_by_id(self, technician_id: int) -> Optional[Dict[str, Any]]:
        return self._repo.get_by_id(technician_id)

    def create(self, tech: TechnicianSchema) -> int:
        data = {
            "name": tech.name,
            "specialty": tech.specialty or "",
            "phone": tech.phone or "",
            "email": tech.email or "",
            "active": int(tech.active),
            "created_at": tech.created_at or datetime.now().isoformat(timespec="seconds"),
        }
        return self._repo.insert(data)

    def update(self, technician_id: int, tech: TechnicianSchema) -> None:
        existing = self._repo.get_by_id(technician_id)
        if not existing:
            raise ValueError(f"Técnico ID {technician_id} não encontrado")
        data = {
            "name": tech.name,
            "specialty": tech.specialty or "",
            "phone": tech.phone or "",
            "email": tech.email or "",
            "active": int(tech.active),
            "created_at": existing.get("created_at", ""),
        }
        self._repo.update_by_id(technician_id, data)

    def delete(self, technician_id: int) -> None:
        self._repo.delete_by_id(technician_id)


class SheetsClientRepository:
    def __init__(self, spreadsheet: Spreadsheet):
        self._repo = SheetsRepository(spreadsheet, SHEET_CLIENTS, CLIENT_HEADERS)

    def get_all(self, active_first: bool = True) -> pd.DataFrame:
        df = self._repo.get_dataframe()
        if df.empty:
            return df
        if active_first:
            df["_sort"] = df["status"].apply(lambda s: 0 if s == "Ativo" else 1)
            df = df.sort_values(["_sort", "name"]).drop(columns=["_sort"]).reset_index(drop=True)
        else:
            df = df.sort_values("name").reset_index(drop=True)
        return df

    def get_by_id(self, client_id: int) -> Optional[Dict[str, Any]]:
        return self._repo.get_by_id(client_id)

    def get_by_name(self, name: str) -> Optional[Dict[str, Any]]:
        records = self._repo.get_all_records()
        for r in records:
            if r.get("name", "").strip().lower() == name.strip().lower():
                return r
        return None

    def create(self, client: ClientSchema) -> int:
        data = {
            "name": client.name,
            "company": client.company or "",
            "phone": client.phone or "",
            "email": client.email or "",
            "city": client.city or "",
            "segment": client.segment or "",
            "notes": client.notes or "",
            "status": client.status,
            "created_at": client.created_at or datetime.now().isoformat(timespec="seconds"),
        }
        return self._repo.insert(data)

    def update(self, client_id: int, client: ClientSchema) -> None:
        existing = self._repo.get_by_id(client_id)
        if not existing:
            raise ValueError(f"Cliente ID {client_id} não encontrado")
        data = {
            "name": client.name,
            "company": client.company or "",
            "phone": client.phone or "",
            "email": client.email or "",
            "city": client.city or "",
            "segment": client.segment or "",
            "notes": client.notes or "",
            "status": client.status,
            "created_at": existing.get("created_at", ""),
        }
        self._repo.update_by_id(client_id, data)

    def delete(self, client_id: int) -> None:
        self._repo.delete_by_id(client_id)


class SheetsAttendanceRepository:
    def __init__(self, spreadsheet: Spreadsheet):
        self._repo = SheetsRepository(spreadsheet, SHEET_ATTENDANCES, ATTENDANCE_HEADERS)

    def get_all(self) -> pd.DataFrame:
        df = self._repo.get_dataframe()
        if df.empty:
            return pd.DataFrame(columns=ATTENDANCE_HEADERS + ["technician", "client", "company", "client_phone", "client_email", "city"])

        # Converter IDs numéricos
        for col in ("technician_id", "client_id", "time_spent_hours", "customer_rating"):
            if col in df.columns:
                df[col] = pd.to_numeric(df[col], errors="coerce").fillna(0)

        df["technician_id"] = df["technician_id"].astype(int)
        df["client_id"] = df["client_id"].astype(int)

        # Buscar nomes de técnicos e clientes para join
        tech_repo = SheetsRepository(self._repo._spreadsheet, SHEET_TECHNICIANS, TECHNICIAN_HEADERS)
        client_repo_sheets = SheetsRepository(self._repo._spreadsheet, SHEET_CLIENTS, CLIENT_HEADERS)

        techs = tech_repo.get_dataframe()
        clients = client_repo_sheets.get_dataframe()

        # Merge técnicos
        if not techs.empty:
            techs_map = techs.set_index("id")["name"].to_dict()
            df["technician"] = df["technician_id"].map(techs_map).fillna("Desconhecido")
        else:
            df["technician"] = "Desconhecido"

        # Merge clientes
        if not clients.empty:
            clients_idx = clients.set_index("id")
            df["client"] = df["client_id"].map(clients_idx["name"].to_dict()).fillna("Desconhecido")
            df["company"] = df["client_id"].map(clients_idx["company"].to_dict()).fillna("")
            df["client_phone"] = df["client_id"].map(clients_idx["phone"].to_dict()).fillna("")
            df["client_email"] = df["client_id"].map(clients_idx["email"].to_dict()).fillna("")
            df["city"] = df["client_id"].map(clients_idx["city"].to_dict()).fillna("")
        else:
            df["client"] = "Desconhecido"
            df["company"] = ""
            df["client_phone"] = ""
            df["client_email"] = ""
            df["city"] = ""

        # Ordenar por data
        df = df.sort_values(["opened_at", "id"], ascending=[False, False]).reset_index(drop=True)
        return df

    def get_by_id(self, attendance_id: int) -> Optional[Dict[str, Any]]:
        return self._repo.get_by_id(attendance_id)

    def get_by_protocol(self, protocol: str) -> Optional[Dict[str, Any]]:
        records = self._repo.get_all_records()
        for r in records:
            if r.get("protocol") == protocol:
                return r
        return None

    def create(self, att: AttendanceSchema) -> int:
        data = {
            "protocol": att.protocol or "",
            "title": att.title,
            "description": att.description or "",
            "technician_id": att.technician_id,
            "client_id": att.client_id,
            "status": att.status,
            "priority": att.priority,
            "channel": att.channel,
            "service_type": att.service_type,
            "opened_at": att.opened_at or datetime.now().isoformat(timespec="seconds"),
            "due_date": att.due_date or "",
            "solved_at": att.solved_at or "",
            "time_spent_hours": att.time_spent_hours,
            "equipment": att.equipment or "",
            "category": att.category or "",
            "next_action": att.next_action or "",
            "resolution": att.resolution or "",
            "customer_rating": att.customer_rating or 0,
            "created_at": att.created_at or datetime.now().isoformat(timespec="seconds"),
            "updated_at": att.updated_at or datetime.now().isoformat(timespec="seconds"),
        }
        return self._repo.insert(data)

    def update(self, attendance_id: int, att: AttendanceSchema) -> None:
        existing = self._repo.get_by_id(attendance_id)
        if not existing:
            raise ValueError(f"Atendimento ID {attendance_id} não encontrado")
        data = {
            "protocol": att.protocol or existing.get("protocol", ""),
            "title": att.title,
            "description": att.description or "",
            "technician_id": att.technician_id,
            "client_id": att.client_id,
            "status": att.status,
            "priority": att.priority,
            "channel": att.channel,
            "service_type": att.service_type,
            "opened_at": att.opened_at or existing.get("opened_at", ""),
            "due_date": att.due_date or "",
            "solved_at": att.solved_at or "",
            "time_spent_hours": att.time_spent_hours,
            "equipment": att.equipment or "",
            "category": att.category or "",
            "next_action": att.next_action or "",
            "resolution": att.resolution or "",
            "customer_rating": att.customer_rating or 0,
            "created_at": existing.get("created_at", ""),
            "updated_at": datetime.now().isoformat(timespec="seconds"),
        }
        self._repo.update_by_id(attendance_id, data)

    def delete(self, attendance_id: int) -> None:
        self._repo.delete_by_id(attendance_id)

    def count_today_by_base(self, base: str) -> int:
        records = self._repo.get_all_records()
        return sum(1 for r in records if str(r.get("protocol", "")).startswith(base))
