from datetime import datetime
from typing import Dict, Optional

import pandas as pd

from app_logging import get_logger
from config import CLIENT_STATUS_OPTIONS, STATUS_OPTIONS
from errors import ConfigurationError, DataAccessError, NotFoundError, ValidationError
from models import AttendanceSchema, ClientSchema, TechnicianSchema

logger = get_logger(__name__)


def _build_repositories():
    """Constrói os repositórios SQLite."""
    try:
        from repositories import (
            AttendanceRepository,
            ClientRepository,
            DatabaseRepository,
            TechnicianRepository,
        )

        db_repo = DatabaseRepository()
        return (
            TechnicianRepository(db_repo),
            ClientRepository(db_repo),
            AttendanceRepository(db_repo),
        )
    except Exception as exc:
        logger.exception("Falha ao construir repositórios")
        raise DataAccessError("Não foi possível inicializar os repositórios de dados.") from exc


class CRMService:
    def __init__(self):
        self.technician_repo, self.client_repo, self.attendance_repo = _build_repositories()

    def get_or_create_client(self, client_data: Dict[str, str]) -> int:
        """Obtém ou cria um cliente baseado nos dados fornecidos."""
        try:
            client_schema = ClientSchema(**client_data)
            existing = self.client_repo.get_by_name(client_schema.name)
            if existing:
                logger.info(f"Cliente existente encontrado: {client_schema.name}")
                return existing['id']
            client_id = self.client_repo.create(client_schema)
            logger.info(f"Novo cliente criado: {client_schema.name} (ID: {client_id})")
            return client_id
        except CRMServiceDomainError:
            raise
        except Exception as exc:
            logger.exception("Erro ao obter/criar cliente")
            raise ValidationError(f"Erro ao processar cliente: {exc}") from exc

    def generate_protocol(self) -> str:
        """Gera um protocolo único baseado na data atual."""
        base = datetime.now().strftime("ATD%Y%m%d")
        try:
            sequence = self.attendance_repo.count_today_by_base(base) + 1
            protocol = f"{base}-{sequence:03d}"
            logger.info(f"Protocolo gerado: {protocol}")
            return protocol
        except Exception as exc:
            logger.exception("Erro ao gerar protocolo")
            raise DataAccessError("Erro ao gerar protocolo único") from exc

    def load_technicians(self, active_only: bool = False) -> pd.DataFrame:
        """Carrega técnicos do banco."""
        try:
            return self.technician_repo.get_all(active_only)
        except Exception as exc:
            logger.exception("Erro ao carregar técnicos")
            raise DataAccessError("Erro ao carregar lista de técnicos") from exc

    def load_clients(self, active_first: bool = True) -> pd.DataFrame:
        """Carrega clientes do banco."""
        try:
            return self.client_repo.get_all(active_first)
        except Exception as exc:
            logger.exception("Erro ao carregar clientes")
            raise DataAccessError("Erro ao carregar lista de clientes") from exc

    def load_attendances(self) -> pd.DataFrame:
        """Carrega atendimentos do banco."""
        try:
            return self.attendance_repo.get_all()
        except Exception as exc:
            logger.exception("Erro ao carregar atendimentos")
            raise DataAccessError("Erro ao carregar lista de atendimentos") from exc

    def create_attendance(self, attendance_data: Dict) -> int:
        """Cria um novo atendimento."""
        try:
            if not attendance_data.get('protocol'):
                attendance_data['protocol'] = self.generate_protocol()
            attendance_schema = AttendanceSchema(**attendance_data)
            if not self.technician_repo.get_by_id(attendance_schema.technician_id):
                raise NotFoundError("Técnico não encontrado")
            if not self.client_repo.get_by_id(attendance_schema.client_id):
                raise NotFoundError("Cliente não encontrado")
            attendance_id = self.attendance_repo.create(attendance_schema)
            logger.info(f"Atendimento criado: {attendance_schema.protocol} (ID: {attendance_id})")
            return attendance_id
        except CRMServiceDomainError:
            raise
        except Exception as exc:
            logger.exception("Erro ao criar atendimento")
            raise ValidationError(f"Erro ao criar atendimento: {exc}") from exc

    def update_attendance(self, attendance_id: int, attendance_data: Dict) -> None:
        """Atualiza um atendimento existente."""
        try:
            existing = self.attendance_repo.get_by_id(attendance_id)
            if not existing:
                raise NotFoundError("Atendimento não encontrado")
            attendance_schema = AttendanceSchema(**attendance_data)
            self.attendance_repo.update(attendance_id, attendance_schema)
            logger.info(f"Atendimento atualizado: ID {attendance_id}")
        except CRMServiceDomainError:
            raise
        except Exception as exc:
            logger.exception("Erro ao atualizar atendimento %s", attendance_id)
            raise ValidationError(f"Erro ao atualizar atendimento: {exc}") from exc

    def delete_attendance(self, attendance_id: int) -> None:
        """Exclui um atendimento."""
        try:
            existing = self.attendance_repo.get_by_id(attendance_id)
            if not existing:
                raise NotFoundError("Atendimento não encontrado")
            self.attendance_repo.delete(attendance_id)
            logger.info(f"Atendimento excluído: ID {attendance_id}")
        except CRMServiceDomainError:
            raise
        except Exception as exc:
            logger.exception("Erro ao excluir atendimento %s", attendance_id)
            raise DataAccessError(f"Erro ao excluir atendimento: {exc}") from exc

    def create_technician(self, technician_data: Dict) -> int:
        """Cria um novo técnico."""
        try:
            technician_schema = TechnicianSchema(**technician_data)
            technician_id = self.technician_repo.create(technician_schema)
            logger.info(f"Técnico criado: {technician_schema.name} (ID: {technician_id})")
            return technician_id
        except CRMServiceDomainError:
            raise
        except Exception as exc:
            logger.exception("Erro ao criar técnico")
            raise ValidationError(f"Erro ao criar técnico: {exc}") from exc

    def update_technician(self, technician_id: int, technician_data: Dict) -> None:
        """Atualiza um técnico."""
        try:
            existing = self.technician_repo.get_by_id(technician_id)
            if not existing:
                raise NotFoundError("Técnico não encontrado")
            technician_schema = TechnicianSchema(**technician_data)
            self.technician_repo.update(technician_id, technician_schema)
            logger.info(f"Técnico atualizado: ID {technician_id}")
        except CRMServiceDomainError:
            raise
        except Exception as exc:
            logger.exception("Erro ao atualizar técnico %s", technician_id)
            raise ValidationError(f"Erro ao atualizar técnico: {exc}") from exc

    def delete_technician(self, technician_id: int) -> None:
        """Exclui um técnico."""
        try:
            existing = self.technician_repo.get_by_id(technician_id)
            if not existing:
                raise NotFoundError("Técnico não encontrado")
            self.technician_repo.delete(technician_id)
            logger.info(f"Técnico excluído: ID {technician_id}")
        except CRMServiceDomainError:
            raise
        except Exception as exc:
            logger.exception("Erro ao excluir técnico %s", technician_id)
            raise DataAccessError(f"Erro ao excluir técnico: {exc}") from exc

    def create_client(self, client_data: Dict) -> int:
        """Cria um novo cliente."""
        try:
            client_schema = ClientSchema(**client_data)
            client_id = self.client_repo.create(client_schema)
            logger.info(f"Cliente criado: {client_schema.name} (ID: {client_id})")
            return client_id
        except CRMServiceDomainError:
            raise
        except Exception as exc:
            logger.exception("Erro ao criar cliente")
            raise ValidationError(f"Erro ao criar cliente: {exc}") from exc

    def update_client(self, client_id: int, client_data: Dict) -> None:
        """Atualiza um cliente."""
        try:
            existing = self.client_repo.get_by_id(client_id)
            if not existing:
                raise NotFoundError("Cliente não encontrado")
            client_schema = ClientSchema(**client_data)
            self.client_repo.update(client_id, client_schema)
            logger.info(f"Cliente atualizado: ID {client_id}")
        except CRMServiceDomainError:
            raise
        except Exception as exc:
            logger.exception("Erro ao atualizar cliente %s", client_id)
            raise ValidationError(f"Erro ao atualizar cliente: {exc}") from exc


CRMServiceDomainError = (ValidationError, NotFoundError, ConfigurationError, DataAccessError)