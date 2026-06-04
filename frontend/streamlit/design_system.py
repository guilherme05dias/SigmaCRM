# Design System Global do ServiçoCRM
#
# Paleta atual: SaaS (General) — recomendação do UI/UX Pro Max para CRMs B2B.
# Trust blue (#2563EB) como primária + orange CTA (#F97316) para contraste de
# conversão. Mantém botões pill, cantos generosos e tipografia Montserrat.

# ---------------------------------------------------------------------------
# PALETA (SaaS trust-blue + orange CTA)
# ---------------------------------------------------------------------------

# Marca / ação
PRIMARY        = "#2563EB"   # trust blue — ação primária
PRIMARY_DEEP   = "#1D4ED8"   # pressed / links ativos
PRIMARY_SOFT   = "#3B82F6"   # realce translúcido / callouts
ON_PRIMARY     = "#FFFFFF"
INK_BUTTON     = "#2563EB"   # CTA = mesma cor primária (decisão: tudo azul, acessível)
ON_INK_BUTTON  = "#FFFFFF"
ACCENT_WARM      = "#F97316"   # laranja: APENAS acento fino (realces), nunca fundo de botão
ACCENT_WARM_DEEP = "#C2410C"   # variante acessível do laranja (texto branco ~5:1) se preciso
FB_BLUE        = "#3B82F6"   # foco de campos / seleção de form
META_LINK      = "#1D4ED8"

# Semânticas
SUCCESS        = "#31A24C"
ATTENTION      = "#F2A918"
WARNING        = "#F7B928"
CRITICAL       = "#E41E3F"
CRITICAL_STRONG = "#F0284A"

# Superfícies
CANVAS         = "#F8FAFC"   # fundo da página (slate-50)
SURFACE_SOFT   = "#F1F5F9"   # thumbnails, search pill, fundos sutis
HAIRLINE       = "#CBD5E1"   # borda de input (1px)
HAIRLINE_SOFT  = "#E2E8F0"   # divisores de card / seções

# Texto
INK_DEEP       = "#1E293B"   # títulos / corpo principal (slate-800)
INK            = "#334155"   # corpo padrão (slate-700)
CHARCOAL       = "#444950"   # terciário
SLATE          = "#4B4C4F"   # microcopy de apoio
STEEL          = "#5D6C7B"   # captions / links quietos
STONE          = "#8595A4"   # desabilitado / de-ênfase
DISABLED_TEXT  = "#BCC0C4"

# ---------------------------------------------------------------------------
# BADGES (fundo suave + texto escuro; passam 4.5:1 e não dependem só da cor)
# Recomendação ui-ux-pro-max: "não comunicar só por cor" -> sempre com rótulo.
# ---------------------------------------------------------------------------
STATUS_BADGES: dict[str, tuple[str, str]] = {
    "Novo":               ("#DBEAFE", "#1E40AF"),
    "Em andamento":       ("#FEF3C7", "#92400E"),
    "Aguardando cliente": ("#E2E8F0", "#334155"),
    "Aguardando retorno": ("#E2E8F0", "#334155"),
    "Concluído":          ("#DCFCE7", "#166534"),
    "Cancelado":          ("#FEE2E2", "#991B1B"),
}
PRIORITY_BADGES: dict[str, tuple[str, str]] = {
    "Baixa":   ("#F1F5F9", "#475569"),
    "Média":   ("#DBEAFE", "#1E40AF"),
    "Alta":    ("#FEF3C7", "#92400E"),
    "Crítica": ("#FEE2E2", "#991B1B"),
}

# ---------------------------------------------------------------------------
# COMPAT — chaves legadas consumidas em ui.py (remapeadas p/ paleta Meta)
# ---------------------------------------------------------------------------
SECONDARY = INK_DEEP   # títulos
ACCENT    = PRIMARY_SOFT
DARK_BG   = INK_DEEP
LIGHT_BG  = CANVAS
NEUTRAL   = CANVAS

# ---------------------------------------------------------------------------
# TIPOGRAFIA
# ---------------------------------------------------------------------------
# Optimistic VF é proprietária da Meta; usamos Montserrat como fallback
# geométrico humanista mais próximo, mantendo a cadeia de fallback do sistema.
FONT_FAMILY = "'Montserrat', 'Helvetica Neue', Helvetica, Arial, 'Noto Sans', sans-serif"
FONT_SIZE_BASE = "16px"
FONT_SIZE_LG = "1.125rem"   # 18px subtitle
FONT_SIZE_SM = "0.875rem"   # 14px body-sm
LETTER_SPACING_BODY = "0"

