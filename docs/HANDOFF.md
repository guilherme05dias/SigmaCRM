# Sigma — Handoff de execução para ChatGPT (Ondas 1, 2 e 3)

**Data:** 2026-06-06 · Companion de [ACTION_PLAN.md](ACTION_PLAN.md).

Este arquivo contém **prompts executáveis e autossuficientes** para um agente (ChatGPT)
implementar cada onda. O agente não conhece o código — por isso o **Parte 0 (Contexto)
deve ser colado junto com a onda escolhida**.

> Como usar: copie **Parte 0** + a **Parte da onda** que vai executar e cole no ChatGPT,
> junto com o código de `apps/web` e `apps/api`. Cada item tem critério de pronto.

---

# PARTE 0 — Contexto (colar SEMPRE)

## Stack e estrutura
- Monorepo npm workspaces. Apps: `apps/api` (Express + Prisma + Postgres/Supabase +
  Socket.io + JWT, TS) e `apps/web` (React 18 + Vite + React Router v6 + Tailwind 3, TS).
- Portas: web :5173, api :3334. Pacote compartilhado: `@sigma/shared`.
- Build de validação (rodar ao fim de cada item): `npm run build --workspace=apps/web`
  (`tsc && vite build`). Backend: `npm run build --workspace=apps/api`.

## Design system (CSS vars — dark mode automático; USE estas classes)
- Superfícies: `bg-background`, `bg-surface`, `bg-surface-alt`, `border-border`.
- Texto: `text-foreground`, `text-muted-foreground`.
- Marca: `bg-primary`, `text-primary`, `bg-primary-50/100/700`, `text-primary-fg`.
- Status (par soft+fg): `bg-danger-soft text-danger-fg`, `bg-success-soft text-success-fg`,
  `bg-warning-soft text-warning-fg`, info = `bg-primary/10 text-primary`.
- Raio: botões `rounded-xl` (12px), cards `rounded-2xl` (16px), pill `rounded-pill`.
- Fonte Plus Jakarta Sans (configurada). Headings `font-display` peso 400–500, `tracking-wide`.
- **NÃO** use cores hex cruas nem classes do tema antigo (orange/slate/`bg-app`/`text-white`
  exceto sobre `bg-primary`). Sempre os tokens acima.

## Componentes e libs já existentes (reutilizar, não recriar)
- `components/ui/Button.tsx` — `variant: primary|secondary|outline|ghost|danger`,
  `size: sm|md|lg|icon`, prop `loading`.
- `components/ui/Card.tsx` (+ CardHeader/Title/Description/Content), `Input.tsx` (props
  `label`/`error`), `Badge.tsx` (`Badge`, `StatusBadge`, `PriorityBadge`).
- `components/ui/Icon.tsx` — `<Icon name="..." className="size-5" />`. Registro central de
  ícones lucide-react. **Para ícone novo: importe o componente lucide e adicione ao
  objeto `registry`** (não use `<span>` nem outra lib de ícone).
- `lib/api.ts` — `apiRequest<T>(path, { method, body: JSON.stringify(...), auth? })`;
  lança `ApiError` com `.status`; helper `redirectOnUnauthorized(err, navigate)`.
- `lib/authToken.ts` — `getAuthToken()`, `setAuthToken(token, remember)`, `clearAuthToken()`
  (localStorage + sessionStorage).
- `lib/theme.tsx` — `useTheme()` → `{ theme, toggleTheme }`; classe `.dark` no `<html>`.
- Realtime: `lib/useInboxSocket.ts` (socket.io-client). Backend emite eventos
  `conversation:new|updated`, `message:new`.

## Contratos do backend (atuais)
- JWT payload hoje: `{ id, role, companyId }` (SEM `name`/`email`).
- `POST /api/auth/login` → `{ token, user }`. Comparação de senha em **texto puro** em
  `auth.routes.ts` (só mexer nisso na Onda 3 / C1).
