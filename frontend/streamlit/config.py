from urllib.parse import quote_plus

import streamlit as st

from errors import ConfigurationError


def get_db_url() -> str:
    """Retorna a URL de conexão PostgreSQL a partir dos secrets do Streamlit."""
    try:
        s = st.secrets["database"]
    except Exception as exc:
        raise ConfigurationError(
            "Configuração do banco ausente. Crie o arquivo "
            ".streamlit/secrets.toml com a seção [database]."
        ) from exc

    required_keys = ("user", "password", "host", "dbname")
    missing = [key for key in required_keys if not s.get(key)]
    if missing:
        raise ConfigurationError(
            "Configuração do banco incompleta em .streamlit/secrets.toml. "
            f"Campos ausentes: {', '.join(missing)}."
        )

    password = quote_plus(str(s["password"]))
    return (
        f"postgresql+psycopg2://{s['user']}:{password}"
        f"@{s['host']}:{s.get('port', 5432)}/{s['dbname']}"
    )


APP_TITLE = "ServiçoCRM"

# Temporário: desabilita login e entra como gerente local.
# Voltar para False antes de produção.
AUTH_DISABLED = True

# Temporário: roda o app com dados em memória, sem exigir Supabase.
# Voltar para False quando .streamlit/secrets.toml estiver configurado.
DEMO_MODE = True

STATUS_OPTIONS = [
    "Novo",
    "Em andamento",
    "Aguardando cliente",
    "Aguardando retorno",
    "Concluído",
    "Cancelado",
]

PRIORITY_OPTIONS = ["Baixa", "Média", "Alta", "Crítica"]
CHANNEL_OPTIONS = ["WhatsApp", "Telefone", "E-mail", "Presencial", "Acesso remoto"]
SERVICE_TYPE_OPTIONS = ["Remoto", "Presencial", "Híbrido"]
CLIENT_STATUS_OPTIONS = ["Ativo", "Em negociação", "Inativo"]

SAMPLE_TECHNICIANS = [
    "André",
    "Bruna",
    "Carlos",
    "Fernanda",
    "Juliano",
    "Marcela",
]
