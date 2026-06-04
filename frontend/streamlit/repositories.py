import logging
from typing import Any, Dict, List, Optional

import pandas as pd
from sqlalchemy import create_engine, text
from sqlalchemy.engine import Engine

from config import get_db_url
from models import AttendanceSchema, ClientSchema, TechnicianSchema

logger = logging.getLogger(__name__)


class DatabaseRepository:
    def __init__(self):
        self.engine: Engine = create_engine(get_db_url(), pool_pre_ping=True)

    def execute_query(self, query: str, params: Optional[dict] = None) -> None:
        with self.engine.connect() as conn:
            conn.execute(text(query), params or {})
            conn.commit()

    def execute_returning(self, query: str, params: Optional[dict] = None) -> int:
        """Executa INSERT com RETURNING id e retorna o id gerado."""
        with self.engine.connect() as conn:
            result = conn.execute(text(query), params or {})
            conn.commit()
            row = result.fetchone()
            return row[0] if row else 0

    def query_dataframe(self, query: str, params: Optional[dict] = None) -> pd.DataFrame:
        with self.engine.connect() as conn:
            return pd.read_sql(text(query), conn, params=params or {})

    def query_one(self, query: str, params: Optional[dict] = None) -> Optional[Dict[str, Any]]:
        with self.engine.connect() as conn:
            result = conn.execute(text(query), params or {})
            row = result.mappings().fetchone()
            return dict(row) if row else None

    def query_many(self, query: str, params: Optional[dict] = None) -> List[Dict[str, Any]]:
        with self.engine.connect() as conn:
            result = conn.execute(text(query), params or {})
            return [dict(r) for r in result.mappings().fetchall()]


class TechnicianRepository:
    def __init__(self, db_repo: DatabaseRepository):
        self.db = db_repo

    def get_all(self, active_only: bool = False) -> pd.DataFrame:
        query = "SELECT * FROM technicians"
        if active_only:
            query += " WHERE active = TRUE"
        query += " ORDER BY name"
        return self.db.query_dataframe(query)

    def get_by_id(self, technician_id: int) -> Optional[Dict[str, Any]]:
        return self.db.query_one(
            "SELECT * FROM technicians WHERE id = :tid",
            {"tid": technician_id},
        )

    def create(self, tech: TechnicianSchema) -> int:
        return self.db.execute_returning(
            """
            INSERT INTO technicians (name, specialty, phone, email, active, created_at)
            VALUES (:name, :specialty, :phone, :email, :active, :created_at)
            RETURNING id
            """,
            {
                "name": tech.name,
                "specialty": tech.specialty or "",
                "phone": tech.phone or "",
                "email": tech.email or "",
                "active": bool(tech.active),
                "created_at": tech.created_at,
            },
        )

    def update(self, technician_id: int, tech: TechnicianSchema) -> None:
        self.db.execute_query(
            """
            UPDATE technicians
            SET name = :name, specialty = :specialty, phone = :phone,
                email = :email, active = :active
            WHERE id = :tid
            """,
            {
                "name": tech.name,
                "specialty": tech.specialty or "",
                "phone": tech.phone or "",
                "email": tech.email or "",
                "active": bool(tech.active),
                "tid": technician_id,
            },
        )

    def delete(self, technician_id: int) -> None:
        self.db.execute_query("DELETE FROM technicians WHERE id = :tid", {"tid": technician_id})


class ClientRepository:
    def __init__(self, db_repo: DatabaseRepository):
        self.db = db_repo

    def get_all(self, active_first: bool = True) -> pd.DataFrame:
        query = "SELECT * FROM clients"
        if active_first:
            query += " ORDER BY CASE WHEN status = 'Ativo' THEN 0 ELSE 1 END, name"
        else:
            query += " ORDER BY name"
        return self.db.query_dataframe(query)

    def get_by_id(self, client_id: int) -> Optional[Dict[str, Any]]:
        return self.db.query_one(
            "SELECT * FROM clients WHERE id = :cid",
            {"cid": client_id},
        )

    def get_by_name(self, name: str) -> Optional[Dict[str, Any]]:
        return self.db.query_one(
            "SELECT * FROM clients WHERE name = :name",
            {"name": name.strip()},
        )

    def create(self, client: ClientSchema) -> int:
        return self.db.execute_returning(
            """
            INSERT INTO clients (name, company, phone, email, city, segment, notes, status, created_at)
            VALUES (:name, :company, :phone, :email, :city, :segment, :notes, :status, :created_at)
            RETURNING id
            """,
            {
                "name": client.name,
                "company": client.company or "",
                "phone": client.phone or "",
                "email": client.email or "",
                "city": client.city or "",
                "segment": client.segment or "",
                "notes": client.notes or "",
                "status": client.status,
                "created_at": client.created_at,
            },
        )

    def update(self, client_id: int, client: ClientSchema) -> None:
        self.db.execute_query(
            """
            UPDATE clients
            SET name = :name, company = :company, phone = :phone, email = :email,
                city = :city, segment = :segment, notes = :notes, status = :status
            WHERE id = :cid
            """,
            {
                "name": client.name,
                "company": client.company or "",
                "phone": client.phone or "",
                "email": client.email or "",
                "city": client.city or "",
                "segment": client.segment or "",
                "notes": client.notes or "",
                "status": client.status,
                "cid": client_id,
            },
        )

    def delete(self, client_id: int) -> None:
        self.db.execute_query("DELETE FROM clients WHERE id = :cid", {"cid": client_id})


