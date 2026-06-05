# Product Requirements Document (PRD) - Sigma Atendimento V1

## 1. Visão Geral do Produto
O **Sigma Atendimento** é um sistema de atendimento ao cliente via WhatsApp, focado estritamente em um suporte técnico humanizado. A plataforma é projetada para ser leve, responsiva e de fácil manutenção, operando via web. Diferente de muitas soluções modernas, este sistema **não utiliza Inteligência Artificial** para responder mensagens. As automações são limitadas e 100% determinísticas (boas-vindas, mensagens de ausência fora de horário e encerramento). 

## 2. Escopo da V1
A primeira versão foca na fundação sólida para operação eficiente por uma equipe de atendimento.

### 2.1 Restrições e Limites
* **Multi-empresa:** A V1 suportará apenas um *tenant* (uma empresa) na interface, mas o modelo de dados contemplará a hierarquia (tabela `Company`) para facilitar expansões futuras.
* **Canais:** Suporte único a 1 (um) número de WhatsApp.
* **Usuários:** Múltiplos logins simultâneos via painel web, com perfis (Admin, Supervisor, Agente).
* **Ausência de IA:** É estritamente proibido o uso de LLMs, embeddings ou chatbots inteligentes para interação ou tomada de decisão primária.

## 3. Regras de Negócio
### 3.1 Distribuição de Conversas (Inbox)
* Quando um cliente envia uma mensagem, ela cai em uma **fila única global** de "Novas Conversas".
* Qualquer agente/atendente livre pode "puxar" a conversa da fila para iniciar o atendimento.
* Deve ser possível transferir a conversa em andamento para outro agente específico ou para um departamento (N1, N2, Financeiro, etc).

### 3.2 Horário de Atendimento
* Configurável via painel (dias da semana e horas).
* Interações recebidas fora do horário acionam um disparo automático da **Mensagem de Ausência**.

### 3.3 Mensagens Automáticas (Gatilhos Fixos)
1. **Boas-vindas:** Enviada na primeira interação do cliente ou quando um novo ciclo de atendimento se inicia.
2. **Ausência:** Enviada fora do expediente bancado nas configurações.
3. **Encerramento:** Disparada pelo sistema assim que o agente clica em "Encerrar Atendimento".

### 3.4 Ciclo de Vida do Atendimento (Reabertura)
* Após encerrado, se o cliente responder dentro de um intervalo de **X horas** (configurável, default 24h), o ticket/conversa anterior é **reaberto**.
* Após X horas, uma nova conversa é iniciada, passando novamente pelas regras de Novas Conversas (boas-vindas, fila global).

## 4. Estrutura de Domínio e Entidades

Para preparar o terreno, as entidades base do banco de dados relacional seguirão a estrutura:

* `Company`: (id, nome, ativo, razao_social) - Base para o futuro multi-tenant.
* `User`: (id, company_id, nome, email, password_hash, role, department_id, ativo)
* `Department`: (id, company_id, nome, descrição, ativo)
* `Contact`: (id, company_id, nome, phone, email, notes)
* `Conversation`: (id, company_id, contact_id, channel, department_id, agent_id, status, origin)
* `Message`: (id, conversation_id, direction, type, content, media_url, status)
* `Ticket`: (id, company_id, contact_id, conversation_id, subject, description, priority, status, department_id, agent_id)
* `Tag` e `TagAssignment`: (Para categorização livre de tickets, conversas e contatos).
* `Settings`: (id, company_id, business_hours, welcome_message, away_message, closing_message, reopen_hours_limit)

## 5. Módulos e Telas da V1

### 5.1 Autenticação e Perfis (Admin, Supervisor, Agente)
* Dashboard de Login no Frontend.
* CRUD Administrativo para gerenciar usuários da conta.

### 5.2 Painel de Atendimento (Inbox)
* **Sidebar Esquerda:** Lista contínua de contatos/conversas com filtros ágeis (Novas, Em Atendimento, Encerradas | Minhas vs. Todas).
* **Área Central (Chat):** Histórico completo, capacidade de enviar texto e mídia. Notas internas (invisíveis ao cliente).
* **Painel de Ações:** Assumir atendimento, Transferir, Encerrar.

### 5.3 Gestão de Contatos e Tickets
* Listagem em formato de tabela (CRUD) para Contatos e Ticketização do atendimento.

### 5.4 Configurações Gerais
* Tela para editar os fusos e grades de Horário de Atendimento.
* Inputs das 3 mensagens textuais padrões.

## 6. Requisitos Não Funcionais (Stack e Arquitetura Web)
* **Backend:** Node.js, Express (ou equivalente minimalista), TypeScript, Postgres + Prisma ORM.
* **Frontend:** React (SPA - Ex: Vite com React) com forte reuso de componentes, Zod para tipagem de formulários e Tailwind CSS para visual leve.
* **Tempo Real:** Socket.io ou nativo WebSockets para atualizar a Inbox instantaneamente sem polling.
* **API WhatsApp:** Camada de abstração garantida (`IWhatsAppProvider`). O core não conhece o provedor final. O banco recebe webhooks limpos e processados.
* Tudo deve ser empacotado estruturalmente na raiz como um monorepo (`apps/api`, `apps/web`, `packages/shared`).
