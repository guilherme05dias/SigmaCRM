# Diário de desenvolvimento — Sigma Atendimento + CRM

## 2026-07-09

### Contexto do dia

Foi definido que o projeto ativo é o monorepo `SigmaAtendimento/`. As pastas `frontend/`, `backend/` e `database/` ficaram como legado/histórico e não devem receber novas funcionalidades do produto principal.

O produto em construção é um sistema de atendimentos + CRM, começando pelo WhatsApp e podendo gerar visitas técnicas quando necessário. No primeiro momento será usado por uma única empresa.

### Decisões de produto consolidadas

- Perfis:
  - Administrador;
  - Supervisor;
  - Atendente;
  - Técnico.
- Atendimento nasce automaticamente ao receber a primeira mensagem do cliente.
- O cliente escolhe um setor e entra na fila correspondente.
- Se o cliente não escolher em 2 minutos, o atendimento deve ir para um técnico padrão.
- O profissional assume manualmente a conversa clicando em “Assumir”.
- Enquanto aguarda, o cliente pode continuar enviando detalhes.
- O atendimento só encerra quando o profissional clicar em “Finalizar atendimento”.
- Encerramento exige:
  - resultado;
  - resumo;
  - sistema/assunto.
- Sistemas/assuntos ficam em lista cadastrada, com opção “Outro”.
- Quem está atendendo decide se abre chamado/visita.
- O atendente pode agendar com o cliente ou deixar a data como “Não definido”.
- Alteração de agenda exige motivo e deve ficar registrada.
- Execução da visita registra:
  - resultado;
  - descrição do serviço executado;
  - tempo;
  - materiais;
  - fotos/anexos.
- Resultado e descrição do serviço são os campos essenciais de conclusão da visita.
- Clientes são criados inicialmente pelo número do WhatsApp.
- Uma empresa cliente pode ter vários contatos.
- Cada nova conversa após encerramento gera novo atendimento.
- Dashboard deve destacar fila atual, atendimentos ativos, visitas do dia, últimos atendimentos e últimas visitas.
- Permissões:
  - administrador e supervisor veem tudo;
  - atendente/técnico veem principalmente o que está vinculado a eles.

### Organização e documentação

Arquivos criados/atualizados:

- `README.md`
- `docs/PRD.md`
- `docs/ROADMAP.md`
- `docs/PROJECT_STRUCTURE.md`
- `docs/README.md`
- `project-reorganization.md`
- `SigmaAtendimento/apps/web/PRODUCT.md`
- `SigmaAtendimento/apps/web/DESIGN.md`

O `PRODUCT.md` e o `DESIGN.md` foram criados para a skill `impeccable` reconhecer o produto e o Sigma Design System.

### Design system

Design system identificado e documentado:

- Nome: Sigma Design System.
- Inspiração: Airtable.
- Stack: React + Vite + Tailwind + CSS Custom Properties.
- Fonte: Plus Jakarta Sans.
- Dark mode por classe `.dark`.
- Cores principais:
  - light primary: `#1b61c9`;
  - dark primary: `#4f94f6`.
- Componentes base:
  - `Button`;
  - `Badge`;
  - `StatusBadge`;
  - `PriorityBadge`;
  - `EmptyState`;
  - `Skeleton`;
  - `Icon`;
  - `ThemeToggle`;
  - `SigmaSidebarIcon`.

Skill `impeccable` instalada e usada para manter o padrão de UI.

### Segurança e base da API

Implementado:

- Configuração centralizada em `apps/api/src/config/env.ts`.
- CORS centralizado.
- JWT sem fallback inseguro em produção.
- Middleware de autorização com roles:
  - `ADMIN`;
  - `SUPERVISOR`;
  - `ATTENDANT`;
  - `TECHNICIAN`.
- Helpers:
  - `requireRoles`;
  - `requireAdmin`;
  - `requireAdminOrSupervisor`;
  - `canViewAll`.
- Rotas administrativas protegidas.
- Removido efeito perigoso de recriação/limpeza de schema no start.
- WhatsApp start não apaga histórico.
- Webhook cria nova conversa se a última estiver encerrada.

### Banco / Prisma

Schema evoluído com:

- `UserRole`.
- `FieldVisitStatus`.
- `ServiceTopic`.
- Campos de encerramento em `Conversation`.
- Campos de fila/atribuição em `Conversation`.
- Campos de visita técnica em `TicketFieldService`.
- Histórico de alteração de agenda em `FieldVisitScheduleChange`.
- Técnico padrão em `Company`.

