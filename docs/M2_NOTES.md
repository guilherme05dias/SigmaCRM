# M2 — Schema convergente + Seed (notas de execução)

**Data:** 2026-06-05 · Base: [ARCHITECTURE_DECISIONS.md](ARCHITECTURE_DECISIONS.md)

O que foi entregue no M2 (somente arquivos; **migration ainda não aplicada** — depende
do seu banco):
- `SigmaAtendimento/apps/api/prisma/schema.prisma` — schema convergente (camelCase,
  `companyId` em tudo, `Customer`, `TicketFieldService`, `TicketEvaluation`,
  `TicketTimeline`, `Counter`, `WhatsAppOutbox`, `WhatsAppInboundEvent`, `User.specialty`,
  enums novos).
- `SigmaAtendimento/apps/api/src/scripts/seed.ts` — seed com **2 empresas** (teste de
  tenancy) + vertical slice (cliente → contato → conversa → ticket com protocolo →
  field service → timeline).
- `SigmaAtendimento/.gitignore` — exclui skills/tooling do versionamento (M0).

> Atualização 2026-06-05: `prisma format`, `prisma validate`, migration
> `20260605000100_unify_crm_atendimento`, `prisma generate` e seed passaram no
> Supabase configurado.

## 1. Pré-requisitos
`apps/api/.env` com a connection string do Supabase:
```
DATABASE_URL="postgresql://...pooler.supabase.com:6543/postgres?pgbouncer=true"
DIRECT_URL="postgresql://...supabase.com:5432/postgres"
```
(`directUrl` é necessário para o `migrate`.)

## 2. Validar e migrar
```powershell
cd SigmaAtendimento\apps\api
npx prisma format          # formata e checa sintaxe
npx prisma validate        # valida o schema (relações etc.)
npx prisma migrate deploy  # aplicou 20260605000100_unify_crm_atendimento
npx prisma generate
npm run prisma:seed
```
Como não há dados reais, pode ser `migrate reset` se preferir começar do zero.

## 3. ⚠️ Quebra de build esperada (reconciliar no M3)
O schema renomeou campos e enums; a API **não vai compilar** até o M3 atualizar o
código. Checklist do que mudou e onde corrigir:

### Renomes de campo (snake → camelCase)
| Antes | Agora | Afeta |
|---|---|---|
| `Company.nome` / `razao_social` | `name` / `legalName` | users/departments/seed/rotas |
| `User.nome` / `password_hash` / `company_id` / `department_id` | `name` / `passwordHash` / `companyId` / `departmentId` | `auth.routes`, `users.routes`, socket |
| `Department.nome` / `descricao` / `company_id` | `name` / `description` / `companyId` | `departments.routes` |
| `Settings.company_id` | `companyId` | `businessHoursService`, settings |

### Enums alterados
- `ConversationStatus`: `NEW/IN_PROGRESS` → **`OPEN/ASSIGNED`** (CLOSED mantém).
- `TicketStatus`: removido `OPEN`; agora `NEW/QUEUED/IN_PROGRESS/WAITING_CUSTOMER/
  WAITING_INTERNAL/SCHEDULED_FIELD_SERVICE/RESOLVED/CLOSED/CANCELED` (era `CANCELLED`).
- `TicketPriority`: + `CRITICAL`. **Corrigir o bug** em `tickets.routes.ts`
  (`CreateTicketSchema` usa `'URGENT'`) → trocar para `'CRITICAL'`.

### Ticket — campos movidos
- `Ticket.technicianId` e `visit*`/`onSiteRequired` **saíram do Ticket** → agora em
  **`TicketFieldService`**. As rotas de criar/editar ticket devem gravar esses dados
  no `TicketFieldService` (relação 1:1). Relação `TicketTechnician` agora aponta
  `TicketFieldService.technician`.
- Novos campos no Ticket: `protocol`, `customerId`, `channel`, `category`, `dueAt`,
  `solvedAt`, `companyId`.

### Multi-tenant (ADR-02)
- Todas as queries de negócio devem filtrar por `companyId` (vem do JWT). Implementar
  no M3 a **Prisma Client Extension** que injeta o escopo; hoje as rotas (ex.:
  `tickets.routes.ts`) **não filtram** — corrigir.

## 4. Próximos passos (M3 — backend)
1. **Prisma Extension de tenancy** (injeta `companyId`) + middleware lê do JWT.
2. **Gerador de protocolo** usando `Counter` (transação, reset diário) — ADR-07.
3. **Validador de transições** de status (máquina de estados) — ADR-04.
4. Reconciliar as rotas (lista acima) e ajustar o `socket.ts`.
5. **Vertical slice** + 1 teste de integração com 2 empresas (critério ADR-09).

## 5. Dívida registrada
- **Senhas em texto puro** no seed/login (dev). Migrar para hash (bcrypt/argon2) no
  M3/M6 junto com `auth.routes`.
- `Contact.phone` é `@unique` global; avaliar `@@unique([companyId, phone])` quando a
  tenancy estiver fechada.
