import base64
import mimetypes
import re
from datetime import date, datetime, timedelta
from pathlib import Path

import pandas as pd
import plotly.express as px
import streamlit as st
from streamlit_autorefresh import st_autorefresh

from auth import (
    ALL_ACTIONS,
    ALL_PAGES,
    ROLE_ALLOWED_PAGES,
    ROLE_DEFAULT_ACTIONS,
    authenticate_user,
    can_manage,
    change_password,
    create_user as auth_create_user,
    get_allowed_pages,
    list_users,
    update_user as auth_update_user,
    user_to_session_dict,
)
from design_system import STYLE_VARS, STATUS_BADGES, PRIORITY_BADGES
from icons import render as ds_icon, data_uri as ds_icon_uri
from backend import (
    create_attendance_entry,
    create_client_entry,
    create_technician_entry,
    delete_attendance,
    delete_technician,
    generate_protocol,
    get_or_create_client,
    load_attendances,
    load_clients,
    load_technicians,
    set_client_status,
    set_technician_active,
    update_attendance_by_protocol,
    update_client_profile,
)
from config import (
    APP_TITLE,
    AUTH_DISABLED,
    CHANNEL_OPTIONS,
    CLIENT_STATUS_OPTIONS,
    DEMO_MODE,
    PRIORITY_OPTIONS,
    SERVICE_TYPE_OPTIONS,
    STATUS_OPTIONS,
)
from whatsapp_parser import (
    tables_exist as wa_tables_exist,
    import_new_messages,
    load_conversations,
    load_messages,
    load_summary_stats,
    update_conversation_status,
    link_attendance,
    save_notes,
)


# ---------------------------------------------------------------------------
# CSS GLOBAL – Design System
# ---------------------------------------------------------------------------