Migration criada:

- `SigmaAtendimento/apps/api/prisma/migrations/20260709143000_crm_foundation_roles_topics_visits/migration.sql`

### Sistemas / assuntos

Implementado:

- Backend `serviceTopics.routes.ts`.
- CRUD de sistemas/assuntos.
- Frontend `ServiceTopics.tsx`.
- Rota `/service-topics`.
- Menus atualizados.

### Inbox / atendimento WhatsApp

Implementado:

- Encerramento com modal exigindo:
  - resultado;
  - sistema/assunto;
  - resumo;
  - observações opcionais;
  - marcação se houve chamado/visita.
- Validação de “Outro” com descrição obrigatória.
- Criação de chamado/visita a partir da conversa.
- Modal de criação de chamado com:
  - título;
  - prioridade;
  - descrição;
  - técnico;
  - data combinada;
  - endereço;
  - observações internas.
- Conversa encerrada não pode receber resposta, transferência ou novo chamado.
- Usuário operacional precisa assumir a conversa antes de responder, finalizar ou criar chamado.
- Socket do Inbox filtra conversas que o usuário operacional não deveria enxergar.

### Chamados e visitas

Implementado:

- Chamado criado a partir de atendimento pode gerar `TicketFieldService`.
- Se tiver data combinada, status da visita fica `SCHEDULED`.
- Se não tiver data, status fica `PENDING`.
- Técnico precisa ter role `TECHNICIAN`.
- Tela de chamados recebeu filtros:
  - técnico;
  - status da visita;
  - apenas visitas.
- Tela de detalhe do chamado/visita permite registrar:
  - status da visita;
  - técnico;
  - data combinada;
  - endereço;
  - equipamento;
  - tempo gasto;
  - resultado;
  - descrição do serviço executado;
  - materiais utilizados;
  - fotos/anexos por URL.
- Alteração da data combinada exige motivo.
- Histórico de alterações de agenda aparece no detalhe.
- Timeline recebe evento de alteração de agenda.

### Painel de visitas

Criado:

- `SigmaAtendimento/apps/web/src/pages/Visits.tsx`
- rota `/visits`
- link na sidebar

Funcionalidades:

- calendário semanal;
- lista de próximas visitas;
- filtros por técnico e status;
- cards de resumo:
  - visitas de hoje;
  - agendadas;
  - sem data;
- link para detalhe do chamado.

### Dashboard

Atualizado para mostrar:

- fila atual;
- atendimentos ativos;
- visitas de hoje;
- visitas abertas;
- conversas no período;
- mensagens no período;
- chamados no período;
- taxa de resolução;
- últimos atendimentos;
- últimas visitas;
- rankings por departamento e técnico.

Endpoint `/api/reports/summary` ampliado para fornecer esses dados.

### Permissões

Implementado:

- Admin/supervisor veem tudo.
- Atendente/técnico veem dados ligados a eles.
- Chamados/visitas:
  - listagem filtrada;
  - detalhe protegido;
  - edição protegida.
- Dashboard/relatórios:
  - admin/supervisor veem operação global;
  - atendente/técnico veem próprios indicadores.
- `/api/users`:
  - admin/supervisor recebem dados completos;
  - atendente/técnico recebem lista reduzida de profissionais ativos.
- Sidebar:
  - áreas administrativas ocultas para perfis operacionais.
- Rotas frontend administrativas protegidas:
  - usuários;
  - departamentos;
  - sistemas/assuntos;
  - configurações.
- Inbox:
  - fila aberta visível para operação;
  - conversas atribuídas visíveis ao responsável;
  - ações protegidas por vínculo com a conversa.

### Validações feitas

Após as fases principais, foram executados:

```powershell
cd SigmaAtendimento
npm run typecheck
npm run build
```

Resultado:

- TypeScript passou.
- Build passou.
- Aviso conhecido: bundle Vite acima de 500 KB.

### Observações técnicas

- O projeto ainda está com várias alterações pendentes no worktree.
- Não foi feito commit.
- Não foi feito push.
- Não usar `git reset` ou comandos destrutivos sem confirmação.
- Há Ollama instalado e pode ser usado para análises locais de baixo risco, como resumos de arquivos grandes e revisão de documentação.

### Próxima fase sugerida para 2026-07-10

Começar por notificações internas:

