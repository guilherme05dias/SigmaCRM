# SigmaCRM — Roadmap de Evolução

> Análise comparativa com o projeto open-source [wacrm](https://github.com/ArnasDon/wacrm) e recomendações para colocar o produto em produção.

---

## Estado Atual do SigmaCRM

### O que já existe
- Inbox compartilhado (conversas + mensagens WhatsApp)
- Integração Meta Cloud API (envio, recebimento, proxy de mídia)
- Gerenciamento de contatos e clientes
- Tickets de suporte com workflow completo
- Departamentos e usuários com roles (ADMIN, SUPERVISOR, AGENT)
- Relatórios básicos
- Configurações (horário comercial, mensagens automáticas)
- Real-time via Socket.io

### O que está faltando (gap vs wacrm)
Tags, campos customizados, broadcasts, automações, chatbot visual, templates Meta, reações a mensagens, pipelines de venda, e endurecimento de segurança (signature validation, rate limit, criptografia de token).

---

## Bloqueadores de Produção (fazer antes de qualquer deploy)

Esses itens não são features — são buracos de segurança ou funcionalidade quebrada que impedem o uso real.

### 1. Validação de Assinatura do Webhook Meta
**Problema:** O webhook `/api/whatsapp/webhooks/meta` aceita qualquer POST. Na produção qualquer pessoa pode injetar mensagens falsas.

**Solução (retirada do wacrm `src/lib/whatsapp/webhook-signature.ts`):**
```typescript
// Adicionar no handler do webhook antes de processar
import crypto from 'crypto';

function verifyMetaSignature(rawBody: Buffer, signature: string): boolean {
  const appSecret = process.env.META_APP_SECRET!;
  const expected = 'sha256=' + crypto
    .createHmac('sha256', appSecret)
    .update(rawBody)
    .digest('hex');
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}
```
**Variável nova:** `META_APP_SECRET` (disponível em Meta for Developers → App Settings).  
**Esforço:** 2h

---

### 2. Criptografia do Access Token Meta
**Problema:** O `META_WHATSAPP_ACCESS_TOKEN` está em texto plano no `.env` e em logs. Em produção, o token fica exposto em variáveis de ambiente de plataformas como Railway.

**Solução (retirada do wacrm `src/lib/whatsapp/encryption.ts`):**
- Gerar `ENCRYPTION_KEY` de 64 chars hex
- Criptografar o token com AES-256-GCM antes de salvar
- Descriptografar apenas quando for chamar a Meta API

**Esforço:** 3h

---

### 3. Rate Limiting nos Endpoints
**Problema:** Os endpoints de envio de mensagem e webhook não têm limite. Um agente pode derrubar a cota da Meta (1000 msgs/dia no número de teste, 250k/dia no prod).

**Solução (retirada do wacrm `src/lib/rate-limit.ts`):**
Fixed-window counter em memória. Para escala horizontal futura, trocar por Redis com a mesma interface.

```
POST /api/whatsapp/send      → 60 req/min por companyId
POST /api/whatsapp/webhooks  → 200 req/min global (proteção anti-flood)
```
**Esforço:** 2h

---

### 4. Deploy Funcional
**Status:** `vercel.json` e `railway.toml` criados, aguardando repositório público/privado no GitHub.

**Passos restantes:**
1. Criar repo no GitHub e fazer push (`git push origin main`)
2. Criar serviço no [Railway](https://railway.app) conectando o repo → configurar env vars da API
3. Criar projeto no [Vercel](https://vercel.com) conectando o mesmo repo → configurar `VITE_API_URL` e `VITE_SOCKET_URL`
4. Atualizar `CORS_ORIGIN` no Railway com a URL do Vercel
5. Configurar webhook na Meta apontando para `https://SEU-RAILWAY.railway.app/api/whatsapp/webhooks/meta`

**Esforço:** 1-2h de setup manual

---

## Fase 1 — Funcionalidades de Alto Impacto (2–4 semanas)

### 5. Tags para Contatos
**Por que primeiro:** Tags são a base das automações, broadcasts por segmento e organização do inbox.

**Mudanças no banco (Prisma):**
```prisma
model Tag {
  id        String   @id @default(uuid())
  companyId String
  name      String
  color     String   @default("#6366f1")
  createdAt DateTime @default(now())
  contacts  ContactTag[]
  @@unique([companyId, name])
}

model ContactTag {
  contactId String
  tagId     String
  contact   Contact @relation(fields: [contactId], references: [id], onDelete: Cascade)
  tag       Tag     @relation(fields: [tagId], references: [id], onDelete: Cascade)
  @@id([contactId, tagId])
}
```

**UI:** chips coloridos no perfil do contato, no inbox e na lista de contatos.  
**Referência wacrm:** `supabase/migrations/001_initial_schema.sql` (tabelas `tags` e `contact_tags`).  
**Esforço:** 3–4 dias

---

### 6. Templates WhatsApp (Meta Approved)
**Por que:** Para iniciar conversas ou enviar broadcasts, a Meta exige templates pré-aprovados. Sem isso, não é possível enviar mensagens para quem não te mandou mensagem nas últimas 24h.

**O que implementar:**
- Listar templates da conta (`GET graph.facebook.com/v20.0/{WABA_ID}/message_templates`)
- Tela de gerenciamento em Settings
- Envio de template a partir do Inbox

**Referência wacrm:**
- `src/lib/whatsapp/meta-api.ts` → funções `submitMessageTemplate`, `editMessageTemplate`, `deleteMessageTemplate`
- `src/lib/whatsapp/template-send-builder.ts` → monta o payload correto com variáveis
- `supabase/migrations/014_message_templates_meta_integration.sql` → estrutura de dados

**Esforço:** 1 semana

---

### 7. Mensagens Interativas (Botões e Listas)
**Por que:** Essencial para qualquer chatbot ou automação. Sem isso, flows e automações ficam limitados a texto.

**O que implementar:**
- No Inbox: botão para enviar mensagem com até 3 botões ou lista de opções
- No webhook: processar `interactive_reply` e linkar à mensagem original

**Referência wacrm:**
- `src/lib/whatsapp/meta-api.ts` → funções `sendInteractiveButtons` e `sendInteractiveList`
- `supabase/migrations/009_message_actions.sql` → coluna `interactive_reply_id` e campo `content_type: 'interactive'`

**Mudanças no schema:**
```prisma
// Adicionar em Message
replyToMessageId String?            @map("reply_to_message_id")
replyToMessage   Message?           @relation("MessageReplies", fields: [replyToMessageId], references: [id])
replies          Message[]          @relation("MessageReplies")
interactiveReplyId String?          @map("interactive_reply_id")

// Adicionar em MessageType enum
INTERACTIVE
REACTION
```
**Esforço:** 4–5 dias

---

### 8. Reações a Mensagens
**Por que:** Melhoria de UX direta no inbox. Agentes podem reagir com emoji e ver reações dos contatos.

**Referência wacrm:** `supabase/migrations/009_message_actions.sql` (tabela `message_reactions`)  
**Esforço:** 2 dias

---

## Fase 2 — Motor de Broadcasts (3–5 semanas)

### 9. Broadcasts (Disparos em Massa)
**Por que:** Feature de receita — envio de campanhas segmentadas para listas de contatos. Mais importante que automações para monetização.

**Arquitetura recomendada:**
```
Broadcast
├── id, companyId, name, templateId, status (draft/scheduled/sending/sent/failed)
├── sentCount, deliveredCount, readCount (atualizado pelo webhook de status)
└── scheduledAt, sentAt

BroadcastRecipient
├── id, broadcastId, contactId
├── status (pending/sent/delivered/read/replied/failed)
├── waMessageId (para correlacionar com status webhook)
└── sentAt, deliveredAt, readAt
```

**Fluxo:**
1. Agente cria broadcast, seleciona template + variáveis + contatos (por tag ou manual)
2. Broadcast fica em `draft` → preview → `scheduled`
3. Worker processa em lotes (respeitar rate limit Meta: ~80 msgs/seg)
4. Webhook de status atualiza `deliveredCount` / `readCount` por `waMessageId`

**Referência wacrm:**
- `src/lib/broadcast-status.ts` → lógica de status badges
- `supabase/migrations/003_broadcast_recipient_wamid.sql`
- `supabase/migrations/005_broadcast_counts_incremental.sql`

**Esforço:** 2–3 semanas

---

## Fase 3 — Automações (4–6 semanas)

### 10. Engine de Automações
O wacrm tem um engine de automações completo e bem testado. A lógica pode ser portada para TypeScript/Express sem grandes mudanças.

**Triggers suportados:**
| Trigger | Descrição |
|---|---|
| `keyword_match` | Mensagem contém palavra-chave (exact ou contains) |
| `tag_added` | Tag adicionada ao contato |
| `conversation_assigned` | Conversa atribuída a agente |
| `time_based` | Agendado por cron |

**Steps/Actions suportados:**
| Step | Descrição |
|---|---|
| `send_message` | Envia texto via WhatsApp |
| `send_template` | Envia template com variáveis |
| `add_tag` / `remove_tag` | Manipula tags do contato |
| `assign_conversation` | Atribui a agente (round-robin ou específico) |
| `close_conversation` | Encerra conversa |
| `update_contact_field` | Atualiza nome/email/empresa |
| `create_deal` | Cria deal em pipeline |
| `wait` | Pausa e retoma (minutos/horas/dias) |
| `condition` | Ramificação condicional |
| `send_webhook` | POST HTTP externo |

**Condições suportadas:**
- `tag_presence` — contato tem/não tem tag
- `contact_field` — campo do contato = valor
- `message_content` — texto contém palavra
- `time_of_day` — dentro de janela de horário

**Referência wacrm:**
- `src/lib/automations/engine.ts` — executor principal (adaptar)
- `src/lib/automations/validate.ts` — validação de schema
- `src/lib/automations/steps-tree.ts` — estrutura de árvore
- `supabase/migrations/006_automations.sql` — schema de banco

**Schema de banco necessário:**
```prisma
model Automation {
  id           String   @id @default(uuid())
  companyId    String
  name         String
  triggerType  String
  triggerConfig Json
  steps        AutomationStep[]
  isActive     Boolean  @default(false)
  executionCount Int    @default(0)
  lastExecutedAt DateTime?
}

model AutomationStep {
  id           String      @id @default(uuid())
  automationId String
  automation   Automation  @relation(...)
  parentStepId String?
  branch       String?     // "yes" | "no"
  position     Int
  stepType     String
  stepConfig   Json
}

model AutomationLog {
  id             String  @id @default(uuid())
  automationId   String
  companyId      String
  contactId      String?
  triggerEvent   Json
  stepsExecuted  Int     @default(0)
  status         String  // "success" | "error"
  error          String?
  createdAt      DateTime @default(now())
}

// Fila para steps com "wait"
model AutomationPendingExecution {
  id             String   @id @default(uuid())
  automationId   String
  companyId      String
  contactId      String
  context        Json
  nextStepPosition Int
  runAt          DateTime
}
```

**Esforço:** 3–4 semanas

---

## Fase 4 — Chatbot Visual (Flows) (6–8 semanas)

### 11. Flow Builder (Chatbot Conversacional)
O sistema mais complexo — um editor visual de chatbot onde o cliente navega por um grafo de nós através de botões e respostas.

**Diferença entre Flows e Automações:**
| | Automações | Flows |
|---|---|---|
| Interação | Unilateral (sistema age) | Conversacional (aguarda resposta) |
| Controle | Sistema decide o caminho | Usuário/contato navega |
| Pausa | Apenas step `wait` | Pausa em todo nó interativo |
| Uso | Notificações, atribuições, tags | Atendimento inicial, qualificação, FAQ |

**Tipos de nós:**
| Nó | Comportamento |
|---|---|
| `start` | Ponto de entrada |
| `send_message` | Envia texto, avança automaticamente |
| `send_media` | Envia imagem/vídeo/documento |
| `send_buttons` | Envia botões interativos, **suspende** aguardando clique |
| `send_list` | Envia lista de opções, **suspende** aguardando seleção |
| `collect_input` | Captura texto livre, **suspende** aguardando resposta |
| `condition` | Ramificação baseada em campo/tag/mensagem |
| `set_tag` | Adiciona/remove tag |
| `handoff` | Transfere para agente humano |
| `end` | Encerra o flow |

**Stack recomendada:**
- Editor visual: `@xyflow/react` (mesmo do wacrm — já tem 20k estrelas, mantido ativamente)
- Layout automático de nós: `dagre` (grafo direcionado acíclico)
- Persistência: nós e arestas em tabela `FlowNode` com config JSONB

**Referência wacrm:**
- `src/lib/flows/engine.ts` — executor do grafo
- `src/lib/flows/edges.ts` — lógica de navegação entre nós
- `src/lib/flows/fallback.ts` — mensagem quando flow não entende resposta
- `src/lib/flows/layout.ts` — auto-layout com dagre
- `supabase/migrations/010_flows.sql` — schema completo

**Esforço:** 5–7 semanas (é o item mais complexo do roadmap)

---

## Fase 5 — Pipeline de Vendas (2–3 semanas)

### 12. Pipelines (Kanban)
Board Kanban para acompanhar oportunidades de venda vinculadas a contatos.

**Schema:**
```prisma
model Pipeline {
  id        String   @id @default(uuid())
  companyId String
  name      String
  stages    PipelineStage[]
}

model PipelineStage {
  id         String   @id @default(uuid())
  pipelineId String
  name       String
  position   Int
  color      String   @default("#6366f1")
  deals      Deal[]
}

model Deal {
  id          String        @id @default(uuid())
  companyId   String
  contactId   String
  stageId     String
  title       String
  value       Decimal?
  currency    String        @default("BRL")
  expectedCloseDate DateTime?
  createdAt   DateTime      @default(now())
}
```

**Referência wacrm:** `supabase/migrations/002_pipelines_enhancements.sql`  
**Esforço:** 1–2 semanas

---

## Melhorias de Arquitetura Recomendadas

### A. Campo de Busca Rápida no Inbox
O inbox atual não tem filtros por status/agente/tag. Com o crescimento da base de contatos, isso vira gargalo.

### B. Campos Customizados para Contatos
```prisma
model CustomField {
  id         String  @id @default(uuid())
  companyId  String
  fieldName  String
  fieldType  String  // "text" | "number" | "date" | "select"
  fieldOptions Json? // para tipo "select"
}

model ContactCustomValue {
  contactId    String
  customFieldId String
  value        String
  @@id([contactId, customFieldId])
}
```
Referência wacrm: `supabase/migrations/001_initial_schema.sql`

### C. Notas por Contato (separado do campo `notes`)
O campo `notes` atual no Contact é uma string simples. Trocar por tabela `ContactNote` com histórico e autor.

### D. Deduplicação de Telefone
O wacrm tem uma migração (`022_contact_phone_dedup.sql`) que garante unicidade de telefone por conta. O SigmaCRM já tem `@@unique([companyId, phone])` — manter e garantir no código.

---

## Resumo Priorizado

| # | Item | Impacto | Esforço | Fase |
|---|---|---|---|---|
| 1 | **Deploy (Railway + Vercel)** | Bloqueador | 1–2h | Agora |
| 2 | **Validação de assinatura webhook** | Segurança crítica | 2h | Agora |
| 3 | **Rate limiting** | Segurança | 2h | Agora |
| 4 | **Tags para contatos** | Alto | 3–4 dias | Fase 1 |
| 5 | **Templates Meta** | Alto | 1 semana | Fase 1 |
| 6 | **Mensagens interativas** | Alto | 4–5 dias | Fase 1 |
| 7 | **Reações a mensagens** | Médio | 2 dias | Fase 1 |
| 8 | **Broadcasts** | Alto (receita) | 2–3 semanas | Fase 2 |
| 9 | **Automações** | Alto | 3–4 semanas | Fase 3 |
| 10 | **Pipeline Kanban** | Médio | 1–2 semanas | Fase 5 |
| 11 | **Flow Builder (chatbot)** | Alto (diferencial) | 5–7 semanas | Fase 4 |

---

## O que Reutilizar Diretamente do wacrm

| Arquivo wacrm | O que pegar | Onde usar no SigmaCRM |
|---|---|---|
| `src/lib/whatsapp/webhook-signature.ts` | Função de verificação HMAC-SHA256 | `apps/api/src/routes/whatsapp.routes.ts` |
| `src/lib/whatsapp/encryption.ts` | AES-256-GCM para token Meta | `apps/api/src/whatsapp/config/metaCloud.config.ts` |
| `src/lib/whatsapp/meta-api.ts` | `sendInteractiveButtons`, `sendInteractiveList`, templates | `apps/api/src/whatsapp/providers/MetaCloudWhatsAppProvider.ts` |
| `src/lib/whatsapp/template-send-builder.ts` | Montagem de payload de template | Novo `apps/api/src/whatsapp/templates/` |
| `src/lib/rate-limit.ts` | Fixed-window rate limiter | `apps/api/src/middlewares/rateLimit.middleware.ts` |
| `src/lib/broadcast-status.ts` | Mapeamento de status para badges | `apps/web/src/lib/broadcastStatus.ts` |
| `src/lib/automations/engine.ts` | Executor de steps | `apps/api/src/services/automations/engine.ts` |
| `src/lib/automations/validate.ts` | Validação de schema de automação | `apps/api/src/services/automations/validate.ts` |
| `src/lib/flows/engine.ts` | Runner de grafos conversacionais | `apps/api/src/services/flows/engine.ts` |
| `src/lib/flows/edges.ts` | Navegação entre nós | `apps/api/src/services/flows/edges.ts` |

---

*Gerado em 2026-06-08 com base na análise do wacrm (MIT) e do estado atual do SigmaCRM.*
