# Architecture Decision Record — Sigma (Atendimento + CRM)

**Data:** 2026-06-05 · **Fase:** M1 (Auditoria, somente leitura) · **Status:** base oficial aprovada para revisão final
Complementa o [UNIFICATION_PLAN.md](UNIFICATION_PLAN.md). Nenhuma migration/código foi
escrito; este documento define o domínio **antes** de codar.

---

## 1. Achados da auditoria (estado real do Sigma)

Base: `SigmaAtendimento/apps/api` (Express + Prisma + Postgres/Supabase + Socket.io +
JWT) e `apps/web` (React + Vite + Tailwind + lucide-react).

### Backend
- Estrutura limpa: rotas por domínio (`auth, users, departments, whatsapp,
  conversations, contacts, tickets, inbox, reports`), `authMiddleware`, validação
  Zod, Prisma, Socket.io (`initSocket`).
- ✅ **Abstração de WhatsApp já existe**: `whatsapp/IWhatsAppProvider.ts` +
  `providers/MockWhatsAppProvider.ts` + `providers/MetaCloudWhatsAppProvider.ts`.
  (Falta um provider **WAHA** e a camada de **outbox/eventos**.)
- 🔴 **Multi-tenant NÃO é aplicado**: `tickets.routes.ts` monta o `where` só com
  query params — **sem `companyId`**. Risco de vazamento entre empresas.
- 🐞 **Bug**: `CreateTicketSchema` (Zod) aceita `priority: 'URGENT'`, mas o enum
  Prisma `TicketPriority` só tem `LOW | MEDIUM | HIGH`.

### Modelo de dados atual (Prisma)
- `Company` (tenant), `User`, `Department`, `Contact`, `Conversation`, `Message`,
  `Ticket`, `Settings`.
- `Ticket` **já tem** campos de serviço de campo: `onSiteRequired`, `visitAddress`,
  `visitWindowStart/End`, `technicianId`, `notesInternal`, `closedAt`.
- 🔴 **Sem `companyId`** em `Contact`, `Conversation`, `Message`, `Ticket`.
- ⚠️ Faltam: `Customer` (cliente B2B), `protocol`, CSAT/avaliação, timeline,
  outbox/eventos de WhatsApp, `channel`/`category` no Ticket.
- ⚠️ **Nomenclatura mista**: `Company/User/Department/Settings` em snake_case;
  `Contact/Conversation/Message/Ticket` em camelCase.
- `TicketStatus` = OPEN/IN_PROGRESS/RESOLVED/CANCELLED (menos estados que o desejado);
  `TicketPriority` sem `CRITICAL`.

### Frontend (apps/web) — mais pronto que o esperado
- Já há **design system**: `components/ui` (Button, Card, Input, PageContainer) e
  `components/sigma` (MetricCard, SettingsCard, SidebarIcon, Table, Topbar).
- Páginas: Inbox, Tickets, Users, Departments, Reports, Settings, Login, Privacy,
  Terms. Hooks de socket (`useInboxSocket`), timer, utils.
- ⚠️ **Faltam módulos de CRM**: página **Clientes**, **Dashboard** (há "Reports"),
  e visão dedicada de técnicos.

### Conclusão
O Sigma é uma base sólida e **já resolve** boa parte do roadmap (RBAC, tempo real,
provider de WhatsApp + mock, UI base). O trabalho real é: **(a) fechar a tenancy**,
**(b) acrescentar o domínio CRM**, **(c) outbox/WAHA + roteamento**, **(d) aplicar a
paleta trust-blue**.

---

## 2. Decisões (ADRs)

### ADR-01 — Base do produto
Sigma monorepo (`apps/api` + `apps/web`) é a base única. Streamlit e Next.js `web`
são **arquivados** (legado). O bridge `whatsapp-web.js` é descontinuado.

### ADR-02 — Multi-tenant obrigatório (crítico, desde o início)
- Adicionar `companyId` a **toda tabela de negócio**: `Customer, Contact,
  Conversation, Message, Ticket, TicketTimeline, TicketEvaluation, TicketFieldService,
  WhatsAppOutbox, WhatsAppInboundEvent` (além das que já têm).
- Impor por **código**: uma **Prisma Client Extension** (ou middleware) que injeta
  `where: { companyId }` por request, derivado do JWT.
