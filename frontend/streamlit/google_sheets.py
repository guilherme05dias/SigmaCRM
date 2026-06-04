"""
Módulo de integração com Google Sheets.
Gerencia conexão e operações CRUD nas abas: tecnicos, clientes, atendimentos.
"""

import logging
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

import gspread
import pandas as pd
from gspread import Spreadsheet, Worksheet

logger = logging.getLogger(__name__)

# Nomes das abas na planilha
SHEET_TECHNICIANS = "tecnicos"
SHEET_CLIENTS = "clientes"
SHEET_ATTENDANCES = "atendimentos"

# Cabeçalhos esperados em cada aba
TECHNICIAN_HEADERS = ["id", "name", "specialty", "phone", "email", "active", "created_at"]
CLIENT_HEADERS = ["id", "name", "company", "phone", "email", "city", "segment", "notes", "status", "created_at"]
ATTENDANCE_HEADERS = [
    "id", "protocol", "title", "description", "technician_id", "client_id",
    "status", "priority", "channel", "service_type", "opened_at", "due_date",
    "solved_at", "time_spent_hours", "equipment", "category", "next_action",
    "resolution", "customer_rating", "created_at", "updated_at",
]


def _get_credentials_path() -> Path:
    return Path(__file__).parent / "credentials.json"


def connect_to_sheets(spreadsheet_id: str) -> Spreadsheet:
    """Conecta ao Google Sheets usando Service Account."""
    creds_path = _get_credentials_path()
    if not creds_path.exists():
        raise FileNotFoundError(
            f"Arquivo de credenciais não encontrado em {creds_path}.\n"
            "Siga as instruções para criar a Service Account e baixar o credentials.json."
        )
    gc = gspread.service_account(filename=str(creds_path))
    return gc.open_by_key(spreadsheet_id)


def _get_or_create_worksheet(spreadsheet: Spreadsheet, title: str, headers: List[str]) -> Worksheet:
    """Obtém ou cria uma aba com os cabeçalhos corretos."""
    try:
        ws = spreadsheet.worksheet(title)
        # Verificar se tem cabeçalhos
        existing = ws.row_values(1)
        if not existing:
            ws.append_row(headers, value_input_option="RAW")
    except gspread.WorksheetNotFound:
        ws = spreadsheet.add_worksheet(title=title, rows=1000, cols=len(headers))
        ws.append_row(headers, value_input_option="RAW")
        # Formatar cabeçalho (negrito)
        ws.format("1", {"textFormat": {"bold": True}})
    return ws


def setup_spreadsheet(spreadsheet: Spreadsheet) -> None:
    """Garante que todas as abas existam com os cabeçalhos corretos."""
    _get_or_create_worksheet(spreadsheet, SHEET_TECHNICIANS, TECHNICIAN_HEADERS)
    _get_or_create_worksheet(spreadsheet, SHEET_CLIENTS, CLIENT_HEADERS)
    _get_or_create_worksheet(spreadsheet, SHEET_ATTENDANCES, ATTENDANCE_HEADERS)

    # Remover aba padrão "Sheet1" / "Página1" se existir e estiver vazia
    for default_name in ("Sheet1", "Página1", "Planilha1"):
        try:
            default_ws = spreadsheet.worksheet(default_name)
            if not default_ws.get_all_values()[1:]:  # sem dados além do cabeçalho
                spreadsheet.del_worksheet(default_ws)
        except (gspread.WorksheetNotFound, IndexError):
            pass

    logger.info("Planilha configurada com sucesso.")


class SheetsRepository:
    """Repositório base para operações CRUD no Google Sheets."""

    def __init__(self, spreadsheet: Spreadsheet, sheet_name: str, headers: List[str]):
        self._spreadsheet = spreadsheet
        self._sheet_name = sheet_name
        self._headers = headers
        self._ws: Optional[Worksheet] = None

    @property
    def ws(self) -> Worksheet:
        if self._ws is None:
            self._ws = self._spreadsheet.worksheet(self._sheet_name)
        return self._ws

    def _invalidate_cache(self) -> None:
        """Força re-leitura da aba na próxima operação."""
        self._ws = None

    def get_all_records(self) -> List[Dict[str, Any]]:
        """Retorna todos os registros da aba."""
        records = self.ws.get_all_records()
        return records

    def get_dataframe(self) -> pd.DataFrame:
        """Retorna todos os registros como DataFrame."""
        records = self.get_all_records()
        if not records:
            return pd.DataFrame(columns=self._headers)
        df = pd.DataFrame(records)
        # Garantir que id seja int
        if "id" in df.columns and not df.empty:
            df["id"] = pd.to_numeric(df["id"], errors="coerce").fillna(0).astype(int)
        return df

    def _next_id(self) -> int:
        """Gera próximo ID baseado no maior existente."""
        records = self.get_all_records()
        if not records:
            return 1
        ids = [int(r.get("id", 0)) for r in records if r.get("id")]
        return max(ids) + 1 if ids else 1

    def _find_row_by_id(self, record_id: int) -> Optional[int]:
        """Encontra o número da linha (1-based) pelo ID."""
        records = self.get_all_records()
        for i, r in enumerate(records):
            if int(r.get("id", 0)) == record_id:
                return i + 2  # +1 cabeçalho, +1 base-1
        return None

    def insert(self, data: Dict[str, Any]) -> int:
        """Insere um novo registro e retorna o ID."""
        new_id = self._next_id()
        data["id"] = new_id
        row = [str(data.get(h, "")) for h in self._headers]
        self.ws.append_row(row, value_input_option="RAW")
        self._invalidate_cache()
        logger.info(f"[{self._sheet_name}] Registro inserido: ID {new_id}")
        return new_id

    def update_by_id(self, record_id: int, data: Dict[str, Any]) -> None:
        """Atualiza um registro existente pelo ID."""
        row_num = self._find_row_by_id(record_id)
        if row_num is None:
            raise ValueError(f"Registro ID {record_id} não encontrado em '{self._sheet_name}'")
        data["id"] = record_id
        row = [str(data.get(h, "")) for h in self._headers]
        col_end = chr(ord("A") + len(self._headers) - 1)
        cell_range = f"A{row_num}:{col_end}{row_num}"
        self.ws.update(cell_range, [row], value_input_option="RAW")
        self._invalidate_cache()
        logger.info(f"[{self._sheet_name}] Registro atualizado: ID {record_id}")

    def delete_by_id(self, record_id: int) -> None:
        """Remove um registro pelo ID."""
        row_num = self._find_row_by_id(record_id)
        if row_num is None:
            raise ValueError(f"Registro ID {record_id} não encontrado em '{self._sheet_name}'")
        self.ws.delete_rows(row_num)
        self._invalidate_cache()
        logger.info(f"[{self._sheet_name}] Registro removido: ID {record_id}")

    def get_by_id(self, record_id: int) -> Optional[Dict[str, Any]]:
        """Busca um registro pelo ID."""
        records = self.get_all_records()
        for r in records:
            if int(r.get("id", 0)) == record_id:
                return r
        return None
