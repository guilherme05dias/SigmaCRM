"""Backend do CRM de Técnicos com interface estável para a UI."""

from datetime import datetime
from typing import Callable, TypeVar

import pandas as pd

from app_logging import configure_logging, get_logger
from config import DEMO_MODE
import demo_data
from errors import CRMError
from services import CRMService

configure_logging()
logger = get_logger(__name__)

T = TypeVar("T")

_crm_service: CRMService | None = None


def _get_crm_service() -> CRMService:
    """Inicializa o serviço apenas quando uma operação precisa do banco."""
    global _crm_service
    if _crm_service is None:
        _crm_service = CRMService()
    return _crm_service


class _CRMServiceProxy:
    """Mantém compatibilidade com chamadas existentes a `crm_service`."""

    def __getattr__(self, name: str):
        return getattr(_get_crm_service(), name)


crm_service = _CRMServiceProxy()


def _run_action(action: Callable[[], T], message: str) -> T:
    try:
        return action()
    except CRMError:
        raise
    except Exception as exc:
        logger.exception(message)
        raise RuntimeError(message) from exc


def health_check() -> dict:
    """Retorna status operacional básico da aplicação."""
    timestamp = datetime.now().isoformat(timespec="seconds")
    if DEMO_MODE:
        technicians = load_technicians(active_only=False)
        clients = load_clients(active_first=False)
        attendances = load_attendances()
        return {
            "status": "OK",
            "timestamp": timestamp,
            "backend": "demo",
            "technicians": int(len(technicians)),
            "clients": int(len(clients)),
            "attendances": int(len(attendances)),
        }
    try:
        technicians = load_technicians(active_only=False)
        clients = load_clients(active_first=False)
        attendances = load_attendances()
        return {
            "status": "OK",
            "timestamp": timestamp,
            "backend": "postgresql",
            "technicians": int(len(technicians)),
            "clients": int(len(clients)),
            "attendances": int(len(attendances)),
        }
    except Exception as exc:
        logger.exception("Falha no health check")
        return {
            "status": "ERROR",
            "timestamp": timestamp,
            "backend": "postgresql",
            "error": str(exc),
        }


def get_or_create_client(
    name: str,
    company: str,
    phone: str,
    email: str,
    city: str,
    segment: str,
    status: str = "Ativo",
) -> int:
    """
    Obtém ou cria um cliente.
    Mantém a mesma interface para compatibilidade com UI.
    """
    if DEMO_MODE:
        return demo_data.get_or_create_client(name, company, phone, email, city, segment, status)

    def _action() -> int:
        client_data = {
            "name": name,
            "company": company,
            "phone": phone,
            "email": email,
            "city": city,
            "segment": segment,
            "status": status,
        }
        return crm_service.get_or_create_client(client_data)

    return _run_action(_action, "Erro ao obter/criar cliente")


def generate_protocol() -> str:
    """Gera um protocolo único."""
    if DEMO_MODE:
        return demo_data.generate_protocol()
    return _run_action(crm_service.generate_protocol, "Erro ao gerar protocolo")


def load_technicians(active_only: bool = False) -> pd.DataFrame:
    """Carrega técnicos."""
    if DEMO_MODE:
        return demo_data.load_technicians(active_only)
    return _run_action(lambda: crm_service.load_technicians(active_only), "Erro ao carregar técnicos")


def load_clients(active_first: bool = True) -> pd.DataFrame:
    """Carrega clientes."""
    if DEMO_MODE:
        return demo_data.load_clients(active_first)
    return _run_action(lambda: crm_service.load_clients(active_first), "Erro ao carregar clientes")


def load_attendances() -> pd.DataFrame:
    """Carrega atendimentos."""
    if DEMO_MODE:
        return demo_data.load_attendances()
    return _run_action(crm_service.load_attendances, "Erro ao carregar atendimentos")


# Funções adicionais para operações CRUD completas
def create_attendance(attendance_data: dict) -> int:
    """Cria um novo atendimento."""
    if DEMO_MODE:
        return demo_data.create_attendance(attendance_data)
    return _run_action(lambda: crm_service.create_attendance(attendance_data), "Erro ao criar atendimento")


