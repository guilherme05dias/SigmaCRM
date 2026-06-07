# Sigma — Resumo de Execução, Decisões e Próximos Passos

**Atualizado:** 2026-06-07
Documento-guia (handoff) que explica **tudo o que foi feito**, **por que foi feito
assim** e **qual o próximo passo**. Para detalhes, ver os documentos referenciados.

Mapa de documentos:
[UNIFICATION_PLAN.md](UNIFICATION_PLAN.md) ·
[ARCHITECTURE_DECISIONS.md](ARCHITECTURE_DECISIONS.md) ·
[M2_NOTES.md](M2_NOTES.md) · [M3_NOTES.md](M3_NOTES.md) · [M4_NOTES.md](M4_NOTES.md) ·
[TEST_USERS.md](TEST_USERS.md) · [PRD.md](PRD.md) · [ROADMAP.md](ROADMAP.md)

> **Nota de atualização:** este resumo preserva histórico da migração, mas o estado
> operacional atual é o dos commits `80a2780`, `cf4de3c`, `42aa106` e correções de
> 2026-06-07. Senhas usam `bcryptjs` com migração preguiçosa, socket broadcast é isolado
> por empresa, WhatsApp tem outbox/idempotência preparada, LGPD tem rota + UI, e C7
> adicionou toasts/skeletons/empty states. Pendências reais: teste WhatsApp com celular,
> aplicar/validar RLS no Supabase, deploy público e validação mobile/manual.

---

## 1. Visão geral

O projeto começou como um **CRM de atendimentos técnicos em Streamlit**
(`frontend/streamlit`, ex `crm-tecnicos-app`) sobre Supabase. Ao longo do trabalho:
1. Analisei e documentei o CRM.
2. Refiz o design (visual profissional).
3. Descobri, ao adicionar a pasta **`SigmaAtendimento`**, uma **plataforma de
   atendimento omnichannel** muito mais avançada (Node/TS + React + Prisma + Socket.io).
4. Decidimos **unificar tudo em um único produto** (canal de atendimento + CRM) usando
   o **Sigma como base**.
5. Comecei a execução da unificação (higiene + schema + backend).

---

## 2. Linha do tempo (o que foi feito)

### Fase A — Análise e documentação do CRM
- Mapeei a arquitetura (UI → backend → services → repositories, Supabase).
- Criei **[PRD.md](PRD.md)** e **[ROADMAP.md](ROADMAP.md)** (tela a tela).
- Identifiquei dívidas: doc desatualizada, Pydantic v1, datas como TEXT, sem testes,
  WhatsApp via bridge não-oficial, sem multi-tenant.

### Fase B — Redesign visual (no app Streamlit)
- `design_system.py` + `ui.py`: paleta, tipografia, botões, sidebar, métricas.
- Evoluiu de "Meta" (cobalto/preto) para **SaaS trust-blue** (`#2563EB`) após uso da
  skill **ui-ux-pro-max**, com correção de **acessibilidade** (CTA azul, não laranja —
  contraste).
- Ícones **Lucide** (substituindo emojis), **badges** de status/prioridade, **gráficos**
  (Plotly) no dashboard e "Resumo por período".
- Preview sem banco (`preview_design.py`) para validar o visual.

### Fase C — Tooling de agentes
- **[ANTIGRAVITY_SETUP.md](../frontend/streamlit/ANTIGRAVITY_SETUP.md)** e prompts para
  executores (skills/MCP/rules).

### Fase D — Descoberta da SigmaAtendimento e decisão
- A `SigmaAtendimento` contém: (a) **app real** (`apps/api` Express+Prisma+Socket.io+JWT;
  `apps/web` React+Vite+Tailwind+lucide-react) e (b) **~700 skills** (tooling, não-produto).
- O Sigma já tinha o "trabalho difícil" do roadmap: **multi-tenant (Company), RBAC,
  departamentos, tempo real, abstração de WhatsApp (provider + mock)**.
- Decisão (sua): **unificar em um só produto, Sigma como base**, trazendo o CRM
  (clientes B2B, técnico/serviço de campo, protocolo, CSAT, dashboard).

