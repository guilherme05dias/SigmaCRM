# Plano de Unificação — "Sigma" (Atendimento + CRM)

**Data:** 2026-06-04 · **Status:** proposta (aguardando aprovação) · **Modo:** sem
modificações no código até OK do responsável.

Objetivo: unir o CRM (Streamlit) e a plataforma **Sigma Atendimento** em **um
único produto SaaS** — canal de atendimento omnichannel (WhatsApp) **+** CRM B2B —
usando o **Sigma como base** (Express API + React/Vite).

Decisões já tomadas:
- **Base técnica:** Sigma (Express API + React/Vite).
- **Recursos do CRM a incluir:** Clientes/empresas (B2B); Técnicos + serviço de
  campo; Protocolo + CSAT; Dashboard/Relatórios.
- **Dados atuais:** não há dados reais → **começar limpo** (schema novo + seed).
- **WhatsApp:** **um número, vários departamentos** (roteamento por fila/depto).

> **Atualização 2026-06-05 (pós-auditoria M1).** Detalhes e decisões finais em
> [ARCHITECTURE_DECISIONS.md](ARCHITECTURE_DECISIONS.md). Principais ajustes após ler
> o código real do Sigma:
> - ✅ **Provider de WhatsApp + Mock já existem** (`IWhatsAppProvider`, `MockWhatsAppProvider`,
>   `MetaCloudWhatsAppProvider`) — falta um provider **WAHA** e a camada de **outbox/eventos**.
> - ✅ **Frontend já tem UI base** e as telas de atendimento (Inbox/Tickets/Users/Departments/
>   Reports/Settings). Faltam **Clientes** e **Dashboard** + aplicar a paleta trust-blue.
> - 🔴 **Multi-tenant não está aplicado** (sem `companyId` em Contact/Conversation/Message/Ticket
>   nem escopo nas queries) → tratar como crítico no M2 (Prisma extension + RLS).
> - ✂️ **Poda de over-engineering:** `protocol` vira **coluna** (+counter), não tabela; nada de
>   `TicketAssignment` (usar FKs + `TicketTimeline`). Mantidos `TicketFieldService`,
>   `TicketEvaluation`, `TicketTimeline`, `WhatsAppOutbox`.
> - 🐞 Corrigir bug de prioridade (`URGENT` no Zod ✗ enum Prisma) e padronizar nomenclatura.

---

## 1. Como está hoje (as-is)

O workspace virou um monorepo reorganizado e recebeu a `SigmaAtendimento`. Há
**três frontends e dois "produtos"** sobrepostos:

| Local | O que é | Stack | Estado |
|---|---|---|---|
| `frontend/streamlit/` | CRM atual (ex `crm-tecnicos-app`) | Streamlit + Supabase | funcional, com design trust-blue/Lucide |
| `frontend/web/` | "servicocrm-web" | Next.js + Supabase | scaffold inicial |
| `backend/whatsapp-bridge/` | captura WhatsApp | Node + whatsapp-web.js | frágil, só leitura |
| `database/` | schema/migrations/seed | Supabase + SQLite | misto |
| `SigmaAtendimento/apps/api` | **plataforma de atendimento** | Express + Prisma + Supabase + Socket.io + JWT | **base** |
| `SigmaAtendimento/apps/web` | painel do atendente | React + Vite + Tailwind + lucide-react | **base** |
| `SigmaAtendimento/.agent` + `antigravity-awesome-skills-main` | ~700 skills | — | **tooling, não-produto** |

**Conclusão:** duplicação de "atendimento + WhatsApp + clientes" em stacks
diferentes. O **Sigma** é o mais avançado (multi-tenant, RBAC/JWT, tempo real,
abstração de WhatsApp) e será a base.

## 2. Como vai ficar (to-be)

**Um único produto SaaS** sobre a base do **Sigma**. Streamlit e Next.js `web`
viram **legado/arquivados**; o bridge `whatsapp-web.js` é **substituído** pelo
provider do Sigma (WAHA → Meta Cloud).

### Stack alvo
- **Backend:** `apps/api` — Express + Prisma + **PostgreSQL (Supabase)** + Socket.io + JWT.
- **Frontend:** `apps/web` — React + Vite + **Tailwind + lucide-react** → onde
  aplico o **design system trust-blue + Lucide** já construído (mapeia direto p/ Tailwind).
- **WhatsApp:** `IWhatsAppProvider` — WAHA (dev) → Meta Cloud (prod), **um número
  com roteamento por departamento**.
- **Multi-tenant:** `Company` = empresa operadora (tenant); isolamento por
  `company_id` (+ RLS quando aplicável).

## 3. Modelo de dados unificado (Prisma)