- **RLS no Supabase** como defesa em profundidade — **faseada**:
  - **M2**: schema já nasce compatível (todas as tabelas com `companyId`); escrever as
    políticas RLS (sem necessariamente ativar em todas).
  - **M3**: garantir o escopo `companyId` no backend (Prisma Extension) e validar.
  - **M6**: endurecer, revisar e **ativar** RLS para produção.
- Regra inviolável: nenhuma query de negócio sem escopo de empresa.

### ADR-03 — Modelo de domínio final
**Criar/alterar agora (M2):**
- **`Customer`** (cliente B2B): `id, companyId, name, document(CNPJ/CPF), segment,
  city, status(ATIVO/NEGOCIACAO/INATIVO), notes, timestamps`.
- **`Contact`**: + `companyId`, + `customerId?` (pessoa/numero pertence a um cliente).
- **`Ticket`**: + `companyId`, + `customerId?`, + `protocol`, + `channel`
  (WHATSAPP/PHONE/EMAIL/...), + `category?`, + `dueAt?`, + `solvedAt?`; status com ciclo
  ampliado (ADR-04). Campos de campo migram para `TicketFieldService`.
- **`TicketFieldService`** (1:1 opcional, "execução técnica" — não só presencial):
  `ticketId, companyId, technicianId?, serviceType(REMOTO/PRESENCIAL/HIBRIDO),
  equipment?, scheduledAt?, startedAt?, finishedAt?, hoursSpent?, resolution?,
  visitAddress?, visitWindowStart?, visitWindowEnd?` (absorve os campos de visita
  atuais do Ticket). Em atendimento **remoto**, cria-se o registro com
  `serviceType=REMOTO` e sem campos de visita.
- **Responsabilidade (split):**
  - `Ticket.assignedUserId` = **atendente** responsável.
  - `Ticket.departmentId` = **fila/departamento**.
  - `TicketFieldService.technicianId` = **técnico** da execução (remota ou presencial).
  - → **remover `technicianId` do `Ticket`** (e mover a relação `TicketTechnician`).
- **`TicketEvaluation`** (1:1 opcional, CSAT): `ticketId, companyId, rating(1..5),
  comment?, createdAt`.
- **`TicketTimeline`** (1:N, auditoria): `ticketId, companyId, type(STATUS_CHANGE/
  ASSIGNMENT/NOTE/MESSAGE/...), actorUserId?, payload(Json), createdAt`. Cobre
  histórico de status **e reatribuições**.
- **`WhatsAppOutbox`** e **`WhatsAppInboundEvent`** (campos em ADR-06).
- **`Counter`** (geração de protocolo, ADR-07).
- **`User`**: + `specialty?` (técnico é um User; ADR-05/decisão confirmada).

