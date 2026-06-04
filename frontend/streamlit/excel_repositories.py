"""
Repositórios que usam Excel (.xlsx) como backend.
Mesma interface dos repositórios SQLite para compatibilidade com services.py.
"""

import logging
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

import pandas as pd

from excel_backend import (
    ATTENDANCE_COLS,
    CLIENT_COLS,
    SHEET_ATTENDANCES,
    SHEET_CLIENTS,
    SHEET_TECHNICIANS,
    TECHNICIAN_COLS,
    ExcelRepository,
)
from models import AttendanceSchema, ClientSchema, TechnicianSchema

logger = logging.getLogger(__name__)


class ExcelTechnicianRepository:
    def __init__(self, excel_path: Path):
        self._repo = ExcelRepository(excel_path, SHEET_TECHNICIANS, TECHNICIAN_COLS)

    def get_all(self, active_only: bool = False) -> pd.DataFrame:
        df = self._repo.get_dataframe()
        if df.empty:
            return df
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


class ExcelClientRepository:
    def __init__(self, excel_path: Path):
        self._repo = ExcelRepository(excel_path, SHEET_CLIENTS, CLIENT_COLS)

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


class ExcelAttendanceRepository:
    def __init__(self, excel_path: Path):
        self._path = excel_path
        self._repo = ExcelRepository(excel_path, SHEET_ATTENDANCES, ATTENDANCE_COLS)

    def get_all(self) -> pd.DataFrame:
        df = self._repo.get_dataframe()
        if df.empty:
            return pd.DataFrame(columns=ATTENDANCE_COLS + ["technician", "client", "company", "client_phone", "client_email", "city"])

        for col in ("technician_id", "client_id", "time_spent_hours", "customer_rating"):
            if col in df.columns:
                df[col] = pd.to_numeric(df[col], errors="coerce").fillna(0)
        df["technician_id"] = df["technician_id"].astype(int)
        df["client_id"] = df["client_id"].astype(int)

        # Buscar nomes
        tech_repo = ExcelRepository(self._path, SHEET_TECHNICIANS, TECHNICIAN_COLS)
        client_repo = ExcelRepository(self._path, SHEET_CLIENTS, CLIENT_COLS)
        techs = tech_repo.get_dataframe()
        clients = client_repo.get_dataframe()

        if not techs.empty:
            df["technician"] = df["technician_id"].map(techs.set_index("id")["name"].to_dict()).fillna("Desconhecido")
        else:
            df["technician"] = "Desconhecido"

        if not clients.empty:
            ci = clients.set_index("id")
            df["client"] = df["client_id"].map(ci["name"].to_dict()).fillna("Desconhecido")
            df["company"] = df["client_id"].map(ci["company"].to_dict()).fillna("")
            df["client_phone"] = df["client_id"].map(ci["phone"].to_dict()).fillna("")
            df["client_email"] = df["client_id"].map(ci["email"].to_dict()).fillna("")
            df["city"] = df["client_id"].map(ci["city"].to_dict()).fillna("")
        else:
            for c in ("client", "company", "client_phone", "client_email", "city"):
                df[c] = "" if c != "client" else "Desconhecido"

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
        now = datetime.now().isoformat(timespec="seconds")
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
            "opened_at": att.opened_at or now,
            "due_date": att.due_date or "",
            "solved_at": att.solved_at or "",
            "time_spent_hours": att.time_spent_hours,
            "equipment": att.equipment or "",
            "category": att.category or "",
            "next_action": att.next_action or "",
            "resolution": att.resolution or "",
            "customer_rating": att.customer_rating or 0,
            "created_at": att.created_at or now,
            "updated_at": att.updated_at or now,
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
