# Sigma — Plano de Ação (gaps pós-design system)

**Data:** 2026-06-06 · **Status:** proposta para execução · **Base:**
[EXECUTION_SUMMARY.md](EXECUTION_SUMMARY.md) · [DESIGN_SYSTEM_WEB.md](DESIGN_SYSTEM_WEB.md) ·
[ARCHITECTURE_DECISIONS.md](ARCHITECTURE_DECISIONS.md)

Documento que consolida **tudo que falta** para o Sigma sair de "compila e tem visual"
para "usável em produção", com **como cada coisa deve funcionar**, a abordagem técnica,
os arquivos afetados e o critério de pronto. Organizado em **3 ondas** (GSD), da mais
bloqueante para o polimento.

## Atualização de execução — 2026-06-06

- Plano duplicado removido: `docs/ACTION_PLAN.md` passa a ser a fonte canônica.
- **C2 preparado em código:** webhook idempotente via `WhatsAppInboundEvent`, envio por
  `WhatsAppOutbox`, retry manual em `POST /api/whatsapp/outbox/retry` e boas-vindas via
  outbox. Falta o teste humano com celular real.
- **C3 preparado em SQL:** migration `20260606000200_enable_tenant_rls` adiciona RLS nas
  tabelas de negócio usando `app.current_company_id`. O backend Prisma continua usando
  `companyScope`; validação final deve acontecer no Supabase com role sujeita a RLS.
- **C5 iniciado:** rota LGPD `DELETE /api/contacts/:id/data` remove contato, conversas,
  mensagens, tickets e eventos/outbox associados.
- **C6 preparado:** API ganhou `Dockerfile`, web ganhou `_redirects` para SPA e CORS ficou
  restrito por `CORS_ORIGIN`.
- **C7 iniciado:** paginação real de mensagens no backend e no Inbox.
- Validação local: `npm run build` no monorepo passou para API e web.

> **Legenda de esforço:** 🟢 pequeno (<1h) · 🟡 médio (1–3h) · 🔴 grande (>3h)
> **Legenda de prioridade:** 🔴 crítico (bloqueia uso) · 🟡 importante · 🟢 polimento

---

## Sumário das ondas

| Onda | Foco | Itens |
|---|---|---|
| **W1 — Usabilidade básica** | Tornar o app coerente para um usuário real | A1–A5 |
| **W2 — Funcionalidade de produto** | Fechar os fluxos de atendimento/CRM | B1–B6 |
| **W3 — Produção & polimento** | Segurança, deploy, mobile, refino | C1–C7 |

---

# Onda 1 — Usabilidade básica

Objetivo: qualquer pessoa que logar vê **seus próprios dados**, navega o tema em
qualquer tela, e o app parece um produto (não um protótipo).

## ✅ A1 · Usuário logado real (eliminar `mockUser`) 🔴 / 🟡

**Problema.** Em 8 páginas o topo/sidebar mostra `{ nome: 'Admin', role: 'Administrador' }`
hardcoded. Quem logar como `agente@acme.com` continua vendo "Admin".

**Como deve funcionar.**
- Ao logar, o app conhece **nome, e-mail, papel e empresa** do usuário.
- Topbar/Sidebar/avatar exibem o nome real e a inicial correta.
- O menu da conta mostra e-mail real; "Sair" limpa o token.
- Um único ponto de verdade (contexto), não estado duplicado por página.

**Abordagem técnica.**
1. **Backend:** incluir `name` (e opcionalmente `email`) no payload do JWT em
   `auth.routes.ts` **e** criar `GET /api/auth/me` (retorna o usuário do token) como
   fonte canônica — JWT para boot rápido, `/me` para dados frescos.
2. **Frontend:** criar `src/lib/auth.tsx` com `AuthProvider` + `useAuth()` que:
   - decodifica o JWT no boot (sem lib pesada: `JSON.parse(atob(token.split('.')[1]))`),
   - chama `/api/auth/me` para hidratar/validar,
   - expõe `{ user, loading, logout }`.