**Adiar (quando houver uso):** `WhatsAppConnection` (1 por empresa — modelo "1
número"), `Attachment` (entra com mídia).

**NÃO criar (over-engineering):**
- ❌ `TicketProtocol` como tabela → `protocol` é **coluna** no Ticket + **counter**
  (ADR-07).
- ❌ `TicketAssignment` como tabela → usar as FKs do Ticket + histórico no
  `TicketTimeline`.

### ADR-04 — Ciclos de vida (máquina de estados, não só enum)
- **Ticket**: `NEW → QUEUED → IN_PROGRESS → WAITING_CUSTOMER → WAITING_INTERNAL →
  SCHEDULED_FIELD_SERVICE → RESOLVED → CLOSED` (+ `CANCELED`).
- **Conversation** (≠ Ticket): `OPEN → ASSIGNED → CLOSED`.
- **Priority**: `LOW | MEDIUM | HIGH | CRITICAL` (alinhar Zod **e** Prisma — corrige o
  bug do `URGENT`).
- Conversa = sessão de chat; Ticket = item de trabalho (ciclo próprio).

**Transições permitidas do Ticket** — validar no backend:

| De | Para (permitido) |
|---|---|
| NEW | QUEUED, IN_PROGRESS, CANCELED |
| QUEUED | IN_PROGRESS, CANCELED |
| IN_PROGRESS | WAITING_CUSTOMER, WAITING_INTERNAL, SCHEDULED_FIELD_SERVICE, RESOLVED, CANCELED |
| WAITING_CUSTOMER | IN_PROGRESS, RESOLVED, CANCELED |
| WAITING_INTERNAL | IN_PROGRESS, RESOLVED, CANCELED |
| SCHEDULED_FIELD_SERVICE | IN_PROGRESS, RESOLVED, CANCELED |
| RESOLVED | CLOSED, IN_PROGRESS *(reabertura)* |
| CLOSED | — *(terminal; reabrir só via ação ADMIN explícita → IN_PROGRESS)* |
| CANCELED | — *(terminal)* |

- Transições fora da tabela são rejeitadas (400). `RESOLVED→CLOSED` pode ser
  automático após X dias (config). Toda transição gera evento em `TicketTimeline`.

### ADR-05 — Padronização de nomenclatura
**camelCase** nos campos Prisma (padrão da ferramenta), com `@map`/`@@map` para
snake_case no banco se desejado. Renomear os campos snake_case legados
(`company_id`→`companyId`, `created_at`→`createdAt`...). Barato agora (sem dados reais).

### ADR-06 — WhatsApp (um número, vários departamentos)
- Reusar `IWhatsAppProvider`. Adicionar **`WahaWhatsAppProvider`** (dev) ao lado de
  Mock e Meta.
- Entrada: webhook → grava `WhatsAppInboundEvent` (idempotente) → normaliza →
  `Conversation`/`Message` → **roteamento por departamento** (menu/regra) → Socket.io.
- Saída: `Message(OUTBOUND)` → `WhatsAppOutbox` → provider → `SENT/FAILED/retry`.
- Manter **leve** (tabela + worker/cron); sem broker externo.

**Campos mínimos (já preparados p/ Meta Cloud / multi-número):**
- `WhatsAppInboundEvent`: `id, companyId, provider(WAHA/META/MOCK), providerMessageId,
  phoneNumberId?(nullable), fromPhone, rawPayload(Json), processedAt?, createdAt`.
  `providerMessageId` único por provider → **idempotência** (ignora replays do webhook).
- `WhatsAppOutbox`: `id, companyId, conversationId?, messageId?, provider,
  phoneNumberId?(nullable), toPhone, payload(Json), status(PENDING/SENT/FAILED),
  attempts(int, default 0), lastError?, providerMessageId?, createdAt, updatedAt`.
- `phoneNumberId` fica nulo no WAHA (1 número) e passa a ser usado no Meta Cloud /
  multi-número — sem migration dolorosa depois.

### ADR-07 — Protocolo
- Coluna **`Ticket.protocol`** (string), **única por empresa** (`@@unique([companyId,
  protocol])`).
- Formato **`ATD{YYYYMMDD}-{seq:03d}`** com **reset diário** — `seq` reinicia em 001 a
  cada dia, por empresa.
- Geração via **contador transacional** com tabela `Counter`:
  `Counter { companyId, scope, value, @@id([companyId, scope]) }`, onde `scope =
  "ATD-" + YYYYMMDD`. Incremento dentro de transação (upsert + `value+1`) para evitar
  corrida. Ex.: Empresa A em 05/06 → 001, 002…; em 06/06 → volta a 001.

### ADR-08 — Frontend
Reaproveitar `components/ui` + `components/sigma`; **aplicar o design system
trust-blue + Lucide** (tema Tailwind: primária `#2563EB`, superfícies slate, badges,
pills, Montserrat). Adicionar páginas **Clientes** e **Dashboard** (gráficos
tendência/ranking/CSAT). Tipos compartilhados em `@sigma/shared`.

### ADR-09 — Vertical slice antes de fan-out
Após o schema, validar **um fluxo ponta-a-ponta** antes de construir todo o CRUD.

**Fluxo do slice:** criar `Customer` → criar `Contact` → criar `Ticket` (com
`protocol` gerado) → atribuir atendente → mudar status respeitando a máquina de
estados → registrar `TicketFieldService` (execução) → `RESOLVED` → registrar
`TicketEvaluation` (CSAT) → aparecer no dashboard.

**Critério de aceite:**
1. Todas as operações **escopadas por `companyId`** (um usuário da Empresa A nunca vê
   dados da Empresa B — testar com 2 empresas no seed).
2. **Protocolo** gerado correto e com reset diário (sem colisão sob concorrência).
3. **Transições inválidas** de status são **rejeitadas** (ex.: `CLOSED→IN_PROGRESS`
   sem ação admin).
4. Cada mudança relevante gera registro em **`TicketTimeline`**.
5. **CSAT** (1–5) persiste e o **dashboard** reflete o ticket (contagem + CSAT médio).
6. Tudo coberto por ao menos **1 teste de integração** do fluxo.

### ADR-10 — Higiene de repositório
- Sigma como raiz do produto; **arquivar** `frontend/streamlit` e `frontend/web`.
- **Remover ~700 skills do versionamento do produto** (`.agent`/gitignore).
- Segredos em `apps/api/.env` (DATABASE_URL, tokens) fora do git.

---

## 3. Bugs/inconsistências a corrigir no M2
- `TicketPriority`: alinhar Zod (`URGENT`) ↔ Prisma → padronizar em
  `LOW/MEDIUM/HIGH/CRITICAL`.
- Tenancy ausente nas rotas (`tickets.routes.ts` e provavelmente
  `contacts/conversations/inbox`) — aplicar escopo via extension.
- Nomenclatura snake vs camel.

---

## 4. Milestones revisados (refletindo o que já existe)

| Fase | Escopo | Observação vs auditoria |
|---|---|---|
| **M0** | Higiene de repo (ADR-10) | inalterado |
| **M1** | Auditoria + este ADR | ✅ concluído |
| **M2** | Schema convergente + seed (ADR-02..07) + corrigir bugs | enxugar Ticket (extrair FieldService); tenancy + políticas RLS desde já |
| **M3** | Backend: CRUD Clientes/Técnicos/Tickets, status (máquina), atribuição, protocolo, CSAT, dashboard + **vertical slice** + validar escopo `companyId` | provider/mock já existem |
| **M4** | Frontend: aplicar paleta + páginas **Clientes** e **Dashboard** (Inbox/Tickets/Users/Depts já existem) | menos trabalho que o previsto |
| **M5** | WhatsApp real: `WahaWhatsAppProvider`, inbound raw, outbox, roteamento por depto | interface já pronta |
| **M6** | Produção: **ativar RLS**, RBAC fino, LGPD, deploy, monitoramento, Meta Cloud | — |

---

## 5. Decisões — confirmadas e em aberto

**Confirmadas (2026-06-05):**
1. ✅ **Nomenclatura**: **camelCase** (com `@map`/`@@map` p/ snake no banco se preciso).
2. ✅ **Serviço de campo**: **extrair** para **`TicketFieldService`** (1:1 opcional).
3. ✅ **Técnico**: é um **`User`** com **`specialty`** (sem entidade `Technician`).

**Em aberto (menor, decidir no M5):**
4. **Multi-número futuro**: hoje "1 número + departamentos"; `WhatsAppConnection`
   fica preparado para multi-número por empresa depois.

---

## 6. Pré-requisitos fechados para liberar o M2 (revisão 2026-06-05)

Condições levantadas na revisão, todas resolvidas neste ADR:

1. ✅ **Contador de protocolo**: `ATD{YYYYMMDD}-{seq:03d}`, **reset diário**, contador
   transacional por `companyId + dia` (`Counter`) — ADR-07.
2. ✅ **Transições de status**: máquina de estados com tabela de transições permitidas,
   validada no backend; transição inválida → 400 — ADR-04.
3. ✅ **Estratégia de `companyId`**: `companyId` em todas as tabelas + **Prisma
   Extension** por request; RLS faseada (M2 escreve, M6 ativa) — ADR-02.
4. ✅ **`technicianId`**: vai para **`TicketFieldService`**; `Ticket` mantém
   `assignedUserId` (atendente) e `departmentId` (fila) — ADR-03.
5. ✅ **Campos mínimos** de `WhatsAppOutbox`/`WhatsAppInboundEvent` com `provider`,
   `providerMessageId` (idempotência) e `phoneNumberId?` (futuro) — ADR-06.
6. ✅ **Critério de aceite do vertical slice** definido — ADR-09.

**Escopo do M2:** schema convergente (camelCase, `Customer`, `TicketFieldService`,
`TicketEvaluation`, `TicketTimeline`, `Counter`, `WhatsAppOutbox`,
`WhatsAppInboundEvent`, `companyId` em tudo, `User.specialty`, enums de status/priority
novos) + **seed com 2 empresas** (p/ testar tenancy) + correção do bug de prioridade +
políticas RLS escritas (ativadas no M6).

> **→ M2 liberado mediante seu OK.** Próximo passo sugerido: M0 (higiene) seguido do M2
> (schema + seed + correções). Nada de código até a aprovação.