class AttendanceRepository:
    def __init__(self, db_repo: DatabaseRepository):
        self.db = db_repo

    def get_all(self) -> pd.DataFrame:
        return self.db.query_dataframe(
            """
            SELECT
                a.id, a.protocol, a.title, a.description, a.status, a.priority,
                a.channel, a.service_type, a.opened_at, a.due_date, a.solved_at,
                a.time_spent_hours, a.equipment, a.category, a.next_action,
                a.resolution, a.customer_rating,
                t.name AS technician,
                c.name AS client, c.company AS company,
                c.phone AS client_phone, c.email AS client_email, c.city AS city,
                a.created_at, a.updated_at
            FROM attendances a
            INNER JOIN technicians t ON t.id = a.technician_id
            INNER JOIN clients c ON c.id = a.client_id
            ORDER BY a.opened_at DESC, a.id DESC
            """
        )

    def get_by_id(self, attendance_id: int) -> Optional[Dict[str, Any]]:
        return self.db.query_one(
            "SELECT * FROM attendances WHERE id = :aid",
            {"aid": attendance_id},
        )

    def get_by_protocol(self, protocol: str) -> Optional[Dict[str, Any]]:
        return self.db.query_one(
            "SELECT * FROM attendances WHERE protocol = :proto",
            {"proto": protocol},
        )

    def create(self, att: AttendanceSchema) -> int:
        return self.db.execute_returning(
            """
            INSERT INTO attendances (
                protocol, title, description, technician_id, client_id, status, priority,
                channel, service_type, opened_at, due_date, solved_at, time_spent_hours,
                equipment, category, next_action, resolution, customer_rating,
                created_at, updated_at
            ) VALUES (
                :protocol, :title, :description, :technician_id, :client_id, :status, :priority,
                :channel, :service_type, :opened_at, :due_date, :solved_at, :time_spent_hours,
                :equipment, :category, :next_action, :resolution, :customer_rating,
                :created_at, :updated_at
            )
            RETURNING id
            """,
            {
                "protocol": att.protocol,
                "title": att.title,
                "description": att.description or "",
                "technician_id": att.technician_id,
                "client_id": att.client_id,
                "status": att.status,
                "priority": att.priority,
                "channel": att.channel,
                "service_type": att.service_type,
                "opened_at": att.opened_at,
                "due_date": att.due_date,
                "solved_at": att.solved_at,
                "time_spent_hours": att.time_spent_hours,
                "equipment": att.equipment or "",
                "category": att.category or "",
                "next_action": att.next_action or "",
                "resolution": att.resolution or "",
                "customer_rating": att.customer_rating or 0,
                "created_at": att.created_at,
                "updated_at": att.updated_at,
            },
        )

    def update(self, attendance_id: int, att: AttendanceSchema) -> None:
        self.db.execute_query(
            """
            UPDATE attendances SET
                protocol = :protocol, title = :title, description = :description,
                technician_id = :technician_id, client_id = :client_id, status = :status,
                priority = :priority, channel = :channel, service_type = :service_type,
                opened_at = :opened_at, due_date = :due_date, solved_at = :solved_at,
                time_spent_hours = :time_spent_hours, equipment = :equipment,
                category = :category, next_action = :next_action, resolution = :resolution,
                customer_rating = :customer_rating, updated_at = :updated_at
            WHERE id = :aid
            """,
            {
                "protocol": att.protocol,
                "title": att.title,
                "description": att.description or "",
                "technician_id": att.technician_id,
                "client_id": att.client_id,
                "status": att.status,
                "priority": att.priority,
                "channel": att.channel,
                "service_type": att.service_type,
                "opened_at": att.opened_at,
                "due_date": att.due_date,
                "solved_at": att.solved_at,
                "time_spent_hours": att.time_spent_hours,
                "equipment": att.equipment or "",
                "category": att.category or "",
                "next_action": att.next_action or "",
                "resolution": att.resolution or "",
                "customer_rating": att.customer_rating or 0,
                "updated_at": att.updated_at,
                "aid": attendance_id,
            },
        )

    def delete(self, attendance_id: int) -> None:
        self.db.execute_query("DELETE FROM attendances WHERE id = :aid", {"aid": attendance_id})

    def count_today_by_base(self, base: str) -> int:
        result = self.db.query_one(
            "SELECT COUNT(*) AS total FROM attendances WHERE protocol LIKE :pattern",
            {"pattern": f"{base}%"},
        )
        return result["total"]