_GLOBAL_CSS = f"""
<style>
    @import url('https://fonts.googleapis.com/css2?family=Montserrat:wght@300;400;500;600;700;800&display=swap');

    :root {{
        --primary-color: {STYLE_VARS["primary"]};
        --primary-deep: {STYLE_VARS["primary_deep"]};
        --primary-soft: {STYLE_VARS["primary_soft"]};
        --secondary-color: {STYLE_VARS["secondary"]};
        --accent-color: {STYLE_VARS["accent"]};
        --fb-blue: {STYLE_VARS["fb_blue"]};
        --canvas: {STYLE_VARS["canvas"]};
        --surface-soft: {STYLE_VARS["surface_soft"]};
        --hairline: {STYLE_VARS["hairline"]};
        --hairline-soft: {STYLE_VARS["hairline_soft"]};
        --ink-deep: {STYLE_VARS["ink_deep"]};
        --ink: {STYLE_VARS["ink"]};
        --charcoal: {STYLE_VARS["charcoal"]};
        --slate: {STYLE_VARS["slate"]};
        --steel: {STYLE_VARS["steel"]};
        --stone: {STYLE_VARS["stone"]};
        --success: {STYLE_VARS["success"]};
        --critical: {STYLE_VARS["critical"]};
        --background-light: {STYLE_VARS["surface_soft"]};
        --neutral: {STYLE_VARS["neutral"]};
        --text-main: {STYLE_VARS["ink"]};
        --font-family: {STYLE_VARS["font_family"]};
        --box-shadow: {STYLE_VARS["box_shadow"]};
        --box-shadow-hover: {STYLE_VARS["box_shadow_hover"]};
        --box-shadow-panel: {STYLE_VARS["box_shadow_panel"]};
        --border-radius: {STYLE_VARS["radius_xl"]};
        --radius-card: {STYLE_VARS["radius_xxl"]};
        --radius-full: {STYLE_VARS["radius_full"]};
        --transition: {STYLE_VARS["transition"]};
    }}

    header[data-testid="stHeader"],
    [data-testid="stToolbar"],
    [data-testid="stDecoration"],
    [data-testid="stStatusWidget"],
    #MainMenu {{ display: none !important; height: 0 !important; }}

    [data-testid="stAppViewContainer"],
    [data-testid="stAppViewContainer"] > section,
    [data-testid="stMain"],
    [data-testid="stMain"] > div:first-child,
    .main {{
        padding-top: 0 !important;
        margin-top: 0 !important;
    }}

    .main .block-container {{
        max-width: 1480px;
        padding-top: 1.2rem !important;
        padding-bottom: 2.8rem;
    }}

    html, body, .stApp {{
        font-family: var(--font-family) !important;
        color: var(--text-main) !important;
        background: var(--background-light) !important;
    }}

    .stApp h1, .stApp h2, .stApp h3 {{
        color: var(--ink-deep) !important;
        letter-spacing: 0;
        font-weight: 600 !important;
    }}
    .stApp h1 {{ font-weight: 700 !important; font-size: 2.15rem !important; line-height: 1.16; }}

    .stApp,
    .stApp p,
    .stApp li,
    .stApp span,
    .stApp div {{
        color: var(--ink);
        letter-spacing: {STYLE_VARS["letter_spacing_body"]};
    }}

    .stApp label,
    .stApp [data-testid="stWidgetLabel"] p,
    .stApp [data-testid="stWidgetLabel"] span,
    .stApp .stMarkdown,
    .stApp .stCaption {{
        color: var(--charcoal) !important;
        font-weight: 600;
    }}

    .section-title {{
        display: flex;
        align-items: center;
        gap: 0.55rem;
        margin: 1.15rem 0 0.85rem;
        color: var(--ink-deep);
        font-size: 1.28rem;
        font-weight: 600;
        letter-spacing: 0;
    }}

    .stButton {{
        margin-bottom: 0.45rem;
    }}

    [data-testid="stSidebar"] {{
        background: var(--canvas) !important;
        border-right: 1px solid var(--hairline-soft);
    }}
    [data-testid="stSidebarCollapsedControl"],
    [data-testid="stSidebarCollapseButton"] {{
        display: none !important;
    }}
    [data-testid="stSidebar"] > div,
    [data-testid="stSidebar"] > div > div,
    [data-testid="stSidebarContent"],
    [data-testid="stSidebarContent"] > div:first-child,
    [data-testid="stSidebarUserContent"] {{
        padding-top: 0 !important;
        margin-top: 0 !important;
    }}
    [data-testid="stSidebar"] [data-testid="stSidebarContent"] {{
        overflow-y: auto !important;
        overflow-x: hidden !important;
        scrollbar-width: none !important;
        -ms-overflow-style: none !important;
    }}
    [data-testid="stSidebar"] [data-testid="stSidebarContent"]::-webkit-scrollbar {{
        width: 0 !important;
        height: 0 !important;
        display: none !important;
        background: transparent !important;
    }}
    [data-testid="stSidebar"] * {{ color: var(--ink); }}
    [data-testid="stSidebar"] .stRadio > label {{
        font-size: 0.95rem;
        font-weight: 700;
        letter-spacing: -0.01em;
        color: var(--steel) !important;
    }}
    [data-testid="stSidebar"] .stRadio input[type="radio"] {{
        display: none !important;
    }}
    [data-testid="stSidebar"] .stRadio label > div:first-child {{
        display: none !important;
    }}
    [data-testid="stSidebar"] .stRadio [data-testid="stMarkdownContainer"] p {{
        margin: 0 !important;
        color: var(--ink) !important;
        font-weight: 700;
    }}
    [data-testid="stSidebar"] .stRadio > div[role="radiogroup"] label {{
        display: flex !important;
        align-items: center;
        width: 100% !important;
        box-sizing: border-box;
        min-height: 2.9rem;
        padding: 0.6rem 0.95rem;
        border-radius: var(--radius-full);
        border: 1px solid var(--hairline);
        margin-bottom: 0.45rem;
        transition: var(--transition);
        background: var(--canvas) !important;
    }}
    [data-testid="stSidebar"] .stRadio > div[role="radiogroup"] label:hover {{
        background: var(--surface-soft) !important;
        border-color: var(--hairline);
    }}
    [data-testid="stSidebar"] .stRadio > div[role="radiogroup"] label[data-checked="true"],
    [data-testid="stSidebar"] .stRadio > div[role="radiogroup"] div[data-checked="true"] label {{
        background: var(--ink-deep) !important;
        border-color: var(--ink-deep);
        box-shadow: none;
    }}
    [data-testid="stSidebar"] .stRadio > div[role="radiogroup"] label[data-checked="true"] [data-testid="stMarkdownContainer"] p,
    [data-testid="stSidebar"] .stRadio > div[role="radiogroup"] div[data-checked="true"] label [data-testid="stMarkdownContainer"] p {{
        color: var(--canvas) !important;
    }}

    .sidebar-brand-wrap {{
        display: flex;
        justify-content: center;
        align-items: center;
        width: 100%;
        margin: 1rem 0 0.8rem;
        padding: 0;
        line-height: 0;
    }}
    .sidebar-brand-wrap img {{
        display: block;
        width: min(172px, 76%);
        height: auto;
        margin: 0 auto;
        object-fit: contain;
    }}

    [data-testid="stSidebar"] hr {{
        margin: 0.8rem 0 1.05rem;
        border-color: var(--hairline-soft) !important;
    }}

    /* Secundário / ghost — pill com contorno (padrão Meta button-secondary) */
    .stButton > button,
    .stFormSubmitButton > button,
    .stDownloadButton > button {{
        border: 2px solid var(--ink-deep) !important;
        border-radius: var(--radius-full) !important;
        background: var(--canvas) !important;
        color: var(--ink-deep) !important;
        font-weight: 700 !important;
        letter-spacing: 0 !important;
        padding: 0.58rem 1.35rem !important;
        box-shadow: none !important;
        transition: var(--transition);
    }}

    /* Primário — pill cobalto (padrão Meta button-buy-cta) */
    .stButton > button[kind="primary"],
    .stFormSubmitButton > button[kind="primary"] {{
        background: var(--primary-color) !important;
        color: var(--neutral) !important;
        border: 2px solid var(--primary-color) !important;
        box-shadow: none !important;
    }}

    .stButton > button[kind="primary"]:hover,
    .stButton > button[kind="primary"]:active,
    .stFormSubmitButton > button[kind="primary"]:hover,
    .stFormSubmitButton > button[kind="primary"]:active {{
        background: var(--primary-deep) !important;
        color: var(--neutral) !important;
        border-color: var(--primary-deep) !important;
        box-shadow: none !important;
    }}
    .stButton > button:hover,
    .stFormSubmitButton > button:hover,
    .stDownloadButton > button:hover {{
        background: var(--surface-soft) !important;
        border-color: var(--ink-deep) !important;
        color: var(--ink-deep) !important;
        box-shadow: none !important;
    }}

    .stTextInput,
    .stTextArea,
    .stNumberInput,
    .stDateInput,
    .stSelectbox,
    .stMultiSelect {{
        margin-bottom: 0.18rem;
    }}

    .stApp [data-testid="stWidgetLabel"] {{
        margin-bottom: 0.28rem !important;
    }}

    :root {{
        --field-border-color: {STYLE_VARS["hairline"]};
        --field-border-radius: {STYLE_VARS["radius_lg"]};
        --field-min-height: 2.75rem;
        --field-focus: 0 0 0 2px {STYLE_VARS["fb_blue"]};
    }}

    /* Casca padrão dos campos no nível real do BaseWeb */
    .stTextInput div[data-baseweb="input"],
    .stNumberInput div[data-baseweb="input"],
    .stDateInput div[data-baseweb="input"],
    .stTextArea div[data-baseweb="textarea"],
    .stSelectbox div[data-baseweb="select"],
    .stMultiSelect div[data-baseweb="select"] {{
        background: var(--canvas) !important;
        border: 1px solid var(--field-border-color) !important;
        border-radius: var(--field-border-radius) !important;
        min-height: var(--field-min-height);
        box-shadow: none !important;
        transition: var(--transition);
    }}

    /* Conteúdo interno sem borda para não duplicar espessura */
    .stTextInput input,
    .stTextArea textarea,
    .stNumberInput input,
    .stDateInput input,
    .stTextInput div[data-baseweb="input"] > div,
    .stNumberInput div[data-baseweb="input"] > div,
    .stDateInput div[data-baseweb="input"] > div,
    .stTextArea div[data-baseweb="textarea"] > div,
    .stSelectbox div[data-baseweb="select"] > div,
    .stMultiSelect div[data-baseweb="select"] > div {{
        border: 0 !important;
        background: transparent !important;
        color: var(--ink) !important;
        box-shadow: none !important;
        outline: none !important;
    }}

    .stTextInput input:focus,
    .stTextArea textarea:focus,
    .stNumberInput input:focus,
    .stDateInput input:focus,
    .stSelectbox div[data-baseweb="select"] input:focus,
    .stMultiSelect div[data-baseweb="select"] input:focus {{
        border: 0 !important;
        outline: none !important;
        box-shadow: none !important;
    }}

    .stTextInput input::placeholder,
    .stTextArea textarea::placeholder {{
        color: var(--stone) !important;
        opacity: 1 !important;
    }}

    .stSelectbox div[data-baseweb="select"] *,
    .stMultiSelect div[data-baseweb="select"] * {{
        color: var(--ink) !important;
    }}

    .stTextInput div[data-baseweb="input"]:focus-within,
    .stTextArea div[data-baseweb="textarea"]:focus-within,
    .stNumberInput div[data-baseweb="input"]:focus-within,
    .stDateInput div[data-baseweb="input"]:focus-within,
    .stSelectbox div[data-baseweb="select"]:focus-within,
    .stMultiSelect div[data-baseweb="select"]:focus-within {{
        border-color: var(--fb-blue) !important;
        box-shadow: var(--field-focus) !important;
    }}

    [data-testid="stMetric"] {{
        position: relative;
        background: var(--canvas) !important;
        border: 1px solid var(--hairline-soft);
        border-radius: var(--border-radius) !important;
        box-shadow: none !important;
        transition: var(--transition);
        margin-top: 0.2rem;
        min-height: 104px;
        padding: 0.9rem 1rem !important;
        display: flex;
        flex-direction: column;
        justify-content: space-between;
    }}
    [data-testid="stMetric"]::before {{
        content: "";
        position: absolute;
        left: 0;
        top: 0;
        right: 0;
        height: 3px;
        border-radius: var(--border-radius) var(--border-radius) 0 0;
        background: var(--primary-color);
    }}
    [data-testid="stMetric"]:hover {{
        box-shadow: var(--box-shadow) !important;
    }}
    [data-testid="stMetric"] [data-testid="stMetricLabel"] {{
        color: var(--steel) !important;
        font-weight: 700 !important;
        font-size: 0.875rem !important;
        line-height: 1.2 !important;
        text-align: left !important;
        display: flex;
        align-items: flex-start;
        min-height: 1.45rem;
    }}
    [data-testid="stMetric"] [data-testid="stMetricValue"] {{
        color: var(--ink-deep) !important;
        font-weight: 700 !important;
        font-size: 2.05rem !important;
        line-height: 1 !important;
        text-align: left !important;
        font-variant-numeric: tabular-nums;
    }}

    .stDataFrame,
    details[data-testid="stExpander"] {{
        border-radius: var(--border-radius);
        overflow: hidden;
        box-shadow: none;
        border: 1px solid var(--hairline-soft);
        background: var(--canvas) !important;
        background-color: var(--canvas) !important;
    }}

    details[data-testid="stExpander"] summary,
    details[data-testid="stExpander"] summary * {{
        color: var(--ink-deep) !important;
        font-weight: 700;
    }}

    .stApp details[data-testid="stExpander"] summary,
    .stApp details[data-testid="stExpander"] summary:link,
    .stApp details[data-testid="stExpander"] summary:visited,
    .stApp details[data-testid="stExpander"] summary:hover,
    .stApp details[data-testid="stExpander"] summary:active,
    .stApp details[data-testid="stExpander"] summary:focus,
    .stApp details[data-testid="stExpander"] summary:focus-visible,
    .stApp details[data-testid="stExpander"] summary:focus-within,
    .stApp details[open][data-testid="stExpander"] summary,
    .stApp details[open][data-testid="stExpander"] summary:focus,
    .stApp details[open][data-testid="stExpander"] summary:focus-visible,
    .stApp details[open][data-testid="stExpander"] summary:active,
    .stApp div[data-testid="stExpanderHeader"],
    .stApp div[data-testid="stExpanderHeader"]:focus,
    .stApp div[data-testid="stExpanderHeader"]:active {{
        background: var(--canvas) !important;
        background-color: var(--canvas) !important;
        color: var(--ink-deep) !important;
        outline: none !important;
        box-shadow: none !important;
    }}

    .stTabs [data-baseweb="tab-list"] {{
        gap: 0.35rem;
        border-bottom: 1px solid var(--hairline-soft);
    }}
    .stTabs [data-baseweb="tab"] {{
        color: var(--steel) !important;
        font-weight: 700 !important;
        border-radius: 8px 8px 0 0;
        padding: 0.35rem 0.7rem;
    }}
    .stTabs [aria-selected="true"] {{
        color: var(--ink-deep) !important;
        background: var(--surface-soft) !important;
        border-bottom: 2px solid var(--primary-color) !important;
    }}

    div[data-testid="stForm"] {{
        background: var(--canvas);
        border: 1px solid var(--hairline-soft);
        border-radius: var(--radius-card);
        padding: 1.05rem 1.15rem;
    }}

    .app-hero {{
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 1.5rem;
        margin-bottom: 1rem;
        padding: 1.35rem 1.55rem;
        border-radius: 24px;
        border: 1px solid var(--hairline-soft);
        background: var(--canvas);
        box-shadow: 0 1px 2px rgba(20, 22, 26, 0.04);
    }}
    .app-hero__eyebrow {{
        display: inline-flex;
        align-items: center;
        gap: 0.45rem;
        margin-bottom: 0.55rem;
        padding: 0.28rem 0.72rem;
        border-radius: var(--radius-full);
        background: var(--surface-soft);
        color: var(--steel);
        font-size: 0.78rem;
        font-weight: 700;
    }}
    .app-hero h1 {{
        margin: 0 !important;
    }}
    .app-hero p {{
        margin: 0.65rem 0 0;
        max-width: 980px;
        line-height: 1.55;
        color: var(--steel) !important;
    }}
    .preview-banner {{
        display: flex;
        align-items: center;
        gap: 0.65rem;
        margin: 0.15rem 0 0.95rem;
        padding: 0.75rem 0.95rem;
        border-radius: 12px;
        border: 1px solid rgba(0, 100, 224, 0.20);
        background: rgba(0, 100, 224, 0.08);
        color: var(--ink-deep);
        font-size: 0.92rem;
        font-weight: 600;
    }}

    .stAlert,
    .stInfo,
    .stWarning,
    .stSuccess,
    .stError {{
        color: var(--ink) !important;
    }}

    .info-message {{
        border-radius: var(--border-radius);
        padding: 0.8rem 1rem;
        font-weight: 600;
        background: var(--surface-soft);
        border: 1px solid var(--hairline-soft);
        color: var(--charcoal);
        margin-bottom: 0.7rem;
    }}
    .muted {{ color: var(--steel) !important; }}
    .small-note {{ color: var(--steel) !important; font-style: italic; }}

    .fade-in {{ animation: rise 0.45s ease both; }}
    @keyframes rise {{
        from {{ opacity: 0; transform: translateY(10px); }}
        to {{ opacity: 1; transform: translateY(0); }}
    }}

    @media (max-width: 900px) {{
        .main .block-container {{ padding: 0.5rem 0.35rem 2rem; }}
        .stApp h1 {{ font-size: 1.8rem !important; }}
        .app-hero {{ flex-direction: column; padding: 1.1rem; border-radius: 18px; }}
        div[data-testid="stForm"] {{ padding: 0.6rem; }}
    }}
</style>
"""