def update_attendance(attendance_id: int, attendance_data: dict) -> None:
    """Atualiza um atendimento."""
    if DEMO_MODE:
        protocol = attendance_data.get("protocol")
        if protocol:
            demo_data.update_attendance_by_protocol(
                protocol,
                attendance_data.get("status", "Novo"),
                attendance_data.get("resolution", ""),
                attendance_data.get("next_action", ""),
                float(attendance_data.get("time_spent_hours") or 0),
                attendance_data.get("solved_at"),
            )
        return
    _run_action(
        lambda: crm_service.update_attendance(attendance_id, attendance_data),
        "Erro ao atualizar atendimento",
    )


def delete_attendance(attendance_id: int) -> None:
    """Exclui um atendimento."""
    if DEMO_MODE:
        demo_data.delete_attendance(attendance_id)
        return
    _run_action(lambda: crm_service.delete_attendance(attendance_id), "Erro ao excluir atendimento")


def delete_technician(technician_id: int) -> None:
    """Exclui um técnico."""
    if DEMO_MODE:
        demo_data.delete_technician(technician_id)
        return
    _run_action(lambda: crm_service.delete_technician(technician_id), "Erro ao excluir técnico")


def create_technician(technician_data: dict) -> int:
    """Cria um novo técnico."""
    if DEMO_MODE:
        return demo_data.create_technician(technician_data)
    return _run_action(lambda: crm_service.create_technician(technician_data), "Erro ao criar técnico")


def update_technician(technician_id: int, technician_data: dict) -> None:
    """Atualiza um técnico."""
    if DEMO_MODE:
        demo_data.set_technician_active(technician_id, bool(technician_data.get("active", True)))
        return
    _run_action(lambda: crm_service.update_technician(technician_id, technician_data), "Erro ao atualizar técnico")


def create_client(client_data: dict) -> int:
    """Cria um novo cliente."""
    if DEMO_MODE:
        return demo_data.create_client(client_data)
    return _run_action(lambda: crm_service.create_client(client_data), "Erro ao criar cliente")


def update_client(client_id: int, client_data: dict) -> None:
    """Atualiza um cliente."""
    if DEMO_MODE:
        demo_data.update_client(client_id, **client_data)
        return
    _run_action(lambda: crm_service.update_client(client_id, client_data), "Erro ao atualizar cliente")


def create_technician_entry(name: str, specialty: str, phone: str, email: str, active: bool) -> None:
    """Cria técnico."""
    if DEMO_MODE:
        demo_data.create_technician(
            {"name": name, "specialty": specialty, "phone": phone, "email": email, "active": active}
        )
        return
    _run_action(
        lambda: crm_service.create_technician(
            {
                "name": name.strip(),
                "specialty": specialty.strip(),
                "phone": phone.strip(),
                "email": email.strip(),
                "active": active,
            }
        ),
        "Erro ao criar técnico",
    )


def set_technician_active(technician_id: int, active: bool) -> None:
    """Atualiza status ativo/inativo de técnico."""
    if DEMO_MODE:
        demo_data.set_technician_active(technician_id, active)
        return
    existing = crm_service.technician_repo.get_by_id(int(technician_id))
    if existing:
        from models import TechnicianSchema
        tech = TechnicianSchema(
            name=existing["name"],
            specialty=existing.get("specialty", ""),
            phone=existing.get("phone", ""),
            email=existing.get("email", ""),
            active=active,
            created_at=existing.get("created_at"),
        )
        crm_service.technician_repo.update(int(technician_id), tech)


def create_client_entry(
    name: str,
    company: str,
    phone: str,
    email: str,
    city: str,
    segment: str,
    notes: str,
    status: str,
) -> None:
    """Cria cliente."""
    if DEMO_MODE:
        demo_data.create_client(
            {
                "name": name,
                "company": company,
                "phone": phone,
                "email": email,
                "city": city,
                "segment": segment,
                "notes": notes,
                "status": status,
            }
        )
        return
    _run_action(
        lambda: crm_service.create_client(
            {
                "name": name.strip(),
                "company": company.strip(),
                "phone": phone.strip(),
                "email": email.strip(),
                "city": city.strip(),
                "segment": segment.strip(),
                "notes": notes.strip(),
                "status": status,
            }
        ),
        "Erro ao criar cliente",
    )


