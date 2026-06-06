# ACTION PLAN - Onda 1 do Sigma

## Objetivo

Implementar a "Onda 1" do Sigma, consolidando ajustes de CRM + atendimento WhatsApp no monorepo existente.

Escopo: implementar os itens A1-A5 sem refazer o que ja existe, preservando o estilo do codigo vizinho e os contratos atuais.

## Stack e Estrutura

- Monorepo npm workspaces.
- `apps/api`: Express + Prisma/PostgreSQL/Supabase + Socket.io + JWT, em TypeScript.
- `apps/web`: React 18 + Vite + React Router v6 + Tailwind 3, em TypeScript.
- Web local: `http://localhost:5173`.
- API local: `http://localhost:3334`.

Validacao esperada:

```bash
npm run build --workspace=apps/web
```

## Design System

Usar os tokens ja existentes:

- Cores: `bg-background`, `bg-surface`, `bg-surface-alt`, `text-foreground`, `text-muted-foreground`, `border-border`, `bg-primary`, `text-primary`, `bg-primary-50`, `bg-primary-100`, `bg-primary-700`.
- Status: `bg-danger-soft text-danger-fg`, `bg-success-soft text-success-fg`, `bg-warning-soft text-warning-fg`, `bg-primary/10 text-primary`.
- Raio: botoes `rounded-xl`, cards `rounded-2xl`, pills `rounded-pill`.
- Fonte: Plus Jakarta Sans ja configurada.
- Headings: `font-display`, peso 400-500.
- Icones: usar `Icon` em `apps/web/src/components/ui/Icon.tsx`.
- Componentes base: `Button`, `Card`, `Input`, `Badge`, `StatusBadge`, `PriorityBadge`.

## Contratos Atuais

- HTTP client: `apiRequest<T>(path, { method, body: JSON.stringify(...), auth? })`.
- Erros: `ApiError` com `.status`.
- Redirecionamento: `redirectOnUnauthorized(err, navigate)`.
- Token: `getAuthToken`, `setAuthToken`, `clearAuthToken`.
- Tema: `useTheme()`.
- JWT atual: `{ id, role, companyId }`.
- Login: `POST /api/auth/login` retorna `{ token, user }`.
- Nao alterar senha em texto puro nesta onda.
- Preservar multi-tenant: nao remover `companyScope` nem `getCompanyId`.

## A3 - Favicon na Cor Correta

Estado atual:

- `apps/web/public/favicon.svg` existe, mas usa laranja `#ff6b00`.

Fazer:

- Trocar a cor de fundo do `<rect>` para `#1b61c9`.
- Manter o desenho de grid branco.
- Confirmar `<title>Sigma Atendimento</title>` em `index.html`.

Pronto quando:

- A aba mostra icone azul.
- Nao ha 404 de favicon.

## A2 - Toggle de Tema em Todas as Telas

Estado atual:

- O botao Sol/Lua existe inline apenas no `SigmaTopbar`.
- Telas com `SigmaSidebarIcon` ainda nao tem toggle.

Fazer:

1. Criar `apps/web/src/components/ui/ThemeToggle.tsx`.
2. O componente deve usar `useTheme()`.
3. Mostrar:
   - `light_mode` quando `theme === 'dark'`.
   - `dark_mode` quando estiver em tema claro.
4. `title` dinamico:
   - `Usar tema claro`.
   - `Usar tema escuro`.
5. Estilo:

```tsx
p-2 text-muted-foreground hover:bg-surface-alt hover:text-foreground rounded-xl transition-colors
```

6. Usar `<ThemeToggle />` no `SigmaTopbar`.
7. Adicionar `<ThemeToggle />` no rodape do `SigmaSidebarIcon`, acima do avatar/engrenagem.

Pronto quando:

- Alternar tema funciona no Dashboard e no Inbox.
- Estado persiste apos refresh.

## A1 - Usuario Logado Real

Estado atual:

- Varias paginas usam `mockUser = { nome: 'Admin', role: 'Administrador' }`.
- JWT ainda nao contem `name`/`email`.

Arquivos com `mockUser`:

- `apps/web/src/pages/Dashboard.tsx`
- `apps/web/src/pages/Inbox.tsx`
- `apps/web/src/pages/Customers.tsx`
- `apps/web/src/pages/Tickets.tsx`
- `apps/web/src/pages/Users.tsx`
- `apps/web/src/pages/Departments.tsx`
- `apps/web/src/pages/Reports.tsx`
- `apps/web/src/pages/Settings.tsx`

### Backend

Fazer:

1. Em `apps/api/src/routes/auth.routes.ts`, incluir `name` e `email` no payload do JWT.
2. Atualizar `AuthPayload` em `apps/api/src/middlewares/auth.middleware.ts` para:

