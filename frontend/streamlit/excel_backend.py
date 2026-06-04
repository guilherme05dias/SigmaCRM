"""
Módulo de integração com arquivo Excel (.xlsx).
Gerencia leitura/escrita nas abas: tecnicos, clientes, atendimentos.
Funciona com arquivo local, OneDrive ou pasta compartilhada na rede.
"""

import logging
import time
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

import pandas as pd

logger = logging.getLogger(__name__)

# Nomes das abas
SHEET_TECHNICIANS = "tecnicos"
SHEET_CLIENTS = "clientes"
SHEET_ATTENDANCES = "atendimentos"

# Colunas esperadas por aba
TECHNICIAN_COLS = ["id", "name", "specialty", "phone", "email", "active", "created_at"]
CLIENT_COLS = ["id", "name", "company", "phone", "email", "city", "segment", "notes", "status", "created_at"]
ATTENDANCE_COLS = [
    "id", "protocol", "title", "description", "technician_id", "client_id",
    "status", "priority", "channel", "service_type", "opened_at", "due_date",
    "solved_at", "time_spent_hours", "equipment", "category", "next_action",
    "resolution", "customer_rating", "created_at", "updated_at",
]


def _ensure_file(path: Path) -> None:
    """Cria o arquivo Excel com as abas e cabeçalhos se não existir."""
    if path.exists():
        return

    logger.info(f"Criando arquivo Excel: {path}")
    with pd.ExcelWriter(path, engine="openpyxl") as writer:
        pd.DataFrame(columns=TECHNICIAN_COLS).to_excel(writer, sheet_name=SHEET_TECHNICIANS, index=False)
        pd.DataFrame(columns=CLIENT_COLS).to_excel(writer, sheet_name=SHEET_CLIENTS, index=False)
        pd.DataFrame(columns=ATTENDANCE_COLS).to_excel(writer, sheet_name=SHEET_ATTENDANCES, index=False)
    logger.info("Arquivo Excel criado com sucesso.")


def _read_sheet(path: Path, sheet_name: str, columns: List[str]) -> pd.DataFrame:
    """Lê uma aba do Excel, retornando DataFrame com as colunas esperadas."""
    try:
        df = pd.read_excel(path, sheet_name=sheet_name, engine="openpyxl", dtype=str)
        df = df.fillna("")
        # Garantir que todas as colunas existam
        for col in columns:
            if col not in df.columns:
                df[col] = ""
        return df[columns]
    except Exception:
        return pd.DataFrame(columns=columns)


def _write_sheet(path: Path, sheet_name: str, df: pd.DataFrame) -> None:
    """Escreve um DataFrame em uma aba específica, preservando as outras abas."""
    max_retries = 3
    for attempt in range(max_retries):
        try:
            # Ler todas as abas existentes
            existing = {}
            if path.exists():
                xls = pd.ExcelFile(path, engine="openpyxl")
                for name in xls.sheet_names:
                    if name != sheet_name:
                        existing[name] = pd.read_excel(xls, sheet_name=name, engine="openpyxl", dtype=str).fillna("")
                xls.close()

            # Reescrever tudo
            with pd.ExcelWriter(path, engine="openpyxl") as writer:
                # Escrever a aba modificada primeiro
                df.to_excel(writer, sheet_name=sheet_name, index=False)
                # Reescrever as outras abas
                for name, other_df in existing.items():
                    other_df.to_excel(writer, sheet_name=name, index=False)

            return
        except PermissionError:
            if attempt < max_retries - 1:
                logger.warning(f"Arquivo em uso, tentando novamente ({attempt + 1}/{max_retries})...")
                time.sleep(1)
            else:
                raise PermissionError(
                    f"Não foi possível salvar '{path.name}'. "
                    "Verifique se o arquivo não está aberto no Excel."
                )


class ExcelRepository:
    """Repositório genérico para operações CRUD em uma aba do Excel."""

    def __init__(self, excel_path: Path, sheet_name: str, columns: List[str]):
        self._path = excel_path
        self._sheet_name = sheet_name
        self._columns = columns
        _ensure_file(excel_path)

    def _read(self) -> pd.DataFrame:
        return _read_sheet(self._path, self._sheet_name, self._columns)

    def _write(self, df: pd.DataFrame) -> None:
        _write_sheet(self._path, self._sheet_name, df)

    def get_all_records(self) -> List[Dict[str, Any]]:
        df = self._read()
        return df.to_dict("records")

    def get_dataframe(self) -> pd.DataFrame:
        df = self._read()
        if "id" in df.columns and not df.empty:
            df["id"] = pd.to_numeric(df["id"], errors="coerce").fillna(0).astype(int)
        return df

    def _next_id(self) -> int:
        df = self._read()
        if df.empty:
            return 1
        ids = pd.to_numeric(df["id"], errors="coerce").dropna().astype(int)
        return int(ids.max()) + 1 if len(ids) > 0 else 1

    def insert(self, data: Dict[str, Any]) -> int:
        df = self._read()
        new_id = self._next_id()
        data["id"] = str(new_id)
        row = {col: str(data.get(col, "")) for col in self._columns}
        df = pd.concat([df, pd.DataFrame([row])], ignore_index=True)
        self._write(df)
        logger.info(f"[{self._sheet_name}] Inserido ID {new_id}")
        return new_id

    def update_by_id(self, record_id: int, data: Dict[str, Any]) -> None:
        df = self._read()
        df["_id_num"] = pd.to_numeric(df["id"], errors="coerce").fillna(0).astype(int)
        mask = df["_id_num"] == record_id
        if not mask.any():
            raise ValueError(f"ID {record_id} não encontrado em '{self._sheet_name}'")
        data["id"] = str(record_id)
        for col in self._columns:
            df.loc[mask, col] = str(data.get(col, ""))
        df = df.drop(columns=["_id_num"])
        self._write(df)
        logger.info(f"[{self._sheet_name}] Atualizado ID {record_id}")

    def delete_by_id(self, record_id: int) -> None:
        df = self._read()
        df["_id_num"] = pd.to_numeric(df["id"], errors="coerce").fillna(0).astype(int)
        mask = df["_id_num"] == record_id
        if not mask.any():
            raise ValueError(f"ID {record_id} não encontrado em '{self._sheet_name}'")
        df = df[~mask].drop(columns=["_id_num"])
        self._write(df)
        logger.info(f"[{self._sheet_name}] Removido ID {record_id}")

    def get_by_id(self, record_id: int) -> Optional[Dict[str, Any]]:
        df = self._read()
        df["_id_num"] = pd.to_numeric(df["id"], errors="coerce").fillna(0).astype(int)
        match = df[df["_id_num"] == record_id]
        if match.empty:
            return None
        row = match.iloc[0].drop("_id_num").to_dict()
        return row