3. Trocar os 8 `const mockUser = …` por `const { user } = useAuth()`.
4. `ProtectedLayout` (App.tsx) passa a usar `AuthProvider` (envolver as rotas privadas).

**Arquivos.** `apps/api/src/routes/auth.routes.ts`, `apps/web/src/lib/auth.tsx` (novo),
`apps/web/src/App.tsx`, `apps/web/src/main.tsx`, e as 8 páginas.

**Decisão pendente.** ⚠️ JWT-only (mais simples) **vs** JWT + `/api/auth/me` (mais
correto, permite atualizar perfil sem relogar). **Recomendado:** os dois — JWT carrega
`name`/`role` para render imediato, `/me` valida e atualiza.

**Critério de pronto.** Logar com 2 usuários diferentes mostra nomes/iniciais distintos
em todas as telas; refresh mantém; logout limpa.

---

## ✅ A2 · Toggle de tema no SigmaSidebarIcon 🔴 / 🟢

**Problema.** O botão Sol/Lua só está no `SigmaTopbar`. Páginas com sidebar lateral
(Dashboard, Inbox, Clientes, Tickets) não têm como alternar tema.

**Como deve funcionar.** Botão de tema disponível em **todas** as telas, com o mesmo
comportamento (persiste no `localStorage`, ícone reflete o estado).

**Abordagem técnica.** Extrair um componente `ThemeToggle` (`src/components/ui/ThemeToggle.tsx`)
reutilizando `useTheme()`; usar no `SigmaTopbar` (substituindo o inline) e adicionar ao
rodapé do `SigmaSidebarIcon`, acima do avatar.

**Arquivos.** `apps/web/src/components/ui/ThemeToggle.tsx` (novo),
`SigmaSidebarIcon.tsx`, `SigmaTopbar.tsx`.

**Critério de pronto.** Alternar tema funciona no Dashboard e Inbox; estado consistente
ao navegar entre páginas com sidebar e com topbar.

---

## ✅ A3 · Favicon + título/branding 🟢 / 🟢

**Problema.** `index.html` aponta para `/favicon.svg` inexistente → ícone genérico.

**Como deve funcionar.** Aba do navegador mostra o "S" do Sigma em azul Airtable;
título "Sigma Atendimento".

**Abordagem técnica.** Criar `apps/web/public/favicon.svg` (quadrado azul `#1b61c9`,
glifo "S" ou ícone de hub branco, raio 12px coerente com o design). Confirmar `<title>`.

**Arquivos.** `apps/web/public/favicon.svg` (novo), `index.html`.

**Critério de pronto.** Favicon aparece na aba; sem 404 no console.

---

## ✅ A4 · Aba "Histórico" do Inbox coerente 🟡 / 🟢

**Problema.** O `ConversationList` ganhou a aba `historico`, mas o filtro em `Inbox.tsx`
precisa tratar os 4 estados (`chats`, `fila`, `historico`, `contatos`) de forma clara.

**Como deve funcionar.**
- **Fila** = conversas `OPEN` (aguardando alguém assumir).
- **Chats** = conversas `ASSIGNED` (em atendimento ativo).
- **Histórico** = conversas `CLOSED` (encerradas) — somente leitura.
- **Contatos** = lista de contatos únicos (deduplicado por `contactId`).

**Abordagem técnica.** Ajustar o `visibleConversations` em `Inbox.tsx` para o switch de 4
casos; garantir que o backend `GET /api/conversations` retorna também as `CLOSED` (hoje
ordena por `lastMessageAt`, ok). Tab "Histórico" abre conversa em modo leitura (input
desabilitado quando `status === 'CLOSED'` — já existe no ChatWindow).

**Arquivos.** `apps/web/src/pages/Inbox.tsx`, `components/inbox/ConversationList.tsx`.

**Critério de pronto.** Encerrar uma conversa move ela de "Chats" para "Histórico";
abrir do histórico mostra todas as mensagens em leitura.

---

## ✅ A5 · Botões "Fechar conversa" e "Criar ticket" no ChatWindow 🟡 / 🟡

**Problema.** O backend já tem `POST /api/inbox/conversations/:id/close` e
`POST /api/inbox/conversations/:id/tickets`, mas não há UI.