# ---------------------------------------------------------------------------
# ESPAÇAMENTO (escala Meta, base 4px)
# ---------------------------------------------------------------------------
SPACING_XXS = "4px"
SPACING_XS  = "8px"
SPACING_SM  = "10px"
SPACING_MD  = "12px"
SPACING_BASE = "16px"
SPACING_LG  = "20px"
SPACING_XL  = "24px"
SPACING_XXL = "32px"
SPACING_XXXL = "40px"
SPACING_SECTION = "64px"

# ---------------------------------------------------------------------------
# RAIO DE BORDA (escala Meta)
# ---------------------------------------------------------------------------
RADIUS_SM   = "4px"
RADIUS_LG   = "8px"    # inputs
RADIUS_XL   = "16px"   # cards padrão
RADIUS_XXL  = "24px"   # tiles / hero cards
RADIUS_XXXL = "32px"   # cards fotográficos / promo
RADIUS_FULL = "100px"  # pills (botões, chips, badges)
BORDER_RADIUS = RADIUS_XL
BORDER_RADIUS_FULL = RADIUS_FULL

# ---------------------------------------------------------------------------
# ELEVAÇÃO (o sistema é predominantemente flat)
# ---------------------------------------------------------------------------
BOX_SHADOW = "0 1px 4px rgba(20,22,26,0.08)"
BOX_SHADOW_HOVER = "0 4px 16px rgba(20,22,26,0.12)"
BOX_SHADOW_PANEL = "0 1px 4px rgba(20,22,26,0.30)"

# ---------------------------------------------------------------------------
# TRANSIÇÕES (150–250ms ease-out p/ superfícies primárias)
# ---------------------------------------------------------------------------
TRANSITION = "all 0.18s ease-out"

# ---------------------------------------------------------------------------
# Utilitários consumidos pelos componentes
# ---------------------------------------------------------------------------
STYLE_VARS = {
    # legadas (mantidas p/ compatibilidade com ui.py)
    "primary": PRIMARY,
    "secondary": SECONDARY,
    "accent": ACCENT,
    "dark_bg": DARK_BG,
    "light_bg": LIGHT_BG,
    "neutral": NEUTRAL,
    "font_family": FONT_FAMILY,
    "font_size_base": FONT_SIZE_BASE,
    "font_size_lg": FONT_SIZE_LG,
    "font_size_sm": FONT_SIZE_SM,
    "box_shadow": BOX_SHADOW,
    "box_shadow_hover": BOX_SHADOW_HOVER,
    "border_radius": BORDER_RADIUS,
    "border_radius_full": BORDER_RADIUS_FULL,
    "transition": TRANSITION,
    # paleta Meta completa
    "primary_deep": PRIMARY_DEEP,
    "primary_soft": PRIMARY_SOFT,
    "on_primary": ON_PRIMARY,
    "ink_button": INK_BUTTON,
    "accent_warm": ACCENT_WARM,
    "accent_warm_deep": ACCENT_WARM_DEEP,
    "fb_blue": FB_BLUE,
    "success": SUCCESS,
    "attention": ATTENTION,
    "warning": WARNING,
    "critical": CRITICAL,
    "critical_strong": CRITICAL_STRONG,
    "canvas": CANVAS,
    "surface_soft": SURFACE_SOFT,
    "hairline": HAIRLINE,
    "hairline_soft": HAIRLINE_SOFT,
    "ink_deep": INK_DEEP,
    "ink": INK,
    "charcoal": CHARCOAL,
    "slate": SLATE,
    "steel": STEEL,
    "stone": STONE,
    "disabled_text": DISABLED_TEXT,
    "letter_spacing_body": LETTER_SPACING_BODY,
    # raios
    "radius_lg": RADIUS_LG,
    "radius_xl": RADIUS_XL,
    "radius_xxl": RADIUS_XXL,
    "radius_xxxl": RADIUS_XXXL,
    "radius_full": RADIUS_FULL,
    "box_shadow_panel": BOX_SHADOW_PANEL,
}