1. Criar modelo/tabela de notificações.
2. Notificar técnico quando uma visita for atribuída.
3. Notificar técnico quando uma agenda for alterada.
4. Mostrar contador/ícone de notificações na interface.
5. Criar painel/dropdown simples de notificações.
6. Marcar notificações como lidas.
7. Validar permissões para cada usuário ver apenas suas notificações.

Depois disso:

1. Revisar fluxo de fallback do setor após 2 minutos.
2. Implementar técnico padrão da empresa na UI de configurações.
3. Melhorar histórico do cliente com atendimentos e visitas.
4. Revisar responsividade do Inbox e painel de visitas.
5. Planejar upload real de fotos/anexos.
6. Avaliar code splitting para reduzir o aviso de bundle do Vite.

### Ponto de retomada

Retomar em:

```text
SigmaAtendimento/
```

Com foco em:

```text
Notificações internas para visitas e atendimentos.
```

## 2026-07-10

### Fase iniciada: notificações internas

Implementado:

- Novo enum Prisma `NotificationType`.
- Novo model Prisma `Notification`.
- Migration:
  - `SigmaAtendimento/apps/api/prisma/migrations/20260710090000_add_internal_notifications/migration.sql`
- Índices para consulta por:
  - empresa;
  - usuário;
  - leitura;
  - data de criação.
- Serviço interno:
  - `apps/api/src/services/notification.service.ts`
- Rotas:
  - `GET /api/notifications`
  - `POST /api/notifications/:id/read`
  - `POST /api/notifications/read-all`
- Socket:
  - cada usuário entra na sala `user:{id}`;
  - novo helper `emitToUser`;
  - evento `notification:new`.
- Frontend:
  - componente `NotificationBell`;
  - sino na sidebar;
  - contador de não lidas;
  - dropdown com últimas notificações;
  - marcar uma como lida;
  - marcar todas como lidas;
  - navegação para o link da notificação.

### Eventos que já geram notificação

- Visita técnica atribuída a um técnico.
- Visita criada pelo Inbox com técnico responsável.
- Alteração de agenda da visita.
- Alteração de status da visita.
- Chamado atribuído a um responsável.

### Validação da fase

Executado:

```powershell
cd SigmaAtendimento
npm run prisma:generate --workspace=@sigma/api
npm run typecheck
npm run build
```

Resultado:

- Prisma Client gerado.
- Typecheck passou.
- Build passou.
- Permanece o aviso conhecido do Vite sobre bundle acima de 500 KB.

### Extensão concluída: central de notificações

Implementado:

- nova página `/notifications`;
- lista completa das últimas notificações da conta;
- filtro por tipo;
- filtro de apenas não lidas;
- ação para marcar uma ou todas como lidas;
- navegação do dropdown para a central completa.

### Otimização concluída: socket compartilhado no frontend

Implementado:

- conexão Socket compartilhada por módulo no frontend;
- Inbox, sino e central de notificações agora reutilizam a mesma conexão autenticada;
- limpeza de listeners no unmount sem derrubar a conexão enquanto outra tela/componente ainda estiver usando.

### Próximo passo sugerido

- Revisar onde mais vale notificar:
  - conversa transferida;
  - fallback automático para técnico padrão.
### 2026-07-10 â€” atualizaÃ§Ã£o complementar

Implementado nesta continuaÃ§Ã£o:

- notificaÃ§Ã£o `CONVERSATION_TRANSFERRED`;
- fallback automÃ¡tico de 2 minutos para o tÃ©cnico padrÃ£o quando a conversa segue aberta, sem responsÃ¡vel e sem setor;
- notificaÃ§Ã£o `CONVERSATION_FALLBACK_ASSIGNED`;
- lazy loading por rota em `apps/web/src/App.tsx`;
- `manualChunks` no Vite para separar bundles principais do frontend.

ValidaÃ§Ã£o:

```powershell
cd SigmaAtendimento
npm run prisma:generate --workspace=@sigma/api
npm run typecheck
npm run build
```
### 2026-07-10 â€” otimizaÃ§Ã£o adicional do Inbox

Implementado:

- lazy loading de `ConversationList`, `ChatWindow` e `ContactSidebar`;
- lazy loading do modal `TicketFromConvModal`;
- split interno adicional da rota do Inbox.

Resultado observado no build:

- `Inbox` caiu para cerca de 8.10 kB;
- `ChatWindow` foi isolado em chunk prÃ³prio;
- `ConversationList`, `ContactSidebar` e `TicketFromConvModal` tambÃ©m ficaram separados.