def set_client_status(client_id: int, status: str) -> None:
    """Atualiza status de cliente."""
    if DEMO_MODE:
        demo_data.update_client(client_id, status=status)
        return
    existing = crm_service.client_repo.get_by_id(int(client_id))
    if existing:
        from models import ClientSchema
        client = ClientSchema(
            name=existing["name"],
            company=existing.get("company", ""),
            phone=existing.get("phone", ""),
            email=existing.get("email", ""),
            city=existing.get("city", ""),
            segment=existing.get("segment", ""),
            notes=existing.get("notes", ""),
            status=status,
            created_at=existing.get("created_at"),
        )
        crm_service.client_repo.update(int(client_id), client)


def update_client_profile(
    client_id: int,
    company: str,
    phone: str,
    email: str,
    city: str,
    segment: str,
    status: str,
) -> None:
    """Atualiza dados de um cliente existente."""
    if DEMO_MODE:
        demo_data.update_client(
            client_id,
            company=company.strip(),
            phone=phone.strip(),
            email=email.strip(),
            city=city.strip(),
            segment=segment.strip(),
            status=status,
        )
        return
    existing = crm_service.client_repo.get_by_id(int(client_id))
    if existing:
        from models import ClientSchema
        client = ClientSchema(
            name=existing["name"],
            company=company.strip(),
            phone=phone.strip(),
            email=email.strip(),
            city=city.strip(),
            segment=segment.strip(),
            notes=existing.get("notes", ""),
            status=status,
            created_at=existing.get("created_at"),
        )
        crm_service.client_repo.update(int(client_id), client)


def create_attendance_entry(
    protocol: str,
    title: str,
    description: str,
    technician_id: int,
    client_id: int,
    status: str,
    priority: str,
    channel: str,
    service_type: str,
    due_date: str,
    solved_at: str | None,
    equipment: str,
    category: str,
    next_action: str,
    resolution: str,
) -> None:
    """Cria atendimento."""
    if DEMO_MODE:
        demo_data.create_attendance(
            {
                "protocol": protocol,
                "title": title,
                "description": description,
                "technician_id": int(technician_id),
                "client_id": int(client_id),
                "status": status,
                "priority": priority,
                "channel": channel,
                "service_type": service_type,
                "due_date": due_date or None,
                "solved_at": solved_at,
                "equipment": equipment,
                "category": category,
                "next_action": next_action,
                "resolution": resolution,
            }
        )
        return
    _run_action(
        lambda: crm_service.create_attendance(
            {
                "protocol": protocol,
                "title": title.strip(),
                "description": description.strip(),
                "technician_id": int(technician_id),
                "client_id": int(client_id),
                "status": status,
                "priority": priority,
                "channel": channel,
                "service_type": service_type,
                "due_date": due_date or None,
                "solved_at": solved_at,
                "equipment": equipment.strip(),
                "category": category.strip(),
                "next_action": next_action.strip(),
                "resolution": resolution.strip(),
            }
        ),
        "Erro ao criar atendimento",
    )


def update_attendance_by_protocol(
    protocol: str,
    status: str,
    resolution: str,
    next_action: str,
    time_spent_hours: float,
    solved_at: str | None,
) -> None:
    """Atualiza campos de acompanhamento de atendimento por protocolo."""
    if DEMO_MODE:
        demo_data.update_attendance_by_protocol(
            protocol, status, resolution, next_action, time_spent_hours, solved_at
        )
        return
    # Buscar atendimento pelo protocolo
    att = crm_service.attendance_repo.get_by_protocol(protocol)
    if att:
        from models import AttendanceSchema
        updated = AttendanceSchema(
            protocol=protocol,
            title=att["title"],
            description=att.get("description", ""),
            technician_id=int(att["technician_id"]),
            client_id=int(att["client_id"]),
            status=status,
            priority=att.get("priority", "Média"),
            channel=att.get("channel", "Telefone"),
            service_type=att.get("service_type", "Remoto"),
            opened_at=att.get("opened_at"),
            due_date=att.get("due_date") or None,
            solved_at=solved_at,
            time_spent_hours=float(time_spent_hours),
            equipment=att.get("equipment", ""),
            category=att.get("category", ""),
            next_action=next_action.strip(),
            resolution=resolution.strip(),
            customer_rating=int(att.get("customer_rating", 0)) or None,
            created_at=att.get("created_at"),
        )
        crm_service.attendance_repo.update(int(att["id"]), updated)
