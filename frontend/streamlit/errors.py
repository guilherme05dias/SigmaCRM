"""Exceções de domínio para tratamento consistente de erros."""


class CRMError(Exception):
    """Erro base do domínio CRM."""


class ValidationError(CRMError):
    """Erro de validação de entrada ou regra de negócio."""


class NotFoundError(CRMError):
    """Entidade não encontrada."""


class ConfigurationError(CRMError):
    """Configuração inválida para o backend selecionado."""


class DataAccessError(CRMError):
    """Falha de acesso ao repositório/persistência."""
