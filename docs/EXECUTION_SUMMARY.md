# Sigma — Resumo de Execução, Decisões e Próximos Passos

**Atualizado:** 2026-06-05
Documento-guia (handoff) que explica **tudo o que foi feito**, **por que foi feito
assim** e **qual o próximo passo**. Para detalhes, ver os documentos referenciados.

Mapa de documentos:
[UNIFICATION_PLAN.md](UNIFICATION_PLAN.md) ·
[ARCHITECTURE_DECISIONS.md](ARCHITECTURE_DECISIONS.md) ·
[M2_NOTES.md](M2_NOTES.md) · [M3_NOTES.md](M3_NOTES.md) · [M4_NOTES.md](M4_NOTES.md) ·
[TEST_USERS.md](TEST_USERS.md) · [PRD.md](PRD.md) · [ROADMAP.md](ROADMAP.md)

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
| **Senha em texto puro mantida (dev)** | Não quebrar o login atual; **dívida registrada** para virar hash no M6. |
| **Vertical slice antes de fan-out** | Provar um fluxo ponta-a-ponta (com 2 empresas) antes de construir todo o CRUD; evita arquitetura astronáutica. |
| **Build validado antes do M4** | Após corrigir versionamento e aliases do monorepo, `prisma validate`, `npm run typecheck` e `npm run build` passaram localmente. Migration/seed no Supabase seguem pendentes. |

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
  de estados e CSAT — **escrito, migrado e compilando**. Em 2026-06-05, passaram
  `prisma validate`, `prisma migrate deploy`, `prisma generate`, `npm run prisma:seed`,
  `npm run typecheck` e `npm run build`.
- **WhatsApp**: provider `murilo-api` adicionado para usar a cópia local de
  `murilo1of1/whatsapp-api` em envio de mensagens, sessão, QR Code escaneável e
  webhook de entrada via `client.on('message', ...)`. Falta teste real com celular
  autenticando a sessão.
- **Pendências não-bloqueantes**: auth do socket/conversations ainda usa token fake
  (dívida pré-existente); `companyId` opcional no fluxo realtime; senha em texto puro.
- **Frontend (`apps/web`)**: Dashboard e Clientes criados; navegação atualizada; telas
  críticas passaram a usar `Authorization`. Falta teste visual completo, QR Code
  WhatsApp no frontend e refinamento final de contratos compartilhados.

---

## 6. Próximo passo

### Imediato
1. Rodar a API localmente:
   ```powershell
   cd SigmaAtendimento\apps\api
   npm run dev
   ```
2. Testar login dev:
   - `admin@dragonbyte.com` / `123456`
   - `admin@acme.com` / `123456`
3. Validar o slice multi-tenant:
   - `GET /api/tickets` com token da DragonByte deve mostrar apenas dados da empresa A.
   - `GET /api/tickets` com token da Acme deve mostrar apenas dados da empresa B.

### Depois (eu, como comandante)
- **M4 (frontend unificado)**: testar visualmente com API/banco rodando, ligar QR Code
  WhatsApp no frontend e refinar contratos compartilhados em camelCase.
- **M5 (WhatsApp)**: testar sessão real com celular, persistir evento bruto em
  `WhatsAppInboundEvent` (idempotência), implementar `WhatsAppOutbox` (retry),
  roteamento por departamento, unificar auth do socket.
- **M6 (produção)**: ativar RLS, hash de senha (bcrypt/argon2), LGPD, deploy
  (Railway/Render + Supabase), monitoramento, Meta Cloud.

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