- Multi-tenant: toda query de negócio usa `companyScope(req)` / `getCompanyId(req)`
  (`lib/tenant.ts`). **Nunca remover.** `authMiddleware` injeta `req.user`.
- Rotas existentes: auth, users, departments, contacts, customers, tickets, inbox,
  conversations, reports, settings, whatsapp.
- Enums Prisma: `TicketStatus` (NEW, QUEUED, IN_PROGRESS, WAITING_CUSTOMER,
  WAITING_INTERNAL, SCHEDULED_FIELD_SERVICE, RESOLVED, CLOSED, CANCELED);
  `TicketPriority` (LOW, MEDIUM, HIGH, CRITICAL); `ConversationStatus` (OPEN, ASSIGNED,
  CLOSED); `MessageDirection` (INBOUND, OUTBOUND, SYSTEM); `ServiceType` (PRESENCIAL,
  REMOTO — confirmar no schema).

## Regras gerais (valem para todas as ondas)
- Textos em PT-BR. TypeScript estrito; corrija erros de `tsc`.
- Não adicione libs além das já presentes, salvo quando o item pedir (ex.: `bcrypt` no C1).
  Para decodificar JWT use `atob` nativo (não instale `jwt-decode`).
- Preserve o multi-tenant e o realtime existentes.
- Ao terminar cada item: rode o build e liste arquivos criados/alterados.

---

# PARTE 1 — ONDA 1 (usabilidade básica)

## A3 — Favicon na cor correta  [trivial]
**Estado:** `apps/web/public/favicon.svg` existe mas usa laranja `#ff6b00` (tema antigo).
**Fazer:** trocar a cor de fundo do `<rect>` para azul Airtable `#1b61c9`; manter o desenho.
Confirmar `<title>Sigma Atendimento</title>` no `index.html`.
**Pronto:** aba mostra ícone azul, sem 404.

## A2 — Toggle de tema em todas as telas  [pequeno]
**Estado:** botão Sol/Lua existe INLINE só no `SigmaTopbar`. Telas com `SigmaSidebarIcon`
(Dashboard, Inbox, Clientes, Tickets) não têm toggle.
**Fazer:**
1. Criar `components/ui/ThemeToggle.tsx`: `<button>` usando `useTheme()`, ícone
   `<Icon name={theme==='dark'?'light_mode':'dark_mode'} />`, `title` dinâmico, estilo
   `p-2 text-muted-foreground hover:bg-surface-alt hover:text-foreground rounded-xl transition-colors`.
2. Usar no `SigmaTopbar` (substituir o inline).
3. Adicionar no `SigmaSidebarIcon` (rodapé, acima do avatar/engrenagem).
**Pronto:** alternar tema funciona no Dashboard e Inbox; persiste.

## A1 — Usuário logado real (eliminar `mockUser`)  [médio — item central]
**Estado:** 8 páginas usam `const mockUser = { nome: 'Admin', role: 'Administrador' }`.
JWT não tem `name`. O shell lê `user?.nome`.
**Fazer:**
1. **Backend:** incluir `name` e `email` no payload do JWT em `auth.routes.ts`; atualizar
   `AuthPayload` em `middlewares/auth.middleware.ts` para `{ id, role, companyId, name?, email? }`;
   criar `GET /api/auth/me` (com `authMiddleware`) retornando
   `{ id, name, email, role, companyId, departmentId, active }` do banco via `req.user.id`.
2. **Frontend:** criar `lib/auth.tsx` com `AuthProvider` + `useAuth()`:
   - boot: decodificar JWT com `JSON.parse(atob(token.split('.')[1]))` (try/catch) para
     render imediato; depois `GET /api/auth/me` para hidratar; 401 → `clearAuthToken` + `/login`.
   - expõe `{ user, loading, logout }`.
   - envolver rotas privadas (em `App.tsx`/`main.tsx`); NÃO envolver `/login`.
   - trocar os 8 `mockUser` por `const { user } = useAuth()`.
   - **Padronizar o shell para `user?.name`** (ajustar `SigmaTopbar`/`SigmaSidebarIcon`
     que hoje leem `user?.nome`).
   Arquivos com mockUser: `pages/{Dashboard,Inbox,Customers,Tickets,Users,Departments,Reports,Settings}.tsx`.
