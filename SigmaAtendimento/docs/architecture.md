# Architecture Document - Sigma Atendimento V1

## 1. Visão Arquitetural

O Sigma Atendimento utilizará uma arquitetura de Monorepo (através do npm workspaces ou Turborepo), dividindo escopos de responsabilidade em pacotes e aplicações. A comunicação entre o painel de atendimento e o servidor será baseada em REST API para operações tradicionais (CRUDs) e WebSockets para o tráfego das mensagens de canal e sincronização de estado (Inbox Realtime).

### 1.1 Stack Tecnológica
* **Gerenciador de Pacotes:** `npm` (Workspaces).
* **Linguagem Principal:** TypeScript estrito.
* **Backend (`apps/api`):** Node.js + Express + Prisma ORM (PostgreSQL) + Socket.io.
* **Frontend (`apps/web`):** React (Vite) + Tailwind CSS + Zustand (Estado/WebSocket) + React Query.
* **Shared (`packages/shared`):** Contratos de API, schemas de validação Zod, tipos TypeScript (ex: Entidades, DTOs).

## 2. Diagrama Lógico de Módulos (Backend / API)

A aplicação do backend será dividida modularmente seguindo os domínios mapeados:

```text
[ Express Server / Router ]
       │
       ├── Auth Module          (JWT, Session, Login)
       ├── User Module          (CRUD, Roles, Atribuição)
       ├── Dept Module          (CRUD Departamentos)
       ├── Contact Module       (Agenda, Histórico, Notas)
       ├── Conversation Module  (Inbox, Fila, Assign, Transferência, Status)
       ├── Ticket Module        (Criação, SLA, Resolução)
       └── Settings Module      (Horários, Templates de Mensagem)
```

## 3. Camada de Integração do WhatsApp (Provedor Agnostico)

A comunicação com o WhatsApp ocorrerá mediada por uma Interface na arquitetura do backend. Isso isola as regras do restante do sistema e permite múltiplas integrações (BSP Oficial da Meta, Z-API, Evolution API, Baileys, etc).

```typescript
interface IWhatsAppProvider {
  sendTextMessage(to: string, content: string): Promise<boolean>;
  sendMediaMessage(to: string, mediaUrl: string, caption?: string): Promise<boolean>;
  // ... future implementations like sendButtons, sendTemplate
}
```

O fluxo completo da mensagem (Cliente enviando para a Empresa) funcionará ativamente sobre o modelo de `Webhooks`:

### 3.1 Fluxo Inbound (Cliente -> Sistema)
1. **[WhatsApp / BSP]** -> Envia um POST com payload na rota HTTP `/api/webhooks/whatsapp`.
2. O **Webhook Controller** mapeia o formato do provedor para um DTO interno unificado (`IncomingMessageDTO`).
3. O controlador despacha o payload para o **Conversation Service**.
4. O *Service* verifica:
   * **Se = Fora do horário?** Envia imediatamente via `IWhatsAppProvider` a mensagem de ausência. Fim do processo.
   * **Gatilho de Novas:** É o primeiro contato da pessoa? Salva Contato, inicia nova Conversation, e dispara mensagem de Boas-Vindas.
   * **Reabertura:** É um contato que teve o chamado recém-fechado < X limite? Reabre o `status` e aponta para o Agente anterior.
5. Salva a `Message` no Postgres via Prisma.
6. Emite evento via **Socket.io** (`new_message`) para o frontend conectado.
7. Frontend dos usuários recebem o pulso, tocando um bipe e subindo a mensagem na tela.

### 3.2 Fluxo Outbound (Agente -> Cliente)
1. Agente clica em Enviar pela tela web. Frontend despacha um POST via REST HTTP (`/api/messages/send`) ou emit WebSocket.
2. O **Message Controller** valida a permissão do agente conectado.
3. Grava no banco de dados (`status: sent_to_provider`).
4. Invoca o `IWhatsAppProvider.sendTextMessage(...)`.
5. Retorna status ao frontend. Recebe webhook posterior de `delivered / read`, e o estado do check visual ✅ é atualizado via WebSocket ativo.

## 4. Estrutura de Pastas do Monorepo

```bash
/
├── apps/
│   ├── api/                  # Backend Node.js
│   │   ├── src/
│   │   │   ├── controllers/
│   │   │   ├── services/
│   │   │   ├── routes/
│   │   │   ├── providers/    # Integrações externas (WhatsApp)
│   │   │   ├── prisma/       # Schemas e Migrations do BD
│   │   │   └── websockets/
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   └── web/                  # Frontend SPA Vite
│       ├── src/
│       │   ├── components/
│       │   ├── pages/        # Telas (Login, Inbox, Configs)
│       │   ├── hooks/        # Lógica de estados e Sockets
│       │   └── stores/       # Zustand Global
│       ├── package.json
│       └── tsconfig.json
│
├── packages/
│   └── shared/               # Compartilhamento entre backend e frontend
│       ├── src/
│       │   ├── dtos/
│       │   ├── enums/
│       │   └── schemas/      # Zod validation schemas
│       ├── package.json
│       └── tsconfig.json
│
├── package.json              # Workspace root root manager
└── tsconfig.base.json        # Base configurações de TS
```

## 5. Próximos Passos Iniciais
A construção inicia pela criação manual destas pastas base e configuração do TypeScript e ambiente Node/React, seguido de ORM e autenticação simples para usuários.
