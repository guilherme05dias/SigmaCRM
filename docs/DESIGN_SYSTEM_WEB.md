# Design System — `apps/web` (React + Vite + Tailwind) · trust-blue

**Data:** 2026-06-05 · Stack: React 18 + Vite + Tailwind 3 + lucide-react / Material Symbols
**Base de decisão:** [ARCHITECTURE_DECISIONS.md](ARCHITECTURE_DECISIONS.md) ·
[UNIFICATION_PLAN.md](UNIFICATION_PLAN.md) (milestone "M2 – Design system no React")

> Este é o design system **vivo do produto** (Sigma React). O antigo
> [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md) e [DESIGN-meta.md](DESIGN-meta.md) descrevem o
> visual do **Streamlit legado** (a aposentar) — não usar como referência aqui.

Aplicado com apoio da skill **ui-ux-pro-max** (paleta SaaS B2B, contraste AA, anti-emoji)
e organizado no fluxo **GSD** (ondas reviewáveis, app sempre compilável).

---

## 1. Por que essa onda existiu (achado)

O `apps/web` estava **inteiramente no tema escuro antigo** (laranja `#FF6600`, ciano,
fundos `#101622`, fontes Space Grotesk/Public Sans) — a paleta trust-blue **nunca tinha
sido aplicada no React** (só no Streamlit). São ~209 usos de tokens escuros e **94 usos de
`text-white`** em 19 arquivos. Converter tudo de uma vez seria um diff gigante e
arriscado, então dividimos em ondas.

---

## 2. Tokens (fonte da verdade: `tailwind.config.mjs`)

| Papel | Token Tailwind | Valor |
|---|---|---|
| Marca (CTA, links, ativo) | `primary` (+ escala 50–900) | `#2563EB` (blue-600) |
| Fundo do app | `bg-background` | `#F8FAFC` (slate-50) |
| Cartões / topbar / sidebar | `bg-surface` | `#FFFFFF` |
| Zona alternada / hover sutil | `bg-surface-alt` | `#F1F5F9` (slate-100) |
| Texto principal | `text-foreground` | `#0F172A` (slate-900) |
| Texto secundário (AA) | `text-muted-foreground` | `#475569` (slate-600) |
| Borda | `border-border` | `#E2E8F0` (slate-200) |
| Status | `success` / `warning` / `danger` / `info` (+ `-soft` / `-fg`) | verde/âmbar/vermelho/azul |

- **Tipografia:** `font-display` = **Montserrat** (títulos), `font-sans` = **Inter** (corpo).
- **Raio "pill":** `rounded-pill` / `rounded-cta` = `9999px` (botões e badges).
- **Sombras claras:** `shadow-card`, `shadow-premium`, `shadow-lifted`, `shadow-primary-glow`.
- **Aliases legados** (`app`, `surface-alt`, `elevated`, `secondary`, `sigma-cyan`,
  `sigma-dark`, `font-display`...) foram **remapeados para valores claros** para que as
  telas ainda não migradas (Wave 2) **não quebrem o build** — degradam, não explodem.

Base global em `src/index.css`: body claro, headings Montserrat, **foco visível**
(`ring-primary/40`), scrollbar discreta, `prefers-reduced-motion`.

---

## 3. Kit de componentes base (`src/components/ui/`)

| Componente | Destaques |
|---|---|
| `Button` | **pill** trust-blue; variantes `primary/secondary/outline/ghost/danger`; `size` `sm/md/lg/icon`; prop **`loading`** (spinner + disabled); foco/cursor/altura ≥44px. |
| `Card` (+ `CardHeader/Title/Description/Content`) | superfície clara, `border-border`, `shadow-card`. |
| `Input` | claro; props opcionais **`label`** + **`error`** (com `htmlFor`/`aria-invalid`/`aria-describedby`). |
| `Badge` (+ `StatusBadge` / `PriorityBadge`) | pílulas "soft" AA. **Mapeiam os enums reais** do Ticket (status: `NEW…CANCELED`; prioridade: `LOW/MEDIUM/HIGH/CRITICAL`) com rótulos PT-BR. |

Shell convertido para claro: `SigmaTopbar`, `SigmaSidebarIcon`, `LoadingScreen` (App.tsx).

✅ `npm run build` (`tsc && vite build`) passa após a Wave 1.

---

## 4. Migração das páginas

> **Status (2026-06-05): migração completa ✅.** Todo o `apps/web` está em trust-blue
> claro. Build final: CSS **27,4 kB** (era 34 kB antes da purga das utilities escuras).
> Varredura final: os únicos `text-white` restantes são legítimos (sobre `bg-primary`,
> badges coloridos, botão `danger`) + o verde oficial do WhatsApp `#25D366`.

Padrão de substituição usado (referência para telas novas):

| De (escuro) | Para (claro) |
|---|---|
| `text-white` (texto de conteúdo) | `text-foreground` |
| `text-slate-300/400` | `text-muted-foreground` |
| `bg-sigma-dark` / `bg-[#1E272E]` | `bg-surface` |
| `bg-elevated` (inputs) | `bg-surface` + `border-border` |
| `border-white/10` / `border-white/5` | `border-border` |
| pílulas de status/prioridade manuais | `<StatusBadge>` / `<PriorityBadge>` |
| botões `<button>` cru | `<Button variant=…>` |

> ⚠️ `text-white` **continua correto** sobre `bg-primary` e dentro de badges coloridos —
> não trocar nesses casos.

**Telas migradas (todas ✅):**
- **Wave 2** — Dashboard, Customers (com `Button`), Tickets (com `StatusBadge`/
  `PriorityBadge`, removido `getStatusColor`), `SigmaMetricCard`, `SigmaTable`.
- **Wave 3** — Inbox (`ChatWindow` com bolhas claras, `ConversationList`,
  `ContactSidebar`), Users, Departments, Reports, Settings (+ `SigmaSettingsCard`),
  Login, PrivacyPolicy, TermsOfService.

> Build validado após cada onda: `npm run build` (`tsc && vite build`) ✅.

### Dívidas quitadas (2026-06-05)
- ✅ `SigmaMetricCard` — `colorClass` agora mapeia para **classes estáticas** (`toneClass`),
  então o Tailwind gera os fundos coloridos dos ícones (antes eram classes dinâmicas
  purgadas).
- ✅ **Ícones migrados para lucide-react.** Criado o registro central
  [`components/ui/Icon.tsx`](../SigmaAtendimento/apps/web/src/components/ui/Icon.tsx):
  `<Icon name="..." />` mapeia ~40 nomes legados → componentes Lucide. **Material Symbols
  removido por completo** (link da fonte no `index.html` e regra `.material-symbols-outlined`
  no `index.css`). Telas novas devem usar `<Icon>`; para adicionar um ícone, registre o
  par nome→componente em `Icon.tsx`. Custo: +4 KB gzip no JS (ícones tree-shaken).

### Pré-entrega (checklist ui-ux-pro-max)
- [ ] Sem emoji como ícone (Lucide/Material Symbols SVG)
- [ ] `cursor-pointer` em tudo clicável; hover com transição 150–300ms
- [ ] Contraste de texto ≥ 4.5:1 no claro
- [ ] Foco visível no teclado
- [ ] Responsivo em 375 / 768 / 1024 / 1440px
- [ ] `prefers-reduced-motion` respeitado (já global no `index.css`)