**Pronto:** dois usuários distintos mostram nomes/iniciais diferentes em todas as telas;
refresh mantém; logout limpa.

## A4 — Aba "Histórico" do Inbox coerente  [pequeno]
**Estado:** `ConversationList` já tem abas `chats|fila|historico|contatos`. O filtro
`visibleConversations` em `pages/Inbox.tsx` precisa cobrir os 4 casos.
**Regra (status da Conversation):** `fila`=OPEN · `chats`=ASSIGNED · `historico`=CLOSED
(só leitura) · `contatos`=contatos únicos (dedup por `contactId`).
**Fazer:** ajustar o switch de `visibleConversations`. (O `ChatWindow` já desabilita input
quando `status==='CLOSED'`.)
**Pronto:** encerrar conversa move de Chats→Histórico; histórico abre em leitura.

## A5 — Botões "Encerrar" e "Criar chamado" no ChatWindow  [médio]
**Estado:** backend pronto: `POST /api/inbox/conversations/:id/close` e
`POST /api/inbox/conversations/:id/tickets` (recebe `title`*, `description?`, `priority`,
`customerId?`, `serviceType?`, `equipment?`, `visitAddress?`, `visitWindowStart?`,
`visitWindowEnd?`, `technicianId?`, `notesInternal?`). Sem UI.
**Fazer:**
1. Header do `ChatWindow` (quando `status!=='CLOSED'`): botão **Encerrar** (outline/ghost,
   confirma, chama close, conversa vai p/ Histórico).
2. Botão **Criar chamado** abre modal MÍNIMO: `title`* + `priority` (select, default
   MEDIUM) + `description` (textarea). Salva via `POST .../tickets`. Campos de visita/
   técnico ficam para a Onda 2.
3. Handlers em `Inbox.tsx` passados como props; novo `components/inbox/TicketFromConvModal.tsx`.
**Pronto:** encerrar e criar chamado a partir de conversa real funcionam ponta-a-ponta.

---

# PARTE 2 — ONDA 2 (funcionalidade de produto)

## B1 — Tela de detalhe do Ticket (`/tickets/:id`)  [grande]
**Estado:** lista em `pages/Tickets.tsx` só mostra status/prioridade. `GET /api/tickets/:id`
existe — **leia a rota** e garanta que inclui `contact, customer, department, assignedUser,
fieldService{technician}, timeline, evaluation`. Há `services/ticketStatus.ts` com a
máquina de estados.
**Fazer:**
1. **Backend:** garantir os `include` no `GET /:id`; criar/!confirmar `PATCH /api/tickets/:id`
   para editar campos e **transicionar status validando** com `ticketStatus.ts` (rejeitar
   transição inválida com 409). Cada mudança relevante grava `TicketTimeline`.
2. **Frontend:** rota `/tickets/:id` em `App.tsx`; página `pages/TicketDetail.tsx` com:
   cabeçalho (protocolo, título, `StatusBadge`, `PriorityBadge`, cliente, depto,
   responsável); descrição; bloco **field service** (técnico, tipo, equipamento, janela de
   visita, endereço); **notas internas**; **timeline** (lista cronológica); **CSAT** se
   avaliado; ações: mudar status (só transições válidas), atribuir técnico, editar, add nota.
   Linha da lista em `Tickets.tsx` vira link para o detalhe.
**Decisão tomada:** página com URL própria (não modal).
**Pronto:** abrir ticket do seed mostra tudo; transição inválida bloqueada; válida aparece
na timeline.