```ts
{
  id: string;
  role: string;
  companyId?: string;
  name?: string;
  email?: string;
}
```

3. Criar `GET /api/auth/me` protegido por `authMiddleware`.
4. Retornar:

```ts
{
  id: string;
  name: string;
  email: string;
  role: string;
  companyId: string | null;
  departmentId: string | null;
  active: boolean;
}
```

### Frontend

Fazer:

1. Criar `apps/web/src/lib/auth.tsx`.
2. Implementar `AuthProvider` + `useAuth()`.
3. No boot:
   - Ler token.
   - Decodificar JWT sem lib:

```ts
JSON.parse(atob(token.split('.')[1]))
```

   - Usar `try/catch`.
   - Renderizar imediatamente `{ name, role }`.
4. Em seguida chamar `GET /api/auth/me`.
5. Se `401`, limpar token e redirecionar para `/login`.
6. Expor:

```ts
{
  user,
  loading,
  logout
}
```

7. Envolver rotas privadas com `<AuthProvider>`.
8. Nao envolver `/login`.
9. Remover `mockUser` das 8 telas.
10. Padronizar shell para ler `user?.name`, nao `user?.nome`.

Pronto quando:

- Login com usuarios diferentes mostra nomes/iniciais diferentes em todas as telas.
- Refresh mantem usuario.
- Logout limpa token e volta ao login.

## A4 - Aba Historico do Inbox Coerente

Estado atual:

- `ConversationList` ja possui abas `chats | fila | historico | contatos`.
- O filtro em `Inbox.tsx` deve cobrir os 4 casos corretamente.

Regra:

- `fila`: `status === 'OPEN'`.
- `chats`: `status === 'ASSIGNED'`.
- `historico`: `status === 'CLOSED'`.
- `contatos`: contatos unicos, deduplicados por `contactId`.

Fazer:

- Ajustar `visibleConversations` em `apps/web/src/pages/Inbox.tsx`.

Pronto quando:

- Encerrar uma conversa move de Chats para Historico.
- Abrir uma conversa do Historico mostra todas as mensagens.
- Conversas fechadas nao permitem responder.

## A5 - Botoes Encerrar e Criar Chamado no ChatWindow

Estado atual:

- Backend ja possui:
  - `POST /api/inbox/conversations/:id/close`
  - `POST /api/inbox/conversations/:id/tickets`

Payload de criacao de chamado:

```ts
{
  title: string;
  description?: string;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  customerId?: string;
  serviceType?: 'PRESENCIAL' | 'REMOTO';
  equipment?: string;
  visitAddress?: string;
  visitWindowStart?: string;
  visitWindowEnd?: string;
  technicianId?: string;
  notesInternal?: string;
}
```

### Encerrar Conversa

Fazer:

1. No header do `ChatWindow`, ao lado de Transferir/Assumir, exibir botao **Encerrar** quando `status !== 'CLOSED'`.
2. Pedir confirmacao.
3. Chamar `POST /api/inbox/conversations/:id/close`.
4. Atualizar lista via realtime ou reload.

### Criar Chamado

Fazer:

1. Adicionar botao **Criar chamado**.
2. Abrir modal minimo.
3. Campos:
   - `title` obrigatorio.
   - `priority`, default `MEDIUM`.
   - `description` opcional.
4. Ao salvar, chamar `POST /api/inbox/conversations/:id/tickets`.
5. Fechar modal e mostrar sucesso.
6. Campos de field service ficam para Onda 2 na tela de Tickets.

Arquivos esperados:

- `apps/web/src/components/inbox/ChatWindow.tsx`
- `apps/web/src/pages/Inbox.tsx`
- `apps/web/src/components/inbox/TicketFromConvModal.tsx`

Pronto quando:

- Encerrar conversa real funciona.
- Criar chamado a partir da conversa funciona.
- Conversa encerrada vai para Historico.

## Ordem Recomendada

1. A3 - favicon.
2. A2 - toggle de tema.
3. A1 - usuario logado real.
4. A4 - historico coerente.
5. A5 - encerrar conversa e criar chamado.
6. Validar build.
7. Reiniciar servidores se necessario.

## Validacao Final

Executar:

```bash
npm run build --workspace=apps/web
```

Se necessario, tambem executar:

```bash
npm run typecheck
npm run build
```

## Criterios de Entrega

- Sem `mockUser` nas telas privadas.
- Tema alterna em todas as telas.
- Favicon azul.
- Aba Historico mostra apenas conversas fechadas.
- Conversas fechadas sao somente leitura.
- Botao Encerrar funcional.
- Botao Criar chamado funcional.
- Build sem erro de TypeScript.
- Lista de arquivos criados/alterados reportada ao final da execucao.