**Como deve funcionar.**
- No header do `ChatWindow`, ao lado de "Transferir": botão **Encerrar** (confirma,
  manda mensagem de encerramento configurada, move para Histórico).
- Botão **Criar chamado** abre um formulário (modal) pré-preenchido com o contato; ao
  salvar, gera o ticket com protocolo e vincula à conversa.

**Abordagem técnica.** Adicionar handlers `handleCloseConversation` e
`handleCreateTicket` em `Inbox.tsx`; modal de ticket reutiliza os campos de
`CreateTicketFromConvSchema` (title, priority, serviceType, técnico, visita…).

**Arquivos.** `Inbox.tsx`, `components/inbox/ChatWindow.tsx`,
`components/inbox/TicketFromConvModal.tsx` (novo).

**Decisão pendente.** ⚠️ Modal completo (todos os campos de field service) **vs** mínimo
(título + prioridade, completar depois na tela de Tickets). **Recomendado:** mínimo na W1,
completo na W2 (item B1).

**Critério de pronto.** Encerrar e criar ticket a partir de uma conversa real funcionam
ponta-a-ponta com atualização em tempo real.

---

# Onda 2 — Funcionalidade de produto

Objetivo: fechar os fluxos de **atendimento** e **CRM** que hoje têm backend mas não têm
tela completa.

## B1 · Tela de detalhe do Ticket 🔴 / 🔴

**Problema.** A lista de Tickets mostra status/prioridade, mas não há como ver descrição,
timeline, field service, CSAT, notas internas, nem editar.

**Como deve funcionar.**
- Clicar numa linha abre o **detalhe** (página `/tickets/:id` ou drawer lateral) com:
  - Cabeçalho: protocolo, título, status (com transições válidas), prioridade, cliente,
    departamento, responsável.
  - Corpo: descrição, **field service** (técnico, tipo, equipamento, janela de visita,
    endereço), **notas internas**.
  - **Timeline** (`TicketTimeline`): criação, mudanças de status, atribuições.
  - **CSAT** quando avaliado.
  - Ações: mudar status (respeitando a máquina de estados), atribuir técnico, editar
    campos, adicionar nota.

**Abordagem técnica.**
1. Backend já tem `GET /api/tickets/:id`; confirmar que inclui `fieldService`,
   `timeline`, `evaluation`, `contact`, `customer`, `department`, `assignedUser`.
2. Adicionar `PATCH /api/tickets/:id` para edição de campos + transição validada
   (usar `services/ticketStatus.ts`).
3. Frontend: rota `/tickets/:id` + componente `TicketDetail`. Badges de status reusam
   `StatusBadge`/`PriorityBadge`.

**Arquivos.** `apps/api/src/routes/tickets.routes.ts`, `apps/web/src/pages/TicketDetail.tsx`
(novo), `App.tsx` (rota), `pages/Tickets.tsx` (link).

**Decisão pendente.** ⚠️ **Página** `/tickets/:id` (deep-link, voltar do navegador) **vs**
**drawer** (mais rápido, sem mudar rota). **Recomendado:** página — chamados precisam de
URL compartilhável.

**Critério de pronto.** Abrir um ticket do seed mostra todos os dados; mudar status
inválido é bloqueado; mudança válida aparece na timeline.

---

## B2 · Settings de horário + mensagens automáticas conectados 🟡 / 🟡

**Problema.** A UI de "Horário de Funcionamento" e "Mensagens Automáticas" é estática;
o backend tem `GET/PUT /api/settings`.

**Como deve funcionar.**
- Carregar os valores reais no load da página.
- Editar horários por dia, mensagens de saudação/ausência/encerramento.
- Salvar persiste via `PUT /api/settings`; feedback de sucesso/erro.

**Abordagem técnica.** Ler o shape de `Settings` no schema; ligar os inputs ao estado;
`businessHoursService` já consome esses dados para mensagens automáticas.

**Arquivos.** `apps/web/src/pages/Settings.tsx`, `apps/api/src/routes/settings.routes.ts`
(confirmar shape).

