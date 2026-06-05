# M3 — Reconciliação do Backend (notas)

**Data:** 2026-06-05 · Base: [ARCHITECTURE_DECISIONS.md](ARCHITECTURE_DECISIONS.md) ·
Pré: [M2_NOTES.md](M2_NOTES.md)

> Atualização 2026-06-05: `npx prisma format`, `npx prisma validate`,
> `npx prisma migrate deploy`, `npx prisma generate`, `npm run prisma:seed`,
> `npm run typecheck` e `npm run build` foram executados e passaram.

## 1. Núcleos criados (ADR-02/04/07)
- `apps/api/src/lib/tenant.ts` — `getCompanyId(req)` / `companyScope(req)` (multi-tenant).
- `apps/api/src/services/protocol.service.ts` — `generateProtocol(companyId, tx)` com
  `Counter` (reset diário, transacional).
- `apps/api/src/services/ticketStatus.ts` — `TICKET_TRANSITIONS` + `assertTransition`
  (máquina de estados).

## 2. Arquivos reconciliados
- `middlewares/auth.middleware.ts` — `AuthPayload` agora tem `companyId`.
- `routes/auth.routes.ts` — `passwordHash`/`name`/`departmentId`; **JWT inclui companyId**.
- `routes/users.routes.ts`, `routes/departments.routes.ts` — `authMiddleware` + escopo
  por empresa + `active`.
- `routes/contacts.routes.ts` — `authMiddleware` + escopo + relação `customer` + POST.
- `routes/customers.routes.ts` — CRUD de clientes B2B com tenancy, validação via Zod,
  busca por nome/documento/segmento/cidade e detalhe com contatos/tickets recentes.
- `routes/tickets.routes.ts` — **reescrito**: protocolo, máquina de estados,
  `TicketFieldService`, `TicketTimeline`, CSAT (`POST /:id/evaluation`), tenancy,
  enum de prioridade corrigido (`CRITICAL`).
- `routes/inbox.routes.ts` — `name`, status `ASSIGNED`, criação de ticket a partir da
  conversa agora gera protocolo + `TicketFieldService` + timeline.
- `routes/conversations.routes.ts`, `routes/whatsapp.routes.ts` — `name`, status
  `OPEN`/`ASSIGNED`.
- `whatsapp/providers/MuriloWhatsAppApiProvider.ts` — provider para
  `murilo1of1/whatsapp-api`, com envio de texto/documento, início de sessão e QR Code
  via `/api/whatsapp/sessions`.
- `routes/reports.routes.ts` — técnico agregado via `TicketFieldService`, tenancy,
  `name`, + **CSAT médio**.
- `services/businessHoursService.ts`, `scripts/create-admin.ts`, `scripts/seed.ts` —
  renames camelCase.

## 3. Verificação
```powershell
cd SigmaAtendimento\apps\api
npx prisma format
npx prisma validate
npx prisma generate
npm run build
cd ..\..
npm run typecheck
npm run build
cd SigmaAtendimento\apps\api
npx prisma migrate deploy
npm run prisma:seed
npm run dev        # sobe API :3333
```
Teste rápido (slice/tenancy):
- `POST /api/auth/login` com `admin@dragonbyte.com` / `123456` → token (contém companyId).
- `GET /api/tickets` com Bearer → só tickets da empresa A (não vê os da B).
- `PATCH /api/tickets/:id` com transição inválida (ex.: CLOSED→IN_PROGRESS) → 400.
- `POST /api/tickets/:id/evaluation` `{rating:5}` → CSAT.

## 4. Pendências conhecidas (não-bloqueantes do build)
- **WhatsApp real precisa de teste com celular**: a cópia local da API
  `murilo1of1/whatsapp-api` já foi integrada com `client.on('message', ...)`, QR Code
  escaneável e encaminhamento para `/api/whatsapp/webhook`; falta testar envio e
  recebimento com sessão autenticada no WhatsApp Web.
- **Auth do socket/conversations**: `socket.ts` e `conversations.routes.ts` ainda usam
  o token fake `fake-jwt-token-for-` (dívida pré-existente). Unificar para o JWT real
  (com companyId) no M5.
- **Tenancy do realtime**: `Conversation/Message` criados no fluxo WhatsApp ainda não
  setam `companyId` (campo é opcional). Fechar no M5 (provider sabe a empresa).
- **Senhas em texto puro** (dev) — migrar para hash no M6.
- **Frontend** passa a precisar do header `Authorization` em Users/Departments/Contacts
  (antes abertos) — alinhar no M4.

## 5. Próximas fases
- **M4 (frontend)**: aplicar paleta trust-blue + Lucide ao `apps/web`; páginas
  **Clientes** e **Dashboard**; enviar `Authorization` em todas as chamadas; ligar
  CSAT/field service nas telas de Ticket.
- **M5 (WhatsApp)**: testar sessão real com celular, persistir evento bruto em
  `WhatsAppInboundEvent` (idempotência), implementar `WhatsAppOutbox` (retry),
  roteamento por departamento, unificar auth do socket.
- **M6 (produção)**: ativar RLS, hash de senha, LGPD, deploy (Railway/Render + Supabase),
  monitoramento, Meta Cloud.