O Sigma já tem: `Company` (tenant), `User` (role ADMIN/SUPERVISOR/AGENT +
department), `Department`, `Contact`, `Conversation`, `Message`, `Ticket`
(priority/status/assignee/technician/department + "field specifics" **(a
confirmar)**), `Settings` **(a confirmar)**.

**Mapeamento CRM → Sigma + o que adicionar:**

| Conceito do CRM | Destino no Sigma | Ação |
|---|---|---|
| `clients` (empresa, segmento, cidade, status) | **novo `Customer`** (empresa atendida) 1—* `Contact` | criar model `Customer`; ligar `Contact.customerId`, `Ticket.customerId` |
| `technicians` (especialidade) | `User` (papel técnico) | add `User.specialty`; usar relação `TicketTechnician` existente |
| `attendances` (protocolo, canal, modalidade, equipamento, categoria, próxima ação, resolução, horas, CSAT, prazo, solved_at) | `Ticket` | estender `Ticket` **(checar os já existentes em "field specifics")** |
| dashboard/relatórios | `reports.routes` + novas métricas | add agregações (tendência, ranking, CSAT, por técnico) |

> **Distinção-chave:** `Company` = tenant (quem usa o SaaS); `Customer` = cliente
> B2B atendido. São diferentes — por isso o model novo `Customer`, em vez de
> sobrecarregar `Company`/`Contact`.

**Dados:** começamos limpo (schema novo + `prisma:seed`). Sem migração.

## 4. Frontend unificado (apps/web)

- **Design system:** converter os tokens (trust-blue `#2563EB`, superfícies slate,
  badges, pills, Montserrat) em **tema Tailwind** + componentes base (Button pill,
  Badge, Card, Sidebar com Lucide). Reaproveita as decisões da skill `ui-ux-pro-max`.
- **Páginas:** Inbox (tempo real) · Tickets · **Clientes (CRM)** ·
  **Técnicos/Usuários** · Departamentos · **Dashboard/Relatórios** · Configurações.

## 5. WhatsApp (um número, vários departamentos)

- WAHA via Docker em dev (webhook → `apps/api`); trocável por Meta Cloud pelo mesmo
  `IWhatsAppProvider`.
- Entrada: mensagem nova → cria/atualiza `Conversation` → **roteamento por
  departamento** (menu/regra) → fila do depto → atendente assume.
- Saída: enviar pela Inbox; `Message.direction = OUTBOUND`.

## 6. Fases (milestones)

| Fase | Escopo | Critério de pronto |
|---|---|---|
| **M0 – Higiene/repo** | Definir Sigma como raiz do produto; arquivar `frontend/streamlit` e `frontend/web`; **remover skills do repo do produto** (→ `.agent`/gitignore); padronizar `.env`/secrets | repo limpo, 1 produto, skills fora do versionamento |
| **M1 – Schema convergente** | Estender Prisma (`Customer`, `User.specialty`, campos CRM no `Ticket`), migrations, seed | `prisma migrate` + `seed` rodando; schema cobre CRM+atendimento |
| **M2 – Design system no React** | Tema Tailwind trust-blue + componentes base (Button/Badge/Card/Sidebar Lucide) | telas base com o visual aprovado |
| **M3 – Módulos CRM** | Clientes, Técnicos, serviço de campo no Ticket, **protocolo + CSAT** | CRUD + protocolo automático + avaliação |
| **M4 – Dashboard/Relatórios** | Métricas, gráficos (tendência/ranking), CSAT, por técnico/depto | dashboard com dados do seed |
| **M5 – WhatsApp** | Provider WAHA, número único + roteamento por depto, inbox in/out tempo real | conversa real ponta-a-ponta |
| **M6 – Multi-tenant/Auth + deploy** | Isolamento por `company_id`, polish RBAC, deploy (Railway/Render + Supabase) | app no ar, multiusuário |

## 7. Riscos / decisões pendentes

- **(a confirmar)** campos já existentes em `Ticket` ("field specifics") e o model
  `Settings` — para não duplicar (ler antes do M1).
- **Convergência de 3 frontends:** Streamlit e Next.js `web` aposentados (arquivados, não apagados).
- **Skills no repo:** ~700 skills incham o produto; tirar do versionamento.
- **Segredos:** `apps/api/.env` (DATABASE_URL Supabase, WAHA token) fora do git.
- **WAHA é não-oficial:** ok para dev; produção = Meta Cloud (mesmo provider).

## 8. Próximo passo

Ao aprovar: começar por **M0 + M1** (higiene de repo + schema convergente) e,
**antes de qualquer migration**, ler os trechos `(a confirmar)` (resto do `Ticket`,
`Settings`, `reports.routes`, páginas do `apps/web`) para alinhar ao que já existe.

> Documentos relacionados: [PRD.md](PRD.md), [ROADMAP.md](ROADMAP.md),
> [ANTIGRAVITY_SETUP.md](../frontend/streamlit/ANTIGRAVITY_SETUP.md).
