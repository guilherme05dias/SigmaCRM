"""
Preview do Design System (sem banco de dados).

Renderiza o header e a sidebar REAIS do app + uma vitrine de componentes,
usando o mesmo CSS de ui.py, para verificar visualmente o design sem precisar
de credenciais do Supabase.

Como rodar:
    python -m streamlit run preview_design.py --server.port 8502

Obs.: este arquivo é só para verificação visual; não faz parte do app em produção.
"""

# --- Driblar a conexão com o banco ANTES de importar ui/backend -------------
# repositories/auth fazem `from config import get_db_url`; substituindo aqui,
# o engine é criado de forma "preguiçosa" e nunca conecta (a preview não consulta).
import config  # noqa: E402

config.get_db_url = lambda: "postgresql+psycopg2://preview:preview@localhost:5432/preview"

import pandas as pd  # noqa: E402
import plotly.express as px  # noqa: E402
import streamlit as st  # noqa: E402

import ui  # noqa: E402  (já seguro após o monkeypatch acima)


# --- Tema global (set_page_config + CSS) ------------------------------------
ui.style_app()

# --- Sidebar real -----------------------------------------------------------
demo_user = {
    "role": "gerente",
    "full_name": "Usuário Demonstração",
    "username": "preview",
    "allowed_pages": None,
}
try:
    ui.sidebar_navigation(demo_user)
except Exception as exc:  # pragma: no cover
    st.sidebar.error(f"Sidebar indisponível na preview: {exc}")

# --- Header real (hero) -----------------------------------------------------
try:
    ui.render_header()
except Exception as exc:  # pragma: no cover
    st.error(f"Header indisponível na preview: {exc}")

st.markdown(
    f'<div class="preview-banner">{ui.ds_icon("info", size=16)} '
    "Modo PREVIEW — demonstração visual do design system sem conexão com o banco.</div>",
    unsafe_allow_html=True,
)

# --- Vitrine de componentes -------------------------------------------------
ui._section_title("Botões", icon="mouse-pointer-2")
b1, b2, b3, b4 = st.columns(4)
b1.button("Primário", type="primary", use_container_width=True)
b2.button("Secundário", type="secondary", use_container_width=True)
b3.button("Ghost", use_container_width=True)
b4.download_button("Download CSV", data="a,b\n1,2\n", file_name="exemplo.csv", use_container_width=True)

ui._section_title("Métricas", icon="chart-column")
m1, m2, m3, m4, m5 = st.columns(5)
m1.metric("Atendimentos", 128)
m2.metric("Concluídos", 96)
m3.metric("Pendentes", 32)
m4.metric("Técnicos", 6)
m5.metric("Clientes", 54)

ui._section_title("Gráficos do dashboard", icon="trending-up")
_daily = pd.DataFrame(
    {
        "data": pd.date_range("2026-05-20", periods=12, freq="D").strftime("%d/%m"),
        "Atendimentos": [4, 6, 5, 9, 7, 11, 8, 10, 6, 12, 9, 14],
    }
)
_fig_ts = px.area(_daily, x="data", y="Atendimentos", markers=True)
_fig_ts.update_traces(
    line_color=ui.STYLE_VARS["primary"],
    fillcolor="rgba(37,99,235,0.12)",
    marker=dict(color=ui.STYLE_VARS["primary"], size=6),
)
ui._style_plotly(_fig_ts, height=240)
st.plotly_chart(_fig_ts, use_container_width=True, config={"displayModeBar": False})

_cg1, _cg2 = st.columns(2)
with _cg1:
    _sdf = pd.DataFrame(
        {"status": ["Novo", "Em andamento", "Concluído", "Cancelado"], "Quantidade": [12, 20, 34, 5]}
    ).sort_values("Quantidade")
    _fig_s = px.bar(
        _sdf, x="Quantidade", y="status", orientation="h", text="Quantidade",
        color="status", color_discrete_map=ui.STATUS_BAR_COLORS,
    )
    _fig_s.update_traces(textposition="outside", cliponaxis=False)
    ui._style_plotly(_fig_s, height=240)
    st.plotly_chart(_fig_s, use_container_width=True, config={"displayModeBar": False})
with _cg2:
    _cdf = pd.DataFrame(
        {"cliente": ["Empresa A", "Empresa B", "Empresa C", "Empresa D"], "Atendimentos": [8, 14, 5, 11]}
    ).sort_values("Atendimentos")
    _fig_c = px.bar(_cdf, x="Atendimentos", y="cliente", orientation="h", text="Atendimentos")
    _fig_c.update_traces(marker_color=ui.STYLE_VARS["primary"], textposition="outside", cliponaxis=False)
    ui._style_plotly(_fig_c, height=240)
    st.plotly_chart(_fig_c, use_container_width=True, config={"displayModeBar": False})

ui._section_title("Badges de status e prioridade", icon="circle-check")
_status = ["Novo", "Em andamento", "Aguardando cliente", "Concluído", "Cancelado"]
_prio = ["Baixa", "Média", "Alta", "Crítica"]
st.markdown(
    "<div style='display:flex;gap:8px;flex-wrap:wrap;margin-bottom:6px;'>"
    + "".join(ui.status_badge(s) for s in _status)
    + "</div>"
    + "<div style='display:flex;gap:8px;flex-wrap:wrap;'>"
    + "".join(ui.priority_badge(p) for p in _prio)
    + "</div>",
    unsafe_allow_html=True,
)

ui._section_title("Campos de formulário", icon="clipboard-pen")
with st.form("preview_form"):
    c1, c2 = st.columns(2)
    c1.text_input("Título", placeholder="Ex.: Impressora sem comunicação")
    c2.selectbox("Prioridade", ["Baixa", "Média", "Alta", "Crítica"], index=1)
    c3, c4 = st.columns(2)
    c3.text_input("Cliente", placeholder="Empresa XYZ Ltda")
    c4.selectbox("Status", ["Novo", "Em andamento", "Concluído", "Cancelado"])
    st.text_area("Descrição", placeholder="O que foi feito no cliente...")
    st.form_submit_button("Registrar atendimento", type="primary", use_container_width=True)

st.markdown(
    '<div class="info-message">Caixa de destaque (info-message) com o novo estilo.</div>',
    unsafe_allow_html=True,
)

ui._section_title("Mensagens de feedback", icon="bell")
st.success("Operação concluída com sucesso.")
st.info("Mensagem informativa para o usuário.")
st.warning("Atenção: ação irreversível.")
st.error("Algo deu errado ao salvar.")

ui._section_title("Abas e tabela", icon="clipboard-list")
tab1, tab2 = st.tabs(["Lista", "Resumo"])
with tab1:
    df = pd.DataFrame(
        {
            "protocolo": ["ATD20260601-001", "ATD20260601-002", "ATD20260601-003"],
            "cliente": ["Empresa A", "Empresa B", "Empresa C"],
            "técnico": ["André", "Bruna", "Carlos"],
            "status": ["Novo", "Em andamento", "Concluído"],
            "prioridade": ["Alta", "Média", "Baixa"],
        }
    )
    st.dataframe(df, use_container_width=True, hide_index=True)
with tab2:
    st.write("Conteúdo da aba de resumo.")

with st.expander("Exemplo de expander"):
    st.write("Conteúdo recolhível com o novo estilo de card.")
    st.toggle("Opção ativa", value=True)