**Critério de pronto.** Editar horário/mensagem, salvar, recarregar → persistiu.

---

## B3 · CRUD de Usuários completo + senha 🟡 / 🟡

**Problema.** Form de "Novo usuário" existe; confirmar criação/edição com senha,
papel, departamento, assinatura e ativo/inativo.

**Como deve funcionar.** Admin cria usuário (nome, e-mail, senha, papel, depto,
assinatura), edita, inativa. Senha só enviada quando preenchida (na edição é opcional).

**Abordagem técnica.** Confirmar `POST/PATCH /api/users` aceita `password` e grava
**hasheada** (depende de C1; até lá grava texto puro como dívida explícita). Validação
de e-mail único por empresa.

**Arquivos.** `apps/web/src/pages/Users.tsx`, `apps/api/src/routes/users.routes.ts`.

**Critério de pronto.** Criar usuário, logar com ele, editar papel, inativar (bloqueia
login com 403 — já implementado).

---

## B4 · CSAT visível (Dashboard + Ticket) 🟡 / 🟢

**Problema.** `reports/summary` retorna CSAT médio, mas o Dashboard não exibe nota com
clareza; o ticket avaliado não mostra a nota.

**Como deve funcionar.** KPI de CSAT no Dashboard com nota (ex.: `4.6 / 5`) e contagem;
no detalhe do ticket, estrelas + comentário quando avaliado.

**Abordagem técnica.** Ajustar o KPI existente no Dashboard; no `TicketDetail` (B1)
renderizar `evaluation`.

**Arquivos.** `apps/web/src/pages/Dashboard.tsx`, `TicketDetail.tsx`.

**Critério de pronto.** Seed com avaliação mostra a nota no dashboard e no ticket.

---

## B5 · Roteamento de WhatsApp por departamento 🟡 / 🔴

**Problema.** Decisão de arquitetura é "um número, vários departamentos" mas a entrada
não roteia — toda conversa nova cai sem departamento.

**Como deve funcionar.** Mensagem nova de número desconhecido → menu/regra de
roteamento (ex.: "1 Suporte, 2 Financeiro") → conversa entra na **fila do departamento**
escolhido. Atendentes só veem a fila do(s) seu(s) departamento(s).

**Abordagem técnica.** No webhook (`whatsapp.routes.ts`), ao criar conversa: aplicar
regra de roteamento (configurável em Settings); persistir `departmentId`. Filtrar
`GET /api/conversations` pelo departamento do agente (exceto ADMIN/SUPERVISOR).

**Arquivos.** `apps/api/src/routes/whatsapp.routes.ts`, `conversations.routes.ts`,
`Settings` (regras), possivelmente novo `services/routing.service.ts`.

**Decisão pendente.** ⚠️ Roteamento por **menu interativo** (bot pergunta) **vs**
**fixo por regra** (palavra-chave/horário) **vs** **manual** (cai numa fila geral e o
supervisor distribui). **Precisa de definição de negócio.**

**Critério de pronto.** Mensagem nova entra na fila correta; agente de Suporte não vê
fila do Financeiro.

---

## B6 · Responsividade mobile 🟡 / 🔴

**Problema.** Sidebar e topbar assumem desktop; em telas pequenas a navegação some ou
quebra.

**Como deve funcionar.** Em mobile: menu hambúrguer abre a navegação; Inbox vira
fluxo de uma coluna (lista → conversa → voltar); tabelas viram cards roláveis.

**Abordagem técnica.** Breakpoints Tailwind (`sm`/`md`); drawer de navegação;
Inbox com navegação por estado em telas `< md`.

**Arquivos.** Shell (`SigmaSidebarIcon`, `SigmaTopbar`), `Inbox.tsx`, páginas com tabela.

**Critério de pronto.** Testar em 375px (iPhone SE) — navegação, inbox e listas usáveis.

---

# Onda 3 — Produção & polimento

## ✅ C1 · Hash de senha (bcrypt) — CONCLUÍDO (2026-06-06)

**Problema.** Login comparava `passwordHash === password` (texto puro). Risco real.

