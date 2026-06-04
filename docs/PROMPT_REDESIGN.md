# Prompt — Redesign visual do ServiçoCRM (Streamlit)

Cole o bloco abaixo no modelo executor (ChatGPT / Antigravity / etc.). É uma
especificação **auto-contida** para implementar todo o redesign visual deste
projeto Streamlit. Reproduz exatamente o que já foi feito — use para reaplicar
numa cópia/branch ou auditar.

---

```
Você é um engenheiro front-end implementando um redesign visual completo num app
Streamlit (Python) chamado "ServiçoCRM" — um CRM de atendimentos técnicos (B2B SaaS).
NÃO use React/Tailwind/shadcn: é Streamlit + CSS custom. Trabalhe na pasta do app
(arquivos: main.py, ui.py, design_system.py, config.py, e crie icons.py).

OBJETIVO
Implementar um design system "SaaS trust-blue" (Flat Design), com ícones Lucide
(SVG), SEM nenhum emoji na interface, badges de status/prioridade e gráficos no
dashboard/resumo. Acessível (WCAG AA) e consistente.

REGRAS GLOBAIS
- PROIBIDO emoji na UI. Use SVG (Lucide) onde o Streamlit renderiza HTML; onde não
  renderiza (rótulos de st.button/st.expander/st.toast), use texto limpo ou ícone
  via máscara CSS por key.
- Estilo Flat Design: superfícies chapadas, sem sombras pesadas; transições
  150–250ms; cantos arredondados; botões em "pill".
- Acessibilidade: contraste de texto ≥ 4.5:1; nunca comunicar status só por cor
  (sempre com rótulo); aria-label em botões só-ícone; foco visível.
- NÃO altere a string de dados "📍LOCATION:" usada no parser do WhatsApp (é marcador
  de dados, não UI).
- Mantenha a arquitetura em camadas (ui -> backend -> services -> repositories).

PASSO 1 — TOKENS (design_system.py)
Defina exatamente estes tokens e exponha um dict STYLE_VARS com chaves em snake_case:
- Marca/ação: PRIMARY #2563EB, PRIMARY_DEEP #1D4ED8, PRIMARY_SOFT #3B82F6,
  ON_PRIMARY #FFFFFF, INK_BUTTON #2563EB (o CTA é AZUL — decisão de acessibilidade),
  ACCENT_WARM #F97316 (laranja: APENAS acento fino, nunca fundo de botão),
  ACCENT_WARM_DEEP #C2410C, FB_BLUE #3B82F6.
- Semânticas: SUCCESS #31A24C, ATTENTION #F2A918, WARNING #F7B928,
  CRITICAL #E41E3F, CRITICAL_STRONG #F0284A.
- Superfícies: CANVAS #F8FAFC, SURFACE_SOFT #F1F5F9, HAIRLINE #CBD5E1,
  HAIRLINE_SOFT #E2E8F0.
- Texto: INK_DEEP #1E293B, INK #334155, CHARCOAL #444950, SLATE #4B4C4F,
  STEEL #5D6C7B, STONE #8595A4, DISABLED_TEXT #BCC0C4.
- Tipografia: FONT_FAMILY = "'Montserrat','Helvetica Neue',Helvetica,Arial,sans-serif".
- Raios: RADIUS_LG 8px, RADIUS_XL 16px, RADIUS_XXL 24px, RADIUS_XXXL 32px,
  RADIUS_FULL 100px. Elevação flat: BOX_SHADOW "0 1px 4px rgba(20,22,26,0.08)".
- Badges (fundo suave + texto escuro; todos passam 4.5:1):
  STATUS_BADGES = {
    "Novo": ("#DBEAFE","#1E40AF"), "Em andamento": ("#FEF3C7","#92400E"),
    "Aguardando cliente": ("#E2E8F0","#334155"), "Aguardando retorno": ("#E2E8F0","#334155"),
    "Concluído": ("#DCFCE7","#166534"), "Cancelado": ("#FEE2E2","#991B1B") }
  PRIORITY_BADGES = {
    "Baixa": ("#F1F5F9","#475569"), "Média": ("#DBEAFE","#1E40AF"),
    "Alta": ("#FEF3C7","#92400E"), "Crítica": ("#FEE2E2","#991B1B") }

PASSO 2 — ÍCONES (criar icons.py, Lucide)
- Busque os SVGs oficiais Lucide (https://unpkg.com/lucide-static@latest/icons/<nome>.svg)
  e copie os paths verbatim. NÃO invente paths.
- Ícones necessários: layout-dashboard, clipboard-list, calendar-days, wrench,
  building-2, users, user, message-circle, info, trending-up, chart-column,
  clipboard-pen, hard-hat, settings, trash-2, plus, save, log-out, power, bell,
  refresh-cw, map, map-pin, zap, triangle-alert, check, circle-check, x, circle-x,
  circle, search, mouse-pointer-2.
- API (stdlib apenas, sem efeitos colaterais no import):
  - render(name, size=18, stroke_width=2.0, cls="") -> str: <svg> inline com
    viewBox="0 0 24 24", fill="none", stroke="currentColor", stroke-linecap/linejoin
    "round", class="ds-icon {cls}", style alinhando ao texto. (currentColor faz o
    ícone herdar a cor do texto.)
  - data_uri(name, ...) -> str: "data:image/svg+xml,<urlencoded>" para usar em CSS
    mask-image (ícones que herdam a cor via background-color: currentColor).

PASSO 3 — CSS GLOBAL (ui.py, função style_app/_GLOBAL_CSS)
- Importar a fonte Montserrat (Google Fonts) e mapear os tokens em variáveis CSS.
- Fundo da app = SURFACE_SOFT; cards = CANVAS branco com borda HAIRLINE_SOFT.
- Títulos em INK_DEEP (peso 600/700, letter-spacing -0.02em).
- Botões (pill, radius-full):
  - primário (kind="primary"): fundo PRIMARY, texto branco; pressed PRIMARY_DEEP.
  - secundário/default: fundo branco, borda 2px INK_DEEP, texto INK_DEEP (ghost);
    hover fundo SURFACE_SOFT.
- Inputs (baseweb): fundo branco, borda 1px HAIRLINE, radius 8px, altura ~2.75rem;
  foco: borda 2px FB_BLUE + box-shadow de foco.
- Métricas (stMetric): card branco flat, borda HAIRLINE_SOFT, radius 16px, barra
  superior 3px na cor PRIMARY; valor em INK_DEEP.
- Tabs: ativo com sublinhado PRIMARY; expander/dataframe: borda HAIRLINE_SOFT,
  radius 16px, fundo branco. info-message: fundo SURFACE_SOFT + borda HAIRLINE_SOFT.
- SIDEBAR (clara): fundo CANVAS, borda direita HAIRLINE_SOFT. Navegação como BOTÕES
  (um por página), não st.radio:
  - key = f"nav_{icone_lucide_da_pagina}"; CSS por key injeta o ícone via mask
    (background-color: currentColor + mask-image: data_uri). Itens alinhados à
    esquerda, pill, borda HAIRLINE.
  - Item ATIVO: fundo INK_DEEP, texto/ícone brancos (override por key do item ativo).
  - Mapa página->ícone: Dashboard=layout-dashboard, Atendimentos=clipboard-list,
    "Resumo por data"=calendar-days, Técnicos=wrench, Clientes=building-2,
    Usuários=users, WhatsApp=message-circle, Sobre=info.
  - Estado de navegação em st.session_state["menu_radio"]; a função retorna a página.

PASSO 4 — SEM EMOJIS (ui.py, varrer todo o arquivo)
- _section_title(text, icon): renderizar SVG inline via render(icon) (icon = nome
  Lucide, não emoji). Atualizar TODAS as chamadas para nomes Lucide.
- Remover emojis de rótulos de botões/expanders/abas (texto limpo).
- Botões de ação com ícone via máscara CSS por key: header_logout=power,
  sidebar_logout=power, wa_sync=refresh-cw, quick_att=clipboard-pen,
  quick_cli=building-2, quick_tec=hard-hat.
- toasts/alerts: remover emojis e o param icon="..."; deixar st.success/info/
  warning/error usarem os ícones vetoriais nativos.
- Tabelas/labels de dados: trocar "✅ Sim/❌ Não" por "Sim/Não"; status do WhatsApp
  e Ativo/Inativo viram texto/badge (sem 🟢🟡🔵🔴). Localização do WhatsApp usa
  render("map-pin"). page_icon do set_page_config = caminho da logo (não emoji).

PASSO 5 — BADGES (ui.py)
- Helper _badge(label, palette) -> <span> pill (fundo suave + texto escuro, com
  rótulo textual). status_badge()/priority_badge() usando STATUS_BADGES/PRIORITY_BADGES.
- Usar onde o Streamlit renderiza HTML (st.markdown unsafe_allow_html=True):
  - Atendimentos: no expander de atualização, mostrar status+prioridade atuais.
  - WhatsApp: badge de status no corpo do expander da conversa.
  - Usuários: badge Ativo/Inativo no corpo do expander.
  (st.dataframe NÃO renderiza HTML — não tente badge dentro de dataframe.)

PASSO 6 — GRÁFICOS (ui.py, Plotly — já está no requirements)
- Helper _style_plotly(fig, height): fonte Montserrat, paper/plot bg transparente,
  sem gridlines, sem legenda, margens pequenas.
- STATUS_BAR_COLORS = {status: cor_forte_do_badge}.
- Dashboard (show_dashboard): trocar as tabelas por:
  - Área/linha "Atendimentos ao longo do tempo" (group opened_at[:10]), cor PRIMARY,
    fill rgba(37,99,235,0.12).
  - Barras horizontais "Atendimentos por status" (cores por STATUS_BAR_COLORS) e
    "Top clientes" (PRIMARY), ordenadas, com rótulo de valor.
- Resumo por data (show_daily_summary): virar "Resumo por período" com date_input
  De/Até (padrão últimos 7 dias, validar intervalo), 4 métricas (incl. horas médias),
  badges de status com contagem, e os mesmos gráficos (linha por dia + barras por
  status + principais técnicos) + tabela do período.

PASSO 7 — VERIFICAÇÃO
- python -m py_compile em design_system.py, icons.py, ui.py (sem erros).
- Criar um preview SEM banco para validar o visual: um arquivo que faz monkeypatch
  de config.get_db_url (retorna URL fake, engine nunca conecta), importa ui, chama
  style_app(), render_header(), sidebar_navigation({...}) e exibe uma vitrine
  (botões, métricas, badges, gráficos com dados de exemplo). Rodar com:
  streamlit run preview_design.py --server.port 8502
- Conferir: nenhum emoji; ícones Lucide na sidebar e títulos; CTA azul (contraste OK);
  badges e gráficos renderizando.

ENTREGÁVEL
Liste os arquivos alterados/criados e o resultado do py_compile. Aponte qualquer
ponto onde o Streamlit impediu o uso de SVG (e como contornou).
```

---

## Notas
- O CTA é **azul** (não laranja) por acessibilidade: texto branco sobre `#F97316`
  dá ~2.6:1 (reprova); sobre `#2563EB` dá ~6.4:1 (passa). O laranja vira só acento.
- A skill `ui-ux-pro-max` embasou a paleta (SaaS trust-blue), os badges (não usar só
  cor) e os tipos de gráfico (linha p/ tendência, barra p/ ranking).