# ---------------------------------------------------------------------------
# COMPONENTES REUTILIZÁVEIS
# ---------------------------------------------------------------------------

def _section_title(text: str, icon: str = "circle") -> None:
    st.markdown(
        f'<div class="section-title">{ds_icon(icon, size=22)}<span>{text}</span></div>',
        unsafe_allow_html=True,
    )


def _badge(label: str, palette: dict | None = None) -> str:
    """Retorna o HTML de um badge (pill com fundo suave + texto escuro).

    `palette` mapeia rótulo -> (fundo, texto). Usar em contextos que renderizam
    HTML (st.markdown unsafe_allow_html=True). Inclui sempre o rótulo textual,
    para não depender apenas da cor (acessibilidade).
    """
    palette = palette or STATUS_BADGES
    bg, fg = palette.get(label, ("#E2E8F0", "#334155"))
    return (
        f'<span style="display:inline-block;padding:2px 10px;border-radius:999px;'
        f'background:{bg};color:{fg};font-size:0.75rem;font-weight:700;'
        f'line-height:1.5;white-space:nowrap;">{label}</span>'
    )


def status_badge(label: str) -> str:
    return _badge(label, STATUS_BADGES)


def priority_badge(label: str) -> str:
    return _badge(label, PRIORITY_BADGES)


# Cor de cada status para gráficos (usa o tom forte do badge).
STATUS_BAR_COLORS = {k: v[1] for k, v in STATUS_BADGES.items()}


def _style_plotly(fig, height: int = 260):
    """Aplica o tema do design system a um gráfico Plotly (flat, Montserrat)."""
    fig.update_layout(
        height=height,
        margin=dict(l=6, r=6, t=10, b=6),
        font=dict(family="Montserrat, sans-serif", color=STYLE_VARS["ink"], size=12),
        paper_bgcolor="rgba(0,0,0,0)",
        plot_bgcolor="rgba(0,0,0,0)",
        showlegend=False,
        hoverlabel=dict(font_family="Montserrat, sans-serif"),
    )
    fig.update_xaxes(showgrid=False, zeroline=False, title_text="")
    fig.update_yaxes(showgrid=False, zeroline=False, title_text="")
    return fig



def _render_table(dataframe: pd.DataFrame, columns: list[str] | None = None) -> None:
    if columns is not None:
        dataframe = dataframe[columns]
    st.dataframe(dataframe, use_container_width=True, hide_index=True)


def _find_logo_path() -> Path | None:
    base = Path(__file__).resolve().parent
    candidates = [
        base / "assets" / "logo.png",
        base / "assets" / "logo.jpg",
        base / "assets" / "logo.jpeg",
        base / "assets" / "servicocrm.png",
        base / "assets" / "servicocrm.jpg",
        base / "logo.png",
        base / "logo.jpg",
        base / "logo.jpeg",
    ]
    for candidate in candidates:
        if candidate.exists():
            return candidate
    return None


def _logo_data_uri(logo_path: Path) -> str:
    mime_type, _ = mimetypes.guess_type(str(logo_path))
    if not mime_type:
        mime_type = "image/png"
    encoded = base64.b64encode(logo_path.read_bytes()).decode("ascii")
    return f"data:{mime_type};base64,{encoded}"


# ---------------------------------------------------------------------------
# ESTILO GLOBAL
# ---------------------------------------------------------------------------

def _flash(msg: str, icon: str | None = None) -> None:
    """Salva mensagem para exibir após st.rerun()."""
    st.session_state["_flash_msg"] = msg
    st.session_state["_flash_icon"] = icon


def _show_flash() -> None:
    """Exibe toast pendente (se houver) e limpa."""
    msg = st.session_state.pop("_flash_msg", None)
    icon = st.session_state.pop("_flash_icon", None)
    if msg:
        st.toast(msg, icon=icon)


def _run_ui_action(action, success_message: str, error_prefix: str) -> None:
    """Executa ação de UI com feedback consistente e rerun automático."""
    try:
        action()
        _flash(success_message)
        st.rerun()
    except Exception as exc:
        st.toast(f"{error_prefix}: {exc}")


def _current_user() -> dict:
    return st.session_state.get("auth_user", {})


def _current_role() -> str:
    return str(_current_user().get("role", ""))


def _can(action: str) -> bool:
    user = _current_user()
    return can_manage(_current_role(), action, user.get("can_actions"))


def require_authentication() -> dict:
    """Exibe login quando necessário e retorna usuário autenticado."""
    if AUTH_DISABLED:
        demo_user = {
            "id": 0,
            "username": "demo" if DEMO_MODE else "local",
            "full_name": "Modo demo" if DEMO_MODE else "Acesso local",
            "role": "gerente",
            "is_active": True,
            "allowed_pages": None,
            "can_actions": None,
        }
        st.session_state["auth_user"] = demo_user
        return demo_user

    user = st.session_state.get("auth_user")
    if user:
        return user

    st.markdown(
        """
        <style>
            [data-testid="stSidebar"],
            [data-testid="collapsedControl"],
            [data-testid="stHeader"],
            [data-testid="stToolbar"],
            [data-testid="stDecoration"],
            [data-testid="stStatusWidget"] {
                display: none !important;
            }
            [data-testid="stMain"] {
                display: flex !important;
                align-items: center !important;
                justify-content: center !important;
                min-height: 100vh !important;
            }
            .main .block-container {
                padding: 2rem 1rem 2rem !important;
            }
            .login-shell {
                text-align: center;
                margin-bottom: 0.5rem;
            }
            .login-logo {
                width: min(200px, 60%);
                margin: 0 auto 0.6rem;
                display: block;
            }
            .login-title {
                margin: 0;
                color: #0A1317;
                font-size: 2rem;
                font-weight: 700;
                letter-spacing: -0.02em;
            }
            .login-subtitle {
                margin: 0.4rem 0 1rem;
                color: #5D6C7B;
                font-size: 1rem;
            }
            .login-footnote {
                margin-top: 0.7rem;
                border: 1px solid #DEE3E9;
                border-radius: 16px;
                padding: 0.75rem 0.9rem;
                background: #F1F4F7;
                text-align: left;
            }
            .login-footnote p {
                margin: 0.2rem 0;
                color: #444950;
                font-size: 0.9rem;
                font-weight: 600;
            }
        </style>
        """,
        unsafe_allow_html=True,
    )

    logo_html = ""
    logo_path = _find_logo_path()
    if logo_path is not None:
        logo_src = _logo_data_uri(logo_path)
        logo_html = f'<img class="login-logo" src="{logo_src}" alt="Logo ServiçoCRM" />'

    _, center, _ = st.columns([1, 1.2, 1])
    with center:
        st.markdown(
            f"""
            <div class="login-shell fade-in">
                {logo_html}
                <h2 class="login-title">Acesso ao {APP_TITLE}</h2>
                <p class="login-subtitle">Entre com seu usuário para continuar.</p>
            </div>
            """,
            unsafe_allow_html=True,
        )

        with st.form("login_form", clear_on_submit=False):
            username = st.text_input("Usuário", placeholder="Ex: gerente")
            password = st.text_input("Senha", type="password", placeholder="Digite sua senha")
            submitted = st.form_submit_button("Entrar no sistema", use_container_width=True, type="primary")

        if submitted:
            auth_user = authenticate_user(username, password)
            if auth_user:
                st.session_state["auth_user"] = user_to_session_dict(auth_user)
                st.rerun()
            st.error("Usuário ou senha inválidos.")

        st.markdown(
            """
            <div class="login-footnote">
                <p>Credenciais iniciais (trocar em produção):</p>
                <p>gerente / gerente123</p>
                <p>atendente / atendente123</p>
                <p>tecnico / tecnico123</p>
            </div>
            """,
            unsafe_allow_html=True,
        )

    st.stop()


# Ícones (Lucide) por página de navegação e por botão de ação.
PAGE_ICONS: dict[str, str] = {
    "Dashboard": "layout-dashboard",
    "Atendimentos": "clipboard-list",
    "Resumo por data": "calendar-days",
    "Técnicos": "wrench",
    "Clientes": "building-2",
    "Usuários": "users",
    "WhatsApp": "message-circle",
    "Sobre": "info",
}

# Botões de ação que recebem ícone via máscara CSS (key -> ícone Lucide).
_BUTTON_ICONS: dict[str, str] = {
    "header_logout": "power",
    "sidebar_logout": "power",
    "wa_sync": "refresh-cw",
    "quick_att": "clipboard-pen",
    "quick_cli": "building-2",
    "quick_tec": "hard-hat",
}