### Fase E — Planejamento
- **[UNIFICATION_PLAN.md](UNIFICATION_PLAN.md)** (as-is/to-be, fases M0–M6).
- **[ARCHITECTURE_DECISIONS.md](ARCHITECTURE_DECISIONS.md)** (auditoria do código real +
  10 ADRs), revisado e endurecido (RLS faseada, máquina de estados, contador de
  protocolo, etc.).

### Fase F — Execução (M0 + M2 + M3 backend + M4 frontend inicial)
Resumo na seção 4.

---

## 3. Decisões-chave e o porquê

| Decisão | Por que assim |
|---|---|
| **Sigma como base** (não Streamlit nem Next) | Já tinha multi-tenant, RBAC, realtime e provider de WhatsApp — menos retrabalho; Streamlit é limitado para SaaS. |
| **`Customer` separado de `Company`** | `Company` = tenant (quem usa o SaaS); `Customer` = empresa atendida (B2B). Misturar geraria confusão. |
| **Técnico = `User` + `specialty`** | Reusa auth/RBAC e a relação existente; evita duplicar gestão de pessoas. |
| **`TicketFieldService` (1:1) em vez de inchar o Ticket** | Campos de execução/visita só valem para parte dos tickets; mantém o Ticket enxuto e escalável. |
| **Protocolo = coluna + `Counter` (reset diário)** | Tabela por protocolo seria over-engineering; contador transacional por empresa+dia evita corrida e o número fica legível (`ATD20260605-001`). |
| **Máquina de estados validada no backend** | Sem transições válidas, dashboard/relatórios ficam inconsistentes; bloqueia fluxos sem sentido (ex.: CLOSED→IN_PROGRESS). |
| **NÃO criar `TicketProtocol`/`TicketAssignment` como tabelas** | Over-engineering; protocolo é coluna e atribuição usa FKs + `TicketTimeline`. |
| **`companyId` em tudo + escopo por código** | Multi-tenant é crítico desde o início; corrigir depois é caro/perigoso. RLS faseada (escreve no M2, ativa no M6). |
| **camelCase** | Padrão idiomático do Prisma/TS; elimina a mistura snake/camel que existia. |
| **WhatsApp: outbox + evento bruto + provider abstrato** | Evita perda de mensagem em falha; idempotência no webhook; troca WAHA→Meta sem dor. |
| **Senha com `bcryptjs` + migração preguiçosa** | Logins legados continuam funcionando e são re-hasheados no próximo login; novos usuários/seed gravam hash. |
| **Vertical slice antes de fan-out** | Provar um fluxo ponta-a-ponta (com 2 empresas) antes de construir todo o CRUD; evita arquitetura astronáutica. |
| **Build/typecheck validados continuamente** | `prisma validate`, `npm run typecheck` e `npm run build` passaram localmente após C7 e correções de tenant. Migration/seed no Supabase seguem pendentes de ambiente. |

---

## 4. O que foi executado (M0 + M2 + M3 + M4 inicial)

### M0 — Higiene
- `SigmaAtendimento/.gitignore`: tira skills/tooling/`node_modules`/`.env`/`dist` do
  versionamento do produto.

### M2 — Schema + Seed
- `apps/api/prisma/schema.prisma` — **reescrito**: camelCase, `companyId` em toda
  tabela de negócio, enums novos (status/priority/canal/serviço), e modelos novos:
  `Customer`, `TicketFieldService`, `TicketEvaluation`, `TicketTimeline`, `Counter`,
  `WhatsAppInboundEvent`, `WhatsAppOutbox`; `User.specialty`.
- `apps/api/src/scripts/seed.ts` — **2 empresas** (teste de tenancy) + vertical slice
  (cliente → contato → conversa → ticket com protocolo → field service → timeline) +
  usuários padrão por perfil. Ver [TEST_USERS.md](TEST_USERS.md).

