"""Utilitários de logging centralizados para toda a aplicação."""

from __future__ import annotations

import logging
from logging.handlers import RotatingFileHandler
from pathlib import Path


_CONFIGURED = False


def configure_logging(log_file: str = "crm_app.log", level: int = logging.INFO) -> None:
    """Configura logging global de forma idempotente.

    Evita múltiplos handlers duplicados quando módulos são recarregados.
    """
    global _CONFIGURED
    if _CONFIGURED:
        return

    root = logging.getLogger()
    root.setLevel(level)

    formatter = logging.Formatter(
        "%(asctime)s | %(levelname)s | %(name)s | %(message)s"
    )

    log_path = Path(__file__).with_name(log_file)
    file_handler = RotatingFileHandler(
        filename=log_path,
        maxBytes=2_000_000,
        backupCount=3,
        encoding="utf-8",
    )
    file_handler.setFormatter(formatter)

    stream_handler = logging.StreamHandler()
    stream_handler.setFormatter(formatter)

    root.addHandler(file_handler)
    root.addHandler(stream_handler)
    _CONFIGURED = True


def get_logger(name: str) -> logging.Logger:
    """Retorna logger nomeado, garantindo configuração global."""
    configure_logging()
    return logging.getLogger(name)
