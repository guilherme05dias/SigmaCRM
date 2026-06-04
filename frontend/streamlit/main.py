import streamlit as st

from app_logging import get_logger
from auth import can_access_page, initialize_auth_database
from config import AUTH_DISABLED, DEMO_MODE
from database import initialize_database
from errors import ConfigurationError, DataAccessError
from ui import (
    render_header,
    require_authentication,
    show_about,
    show_attendances,
    show_clients,
    show_dashboard,
    show_daily_summary,
    show_technicians,
    show_users_management,
    show_whatsapp,
    sidebar_navigation,
    style_app,
)

_logger = get_logger(__name__)


def _show_startup_error(exc: Exception) -> None:
    st.error("Não foi possível iniciar o ServiçoCRM.")
    st.markdown(
        """
        O banco de dados ainda não está configurado para esta instalação.
        Crie o arquivo `.streamlit/secrets.toml` com as credenciais do Supabase/PostgreSQL.
        """
    )
    st.code(
        """[database]
user = "postgres"
password = "sua_senha"
host = "db.aprjeyqponmepdrjvxtc.supabase.co"
port = 5432
dbname = "postgres"
""",
        language="toml",
    )
    st.caption(f"Detalhe técnico: {exc}")
    st.stop()


def main() -> None:
    style_app()
    try:
        if not DEMO_MODE:
            initialize_database()
        if not AUTH_DISABLED and not DEMO_MODE:
            initialize_auth_database()
    except (ConfigurationError, DataAccessError) as exc:
        _logger.warning("Falha de configuração ao iniciar aplicação: %s", exc)
        _show_startup_error(exc)

    user = require_authentication()
    page = sidebar_navigation(user)

    if not can_access_page(str(user.get("role", "")), page, user.get("allowed_pages")):
        show_about()
        return

    if page == "Dashboard":
        render_header()
        show_dashboard()
    elif page == "Atendimentos":
        show_attendances()
    elif page == "Resumo por data":
        show_daily_summary()
    elif page == "Técnicos":
        show_technicians()
    elif page == "Clientes":
        show_clients()
    elif page == "Usuários":
        show_users_management()
    elif page == "WhatsApp":
        show_whatsapp()
    else:
        show_about()


if __name__ == "__main__":
    main()