## B2 — Settings de horário + mensagens automáticas conectados  [médio]
**Estado:** UI estática; `GET/PUT /api/settings` existem. **Leia o model `Settings` no
`schema.prisma`** para o shape exato (horários por dia, `greetingMessage`,
`awayMessage`/`absenceMessage`, `closingMessage` — confirmar nomes).
**Fazer:** carregar valores reais no load; ligar inputs ao estado; salvar via `PUT`; feedback
de sucesso/erro. `businessHoursService` já consome esses dados.
**Pronto:** editar horário/mensagem, salvar, recarregar → persistiu.

## B3 — CRUD de Usuários completo  [médio]
**Estado:** form "Novo usuário" existe em `pages/Users.tsx`. **Confirme** `POST/PATCH
/api/users` aceitam `name, email, password?, role, departmentId?, messageSignature?, active`.
**Fazer:** criar/editar/inativar usuário; senha só enviada quando preenchida (opcional na
edição); validar e-mail único por empresa (já pode existir — confirmar). Senha em texto
puro até o C1 (hash) — deixar comentário `// TODO(C1): hash`.
**Pronto:** criar usuário, logar com ele, editar papel, inativar (login bloqueado 403, já
implementado).

## B4 — CSAT visível (Dashboard + Ticket)  [pequeno]
**Estado:** `GET /api/reports/summary` retorna `csat { average, count }`. Dashboard não
exibe a nota com clareza; ticket avaliado não mostra.
**Fazer:** KPI de CSAT no Dashboard com nota (`4.6 / 5`) + contagem; no `TicketDetail` (B1)
renderizar `evaluation` (estrelas + comentário).
**Pronto:** seed com avaliação mostra nota no dashboard e no ticket.

## B5 — Conversas em fila geral (roteamento manual)  [médio]
**Decisão tomada:** **fila manual/geral** — sem bot, sem regra automática.
**Estado:** conversa nova já entra como `OPEN` sem departamento (`conversations.routes.ts`
e webhook em `whatsapp.routes.ts`).
**Fazer:**
1. Garantir que toda conversa nova (inclusive do webhook WhatsApp) cai na fila geral
   (status OPEN, `departmentId` null) — provavelmente já ocorre; só confirmar.
2. Na aba **Fila** do Inbox, permitir ao atendente **assumir** (já existe `take`) e ao
   supervisor **transferir/atribuir** departamento/usuário (já existe `transfer`). Garantir
   que esses botões estão acessíveis na UI da fila.
3. (Opcional) Filtro visual por departamento na lista (dropdown), sem esconder nada — só
   conveniência. NÃO implementar roteamento automático nem isolamento por depto agora.
**Pronto:** conversa nova aparece na Fila; atendente assume; supervisor transfere.

## B6 — Responsividade mobile  [grande]
**Estado:** shell assume desktop; em telas pequenas a navegação some/quebra.
**Fazer:** breakpoints Tailwind (`sm`/`md`); menu hambúrguer (drawer) para a navegação em
`< md`; Inbox em uma coluna no mobile (lista → conversa → voltar, por estado); tabelas
(Tickets/Clientes/Usuários/Deptos) viram cards roláveis em telas pequenas.
**Pronto:** em 375px (iPhone SE) navegação, inbox e listas usáveis sem scroll horizontal.

---

# PARTE 3 — ONDA 3 (produção & polimento)

> ⚠️ C2 e C6 envolvem operação (celular real, deploy) — não são 100% codegen. O agente
> prepara o código/config; o teste/deploy final é com humano.