**Como ficou.**
- `bcryptjs` (JS puro — escolhido em vez do `bcrypt` nativo para evitar build node-gyp
  no Windows).
- Novo helper `apps/api/src/lib/password.ts`: `hashPassword`, `isHashed`,
  `verifyPassword`, `ensureHashed`.
- **Migração preguiçosa (lazy upgrade):** o login aceita hash bcrypt **ou** texto puro
  legado; quando bate texto puro, re-hasheia e grava na hora. **Sem re-seed forçado, sem
  quebrar logins existentes.**
- `users.routes.ts` (create/update) grava sempre hash; `seed.ts` (12 usuários via
  `devPasswordHash`) e `create-admin.ts` geram hash.

**Validação.** `npm run build` (api) ✅. Teste unitário do helper ✅. **E2E contra a API
viva:** usuário com senha legada `123456` → login `200` → banco passou de `123456` para
`$2b$10$...` → 2º login `200` (via bcrypt) → senha errada `401`. ✅

**Arquivos.** `apps/api/src/lib/password.ts` (novo), `routes/auth.routes.ts`,
`routes/users.routes.ts`, `scripts/seed.ts`, `scripts/create-admin.ts`, `package.json`
(+`bcryptjs`, `@types/bcryptjs`).

> Observação: usuários que **nunca mais logarem** continuam com texto puro no banco até o
> próximo login. Para forçar a conversão de todos de uma vez, basta rodar `npm run
> prisma:seed` (regrava com hash) — opcional, não bloqueante.

---

## C2 · Teste real do WhatsApp (sessão + entrada) 🔴 / 🟡

**Problema.** QR Code é exibido mas nunca foi escaneado com celular real; entrada
(`message`) não validada ponta-a-ponta.

**Como deve funcionar.** Escanear QR conecta a sessão; mensagem enviada do celular vira
`Conversation` + `Message` (INBOUND) na Inbox em tempo real; resposta da Inbox chega no
celular.

**Abordagem técnica.** Subir `apps/whatsapp-api`; escanear; validar webhook → cria
conversa/mensagem → socket emite → UI atualiza. Persistir `WhatsAppInboundEvent`
(idempotência) e usar `WhatsAppOutbox` (retry de envio).

**Status 2026-06-06.** Código preparado: idempotência, outbox, retry manual e boas-vindas
passaram a existir. Falta escanear com celular real e validar entrada/saída ponta-a-ponta.

**Decisão pendente.** ⚠️ Precisa de **celular disponível** e um número de teste.

**Critério de pronto.** Conversa real ponta-a-ponta funcionando.

---

## C3 · Multi-tenant — ativar RLS 🟡 / 🔴

**Problema.** Isolamento hoje é só por código (`companyScope`). RLS no Postgres foi
decidido como faseado (escreve no M2, ativa no M6) — ainda não ativo.

**Como deve funcionar.** Mesmo com bug de query, o banco impede vazar dados entre
empresas (defesa em profundidade).

**Abordagem técnica.** Policies RLS por `company_id` nas tabelas de negócio; setar
`app.current_company_id` por request. Ver ADRs.

**Status 2026-06-06.** Migration SQL criada para habilitar RLS nas tabelas de negócio.
Como o backend usa Prisma direto, o isolamento de aplicação segue vindo de `companyScope`;
o teste final de RLS precisa ser feito no Supabase com uma role sujeita às policies.

**Arquivos.** Nova migration de RLS, `lib/prisma.ts`/`tenant.ts`.

**Critério de pronto.** Query sem escopo retorna vazio para outra empresa.

---

## ✅ C4 · Socket multi-tenant + salas por empresa — CONCLUÍDO (2026-06-06)

**Problema.** `getIO().emit(...)` global emitia para TODOS os sockets; eventos de uma
empresa chegavam em sockets de outra.

**Como ficou.**
- `socket.ts`: na conexão, cada socket entra na sala `company:<companyId>` (a partir do
  JWT). Novo helper exportado `emitToCompany(companyId, event, payload)` →
  `getIO().to('company:'+id).emit(...)`; se `companyId` for nulo faz **no-op com warn**
  (nunca cai em broadcast global por engano).