def _icon_before_css(selector: str, icon: str, size: int = 16, gap: str = "0.5rem") -> str:
    """Gera CSS que injeta um ícone Lucide (via mask) antes do conteúdo do elemento."""
    uri = ds_icon_uri(icon)
    return (
        f'{selector}::before {{'
        f'content:"";display:inline-block;flex:0 0 {size}px;width:{size}px;height:{size}px;'
        f'margin-right:{gap};vertical-align:-0.15em;background-color:currentColor;'
        f'-webkit-mask:url("{uri}") center/contain no-repeat;'
        f'mask:url("{uri}") center/contain no-repeat;}}'
    )


def _button_icons_css() -> str:
    """CSS que adiciona ícones aos botões de ação conhecidos (por key)."""
    rules = "".join(
        _icon_before_css(f'.st-key-{key} button', icon)
        for key, icon in _BUTTON_ICONS.items()
    )
    return f"<style>{rules}</style>"


def style_app() -> None:
    _logo = _find_logo_path()
    st.set_page_config(
        page_title=APP_TITLE,
        page_icon=str(_logo) if _logo else None,
        layout="wide",
        initial_sidebar_state="expanded",
        menu_items={},
    )
    st.markdown(_GLOBAL_CSS, unsafe_allow_html=True)
    st.markdown(_button_icons_css(), unsafe_allow_html=True)
    _show_flash()


# ---------------------------------------------------------------------------
# HEADER
# ---------------------------------------------------------------------------

def render_header() -> None:
    # Garante remoção do espaço do header mesmo após montagem do DOM
    st.markdown(
        """
        <style>
        [data-testid="stAppViewContainer"] > section,
        [data-testid="stMain"], [data-testid="stMain"] > div:first-child,
        .main { padding-top: 0 !important; margin-top: 0 !important; }
        </style>
        """,
        unsafe_allow_html=True,
    )
    user = _current_user()
    eyebrow = "Painel demo" if DEMO_MODE else "Painel operacional"
    description = (
        "Versão demonstrativa com dados temporários em memória. Use para validar fluxos e visual sem conectar ao banco."
        if DEMO_MODE
        else "Gestão de atendimentos técnicos com visual executivo, registro rápido e leitura clara da operação. Cadastre clientes, acompanhe protocolos e mantenha tudo organizado em uma única interface."
    )
    left, right = st.columns([7, 0.9], vertical_alignment="top")
    with left:
        st.markdown(
            f"""
            <div class="app-hero fade-in">
                <div>
                <span class="app-hero__eyebrow">{ds_icon("zap", size=14)} {eyebrow}</span>
                <h1 style="margin:0;">{APP_TITLE}</h1>
                <p>{description}</p>
                </div>
            </div>
            """,
            unsafe_allow_html=True,
        )
    with right:
        st.markdown('<div style="height:0.85rem;"></div>', unsafe_allow_html=True)
        if st.button("Sair", use_container_width=True, type="primary", key="header_logout"):
            st.session_state.pop("auth_user", None)
            st.session_state.pop("menu_radio", None)
            st.rerun()


# ---------------------------------------------------------------------------
# SIDEBAR / NAVEGAÇÃO
# ---------------------------------------------------------------------------

def sidebar_navigation(user: dict) -> str:
    st.sidebar.markdown(
        """
        <style>
        [data-testid="stSidebarCollapsedControl"],
        [data-testid="stSidebarCollapseButton"] { display: none !important; }
        [data-testid="stSidebar"] > div,
        [data-testid="stSidebar"] > div > div,
        [data-testid="stSidebarContent"],
        [data-testid="stSidebarContent"] > div:first-child,
        [data-testid="stSidebarUserContent"] {
            padding-top: 0 !important;
            margin-top: 0 !important;
        }
        </style>
        """,
        unsafe_allow_html=True,
    )
    logo_path = _find_logo_path()
    if logo_path is not None:
        logo_src = _logo_data_uri(logo_path)
        st.sidebar.markdown(
            f'<div class="sidebar-brand-wrap"><img src="{logo_src}" alt="Logo ServiçoCRM"/></div>',
            unsafe_allow_html=True,
        )
    st.sidebar.markdown("---")
    st.sidebar.caption(f"Perfil: {user.get('role', '').title()} | {user.get('full_name', '')}")
    allowed_pages = get_allowed_pages(str(user.get("role", "")), user.get("allowed_pages"))

    if st.session_state.get("menu_radio") not in allowed_pages:
        st.session_state["menu_radio"] = allowed_pages[0]
    current = st.session_state["menu_radio"]

    # CSS dos itens de navegação: alinhamento à esquerda, ícone (mask) por página
    # e destaque do item ativo no azul primário do design system.
    nav_rules = [
        '[data-testid="stSidebar"] [class*="st-key-nav_"] button{'
        'justify-content:flex-start !important;text-align:left !important;gap:0.6rem;'
        'min-height:2.55rem !important;padding-left:0.95rem !important;'
        'border-color:var(--hairline) !important;}'
    ]
    for page in allowed_pages:
        icon = PAGE_ICONS.get(page, "circle")
        nav_rules.append(
            _icon_before_css(
                f'[data-testid="stSidebar"] .st-key-nav_{icon} button', icon, size=18, gap="0"
            )
        )
    active_icon = PAGE_ICONS.get(current, "circle")
    nav_rules.append(
        f'[data-testid="stSidebar"] .st-key-nav_{active_icon} button{{'
        'background:var(--primary-color) !important;border-color:var(--primary-color) !important;'
        'color:#fff !important;}'
        f'[data-testid="stSidebar"] .st-key-nav_{active_icon} button:hover,'
        f'[data-testid="stSidebar"] .st-key-nav_{active_icon} button:focus,'
        f'[data-testid="stSidebar"] .st-key-nav_{active_icon} button:active{{'
        'background:var(--primary-deep) !important;border-color:var(--primary-deep) !important;'
        'color:#fff !important;}'
        f'[data-testid="stSidebar"] .st-key-nav_{active_icon} button *,'
        f'[data-testid="stSidebar"] .st-key-nav_{active_icon} button:hover *,'
        f'[data-testid="stSidebar"] .st-key-nav_{active_icon} button:focus *,'
        f'[data-testid="stSidebar"] .st-key-nav_{active_icon} button:active *{{'
        'color:#fff !important;fill:#fff !important;stroke:#fff !important;}'
        f'[data-testid="stSidebar"] .st-key-nav_{active_icon} button::before,'
        f'[data-testid="stSidebar"] .st-key-nav_{active_icon} button:hover::before,'
        f'[data-testid="stSidebar"] .st-key-nav_{active_icon} button:focus::before,'
        f'[data-testid="stSidebar"] .st-key-nav_{active_icon} button:active::before{{'
        'background-color:#fff !important;}'
    )
    st.sidebar.markdown(f"<style>{''.join(nav_rules)}</style>", unsafe_allow_html=True)

    for page in allowed_pages:
        icon = PAGE_ICONS.get(page, "circle")
        if st.sidebar.button(page, key=f"nav_{icon}", use_container_width=True, type="secondary"):
            st.session_state["menu_radio"] = page
            st.rerun()
    menu = st.session_state["menu_radio"]

    st.sidebar.markdown('<div style="height:0.5rem;"></div>', unsafe_allow_html=True)
    st.sidebar.markdown(
        f'<p style="margin:0 0 0.3rem;font-size:0.78rem;color:{STYLE_VARS["steel"]};">'
        f'Conectado como <strong style="color:{STYLE_VARS["ink_deep"]};">{user.get("username","")}</strong></p>',
        unsafe_allow_html=True,
    )
    if st.sidebar.button("Sair / Trocar usuário", use_container_width=True, type="primary", key="sidebar_logout"):
        st.session_state.pop("auth_user", None)
        st.session_state.pop("menu_radio", None)
        st.rerun()

    st.sidebar.markdown(
        f'<div style="margin-top:2rem;font-size:0.9rem;color:{STYLE_VARS["stone"]};'
        f'font-family:{STYLE_VARS["font_family"]};">© 2026 ServiçoCRM</div>',
        unsafe_allow_html=True,
    )
    return menu


# ---------------------------------------------------------------------------
# GERENCIAMENTO DE USUÁRIOS
# ---------------------------------------------------------------------------

