# Design System do ServiçoCRM

> ⚠️ **Documento legado — apenas para consulta.**
> O design system padrão atual é o **`DESIGN-meta (1).md`** (sistema Meta:
> canvas branco, azul cobalto, botões "pill", Montserrat). Os tokens vivos
> ficam em `design_system.py`. Esta página descreve a paleta anterior
> (teal/petróleo/terracota) e é mantida só como referência histórica.

Este documento descreve o padrão visual anterior do front-end (`ui.py`).

## Fonte de tokens

Os tokens são definidos em `design_system.py` e consumidos no CSS de `style_app()`.

Principais tokens:

- `--primary-color`
- `--secondary-color`
- `--accent-color`
- `--background-dark`
- `--background-light`
- `--neutral`
- `--text-main`

Aliases compatíveis com o design system:

- `--background-color`
- `--card-background`
- `--text-color`
- `--muted-text`
- `--border-color`
- `--shadow`
- `--hover-shadow`

## Blocos visuais principais

- `hero`
  - Cabeçalho principal da home
  - Gradiente, borda suave e destaque de marca

- `card`
  - Container base das seções
  - Hover com elevação

- `section-title`
  - Título padronizado das seções (ícone + texto)

- `fade-in`
  - Animação de entrada para cards/blocos

- `success-message`, `error-message`, `info-message`
  - Feedback visual de ações

- `small-note`
  - Texto contextual auxiliar

## Sidebar

A sidebar usa estilo de navegação em formato de botão:

- Hover com transição e deslocamento
- Estado ativo em destaque usando `--primary-color`
- Logo renderizada via HTML para evitar fullscreen button

## Componentes Streamlit customizados

- Botões (`stButton`, `stFormSubmitButton`, `stDownloadButton`)
- Tabs (`stTabs`)
- Inputs (`stTextInput`, `stTextArea`, `stNumberInput`, `stDateInput`, `stSelectbox`)
- Métricas (`stMetric`)
- Tabelas (`stDataFrame`)
- Expander

## Estrutura de telas

- `render_header()`: bloco `hero`
- `show_dashboard()`: métricas + ações rápidas
- `show_attendances()`: fluxo novo/lista
- `show_clients()`, `show_technicians()`: gestão cadastral
- `show_daily_summary()`: visão por data
- `show_about()`: visão institucional

## Diretrizes de manutenção

- Alterar paleta em `design_system.py`
- Evitar estilos inline em novas seções
- Preferir classes CSS reutilizáveis
- Manter efeitos de hover/click consistentes entre sidebar e botões
