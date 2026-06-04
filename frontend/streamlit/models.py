from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field, validator


class TechnicianSchema(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    specialty: Optional[str] = Field(None, max_length=100)
    phone: Optional[str] = Field(None, max_length=20)
    email: Optional[str] = None
    active: bool = True
    created_at: Optional[str] = None
    updated_at: Optional[str] = None

    @validator('created_at', 'updated_at', pre=True, always=True)
    def set_timestamps(cls, v):
        return v or datetime.now().isoformat(timespec="seconds")


class ClientSchema(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    company: Optional[str] = Field(None, max_length=100)
    phone: Optional[str] = Field(None, max_length=20)
    email: Optional[str] = None
    city: Optional[str] = Field(None, max_length=100)
    segment: Optional[str] = Field(None, max_length=100)
    notes: Optional[str] = ""
    status: str = "Ativo"
    created_at: Optional[str] = None
    updated_at: Optional[str] = None

    @validator('created_at', 'updated_at', pre=True, always=True)
    def set_timestamps(cls, v):
        return v or datetime.now().isoformat(timespec="seconds")

    @validator('status')
    def validate_status(cls, v):
        from config import CLIENT_STATUS_OPTIONS
        if v not in CLIENT_STATUS_OPTIONS:
            raise ValueError(f"Status deve ser um dos seguintes: {CLIENT_STATUS_OPTIONS}")
        return v


class AttendanceSchema(BaseModel):
    protocol: Optional[str] = None
    title: str = Field(..., min_length=1, max_length=200)
    description: Optional[str] = None
    technician_id: int = Field(..., gt=0)
    client_id: int = Field(..., gt=0)
    status: str = "Novo"
    priority: str = "Média"
    channel: str = "Telefone"
    service_type: str = "Remoto"
    opened_at: Optional[str] = None
    due_date: Optional[str] = None
    solved_at: Optional[str] = None
    time_spent_hours: float = 0.0
    equipment: Optional[str] = None
    category: Optional[str] = None
    next_action: Optional[str] = None
    resolution: Optional[str] = None
    customer_rating: Optional[int] = Field(None, ge=1, le=5)
    created_at: Optional[str] = None
    updated_at: Optional[str] = None

    @validator('created_at', 'updated_at', pre=True, always=True)
    def set_timestamps(cls, v):
        return v or datetime.now().isoformat(timespec="seconds")

    @validator('opened_at', pre=True, always=True)
    def set_opened_at(cls, v):
        return v or datetime.now().isoformat(timespec="seconds")

    @validator('status')
    def validate_status(cls, v):
        from config import STATUS_OPTIONS
        if v not in STATUS_OPTIONS:
            raise ValueError(f"Status deve ser um dos seguintes: {STATUS_OPTIONS}")
        return v

    @validator('priority')
    def validate_priority(cls, v):
        from config import PRIORITY_OPTIONS
        if v not in PRIORITY_OPTIONS:
            raise ValueError(f"Prioridade deve ser uma das seguintes: {PRIORITY_OPTIONS}")
        return v

    @validator('channel')
    def validate_channel(cls, v):
        from config import CHANNEL_OPTIONS
        if v not in CHANNEL_OPTIONS:
            raise ValueError(f"Canal deve ser um dos seguintes: {CHANNEL_OPTIONS}")
        return v

    @validator('service_type')
    def validate_service_type(cls, v):
        from config import SERVICE_TYPE_OPTIONS
        if v not in SERVICE_TYPE_OPTIONS:
            raise ValueError(f"Tipo de serviço deve ser um dos seguintes: {SERVICE_TYPE_OPTIONS}")
        return v