def show_users_management() -> None:
    import json as _json

    _section_title("Gerenciamento de Usuários", icon="users")

    ROLE_LABELS = {"gerente": "Gerente", "atendente": "Atendente", "tecnico": "Técnico"}
    ROLE_OPTIONS = list(ROLE_LABELS.keys())

    ACTION_LABELS = {
        "attendance:create":    "Atendimentos – Criar",
        "attendance:update":    "Atendimentos – Editar",
        "attendance:delete":    "Atendimentos – Excluir",
        "client:create":        "Clientes – Criar",
        "client:update":        "Clientes – Editar",
        "technician:create":    "Técnicos – Criar",
        "technician:update":    "Técnicos – Editar",
        "technician:delete":    "Técnicos – Excluir",
    }

    current_user_id = _current_user().get("id")

    # ── Novo usuário ────────────────────────────────────────────────────────
    with st.expander("Criar novo usuário"):
        with st.form("form_new_user", clear_on_submit=True):
            c1, c2 = st.columns(2)
            new_uname = c1.text_input("Login (username)")
            new_fname = c2.text_input("Nome completo")
            c3, c4 = st.columns(2)
            new_role = c3.selectbox("Cargo", ROLE_OPTIONS, format_func=lambda r: ROLE_LABELS[r])
            new_pw = c4.text_input("Senha inicial", type="password")
            if st.form_submit_button("Criar usuário", type="primary", use_container_width=True):
                if not new_uname.strip() or not new_fname.strip() or not new_pw:
                    st.error("Preencha todos os campos.")
                else:
                    try:
                        auth_create_user(new_uname, new_fname, new_role, new_pw)
                        _flash(f"Usuário '{new_uname}' criado com sucesso!")
                        st.rerun()
                    except Exception as exc:
                        st.error(f"Erro ao criar: {exc}")

    st.markdown("---")

    # ── Lista de usuários ────────────────────────────────────────────────────
    users = list_users()
    for u in users:
        u_id           = int(u["id"])
        u_username     = str(u["username"])
        u_full_name    = str(u["full_name"])
        u_role         = str(u["role"])
        u_is_active    = bool(int(u["is_active"]))
        u_pages_raw    = u.get("allowed_pages")
        u_actions_raw  = u.get("can_actions")
        u_pages        = _json.loads(u_pages_raw)   if u_pages_raw   else None
        u_actions      = _json.loads(u_actions_raw) if u_actions_raw else None
        is_self        = (u_id == current_user_id)

        badge    = "Ativo" if u_is_active else "Inativo"
        self_tag = " *(você)*" if is_self else ""
        header   = f"**{u_full_name}** ({u_username}) — {ROLE_LABELS.get(u_role, u_role)} · {badge}{self_tag}"

        with st.expander(header):
            st.markdown(
                "Situação: "
                + _badge(
                    "Ativo" if u_is_active else "Inativo",
                    {"Ativo": ("#DCFCE7", "#166534"), "Inativo": ("#FEE2E2", "#991B1B")},
                ),
                unsafe_allow_html=True,
            )
            tab_perfil, tab_senha = st.tabs(["Perfil & Permissões", "Redefinir Senha"])

            # ── Aba Perfil ─────────────────────────────────────────────────
            with tab_perfil:
                with st.form(f"form_edit_{u_id}"):
                    c1, c2 = st.columns(2)
                    edit_fname = c1.text_input("Nome completo", value=u_full_name)
                    edit_role  = c2.selectbox(
                        "Cargo",
                        ROLE_OPTIONS,
                        index=ROLE_OPTIONS.index(u_role) if u_role in ROLE_OPTIONS else 0,
                        format_func=lambda r: ROLE_LABELS[r],
                        disabled=is_self,
                    )
                    edit_active = st.checkbox(
                        "Usuário ativo",
                        value=u_is_active,
                        disabled=is_self,
                        help="Desativar impede o login sem excluir o usuário.",
                    )

                    st.markdown("**Páginas acessíveis**")
                    default_pages = ROLE_ALLOWED_PAGES.get(u_role, ["Sobre"])
                    use_def_pages = st.checkbox(
                        "Usar padrão do cargo",
                        value=(u_pages is None),
                        key=f"def_pages_{u_id}",
                    )
                    edit_pages = st.multiselect(
                        "Páginas",
                        options=ALL_PAGES,
                        default=u_pages if u_pages is not None else default_pages,
                        key=f"pages_{u_id}",
                        help="Ignorado quando 'Usar padrão do cargo' estiver marcado.",
                    )

                    st.markdown("**Ações permitidas**")
                    default_actions = ROLE_DEFAULT_ACTIONS.get(u_role, [])
                    use_def_actions = st.checkbox(
                        "Usar padrão do cargo",
                        value=(u_actions is None),
                        key=f"def_actions_{u_id}",
                    )
                    edit_actions = st.multiselect(
                        "Ações",
                        options=ALL_ACTIONS,
                        default=u_actions if u_actions is not None else default_actions,
                        format_func=lambda a: ACTION_LABELS.get(a, a),
                        key=f"actions_{u_id}",
                        help="Ignorado quando 'Usar padrão do cargo' estiver marcado.",
                    )

                    if st.form_submit_button("Salvar alterações", type="primary", use_container_width=True):
                        try:
                            auth_update_user(
                                u_id,
                                full_name=edit_fname,
                                role=edit_role      if not is_self else None,
                                is_active=edit_active if not is_self else None,
                                allowed_pages=edit_pages    if not use_def_pages   else None,
                                can_actions=edit_actions    if not use_def_actions else None,
                                clear_allowed_pages=use_def_pages,
                                clear_can_actions=use_def_actions,
                            )
                            _flash(f"Usuário '{u_username}' atualizado!")
                            st.rerun()
                        except Exception as exc:
                            st.error(f"Erro: {exc}")

            # ── Aba Senha ──────────────────────────────────────────────────
            with tab_senha:
                with st.form(f"form_pw_{u_id}"):
                    new_pw1 = st.text_input("Nova senha", type="password")
                    new_pw2 = st.text_input("Confirmar nova senha", type="password")
                    if st.form_submit_button("Redefinir senha", type="primary", use_container_width=True):
                        if not new_pw1 or new_pw1 != new_pw2:
                            st.error("Senhas não conferem ou estão em branco.")
                        else:
                            try:
                                change_password(u_id, new_pw1)
                                _flash(f"Senha de '{u_username}' redefinida!")
                                st.rerun()
                            except Exception as exc:
                                st.error(f"Erro: {exc}")

    st.caption("Alterações de permissão só afetam o usuário após ele fazer login novamente.")


# ---------------------------------------------------------------------------
# DASHBOARD
# ---------------------------------------------------------------------------

def show_dashboard() -> None:
    _section_title("Dashboard", icon="layout-dashboard")
    st.markdown('<div class="info-message">Use as ações rápidas para navegar sem voltar ao menu lateral.</div>', unsafe_allow_html=True)

    allowed_pages = get_allowed_pages(_current_role())
    quick1, quick2, quick3 = st.columns(3)
    with quick1:
        if "Atendimentos" in allowed_pages and st.button("Novo atendimento", use_container_width=True, type="secondary", key="quick_att"):
            st.session_state["menu_radio"] = "Atendimentos"
            st.rerun()
    with quick2:
        if "Clientes" in allowed_pages and st.button("Novo cliente", use_container_width=True, type="secondary", key="quick_cli"):
            st.session_state["menu_radio"] = "Clientes"
            st.rerun()
    with quick3:
        if "Técnicos" in allowed_pages and st.button("Novo técnico", use_container_width=True, type="secondary", key="quick_tec"):
            st.session_state["menu_radio"] = "Técnicos"
            st.rerun()

    st.markdown('<div style="height:0.45rem;"></div>', unsafe_allow_html=True)

    attendances = load_attendances()
    technicians = load_technicians(active_only=False)
    clients = load_clients(active_first=False)

    total_att = len(attendances)
    completed = int((attendances["status"] == "Concluído").sum()) if not attendances.empty else 0
    pending = total_att - completed
    total_techs = len(technicians)
    total_clients = len(clients)

    c1, c2, c3, c4, c5 = st.columns(5)
    c1.metric("Atendimentos", total_att)
    c2.metric("Concluídos", completed)
    c3.metric("Pendentes", pending)
    c4.metric("Técnicos", total_techs)
    c5.metric("Clientes", total_clients)

    if not attendances.empty:
        # Série temporal — atendimentos por dia
        _section_title("Atendimentos ao longo do tempo", icon="trending-up")
        ts = attendances.copy()
        ts["data"] = ts["opened_at"].astype(str).str.slice(0, 10)
        daily = (
            ts.groupby("data", as_index=False)
            .size()
            .rename(columns={"size": "Atendimentos"})
            .sort_values("data")
        )
        fig_ts = px.area(daily, x="data", y="Atendimentos", markers=True)
        fig_ts.update_traces(
            line_color=STYLE_VARS["primary"],
            fillcolor="rgba(37,99,235,0.12)",
            marker=dict(color=STYLE_VARS["primary"], size=6),
            hovertemplate="%{x}<br>%{y} atendimento(s)<extra></extra>",
        )
        _style_plotly(fig_ts, height=240)
        st.plotly_chart(fig_ts, use_container_width=True, config={"displayModeBar": False})

        col_a, col_b = st.columns(2)
        with col_a:
            _section_title("Atendimentos por status", icon="chart-column")
            status_df = (
                attendances.groupby("status", as_index=False)
                .size()
                .rename(columns={"size": "Quantidade"})
                .sort_values("Quantidade")
            )
            fig_st = px.bar(
                status_df,
                x="Quantidade",
                y="status",
                orientation="h",
                text="Quantidade",
                color="status",
                color_discrete_map=STATUS_BAR_COLORS,
            )
            fig_st.update_traces(
                textposition="outside",
                cliponaxis=False,
                hovertemplate="%{y}: %{x}<extra></extra>",
            )
            _style_plotly(fig_st, height=280)
            st.plotly_chart(fig_st, use_container_width=True, config={"displayModeBar": False})

        with col_b:
            _section_title("Top clientes", icon="building-2")
            top_clients = (
                attendances.groupby("client", as_index=False)
                .size()
                .rename(columns={"size": "Atendimentos"})
                .sort_values("Atendimentos")
                .tail(10)
            )
            fig_cli = px.bar(
                top_clients,
                x="Atendimentos",
                y="client",
                orientation="h",
                text="Atendimentos",
            )
            fig_cli.update_traces(
                marker_color=STYLE_VARS["primary"],
                textposition="outside",
                cliponaxis=False,
                hovertemplate="%{y}: %{x}<extra></extra>",
            )
            _style_plotly(fig_cli, height=280)
            st.plotly_chart(fig_cli, use_container_width=True, config={"displayModeBar": False})
    else:
        st.info("Ainda não há atendimentos cadastrados para exibir no dashboard.")


# ---------------------------------------------------------------------------
# TÉCNICOS
# ---------------------------------------------------------------------------