### M3 — Backend reconciliado
- **Núcleos**: `lib/tenant.ts`, `services/protocol.service.ts`, `services/ticketStatus.ts`.
- **JWT** passa a incluir `companyId`.
- Login bloqueia usuário inativo (`active=false`) com `403`.
- Rotas com tenancy + camelCase + enums novos: `auth, users, departments, contacts,
  customers (CRUD escopado por empresa + contatos/tickets recentes),
  tickets (reescrito: protocolo/transições/field service/CSAT), inbox, conversations,
  whatsapp, reports (+CSAT médio)`.
- Varredura final por identificadores antigos: **limpa**.

> Detalhes e comandos: [M2_NOTES.md](M2_NOTES.md) e [M3_NOTES.md](M3_NOTES.md).

### M4 — Frontend unificado inicial
- `apps/web/src/lib/api.ts` — camada central de API com `Authorization`.
- Dashboard em `/`, consumindo `/api/reports/summary`.
- Clientes em `/customers`, consumindo `/api/customers` com busca, filtro, criação,
  edição e inativação.
- Inbox movido para `/inbox`; navegação atualizada no topo/sidebar.
- `Users`, `Departments` e `Tickets` ajustados para token e contrato camelCase/status
  novo do backend.

> Detalhes e comandos: [M4_NOTES.md](M4_NOTES.md).

---

## 5. Estado atual

- **Backend**: domínio unificado (CRM + atendimento), multi-tenant, protocolo, máquina
  de estados, CSAT, hash de senha, socket por empresa, outbox/idempotência WhatsApp,
  LGPD e RLS SQL preparado. Em 2026-06-07, passaram `prisma validate`, `npm run typecheck`
  e `npm run build`.
- **WhatsApp**: provider `murilo-api` preparado; conexão, QR Code, sync de histórico,
  outbox/retry e webhook idempotente estão em código. Falta teste real com celular
  autenticando a sessão e validando entrada/saída ponta-a-ponta.
- **Frontend (`apps/web`)**: Dashboard, Inbox, Clientes, Tickets, Usuários,
  Departamentos, Relatórios e Settings integrados; C7 adicionou toasts, skeletons,
  empty states e acessibilidade básica. Falta validação visual/mobile manual.
- **Pendências externas**: aplicar migrations no banco real/Supabase, validar RLS com
  role sujeita a policy, configurar deploy público, domínio/CORS/webhook HTTPS e testar
  WhatsApp real.

---

## 6. Próximo passo

### Imediato
1. Aplicar migrations em banco local/staging.
2. Subir API/Web e validar login.
3. Conectar WhatsApp com celular real e testar: inbound → fila, boas-vindas, resposta
   pela Inbox → chegada no celular.
4. Validar RLS no Supabase com role sujeita às policies.

### Depois
- Deploy público com variáveis reais, CORS restrito e webhook HTTPS.
- Política de retenção automática/configurável.
- Validação mobile/manual e navegação por teclado profunda.

---

## 7. Arquivos criados/alterados (principais)

**Documentação (`docs/`)**: `EXECUTION_SUMMARY.md` (este), `UNIFICATION_PLAN.md`,
`ARCHITECTURE_DECISIONS.md`, `M2_NOTES.md`, `M3_NOTES.md`, `M4_NOTES.md`,
`TEST_USERS.md`, `PRD.md`, `ROADMAP.md`.

**Backend (`SigmaAtendimento/apps/api`)**: `prisma/schema.prisma`, `src/scripts/seed.ts`,
`src/scripts/create-admin.ts`, `src/lib/tenant.ts`, `src/services/protocol.service.ts`,
`src/services/ticketStatus.ts`, `src/middlewares/auth.middleware.ts`,
`src/services/businessHoursService.ts`, e `src/routes/*` (auth, users, departments,
contacts, customers, tickets, inbox, conversations, whatsapp, reports).
  Também foram ajustados `apps/web/tsconfig.json` e `apps/web/vite.config.ts` para
  resolver `@sigma/shared` corretamente no typecheck/build. A migration
  `20260605000100_unify_crm_atendimento` foi criada e aplicada.

**Higiene**: `SigmaAtendimento/.gitignore`.

**Legado (a arquivar)**: `frontend/streamlit` (CRM Streamlit redesenhado),
`frontend/web` (Next.js scaffold), `backend/whatsapp-bridge` (bridge não-oficial).