- Os **16 emits broadcast** (`conversation:new/updated`, `ticket:new/updated`) em
  `conversations`, `inbox`, `tickets` e `whatsapp` routes passaram a usar `emitToCompany`
  com o `companyId` do contexto/entidade.
- Os **5 `getIO().to('conversation:'+id')`** (`message:new`) já eram isolados pela sala da
  conversa — mantidos.

**Validação.** `npm run build` (api) ✅. **E2E em runtime:** 2 sockets (DragonByte +
Acme), `transfer` de uma conversa da DragonByte → socket DragonByte recebeu
`conversation:updated`, **socket Acme NÃO recebeu**. ✅

**Arquivos.** `apps/api/src/socket.ts`, `routes/{conversations,inbox,tickets,whatsapp}.routes.ts`.

---

## C5 · LGPD / política de retenção 🟢 / 🟡

**Problema.** Páginas legais existem, mas não há mecanismo de exclusão/retenção.

**Como deve funcionar.** Exclusão de histórico de contato sob solicitação; retenção
configurável.

**Critério de pronto.** Rota de exclusão de dados de um contato; documentado.

**Status 2026-06-06.** Rota `DELETE /api/contacts/:id/data` criada para ADMIN/SUPERVISOR.
Ainda falta tela administrativa/fluxo operacional e política de retenção automática.

---

## C6 · Deploy (Railway/Render + Supabase) 🔴 / 🔴

**Como deve funcionar.** API + web no ar, banco Supabase, WhatsApp provider configurado;
variáveis de ambiente seguras; build de produção do front servido.

**Abordagem técnica.** Dockerfile/serviço para `apps/api`; build estático de `apps/web`;
`DATABASE_URL`/`DIRECT_URL`/secrets no provedor; CORS restrito ao domínio do front.

**Status 2026-06-06.** `apps/api/Dockerfile`, `_redirects` do Vite e `CORS_ORIGIN` criados.
Falta provisionar Supabase/provedor e configurar variáveis reais.

**Critério de pronto.** URL pública funcionando, multiusuário.

---

## C7 · Polimento de UX 🟢 / 🟡

- ✅ Paginação real de mensagens quando a conversa cresce.
- Estados de loading/skeleton nas listas.
- Toasts de sucesso/erro padronizados (hoje cada tela trata inline).
- Acessibilidade: foco em modais, `aria-*` em ícones-botão, navegação por teclado.
- Empty states ilustrados.

---

# Ordem de execução recomendada

```
W1 (usabilidade):  A3 → A2 → A1 → A4 → A5
W2 (produto):      B1 → B3 → B2 → B4 → B5 → B6
W3 (produção):     C1 → C4 → C2 → C3 → C6 → C5 → C7
```

**Racional.** Começar pelo barato e visível (favicon, toggle global), depois o estrutural
(usuário real), fechar fluxos de atendimento (ticket, settings), e por fim endurecer para
produção (senha, socket isolado, RLS, deploy). C1 (hash) deve vir **antes** de C2/C6
(qualquer teste/deploy real) para não vazar credenciais.

---

# Decisões — RESOLVIDAS (2026-06-06)

| # | Decisão | **Escolha** |
|---|---|---|
| A1 | Nome do usuário: JWT-only vs JWT + `/me` | **JWT + `/api/auth/me`** (render imediato + validação) |
| A5/B1 | Ticket: modal vs página `/tickets/:id` | ✅ **Página `/tickets/:id`** |
| B5 | Roteamento WhatsApp | ✅ **Fila manual / geral** — sem bot; supervisor/atendente distribui. Menu/regra ficam para depois. |
| C2 | Teste WhatsApp: há celular? | ✅ **Sim, disponível agora** — preparar fluxo real (escanear QR + entrada/saída) |
| — | Ordem de execução | ✅ **Onda 1 inteira:** A3 → A2 → A1 → A4 → A5 |

---

> Ao aprovar, executo onda a onda com build/verify a cada item, atualizando este
> documento (✅ por item) e o [EXECUTION_SUMMARY.md](EXECUTION_SUMMARY.md).