def show_technicians() -> None:
    if "Técnicos" not in get_allowed_pages(_current_role()):
        st.warning("Você não tem permissão para acessar esta página.")
        return

    _section_title("Técnicos", icon="wrench")
    st.caption("Cadastre sua equipe e mantenha a seleção sempre padronizada no atendimento.")

    col_form, col_list = st.columns((0.9, 1.3))

    with col_form:
        with st.form("technician_form", clear_on_submit=True):
            _section_title("Novo técnico", icon="hard-hat")
            name = st.text_input("Nome do técnico :orange[*]", placeholder="Ex: João Silva")
            specialty = st.text_input("Especialidade", placeholder="Ex: Suporte técnico")
            phone = st.text_input("Telefone", placeholder="(11) 99999-9999")
            email = st.text_input("E-mail", placeholder="joao@empresa.com")
            active = st.checkbox("Ativo", value=True)
            submitted = st.form_submit_button(
                "Salvar técnico",
                use_container_width=True,
                type="primary",
                disabled=not _can("technician:create"),
            )

            if submitted:
                if not name.strip():
                    st.toast("Informe o nome do técnico.")
                else:
                    _run_ui_action(
                        lambda: create_technician_entry(name, specialty, phone, email, active),
                        "Técnico cadastrado com sucesso!",
                        "Erro ao cadastrar técnico",
                    )

    with col_list:
        technicians = load_technicians(active_only=False)
        _section_title("Equipe cadastrada", icon="users")
        if technicians.empty:
            st.info("Nenhum técnico cadastrado ainda.")
        else:
            display = technicians[["id", "name", "specialty", "phone", "email", "active"]].copy()
            display["active"] = display["active"].map({1: "Sim", 0: "Não", True: "Sim", False: "Não"})
            _render_table(display)

            with st.expander("Editar status de um técnico"):
                selected_id = st.selectbox(
                    "Selecione o técnico",
                    options=technicians["id"].tolist(),
                    format_func=lambda item: technicians.loc[technicians["id"] == item, "name"].iloc[0],
                )
                selected_active = st.toggle(
                    "Técnico ativo",
                    value=bool(int(technicians.loc[technicians["id"] == selected_id, "active"].iloc[0])),
                )
                if st.button(
                    "Atualizar técnico",
                    use_container_width=True,
                    type="secondary",
                    disabled=not _can("technician:update"),
                ):
                    _run_ui_action(
                        lambda: set_technician_active(int(selected_id), bool(selected_active)),
                        "Situação do técnico atualizada!",
                        "Erro ao atualizar técnico",
                    )

            with st.expander("Excluir técnico"):
                del_tech_id = st.selectbox(
                    "Selecione o técnico para excluir",
                    options=technicians["id"].tolist(),
                    format_func=lambda item: technicians.loc[technicians["id"] == item, "name"].iloc[0],
                    key="del_tech_select",
                )
                del_tech_name = technicians.loc[technicians["id"] == del_tech_id, "name"].iloc[0]
                st.warning(f"Esta ação é irreversível. O técnico **{del_tech_name}** será excluído permanentemente.")
                confirm_del_tech = st.checkbox(f"Confirmo a exclusão do técnico **{del_tech_name}**", key="confirm_del_tech")
                if st.button(
                    "Excluir técnico",
                    use_container_width=True,
                    disabled=(not confirm_del_tech) or (not _can("technician:delete")),
                    type="secondary",
                ):
                    _run_ui_action(
                        lambda: delete_technician(int(del_tech_id)),
                        "Técnico excluído com sucesso!",
                        "Erro ao excluir técnico",
                    )


# ---------------------------------------------------------------------------
# CLIENTES
# ---------------------------------------------------------------------------

def show_clients() -> None:
    if "Clientes" not in get_allowed_pages(_current_role()):
        st.warning("Você não tem permissão para acessar esta página.")
        return

    _section_title("Clientes", icon="building-2")
    st.caption("Cadastre os clientes com os dados mais importantes para atendimento e relacionamento.")

    col_form, col_list = st.columns((0.95, 1.35))

    with col_form:
        with st.form("client_form", clear_on_submit=True):
            _section_title("Novo cliente", icon="building-2")
            name = st.text_input("Nome do cliente :orange[*]", placeholder="Ex: Empresa XYZ Ltda")
            company = st.text_input("Empresa", placeholder="Nome da empresa")
            phone = st.text_input("Telefone", placeholder="(11) 99999-9999")
            email = st.text_input("E-mail", placeholder="contato@empresa.com")
            city = st.text_input("Cidade", placeholder="São Paulo")
            segment = st.text_input("Segmento", placeholder="Tecnologia, Varejo, etc.")
            status = st.selectbox("Status do cliente", CLIENT_STATUS_OPTIONS)
            notes = st.text_area("Observações", placeholder="Informações adicionais sobre o cliente")
            submitted = st.form_submit_button(
                "Salvar cliente",
                use_container_width=True,
                type="primary",
                disabled=not _can("client:create"),
            )

            if submitted:
                if not name.strip():
                    st.toast("Informe o nome do cliente.")
                else:
                    _run_ui_action(
                        lambda: create_client_entry(name, company, phone, email, city, segment, notes, status),
                        "Cliente cadastrado com sucesso!",
                        "Erro ao cadastrar cliente",
                    )

    with col_list:
        clients = load_clients(active_first=False)
        _section_title("Base de clientes", icon="clipboard-list")
        if clients.empty:
            st.info("Nenhum cliente cadastrado ainda.")
        else:
            _render_table(clients, ["id", "name", "company", "phone", "email", "city", "segment", "status"])
            with st.expander("Editar status de um cliente"):
                selected_id = st.selectbox(
                    "Selecione o cliente",
                    options=clients["id"].tolist(),
                    format_func=lambda item: clients.loc[clients["id"] == item, "name"].iloc[0],
                )
                current_status = clients.loc[clients["id"] == selected_id, "status"].iloc[0]
                new_status = st.selectbox(
                    "Novo status",
                    CLIENT_STATUS_OPTIONS,
                    index=CLIENT_STATUS_OPTIONS.index(current_status) if current_status in CLIENT_STATUS_OPTIONS else 0,
                )
                if st.button(
                    "Atualizar cliente",
                    use_container_width=True,
                    type="secondary",
                    disabled=not _can("client:update"),
                ):
                    _run_ui_action(
                        lambda: set_client_status(int(selected_id), new_status),
                        "Status do cliente atualizado!",
                        "Erro ao atualizar cliente",
                    )


# ---------------------------------------------------------------------------
# FORMULÁRIO DE ATENDIMENTO
# ---------------------------------------------------------------------------

def _attendance_form() -> None:
    if not _can("attendance:create"):
        st.info("Seu perfil pode acompanhar e atualizar atendimentos, mas não criar novos.")
        return

    technicians = load_technicians(active_only=True)
    clients = load_clients(active_first=True)

    if technicians.empty:
        st.warning("Cadastre ao menos um técnico ativo antes de abrir atendimentos.")
        return

    with st.form("attendance_form", clear_on_submit=True):
        _section_title("Novo atendimento", icon="clipboard-pen")
        st.markdown('<p class="muted">Preencha o atendimento e os dados do cliente.</p>', unsafe_allow_html=True)

        attendance_date = date.today()
        opened_time = datetime.now().strftime("%H:%M")

        st.markdown(
            f"**Data do atendimento:** {attendance_date.strftime('%d/%m/%Y')} &nbsp;&nbsp; "
            f"**Hora registrada:** {opened_time}"
        )

        col_a, col_b = st.columns(2)
        with col_a:
            title = st.text_input("Título :orange[*]", placeholder="Ex.: Impressora não comunica com o sistema")
            technician_id = st.selectbox(
                "Técnico responsável :orange[*]",
                options=technicians["id"].tolist(),
                format_func=lambda item: technicians.loc[technicians["id"] == item, "name"].iloc[0],
            )
            att_status = st.selectbox("Status", STATUS_OPTIONS, index=1)
            priority = st.selectbox("Prioridade :orange[*]", PRIORITY_OPTIONS, index=1)
            service_type = st.selectbox("Modalidade :orange[*]", SERVICE_TYPE_OPTIONS)
            channel = st.selectbox("Canal :orange[*]", CHANNEL_OPTIONS)
            category = st.text_input("Categoria", placeholder="Ex.: PDV, Impressora, Rede, NFS-e")
            equipment = st.text_input("Equipamento / módulo")

        with col_b:
            client_name = st.text_input("Nome do cliente :orange[*]")
            client_company = st.text_input("Empresa")
            client_phone = st.text_input("Telefone do cliente")
            client_email = st.text_input("E-mail do cliente")
            client_city = st.text_input("Cidade")
            client_segment = st.text_input("Segmento")
            client_status = st.selectbox("Status do cliente", CLIENT_STATUS_OPTIONS)
            customer_contact = st.text_input("Contato principal", placeholder="Telefone ou e-mail")

        description = st.text_area("O que foi feito no cliente :orange[*]", height=150)
        next_action = st.text_area("Próxima ação ou pendência")
        resolution = st.text_area("Resultado / resolução aplicada :orange[*]")

        submitted = st.form_submit_button("Registrar atendimento", use_container_width=True, type="primary")

        if submitted:
            if not title.strip():
                st.toast("Informe o título do atendimento.")
            elif not client_name.strip():
                st.toast("Informe o nome do cliente.")
            elif not description.strip():
                st.toast("Informe o que foi feito no cliente.")
            elif not resolution.strip():
                st.toast("Informe o resultado / resolução aplicada.")
            else:
                try:
                    client_id = get_or_create_client(
                        client_name, client_company, client_phone, client_email,
                        client_city, client_segment, client_status,
                    )

                    protocol = generate_protocol()
                    solved_at = datetime.now().isoformat(timespec="seconds") if att_status == "Concluído" else None
                    create_attendance_entry(
                        protocol=protocol,
                        title=title,
                        description=description,
                        technician_id=int(technician_id),
                        client_id=int(client_id),
                        status=att_status,
                        priority=priority,
                        channel=channel,
                        service_type=service_type,
                        due_date=attendance_date.isoformat(),
                        solved_at=solved_at,
                        equipment=equipment,
                        category=category,
                        next_action=next_action,
                        resolution=resolution,
                    )
                    _flash(f"Atendimento registrado! Protocolo: {protocol}")
                    st.rerun()
                except Exception as e:
                    st.toast(f"Erro ao registrar atendimento: {e}")


