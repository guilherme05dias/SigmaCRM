from datetime import datetime

import pandas as pd
from sqlalchemy import create_engine, text
from sqlalchemy.engine import Engine

from config import SAMPLE_TECHNICIANS, get_db_url


def _get_engine() -> Engine:
    return create_engine(get_db_url(), pool_pre_ping=True)


def initialize_database() -> None:
    """Schema já criado no Supabase via supabase_schema.sql. Apenas faz seed se vazio."""
    seed_technicians()


def seed_technicians() -> None:
    engine = _get_engine()
    with engine.connect() as conn:
        total = conn.execute(text("SELECT COUNT(*) FROM technicians")).scalar()
        if total and total > 0:
            return
        now = datetime.now().isoformat(timespec="seconds")
        for name in SAMPLE_TECHNICIANS:
            conn.execute(
                text(
                    "INSERT INTO technicians (name, specialty, phone, email, active, created_at)"
                    " VALUES (:name, :spec, '', '', TRUE, :now)"
                    " ON CONFLICT (name) DO NOTHING"
                ),
                {"name": name, "spec": "Suporte técnico", "now": now},
            )
        conn.commit()


def query_dataframe(query: str, params: dict | None = None) -> pd.DataFrame:
    engine = _get_engine()
    with engine.connect() as conn:
        return pd.read_sql(text(query), conn, params=params or {})


def execute_query(query: str, params: dict | None = None) -> None:
    engine = _get_engine()
    with engine.connect() as conn:
        conn.execute(text(query), params or {})
        conn.commit()