## C1 — Hash de senha (bcrypt)  [médio] — FAZER ANTES de C2/C6
**Fazer:** adicionar `bcrypt` (e `@types/bcrypt`) em `apps/api`. Em `auth.routes.ts` trocar
`passwordHash === password` por `await bcrypt.compare(password, user.passwordHash)`. Em
`users.routes.ts` e `scripts/seed.ts` gravar `await bcrypt.hash(password, 10)`. Como o seed
hoje grava texto puro, **re-rodar o seed** (ou script de migração que re-hasheia) após a
mudança. Remover o `// TODO(C1)` do B3.
**Pronto:** login funciona com hash; banco não guarda senha legível.

## C2 — Teste real do WhatsApp (sessão + entrada/saída)  [médio] — há celular disponível
**Estado:** QR é exibido em Settings; provider `murilo-api` em `apps/whatsapp-api`.
**Fazer (código):** garantir que o webhook persiste `WhatsAppInboundEvent` (idempotência por
`waMessageId`) antes de criar `Conversation`/`Message`; implementar `WhatsAppOutbox` (fila de
envio com retry) no fluxo de saída; emitir socket ao receber. **Validação (humano):** subir
`apps/whatsapp-api`, escanear QR, enviar do celular → ver conversa/mensagem INBOUND na Inbox
em tempo real; responder pela Inbox → chegar no celular.
**Pronto:** conversa real ponta-a-ponta; mensagens não duplicam em reenvio do webhook.

## C3 — Multi-tenant: ativar RLS no Postgres  [grande]
**Fazer:** migration com policies RLS por `company_id` nas tabelas de negócio; setar
`app.current_company_id` por request (em `lib/prisma.ts`/middleware). Ver ADRs em
`ARCHITECTURE_DECISIONS.md`.
**Pronto:** query sem escopo retorna vazio para outra empresa (defesa em profundidade).

## C4 — Socket multi-tenant (salas por empresa)  [médio]
**Estado:** `getIO().emit(...)` é global → evento de uma empresa chega em todas.
**Fazer:** no `socket.ts`, cada socket entra na sala `company:<companyId>` na conexão;
trocar `getIO().emit(...)` por `getIO().to('company:'+companyId).emit(...)` em todas as
rotas que emitem (conversations, inbox, tickets, whatsapp).
**Pronto:** evento da empresa A não chega em socket da empresa B.

## C5 — LGPD / retenção  [médio]
**Fazer:** rota de exclusão do histórico de um contato sob solicitação; política de
retenção configurável (campo em Settings). Documentar nas páginas legais.
**Pronto:** exclusão de dados de um contato funciona; documentado.

## C6 — Deploy (Railway/Render + Supabase)  [grande] — envolve ops
**Fazer (código/config):** Dockerfile/serviço para `apps/api`; build estático de `apps/web`
servido (Vercel/Netlify ou estático no mesmo host); variáveis `DATABASE_URL`, `DIRECT_URL`,
`JWT_SECRET`, `WHATSAPP_PROVIDER` e secrets no provedor; CORS restrito ao domínio do front
(hoje é `*`). **Deploy final:** humano.
**Pronto:** URL pública multiusuário no ar.

## C7 — Polimento de UX  [médio]
**Fazer:** paginação real de mensagens quando a conversa cresce (estrutura `hasMore` já
existe no front; implementar cursor no backend `inbox.routes.ts` que já tem o esqueleto);
skeletons de loading nas listas; toasts de sucesso/erro padronizados (criar
`components/ui/Toast.tsx` + provider); acessibilidade (foco em modais, `aria-label` em
ícones-botão, navegação por teclado); empty states.
**Pronto:** listas com skeleton; feedback consistente; modais acessíveis.

---

# Ordem recomendada
```
Onda 1:  A3 → A2 → A1 → A4 → A5
Onda 2:  B1 → B3 → B2 → B4 → B5 → B6
Onda 3:  C1 → C4 → C2 → C3 → C6 → C5 → C7   (C1 antes de C2/C6)
```
Ao concluir cada item, rodar o build, marcar ✅ no [ACTION_PLAN.md](ACTION_PLAN.md) e
listar os arquivos alterados.