# ---------------------------------------------------------------------------
# LISTA DE ATENDIMENTOS
# ---------------------------------------------------------------------------

def _attendance_list() -> None:
    attendances = load_attendances()

    _section_title("Atendimentos cadastrados", icon="clipboard-list")

    if attendances.empty:
        st.info("Ainda não há atendimentos cadastrados.")
        return

    total = len(attendances)
    completed = int((attendances["status"] == "Concluído").sum())
    pending = total - completed

    c1, c2, c3 = st.columns(3)
    c1.metric("Atendimentos", total)
    c2.metric("Concluídos", completed)
    c3.metric("Pendentes", pending)

    f1, f2, f3 = st.columns(3)
    with f1:
        tech_filter = st.selectbox(
            "Filtrar por técnico",
            options=["Todos"] + sorted(attendances["technician"].dropna().unique().tolist()),
        )
    with f2:
        status_filter = st.selectbox(
            "Filtrar por status",
            options=["Todos"] + sorted(attendances["status"].dropna().unique().tolist()),
        )
    with f3:
        search_text = st.text_input("Buscar por protocolo, cliente ou título")

    filtered = attendances.copy()
    if tech_filter != "Todos":
        filtered = filtered[filtered["technician"] == tech_filter]
    if status_filter != "Todos":
        filtered = filtered[filtered["status"] == status_filter]
    if search_text.strip():
        q = search_text.strip().lower()
        filtered = filtered[
            filtered["protocol"].str.lower().str.contains(q)
            | filtered["client"].str.lower().str.contains(q)
            | filtered["title"].str.lower().str.contains(q)
        ]

    _render_table(
        filtered,
        ["protocol", "title", "technician", "client", "client_phone", "client_email", "status", "priority", "channel", "service_type", "time_spent_hours", "opened_at"],
    )

    _export_csv(filtered)

    with st.expander("Atualizar status / resolução"):
        selected_protocol = st.selectbox("Selecione o protocolo", attendances["protocol"].tolist())
        row = attendances.loc[attendances["protocol"] == selected_protocol].iloc[0]
        st.markdown(
            "Situação atual: "
            + status_badge(str(row["status"]))
            + " &nbsp; "
            + priority_badge(str(row.get("priority", "Média"))),
            unsafe_allow_html=True,
        )
        new_status = st.selectbox(
            "Novo status",
            STATUS_OPTIONS,
            index=STATUS_OPTIONS.index(row["status"]) if row["status"] in STATUS_OPTIONS else 0,
        )
        new_resolution = st.text_area("Nova resolução", value=row["resolution"] or "")
        new_next_action = st.text_area("Próxima ação", value=row["next_action"] or "")
        new_hours = st.number_input(
            "Horas trabalhadas", min_value=0.0, step=0.5,
            value=float(row["time_spent_hours"] or 0),
        )
        if st.button(
            "Salvar atualização",
            use_container_width=True,
            type="primary",
            disabled=not _can("attendance:update"),
        ):
            solved_at = datetime.now().isoformat(timespec="seconds") if new_status == "Concluído" else None
            _run_ui_action(
                lambda: update_attendance_by_protocol(
                    protocol=selected_protocol,
                    status=new_status,
                    resolution=new_resolution,
                    next_action=new_next_action,
                    time_spent_hours=float(new_hours),
                    solved_at=solved_at,
                ),
                "Atendimento atualizado com sucesso!",
                "Erro ao atualizar atendimento",
            )

    with st.expander("Excluir atendimento"):
        del_protocol = st.selectbox(
            "Selecione o protocolo para excluir",
            options=attendances["protocol"].tolist(),
            key="del_att_select",
        )
        del_row = attendances.loc[attendances["protocol"] == del_protocol].iloc[0]
        del_att_id = int(del_row["id"])
        st.warning(f"Esta ação é irreversível. O atendimento **{del_protocol}** será excluído permanentemente.")
        confirm_del_att = st.checkbox(f"Confirmo a exclusão do atendimento **{del_protocol}**", key="confirm_del_att")
        if st.button(
            "Excluir atendimento",
            use_container_width=True,
            disabled=(not confirm_del_att) or (not _can("attendance:delete")),
            type="secondary",
        ):
            _run_ui_action(
                lambda: delete_attendance(del_att_id),
                "Atendimento excluído com sucesso!",
                "Erro ao excluir atendimento",
            )


# ---------------------------------------------------------------------------
# EXPORTAR CSV
# ---------------------------------------------------------------------------

def _export_csv(dataframe: pd.DataFrame) -> None:
    cols = [
        "protocol", "title", "technician", "client", "client_phone",
        "client_email", "company", "city", "status", "priority",
        "channel", "service_type", "time_spent_hours", "opened_at",
        "due_date", "resolution",
    ]
    available = [c for c in cols if c in dataframe.columns]
    csv_bytes = dataframe[available].to_csv(index=False).encode("utf-8-sig")
    st.download_button(
        label="Exportar lista em CSV",
        data=csv_bytes,
        file_name="atendimentos_tecnicos.csv",
        mime="text/csv",
        use_container_width=True,
    )


# ---------------------------------------------------------------------------
# ATENDIMENTOS (agrupa form + lista)
# ---------------------------------------------------------------------------

def show_attendances() -> None:
    st.subheader("Atendimentos")
    st.caption("Registre, acompanhe e atualize cada chamado sem depender de login ou planilhas soltas.")
    st.markdown('<div class="small-note">Dica: use o filtro por técnico + busca por protocolo para localizar chamados em segundos.</div>', unsafe_allow_html=True)
    tab_new, tab_list = st.tabs(["Novo atendimento", "Lista e gestão"])
    with tab_new:
        _attendance_form()
    with tab_list:
        _attendance_list()


# ---------------------------------------------------------------------------
# RESUMO POR DATA
# ---------------------------------------------------------------------------

def show_daily_summary() -> None:
    _section_title("Resumo por período", icon="calendar-days")
    st.caption("Acompanhe o desempenho e as ocorrências de atendimentos no período selecionado.")

    today = date.today()
    col_ini, col_fim = st.columns(2)
    start_date = col_ini.date_input("De", value=today - timedelta(days=6))
    end_date = col_fim.date_input("Até", value=today)
    if start_date > end_date:
        st.warning("A data inicial não pode ser maior que a final.")
        return

    attendances = load_attendances()
    if not attendances.empty:
        dcol = attendances["opened_at"].astype(str).str.slice(0, 10)
        mask = (dcol >= start_date.isoformat()) & (dcol <= end_date.isoformat())
        filtered = attendances[mask].copy()
    else:
        filtered = attendances.copy()

    total = len(filtered)
    completed = int((filtered["status"] == "Concluído").sum()) if not filtered.empty else 0
    pending = total - completed
    avg_hours = float(filtered["time_spent_hours"].astype(float).mean()) if not filtered.empty else 0.0

    c1, c2, c3, c4 = st.columns(4)
    c1.metric("Atendimentos", total)
    c2.metric("Concluídos", completed)
    c3.metric("Pendentes", pending)
    c4.metric("Horas médias", f"{avg_hours:.1f}")

    if filtered.empty:
        st.info("Nenhum atendimento registrado neste período.")
        return

    # Distribuição por status como badges com contagem
    status_counts = filtered.groupby("status").size().to_dict()
    chips = ""
    for s, n in sorted(status_counts.items(), key=lambda x: -x[1]):
        bg, fg = STATUS_BADGES.get(s, ("#E2E8F0", "#334155"))
        chips += (
            f'<span style="display:inline-block;padding:2px 10px;border-radius:999px;'
            f'background:{bg};color:{fg};font-size:0.75rem;font-weight:700;margin:0 6px 6px 0;">'
            f'{s}: {n}</span>'
        )
    st.markdown(f"<div style='display:flex;flex-wrap:wrap;margin:2px 0 12px;'>{chips}</div>", unsafe_allow_html=True)

    # Série temporal no período
    _section_title("Atendimentos por dia", icon="trending-up")
    ts = filtered.copy()
    ts["data"] = ts["opened_at"].astype(str).str.slice(0, 10)
    daily = (
        ts.groupby("data", as_index=False)
        .size()
        .rename(columns={"size": "Atendimentos"})
        .sort_values("data")
    )
    fig_ts = px.area(daily, x="data", y="Atendimentos", markers=True)
    fig_ts.update_traces(
        line_color=STYLE_VARS["primary"],
        fillcolor="rgba(37,99,235,0.12)",
        marker=dict(color=STYLE_VARS["primary"], size=6),
        hovertemplate="%{x}<br>%{y} atendimento(s)<extra></extra>",
    )
    _style_plotly(fig_ts, height=240)
    st.plotly_chart(fig_ts, use_container_width=True, config={"displayModeBar": False})

    col_a, col_b = st.columns(2)
    with col_a:
        _section_title("Por status", icon="chart-column")
        status_df = (
            filtered.groupby("status", as_index=False)
            .size()
            .rename(columns={"size": "Quantidade"})
            .sort_values("Quantidade")
        )
        fig_st = px.bar(
            status_df, x="Quantidade", y="status", orientation="h", text="Quantidade",
            color="status", color_discrete_map=STATUS_BAR_COLORS,
        )
        fig_st.update_traces(textposition="outside", cliponaxis=False, hovertemplate="%{y}: %{x}<extra></extra>")
        _style_plotly(fig_st, height=280)
        st.plotly_chart(fig_st, use_container_width=True, config={"displayModeBar": False})
    with col_b:
        _section_title("Principais técnicos", icon="hard-hat")
        top_tech = (
            filtered.groupby("technician", as_index=False)
            .size()
            .rename(columns={"size": "Atendimentos"})
            .sort_values("Atendimentos")
            .tail(8)
        )
        fig_t = px.bar(top_tech, x="Atendimentos", y="technician", orientation="h", text="Atendimentos")
        fig_t.update_traces(
            marker_color=STYLE_VARS["primary"], textposition="outside", cliponaxis=False,
            hovertemplate="%{y}: %{x}<extra></extra>",
        )
        _style_plotly(fig_t, height=280)
        st.plotly_chart(fig_t, use_container_width=True, config={"displayModeBar": False})

    _section_title("Atendimentos do período", icon="clipboard-list")
    _render_table(filtered, ["protocol", "title", "technician", "client", "client_phone", "status", "resolution", "next_action"])


# ---------------------------------------------------------------------------
# SOBRE
# ---------------------------------------------------------------------------

def show_whatsapp() -> None:
    _section_title("WhatsApp", icon="message-circle")

    # Auto-refresh a cada 30s enquanto o usuário está nesta página
    st_autorefresh(interval=30_000, key="wa_autorefresh")

    # Garante criação das tabelas e importa mensagens novas quando houver JSONL.
    import_new_messages()

    if not wa_tables_exist():
        st.info(
            "Conecte o bridge com **start_whatsapp.bat** e envie/receba ao menos uma mensagem "
            "para começar a aparecer no CRM.",
        )

    col_info, col_sync = st.columns([7, 1])
    with col_info:
        st.caption("Sincronização automática a cada 30 segundos — mensagens chegam sem ação manual.")
    with col_sync:
        if st.button("Sincronizar agora", key="wa_sync"):
            n = import_new_messages()
            if n:
                st.toast(f"{n} mensagem(ns) importada(s)")
            else:
                st.toast("Nenhuma mensagem nova.")
            st.rerun()

    # ── Filtros ──────────────────────────────────────────────────────────────
    col_d, col_s, _ = st.columns([2, 2, 4])
    with col_d:
        period = st.selectbox(
            "Período",
            ["Hoje", "Últimos 7 dias", "Últimos 30 dias", "Tudo"],
            index=2,
            key="wa_period",
        )
    with col_s:
        status_filter = st.selectbox(
            "Status",
            ["Todos", "aberto", "em_andamento", "resolvido"],
            key="wa_status",
        )

    days_map = {"Hoje": 1, "Últimos 7 dias": 7, "Últimos 30 dias": 30, "Tudo": None}
    days = days_map[period]

    # ── Estatísticas ─────────────────────────────────────────────────────────
    stats = load_summary_stats(days or 3650)
    c1, c2, c3, c4 = st.columns(4)
    c1.metric("Conversas", stats.get("total_conversas", 0))
    c2.metric("Mensagens trocadas", stats.get("total_mensagens", 0))
    c3.metric("Resolvidas", stats.get("resolvidos", 0))
    c4.metric("Em aberto", stats.get("abertos", 0))

    st.divider()

    # ── Lista de conversas ────────────────────────────────────────────────────
    df = load_conversations(days=days, status=status_filter if status_filter != "Todos" else None)

    if df.empty:
        st.info("Nenhuma conversa encontrada para os filtros selecionados.")
        return

    attendances_df = load_attendances()
    protocol_options = ["— sem vínculo —"] + (
        attendances_df["protocol"].tolist() if not attendances_df.empty else []
    )

    STATUS_LABEL = {
        "aberto": "Aberto",
        "em_andamento": "Em andamento",
        "resolvido": "Resolvido",
    }
    STATUS_VALUES = ["aberto", "em_andamento", "resolvido"]
    STATUS_DISPLAY = ["Aberto", "Em andamento", "Resolvido"]
    WA_BADGES = {
        "Aberto":       ("#FEF3C7", "#92400E"),
        "Em andamento": ("#DBEAFE", "#1E40AF"),
        "Resolvido":    ("#DCFCE7", "#166534"),
    }

    for _, row in df.iterrows():
        conv_id = int(row["id"])
        label = f"{STATUS_LABEL.get(row['status'], row['status'])}  •  **{row['contact_name']}** ({row['contact_number']})  •  {row['message_count']} msgs  •  último: {row['last_message_at']}"
        with st.expander(label, expanded=False):
            st.markdown(
                "Status: " + _badge(STATUS_LABEL.get(row["status"], row["status"]), WA_BADGES),
                unsafe_allow_html=True,
            )
            tab_msgs, tab_actions = st.tabs(["Mensagens", "Ações"])

            with tab_msgs:
                msgs_df = load_messages(conv_id)
                if msgs_df.empty:
                    st.info("Sem mensagens registradas.")
                else:
                    _LOCATION_RE = re.compile(r'^📍LOCATION:(-?\d+\.\d+),(-?\d+\.\d+):(.*)$')
                    for _, m in msgs_df.iterrows():
                        who   = row["contact_name"] if m["direction"] == "in" else "Técnico"
                        loc   = _LOCATION_RE.match(str(m["body"]))
                        if loc:
                            lat_v = float(loc.group(1))
                            lng_v = float(loc.group(2))
                            desc  = loc.group(3).strip()
                            pin = ds_icon("map-pin", size=14)
                            label = f"{pin} {desc}" if desc else f"{pin} Localização compartilhada"
                            st.markdown(
                                f"<small style='color:#8595A4'>{m['timestamp']}</small> "
                                f"**{who}:** {label}",
                                unsafe_allow_html=True,
                            )
                            st.map(
                                pd.DataFrame({"lat": [lat_v], "lon": [lng_v]}),
                                zoom=14,
                                height=220,
                                use_container_width=True,
                            )
                            osm = (
                                f"https://www.openstreetmap.org/"
                                f"?mlat={lat_v}&mlon={lng_v}#map=15/{lat_v}/{lng_v}"
                            )
                            st.markdown(f"[Abrir no mapa]({osm})")
                        else:
                            st.markdown(
                                f"<small style='color:#8595A4'>{m['timestamp']}</small> "
                                f"**{who}:** {m['body']}",
                                unsafe_allow_html=True,
                            )

            with tab_actions:
                col_st, col_atd = st.columns(2)

                with col_st:
                    new_status = st.selectbox(
                        "Status da conversa",
                        STATUS_VALUES,
                        format_func=lambda v: STATUS_DISPLAY[STATUS_VALUES.index(v)],
                        index=STATUS_VALUES.index(row["status"]) if row["status"] in STATUS_VALUES else 0,
                        key=f"wa_st_{conv_id}",
                    )
                    if st.button("Salvar status", key=f"wa_sv_st_{conv_id}"):
                        update_conversation_status(conv_id, new_status)
                        st.success("Status atualizado.")
                        st.rerun()

                with col_atd:
                    current_prot = None
                    if row["linked_attendance_id"] and not attendances_df.empty:
                        match = attendances_df[attendances_df["id"] == row["linked_attendance_id"]]
                        if not match.empty:
                            current_prot = match.iloc[0]["protocol"]

                    sel_prot = st.selectbox(
                        "Vincular atendimento CRM",
                        protocol_options,
                        index=protocol_options.index(current_prot) if current_prot in protocol_options else 0,
                        key=f"wa_atd_{conv_id}",
                    )
                    if st.button("Salvar vínculo", key=f"wa_sv_atd_{conv_id}"):
                        if sel_prot == "— sem vínculo —":
                            link_attendance(conv_id, None)
                        else:
                            match = attendances_df[attendances_df["protocol"] == sel_prot]
                            if not match.empty:
                                link_attendance(conv_id, int(match.iloc[0]["id"]))
                        st.success("Vínculo salvo.")
                        st.rerun()

                notes_val = row["notes"] or ""
                new_notes = st.text_area("Anotações", value=notes_val, key=f"wa_notes_{conv_id}", height=80)
                if st.button("Salvar anotações", key=f"wa_sv_notes_{conv_id}"):
                    save_notes(conv_id, new_notes)
                    st.success("Anotações salvas.")
                    st.rerun()


def show_about() -> None:
    _section_title("Visão do sistema", icon="info")
    st.markdown(
        """
        <div class="card fade-in">
            <p class="muted">
                O sistema foi projetado para operações técnicas de nível empresarial, com controle de atendimentos,
                comunicação clara e apoio à gestão diária.
            </p>
            <p class="muted">
                A plataforma permite registrar ocorrências sem exigir cadastro prévio de cliente, atualizar status em
                tempo real e gerar relatórios por data.
            </p>
            <p class="small-note">
                Use o formulário de atendimento para registrar cliente novo ou existente, com data automática e contato direto.
            </p>
        </div>
        """,
        unsafe_allow_html=True,
    )
