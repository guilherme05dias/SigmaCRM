# Plano de Implantação SigmaCRM — Roteiro para Antigravity

> Roteiro passo a passo para evoluir o SigmaCRM até produção, inspirado no [wacrm](https://github.com/ArnasDon/wacrm) (MIT).
> Cada tarefa é **autocontida**, tem **critério de aceite** e respeita as convenções do projeto.
> Companion do [ROADMAP.md](./ROADMAP.md) — o ROADMAP explica *o quê* e *por quê*; este arquivo explica *como*.

---

## 0. Contexto do Repositório (leia antes de tudo)

**Monorepo** `SigmaAtendimento` com npm workspaces:

```
apps/
  api/          → Express + TypeScript + Prisma + Socket.io (porta 3334)
  web/          → React + Vite (porta 5173)
  whatsapp-api/ → legado (whatsapp-web.js) — NÃO mexer
packages/       → código compartilhado
```

### Convenções OBRIGATÓRIAS (não negociáveis)

| Regra | Detalhe |
|---|---|
| **Multi-tenant** | Toda tabela de negócio tem `companyId`. Toda query filtra por ele. Nunca vaze dados entre empresas. |
| **Tenant no request** | Use `getCompanyId(req)` (de `apps/api/src/lib/tenant.ts`) para obter o `companyId` do usuário logado. |
| **Auth** | Rotas protegidas usam `authMiddleware`. Rotas de admin usam `requireWhatsAppAdmin` ou checagem de `req.user.role`. |
| **Prisma naming** | Modelos em PascalCase, campos em camelCase, com `@map("snake_case")` quando a coluna física diverge (ADR-05). |
| **Migrations** | Após editar `schema.prisma`: `npx prisma format && npx prisma validate` e depois `npx prisma migrate dev --name <nome>`. NUNCA edite o banco direto. |
| **Realtime** | Emita eventos com `emitToCompany(companyId, evento, payload)` e `getIO().to(\`conversation:${id}\`).emit(...)` (de `apps/api/src/socket.ts`). |
| **Provider WhatsApp** | Todo envio passa pela interface `IWhatsAppProvider`. Se adicionar um método novo, implemente nos **3** providers: Meta, Mock e Murilo. |
| **Outbox** | Envio de mensagem usa o padrão Outbox (`apps/api/src/services/whatsappOutbox.service.ts`) para retry/idempotência. |
| **Idempotência** | Webhook deduplica por `WhatsAppInboundEvent` com `@@unique([provider, providerMessageId])`. |
| **Registro de rota** | Toda rota nova é registrada em `apps/api/src/server.ts` com `app.use('/api/<recurso>', <recurso>Routes)`. |

### Arquivos de referência (estude antes de codar)

- `apps/api/src/routes/whatsapp.routes.ts` — padrão de rota, webhook, auth, emit
- `apps/api/src/services/whatsappOutbox.service.ts` — padrão de envio com retry
- `apps/api/src/whatsapp/IWhatsAppProvider.ts` — interface dos providers
- `apps/api/src/whatsapp/providers/MetaCloudWhatsAppProvider.ts` — implementação Meta
- `apps/api/src/lib/tenant.ts` — `getCompanyId(req)`
- `apps/api/src/socket.ts` — `emitToCompany`, `getIO`
- `apps/api/prisma/schema.prisma` — modelo de dados atual

### Regras de execução para o agente

1. **Uma tarefa por vez, na ordem numérica.** Não pule etapas.
2. **Ao terminar cada tarefa**, rode o critério de aceite. Se falhar, conserte antes de seguir.
3. **Nunca commite secrets.** Variáveis novas vão em `.env.example`, valores reais só no `.env` local (que é gitignored).
4. **Após cada tarefa**, rode `npm run build:api` (e `build:web` se mexeu no front) para garantir que compila.
5. **Commits pequenos e descritivos** ao final de cada tarefa concluída e validada.
6. **Não refatore** o que não faz parte da tarefa. Mudança cirúrgica.

---

# FASE 0 — Bloqueadores de Produção

> Sem estes itens o sistema **não pode** ir para produção. Faça primeiro.

## Tarefa 0.1 — Validação de Assinatura do Webhook Meta

**Objetivo:** rejeitar qualquer POST no webhook que não venha assinado pela Meta (HMAC-SHA256 com o App Secret).

**Problema atual:** `processIncomingWebhook` em `whatsapp.routes.ts` aceita qualquer corpo. Qualquer um pode forjar mensagens.

**Passos:**

1. Adicionar variável `META_APP_SECRET` em `apps/api/.env.example` e `apps/api/.env` (valor real está em Meta for Developers → Configurações do App → Chave Secreta).

2. O Express precisa do **corpo cru (raw body)** para validar o HMAC. Em `apps/api/src/server.ts`, troque o `express.json()` global por uma versão que captura o raw body:

```typescript
app.use(express.json({
  verify: (req: any, _res, buf) => { req.rawBody = buf; },
}));
```

3. Criar `apps/api/src/whatsapp/security/verifyMetaSignature.ts`:

```typescript
import crypto from 'crypto';

/** Valida o header X-Hub-Signature-256 enviado pela Meta. */
export function verifyMetaSignature(rawBody: Buffer, signatureHeader?: string): boolean {
  const appSecret = process.env.META_APP_SECRET;
  // Sem secret configurado → não bloqueia (dev/mock). Logue um aviso.
  if (!appSecret) {
    console.warn('[SIGMA] META_APP_SECRET não configurado — assinatura do webhook NÃO validada.');
    return true;
  }
  if (!signatureHeader) return false;

  const expected = 'sha256=' + crypto
    .createHmac('sha256', appSecret)
    .update(rawBody)
    .digest('hex');

  const a = Buffer.from(expected);
  const b = Buffer.from(signatureHeader);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}
```

4. Em `whatsapp.routes.ts`, no início de `processIncomingWebhook`, antes de qualquer processamento:

```typescript
// Só valida em provider real (meta-cloud). Mock/debug continuam livres.
if ((process.env.WHATSAPP_PROVIDER || 'mock') === 'meta-cloud') {
  const rawBody = (req as any).rawBody as Buffer | undefined;
  const signature = req.headers['x-hub-signature-256'] as string | undefined;
  if (!rawBody || !verifyMetaSignature(rawBody, signature)) {
    console.warn('[SIGMA] Webhook rejeitado: assinatura inválida.');
    return res.status(401).json({ error: 'Invalid signature' });
  }
}
```

> Nota: a rota de debug `/debug/mock-whatsapp/incoming` chama a mesma função, mas como ela só roda com provider != meta-cloud, o `if` acima a deixa passar. Confirme isso.

**Critério de aceite:**
- Com `META_APP_SECRET` setado, POST sem header `X-Hub-Signature-256` válido → `401`.
- POST com assinatura correta (calcule o HMAC do raw body) → `200`.
- `npm run build:api` compila.

**Referência wacrm:** `src/lib/whatsapp/webhook-signature.ts`.

---

## Tarefa 0.2 — Criptografia do Access Token Meta (AES-256-GCM)

**Objetivo:** parar de guardar o token Meta em texto plano. Guardar criptografado e descriptografar só na hora de chamar a API.

> **Decisão de escopo:** hoje o token vive em `META_WHATSAPP_ACCESS_TOKEN` (env var). Criptografar uma env var no próprio processo tem ganho limitado. O ganho real aparece quando os tokens forem **por empresa, no banco** (multi-WABA). Implemente o **utilitário de cripto agora** e prepare o terreno; a migração do token para o banco é a Tarefa 1.0 (opcional/futura).

**Passos:**

1. Adicionar `ENCRYPTION_KEY` (64 chars hex = 32 bytes) em `.env.example` e `.env`. Gere com:
   ```powershell
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```

2. Criar `apps/api/src/lib/crypto.ts`:

```typescript
import crypto from 'crypto';

const ALGO = 'aes-256-gcm';

function key(): Buffer {
  const hex = process.env.ENCRYPTION_KEY;
  if (!hex || hex.length !== 64) {
    throw new Error('ENCRYPTION_KEY ausente ou inválida (esperado 64 hex chars).');
  }
  return Buffer.from(hex, 'hex');
}

/** Retorna "iv:authTag:ciphertext" em base64. */
export function encrypt(plaintext: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, key(), iv);
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString('base64'), tag.toString('base64'), enc.toString('base64')].join(':');
}

export function decrypt(payload: string): string {
  const [ivB64, tagB64, dataB64] = payload.split(':');
  const decipher = crypto.createDecipheriv(ALGO, key(), Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64')), decipher.final()]).toString('utf8');
}
```

3. Escrever um teste manual (`apps/api/src/scripts/test-crypto.ts`) que faz `decrypt(encrypt('abc')) === 'abc'` e roda com `npx tsx apps/api/src/scripts/test-crypto.ts`.

**Critério de aceite:**
- `decrypt(encrypt(x)) === x` para qualquer string.
- Token adulterado (1 byte trocado) → erro na descriptografia (GCM detecta).

**Referência wacrm:** `src/lib/whatsapp/encryption.ts`.

---

## Tarefa 0.3 — Rate Limiting

**Objetivo:** impedir flood nos endpoints de envio e proteger a cota da Meta.

**Passos:**

1. Criar `apps/api/src/middlewares/rateLimit.middleware.ts` — fixed-window em memória:

```typescript
import { Request, Response, NextFunction } from 'express';

interface Bucket { count: number; resetAt: number; }
const store = new Map<string, Bucket>();

/**
 * @param windowMs janela em ms
 * @param max requisições permitidas na janela
 * @param keyFn como identificar o cliente (default: companyId ou IP)
 */
export function rateLimit(windowMs: number, max: number, keyFn?: (req: Request) => string) {
  return (req: Request, res: Response, next: NextFunction) => {
    const key = keyFn ? keyFn(req) : (req.user?.companyId || req.ip || 'global');
    const now = Date.now();
    const bucket = store.get(key);

    if (!bucket || now > bucket.resetAt) {
      store.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }
    if (bucket.count >= max) {
      const retryAfter = Math.ceil((bucket.resetAt - now) / 1000);
      res.setHeader('Retry-After', String(retryAfter));
      return res.status(429).json({ error: 'Limite de requisições excedido. Tente novamente em breve.' });
    }
    bucket.count += 1;
    next();
  };
}

// Limpeza periódica de buckets expirados
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of store) if (now > v.resetAt) store.delete(k);
}, 60_000).unref();
```

2. Aplicar nos endpoints sensíveis:
   - Envio de mensagem (rota de inbox/conversations que dispara WhatsApp): `rateLimit(60_000, 60)` (60/min por empresa).
   - Webhook: `rateLimit(60_000, 300, () => 'webhook-global')` (300/min global).

> Para escala horizontal futura, trocar o `Map` por Redis mantendo a mesma assinatura.

**Critério de aceite:**
- A 61ª requisição em 1 min na rota de envio → `429` com header `Retry-After`.
- Build compila.

**Referência wacrm:** `src/lib/rate-limit.ts`.

---

## Tarefa 0.4 — Deploy (Railway + Vercel)

**Objetivo:** links públicos reais (o webhook da Meta não alcança localhost).

> Arquitetura: **Web → Vercel** (estático). **API → Railway** (processo persistente, precisa de WebSocket/Socket.io, que o Vercel serverless não suporta).

**Passos (setup manual, fora do código — o agente orienta o usuário):**

1. **GitHub:** criar repo **privado** (há credenciais no histórico) e `git push origin main`.
2. **Railway:** novo projeto → conectar repo. Já existe `railway.toml`. Configurar env vars (todas de `apps/api/.env.example` com valores reais): `DATABASE_URL`, `DIRECT_URL`, `JWT_SECRET`, `WHATSAPP_PROVIDER=meta-cloud`, `META_*`, `META_APP_SECRET`, `ENCRYPTION_KEY`, `SIGMA_INTERNAL_TOKEN`, `CORS_ORIGIN` (preencher depois do passo 3).
3. **Vercel:** novo projeto → mesmo repo. Já existe `vercel.json`. Setar `VITE_API_URL` e `VITE_SOCKET_URL` com a URL pública do Railway.
4. **CORS:** atualizar `CORS_ORIGIN` no Railway com a URL do Vercel.
5. **Webhook Meta:** apontar para `https://SEU-RAILWAY.railway.app/api/whatsapp/webhooks/meta`, com o `verify_token` = `META_WHATSAPP_VERIFY_TOKEN`. Assinar o campo `messages`.
6. **Número de teste:** adicionar o número do destinatário na lista de números permitidos no painel Meta (número de teste só fala com destinatários aprovados).

**Critério de aceite:**
- `GET https://.../health` → `{status:"ok"}`.
- Verificação do webhook na Meta passa (challenge ecoado).
- Login no front Vercel funciona (sem erro de CORS).

---

# FASE 0.5 — Conexão "estilo DigiSac" (Evolution API / Baileys) — TRILHA ALTERNATIVA

> **Leia antes de implementar:** esta fase é uma **alternativa** ao Meta Cloud API, não um complemento.
> Ela conecta o WhatsApp via **QR Code (multidispositivo)**, mantendo o número no celular — o modelo
> que DigiSac/Evotalks usam no plano "não-oficial".
>
> **Trade-offs (decisão de negócio, já discutida com o usuário):**
> - ✅ Número fica no celular; cliente usa o mesmo número; sem custo por mensagem.
> - ⚠️ Protocolo **não-oficial** → **risco de banimento**; a Meta pode quebrar o protocolo.
> - ❌ **Sem** templates oficiais, **sem** botões/listas interativas (Fase 1.3), **sem** broadcast oficial (Fase 2).
>   Se esta trilha for a principal, as Fases 1.2, 1.3 e 2 do roadmap **não se aplicam** (são Cloud-API-only).
>
> **A abstração `IWhatsAppProvider` permite os dois canais coexistirem.** O `WHATSAPP_PROVIDER` decide qual
> está ativo. O deploy do Meta Cloud no Railway **continua intacto**; esta fase só adiciona um novo provider.
>
> **Modele o novo provider no `MuriloWhatsAppApiProvider`** (`apps/api/src/whatsapp/providers/MuriloWhatsAppApiProvider.ts`)
> — ele já é exatamente o padrão "provider que fala com um serviço HTTP externo via REST".

---

## Tarefa E.1 — Subir a Evolution API (infra, manual)

**Objetivo:** rodar a Evolution API (gateway Baileys) com persistência de sessão.

**Para TESTAR (local, R$ 0):** crie `infra/evolution/docker-compose.yml` (fora do build da API):

```yaml
services:
  evolution-api:
    image: evoapicloud/evolution-api:latest
    ports:
      - "8080:8080"
    environment:
      - AUTHENTICATION_API_KEY=troque-por-uma-chave-forte
      - DATABASE_ENABLED=true
      - DATABASE_PROVIDER=postgresql
      - DATABASE_CONNECTION_URI=postgresql://evo:evo@postgres:5432/evolution
      - CACHE_REDIS_ENABLED=true
      - CACHE_REDIS_URI=redis://redis:6379
      - DEL_INSTANCE=false
    volumes:
      - evolution_instances:/evolution/instances   # ← guarda a sessão do QR (NÃO perder)
    depends_on: [postgres, redis]

  postgres:
    image: postgres:16-alpine
    environment:
      - POSTGRES_USER=evo
      - POSTGRES_PASSWORD=evo
      - POSTGRES_DB=evolution
    volumes: [evolution_pg:/var/lib/postgresql/data]

  redis:
    image: redis:7-alpine

volumes:
  evolution_instances:
  evolution_pg:
```

`docker compose -f infra/evolution/docker-compose.yml up -d`

**Para PRODUÇÃO:** mesmo compose num **VPS** (~R$25-40/mês) ou como **2º serviço no Railway** (com volume persistente em `/evolution/instances`). Nunca em hospedagem compartilhada.

**Critério de aceite:**
- `GET http://localhost:8080/instance/fetchInstances` com header `apikey: <sua-chave>` → `200`.
- O volume `evolution_instances` persiste a sessão entre restarts (não pede QR de novo).

**Referência:** [docs Evolution API](https://doc.evolution-api.com) — confirme os endpoints da **versão** que subir (v1 e v2 divergem em paths/payloads).

---

## Tarefa E.2 — Criar instância e conectar o número (manual)

1. `POST /instance/create` (header `apikey`) com body:
   ```json
   { "instanceName": "sigma-principal", "integration": "WHATSAPP-BAILEYS", "qrcode": true }
   ```
2. `GET /instance/connect/sigma-principal` → retorna o **QR em base64**.
3. No celular: **⋮ → Aparelhos conectados → Conectar → escaneia**.
4. `GET /instance/connectionState/sigma-principal` → deve voltar `state: "open"`.

**Critério de aceite:** `connectionState = open` e o número segue funcionando no celular.

---

## Tarefa E.3 — Provider `EvolutionWhatsAppProvider` (código)

**Objetivo:** novo provider que fala com a Evolution via REST. **Modele no Murilo provider.**

1. Variáveis novas em `apps/api/.env.example` (sem valor real):
   ```
   # Evolution API (provider 'evolution')
   EVOLUTION_API_URL=http://localhost:8080
   EVOLUTION_API_KEY=
   EVOLUTION_INSTANCE_NAME=sigma-principal
   ```

2. Criar `apps/api/src/whatsapp/providers/EvolutionWhatsAppProvider.ts implements IWhatsAppProvider`.
   - `baseUrl` de `EVOLUTION_API_URL`, header `apikey: EVOLUTION_API_KEY` em **todas** as chamadas, instância de `EVOLUTION_INSTANCE_NAME`.
   - Reaproveite `normalizePhone`, `readJson`, `mapMessageType` do Murilo provider (copie/adapte).
   - Mapeamento de métodos → endpoints Evolution:

   | Método `IWhatsAppProvider` | Endpoint Evolution |
   |---|---|
   | `createSession` | `POST /instance/create` (ou reusa instância existente) |
   | `disconnectSession` | `DELETE /instance/logout/{instance}` |
   | `listSessions` | `GET /instance/connectionState/{instance}` → mapeia p/ `SessionSummary` |
   | `checkContact` | `POST /chat/whatsappNumbers/{instance}` `{ numbers: [phone] }` |
   | `sendText` | `POST /message/sendText/{instance}` `{ number, text }` → retorna `key.id` como `waMessageId` |
   | `sendMedia` | `POST /message/sendMedia/{instance}` `{ number, mediatype, media, caption }` |
   | `syncHistory` | ver Tarefa E.6 |
   | `parseIncoming` | ver Tarefa E.4 |

3. Registrar no factory `apps/api/src/whatsapp/index.ts`: novo branch
   ```typescript
   } else if (providerType === "evolution") {
     console.log("[SIGMA] Using EvolutionWhatsAppProvider as WhatsApp Provider");
     providerInstance = new EvolutionWhatsAppProvider();
   }
   ```

**Critério de aceite:** com `WHATSAPP_PROVIDER=evolution`, enviar texto pelo inbox entrega no WhatsApp e grava `waMessageId` real.

---

## Tarefa E.4 — Webhook de entrada (código)

**Objetivo:** receber mensagens que a Evolution captura e jogá-las no fluxo de inbox existente.

1. Configurar o webhook da Evolution apontando pro SigmaCRM:
   `POST /webhook/set/{instance}` com:
   ```json
   {
     "url": "https://<sua-api>/api/whatsapp/webhook?token=<SEGREDO>",
     "webhook_by_events": false,
     "events": ["MESSAGES_UPSERT", "CONNECTION_UPDATE", "QRCODE_UPDATED"]
   }
   ```

2. **Segurança:** a validação de assinatura (Tarefa 0.1) é só pra `meta-cloud`, então o webhook da Evolution **não é validado** por ela. Proteja com um **token na query** (`?token=...`) conferido no início de `processIncomingWebhook` quando `WHATSAPP_PROVIDER=evolution` (use uma env nova `EVOLUTION_WEBHOOK_TOKEN`). Rejeite com `401` se não bater.

3. Implementar `parseIncoming` no provider para o payload da Evolution (evento `messages.upsert`):
   - Caminho típico: `payload.data` → `key.remoteJid` (telefone, remover `@s.whatsapp.net`), `key.fromMe` (→ `OUTBOUND`), `key.id` (→ `waMessageId`), `pushName` (nome), `message.conversation`/`message.extendedTextMessage.text` (corpo), tipos de mídia em `message.imageMessage`/`audioMessage`/etc.
   - Mídia: a Evolution entrega base64 ou URL conforme config; mapeie pra `mediaUrl` ou trate o base64.
   - Eventos que **não** são mensagem (`CONNECTION_UPDATE`, `QRCODE_UPDATED`) → retornar `{ contact, messages: [] }` (o handler já responde 200 e ignora).

**Critério de aceite:** mandar mensagem **do celular do cliente** → aparece no inbox em tempo real; mensagem enviada pelo próprio celular entra como `OUTBOUND` (dedup por `waMessageId`).

---

## Tarefa E.5 — QR Code e status no painel (código)

**Objetivo:** o admin conecta/reconecta o número pela própria UI do CRM.

1. As rotas de QR em `whatsapp.routes.ts` hoje são travadas em `murilo-api` (`if provider !== 'murilo-api' → 400`). **Estenda** para aceitar `evolution`, buscando o QR via `GET /instance/connect/{instance}` (base64).
2. Frontend: reusar a tela de conexão existente; mostrar o QR e o `connectionState` (open/connecting/close).

**Critério de aceite:** admin abre a tela, vê o QR, escaneia, e o status vira "conectado" — tudo dentro do CRM.

---

## Tarefa E.6 — Sincronização de histórico (código, PARCIAL)

**Objetivo:** importar o histórico recente ao conectar.

> **Expectativa honesta:** o multidispositivo só sincroniza um **trecho recente** — não o histórico completo. Documente isso na UI ("importamos as conversas recentes").

1. Implementar `syncHistory` no provider:
   - Opção A: consumir os eventos de history-sync que a Evolution emite logo após o QR (`MESSAGES_SET`/history) via webhook.
   - Opção B (pull): `POST /chat/findChats/{instance}` + `POST /chat/findMessages/{instance}` `{ where: { key: { remoteJid } } }`, mapeando pro shape `WhatsAppHistoryChat[]` que o `sync-history` da rota já consome (o pipeline de importação em `whatsapp.routes.ts` já existe e funciona — só alimente com esse formato).

**Critério de aceite:** ao conectar, as conversas recentes aparecem no inbox com mensagens e datas corretas.

---

## Multi-número (futuro, opcional)

Para o modelo DigiSac completo (vários números): cada número = uma **instância** Evolution. Evoluir o schema/config para mapear `instância → departamento/empresa` e rotear o inbound conforme a instância que recebeu. Não fazer agora — só quando houver necessidade real de um 2º número.

---

# FASE 1 — Funcionalidades de Alto Impacto

## Tarefa 1.1 — Tags para Contatos

**Objetivo:** etiquetar contatos. Base para segmentação, broadcasts e automações.

**Passos:**

1. Adicionar ao `schema.prisma`:

```prisma
model Tag {
  id        String       @id @default(uuid())
  companyId String       @map("company_id")
  name      String
  color     String       @default("#6366f1")
  createdAt DateTime     @default(now()) @map("created_at")
  contacts  ContactTag[]

  @@unique([companyId, name])
  @@index([companyId])
}

model ContactTag {
  contactId String  @map("contact_id")
  tagId     String  @map("tag_id")
  contact   Contact @relation(fields: [contactId], references: [id], onDelete: Cascade)
  tag       Tag     @relation(fields: [tagId], references: [id], onDelete: Cascade)

  @@id([contactId, tagId])
}
```

2. No model `Contact`, adicionar a relação inversa:
```prisma
  tags ContactTag[]
```

3. `npx prisma format && npx prisma validate && npx prisma migrate dev --name add_tags`

4. Criar `apps/api/src/routes/tags.routes.ts` com (todos protegidos por `authMiddleware`, filtrando por `getCompanyId(req)`):
   - `GET /api/tags` — lista tags da empresa
   - `POST /api/tags` — cria `{ name, color }`
   - `PATCH /api/tags/:id` — edita
   - `DELETE /api/tags/:id` — remove
   - `POST /api/contacts/:contactId/tags` — `{ tagId }` adiciona tag ao contato
   - `DELETE /api/contacts/:contactId/tags/:tagId` — remove

5. Registrar em `server.ts`: `app.use('/api/tags', tagsRoutes)`.

6. **Frontend** (`apps/web/src`):
   - Componente `TagChip` (chip colorido) em `components/sigma/`.
   - Seletor de tags no perfil do contato e no painel do inbox.
   - Hook em `hooks/` para CRUD de tags (seguir o padrão dos hooks existentes).

**Critério de aceite:**
- Criar tag, atribuir a contato, remover. Tag não vaza entre empresas.
- `@@unique([companyId, name])` impede tag duplicada na mesma empresa.

**Referência wacrm:** `supabase/migrations/001_initial_schema.sql` (tabelas `tags`, `contact_tags`).

---

## Tarefa 1.2 — Templates WhatsApp (Meta Approved)

**Objetivo:** listar e enviar templates aprovados pela Meta (obrigatório para iniciar conversa fora da janela de 24h).

**Pré-requisito:** ter o `WABA_ID` (WhatsApp Business Account ID). Adicione `META_WHATSAPP_WABA_ID` em `.env.example`/`.env` (valor: `1001875862289438`).

**Passos:**

1. Estender `IWhatsAppProvider` com:
```typescript
listTemplates?(): Promise<WhatsAppTemplate[]>;
sendTemplate?(params: {
  to: string;
  templateName: string;
  languageCode: string;
  components?: any[]; // variáveis (body, header, buttons)
  sessionId?: string;
}): Promise<{ waMessageId: string }>;
```
   E definir o tipo `WhatsAppTemplate { name, status, category, language, components }`.

2. Implementar em `MetaCloudWhatsAppProvider.ts`:
   - `listTemplates()` → `GET graph.facebook.com/v20.0/{WABA_ID}/message_templates?access_token=...`
   - `sendTemplate()` → reutiliza `callMessagesApi` com payload `type: "template"`.
   - No `MockWhatsAppProvider` e `MuriloWhatsAppApiProvider`: stubs (Mock retorna lista fake; Murilo lança "não suportado").

3. Criar `apps/api/src/whatsapp/templates/templateSendBuilder.ts` — monta o array `components` a partir das variáveis informadas (header text/media, body params, button params). Espelhe a lógica de `src/lib/whatsapp/template-send-builder.ts` do wacrm.

4. Criar rotas em `whatsapp.routes.ts` (ou novo `templates.routes.ts`):
   - `GET /api/whatsapp/templates` — proxy de `listTemplates()` (cache de 5 min recomendado).
   - `POST /api/whatsapp/templates/send` — `{ to, templateName, languageCode, variables }` → grava Message OUTBOUND + outbox + chama provider.

5. **Frontend:** tela em Settings para visualizar templates (nome, status, categoria). Botão no inbox "Enviar template" com formulário de variáveis.

**Critério de aceite:**
- `GET /api/whatsapp/templates` retorna a lista real da conta de teste.
- Enviar um template aprovado (ex.: `hello_world`, `en_US`) entrega no WhatsApp.

**Referência wacrm:** `src/lib/whatsapp/meta-api.ts`, `src/lib/whatsapp/template-send-builder.ts`, `supabase/migrations/014_message_templates_meta_integration.sql`.

---

## Tarefa 1.3 — Mensagens Interativas (Botões e Listas)

**Objetivo:** enviar mensagens com até 3 botões ou lista de opções; processar a resposta no webhook.

**Passos:**

1. **Schema** — estender `MessageType` e `Message`:
```prisma
enum MessageType {
  TEXT
  IMAGE
  AUDIO
  VIDEO
  DOCUMENT
  INTERACTIVE   // novo
  REACTION      // novo (usado na Tarefa 1.4)
}
```
   Em `Message`:
```prisma
  replyToMessageId   String?   @map("reply_to_message_id")
  interactiveReplyId String?   @map("interactive_reply_id")
  metadata           Json?     // guarda botões/lista enviados e o reply recebido
```
   `npx prisma migrate dev --name interactive_messages`.

2. Estender `IWhatsAppProvider`:
```typescript
sendInteractiveButtons?(params: {
  to: string;
  body: string;
  buttons: { id: string; title: string }[]; // máx 3, title <= 20 chars
  sessionId?: string;
}): Promise<{ waMessageId: string }>;

sendInteractiveList?(params: {
  to: string;
  body: string;
  buttonText: string;
  sections: { title: string; rows: { id: string; title: string; description?: string }[] }[];
  sessionId?: string;
}): Promise<{ waMessageId: string }>;
```

3. Implementar em `MetaCloudWhatsAppProvider.ts` via `callMessagesApi` com `type: "interactive"` (subtipos `button` e `list`). Espelhe `sendInteractiveButtons`/`sendInteractiveList` do wacrm `meta-api.ts`.

4. **Webhook** (`parseIncoming` no provider Meta): detectar `messages[].interactive` (subtipos `button_reply` / `list_reply`). Retornar uma `ParsedIncomingMessage` com `type: 'INTERACTIVE'`, `body` = título escolhido, e guardar o `id` da opção em um novo campo `interactiveReplyId` (estender `ParsedIncomingMessage`). No `processIncomingWebhook`, persistir esse id em `Message.interactiveReplyId`.

5. **Frontend:** no inbox, ação "Enviar botões/lista" com construtor simples; renderizar mensagens interativas e as respostas escolhidas de forma distinta.

**Critério de aceite:**
- Enviar 3 botões → chegam no WhatsApp; clicar um → webhook grava a resposta com o `id` correto.
- Build compila.

**Referência wacrm:** `src/lib/whatsapp/meta-api.ts`, `supabase/migrations/009_message_actions.sql`.

---

## Tarefa 1.4 — Reações a Mensagens

**Objetivo:** reagir com emoji a mensagens (e registrar reações recebidas).

**Passos:**

1. Estender `IWhatsAppProvider`:
```typescript
sendReaction?(params: { to: string; waMessageId: string; emoji: string; sessionId?: string }): Promise<void>;
```
   Implementar no Meta provider (`type: "reaction"`, payload `{ message_id, emoji }`).

2. **Schema:** registrar reações como `Message` com `type: REACTION`, `replyToMessageId` = mensagem alvo, `body` = emoji. (Reaproveita campos da Tarefa 1.3 — sem nova tabela.)

3. **Webhook:** detectar `messages[].reaction` no `parseIncoming` → criar Message `REACTION` ligada à original.

4. **Frontend:** picker de emoji ao passar o mouse numa mensagem; renderizar reação como badge sobre a bolha.

**Critério de aceite:** reagir a uma mensagem recebida entrega o emoji no WhatsApp; reação recebida aparece na UI.

**Referência wacrm:** `supabase/migrations/009_message_actions.sql` (tabela `message_reactions`).

---

# FASE 2 — Motor de Broadcasts

## Tarefa 2.1 — Broadcasts (Disparos em Massa)

**Objetivo:** campanhas segmentadas com rastreio de entrega/leitura. **Maior alavanca de receita.**

**Pré-requisitos:** Tarefa 1.1 (Tags), 1.2 (Templates) e — importante — **webhook de status** (ver passo 4).

**Passos:**

1. **Schema:**
```prisma
model Broadcast {
  id             String              @id @default(uuid())
  companyId      String              @map("company_id")
  name           String
  templateName   String              @map("template_name")
  languageCode   String              @map("language_code")
  variables      Json?               // valores padrão das variáveis do template
  status         String              @default("draft") // draft|scheduled|sending|sent|failed
  sentCount      Int                 @default(0) @map("sent_count")
  deliveredCount Int                 @default(0) @map("delivered_count")
  readCount      Int                 @default(0) @map("read_count")
  failedCount    Int                 @default(0) @map("failed_count")
  scheduledAt    DateTime?           @map("scheduled_at")
  sentAt         DateTime?           @map("sent_at")
  createdAt      DateTime            @default(now()) @map("created_at")
  recipients     BroadcastRecipient[]

  @@index([companyId])
}

model BroadcastRecipient {
  id          String    @id @default(uuid())
  broadcastId String    @map("broadcast_id")
  broadcast   Broadcast @relation(fields: [broadcastId], references: [id], onDelete: Cascade)
  contactId   String    @map("contact_id")
  status      String    @default("pending") // pending|sent|delivered|read|replied|failed
  waMessageId String?   @map("wa_message_id")
  error       String?
  sentAt      DateTime? @map("sent_at")
  deliveredAt DateTime? @map("delivered_at")
  readAt      DateTime? @map("read_at")

  @@index([broadcastId])
  @@index([waMessageId])
}
```
   `npx prisma migrate dev --name broadcasts`.

2. **Rotas** `apps/api/src/routes/broadcasts.routes.ts` (auth + companyId):
   - `POST /api/broadcasts` — cria `draft` `{ name, templateName, languageCode, variables, recipients }` (recipients por lista de `contactId` ou por `tagId`).
   - `GET /api/broadcasts` / `GET /api/broadcasts/:id` — lista/detalhe com contadores.
   - `POST /api/broadcasts/:id/send` — enfileira o disparo (status → `sending`).
   - Registrar em `server.ts`.

3. **Worker de disparo** `apps/api/src/services/broadcast/broadcastWorker.ts`:
   - Processa recipients em lotes respeitando o rate da Meta (~80 msg/s — comece conservador, ex. 10/s).
   - Para cada recipient: `sendTemplate()` → grava `waMessageId` + status `sent` + incrementa `Broadcast.sentCount`.
   - Em erro: status `failed` + `error` + incrementa `failedCount`. Não derruba o lote.
   - Use o padrão Outbox para idempotência/retry.

4. **Webhook de status (NOVO — também serve recibos do inbox):**
   - O webhook da Meta envia `statuses[]` (`sent`/`delivered`/`read`/`failed`) com `id` = `waMessageId`.
   - Em `parseIncoming`/`processIncomingWebhook`, tratar `value.statuses[]`: localizar `BroadcastRecipient` por `waMessageId`, atualizar status + timestamp, e **incrementar** `deliveredCount`/`readCount` do Broadcast (update incremental, não recomputar tudo).
   - Emitir `emitToCompany(companyId, 'broadcast:updated', {...})` para a UI atualizar em tempo real.

5. **Frontend:** wizard de broadcast (escolher template → variáveis → selecionar contatos por tag/manual → preview → agendar/enviar) e tela de acompanhamento com contadores e badges de status por recipient.

**Critério de aceite:**
- Criar broadcast para 2+ contatos de teste, enviar, ver `sentCount` subir.
- Recibos de entrega/leitura atualizam `deliveredCount`/`readCount` via webhook de status.

**Referência wacrm:** `src/lib/broadcast-status.ts`, `supabase/migrations/003_broadcast_recipient_wamid.sql`, `005_broadcast_counts_incremental.sql`.

---

# FASE 3 — Automações

## Tarefa 3.1 — Engine de Automações

**Objetivo:** disparar ações automáticas a partir de eventos (sem interação conversacional).

> **Complexidade alta.** Quebre em sub-tarefas. Porte a lógica de `src/lib/automations/engine.ts` do wacrm para TypeScript/Express.

**Passos:**

1. **Schema** (ver ROADMAP §10 para o bloco completo): `Automation`, `AutomationStep` (árvore com `parentStepId`/`branch`/`position`), `AutomationLog`, `AutomationPendingExecution` (fila dos steps `wait`). `npx prisma migrate dev --name automations`.

2. **Engine** `apps/api/src/services/automations/engine.ts`:
   - `runAutomation(automation, context)` — percorre os steps em ordem; em `condition` ramifica para `branch: "yes"|"no"`; em `wait` grava `AutomationPendingExecution` e **para**.
   - Cada step chama um handler dedicado. Implemente os steps na ordem de valor:
     1. `send_message`, `send_template` (reusa providers)
     2. `add_tag`, `remove_tag` (reusa Tarefa 1.1)
     3. `assign_conversation` (round-robin entre agentes do depto), `close_conversation`
     4. `update_contact_field`
     5. `wait`, `condition`
     6. `send_webhook` (POST externo), `create_deal` (depende da Fase 5)

3. **Validação** `apps/api/src/services/automations/validate.ts` — valida o schema da automação antes de salvar (espelha `validate.ts` do wacrm).

4. **Gatilhos (triggers):**
   - `keyword_match` — no `processIncomingWebhook`, após gravar mensagem INBOUND, checar automações ativas com trigger `keyword_match` e disparar.
   - `tag_added` — disparar ao adicionar tag (Tarefa 1.1).
   - `conversation_assigned` — disparar ao atribuir conversa.
   - `time_based` — cron (`node-cron` ou setInterval) varre `AutomationPendingExecution` com `runAt <= now` e retoma.

5. **Rotas** `automations.routes.ts`: CRUD + ativar/desativar + ver logs. Registrar em `server.ts`.

6. **Frontend:** lista de automações, editor de steps (formulário em árvore — versão visual completa fica para a Fase 4), toggle ativo, tela de logs.

**Critério de aceite:**
- Automação "se mensagem contém 'orçamento' → adiciona tag 'lead' + envia template" funciona ponta a ponta.
- Step `wait` agenda e retoma corretamente. `AutomationLog` registra execuções.

**Referência wacrm:** `src/lib/automations/engine.ts`, `validate.ts`, `steps-tree.ts`, `supabase/migrations/006_automations.sql`.

---

# FASE 4 — Chatbot Visual (Flows)

## Tarefa 4.1 — Flow Builder Conversacional

**Objetivo:** editor visual de chatbot; o contato navega por um grafo via botões/respostas.

> **Item mais complexo do roadmap (5–7 semanas).** Diferença para automações: flows **suspendem** aguardando resposta do contato. Veja a tabela comparativa no [ROADMAP.md §11](./ROADMAP.md).

**Passos:**

1. **Schema:** `Flow` (metadados + `isActive` + trigger), `FlowNode` (`type`, `config` JSONB, posição x/y), `FlowEdge` (sourceId, targetId, condition), `FlowSession` (estado de execução por contato: `currentNodeId`, `variables` JSONB, `status`). `npx prisma migrate dev --name flows`.

2. **Engine** `apps/api/src/services/flows/engine.ts`:
   - `advanceFlow(session, input)` — executa o nó atual; nós interativos (`send_buttons`, `send_list`, `collect_input`) **suspendem** salvando `FlowSession.currentNodeId`; demais avançam pela aresta resolvida.
   - Tipos de nó: `start`, `send_message`, `send_media`, `send_buttons`, `send_list`, `collect_input`, `condition`, `set_tag`, `handoff` (transfere p/ agente → `Conversation.status = ASSIGNED`), `end`.

3. **Navegação** `apps/api/src/services/flows/edges.ts` — resolve qual aresta seguir a partir da resposta (id do botão, opção da lista, condição). `fallback.ts` — mensagem quando a resposta não casa.

4. **Integração com webhook:** em `processIncomingWebhook`, se existe `FlowSession` ativa para o contato, encaminhar a mensagem para `advanceFlow` em vez do fluxo normal de inbox.

5. **Frontend (editor visual):**
   - `@xyflow/react` para o canvas de nós/arestas.
   - `dagre` para auto-layout (grafo direcionado).
   - Painel lateral para configurar cada nó.
   - Espelhe `src/lib/flows/layout.ts` do wacrm para o auto-layout.

**Critério de aceite:**
- Montar flow "boas-vindas → 2 botões (Suporte/Vendas) → roteia para tag+handoff" e executar ponta a ponta no WhatsApp.
- `FlowSession` mantém estado entre mensagens; `handoff` entrega ao agente.

**Referência wacrm:** `src/lib/flows/engine.ts`, `edges.ts`, `fallback.ts`, `layout.ts`, `supabase/migrations/010_flows.sql`.

---

# FASE 5 — Pipeline de Vendas (Kanban)

## Tarefa 5.1 — Pipelines e Deals

**Objetivo:** board Kanban de oportunidades vinculadas a contatos.

**Passos:**

1. **Schema** (ver ROADMAP §12): `Pipeline`, `PipelineStage` (com `position`, `color`), `Deal` (`contactId`, `stageId`, `title`, `value`, `currency`, `expectedCloseDate`). `npx prisma migrate dev --name pipelines`.

2. **Rotas** `pipelines.routes.ts`: CRUD de pipeline/stage/deal + `PATCH /api/deals/:id/move` (muda stage — drag&drop). Registrar em `server.ts`.

3. **Frontend:** board Kanban com colunas = stages e cards = deals, drag&drop entre colunas; card linka para o contato/conversa.

4. Habilita o step `create_deal` da Tarefa 3.1.

**Critério de aceite:** criar pipeline com 3 stages, criar deal, arrastar entre stages, persistir.

**Referência wacrm:** `supabase/migrations/002_pipelines_enhancements.sql`.

---

# Melhorias Transversais (encaixar quando fizer sentido)

- **Busca/filtros no inbox** (status, agente, tag) — fazer junto da Tarefa 1.1.
- **Campos customizados** (`CustomField` + `ContactCustomValue`) — útil antes das automações.
- **Notas por contato** (`ContactNote` com autor/histórico) — substituir o campo `notes` string.

---

# Ordem de Execução Recomendada

```
0.1 → 0.2 → 0.3 → 0.4   (bloqueadores + deploy)
1.1 → 1.2 → 1.3 → 1.4   (tags, templates, interativas, reações)
2.1                      (broadcasts) ← maior ROI
3.1                      (automações)
5.1                      (pipeline — relativamente barato)
4.1                      (flow builder — mais caro, deixar por último)
```

---

# PROMPT PARA O ANTIGRAVITY

> Cole o bloco abaixo no Antigravity. Ele assume que o Antigravity tem acesso ao repositório `SigmaAtendimento` e ao arquivo `PLANO_ANTIGRAVITY.md` (este).

```
Você é um engenheiro sênior trabalhando no monorepo SigmaCRM (pasta SigmaAtendimento),
um CRM de atendimento WhatsApp com apps/api (Express + TypeScript + Prisma + Socket.io)
e apps/web (React + Vite). Sua tarefa é implementar o roteiro descrito em
`PLANO_ANTIGRAVITY.md`, que está na raiz do projeto.

REGRAS INEGOCIÁVEIS:
1. Leia PLANO_ANTIGRAVITY.md por completo e o ROADMAP.md antes de escrever qualquer código.
   Leia também a seção "0. Contexto do Repositório" e ESTUDE os arquivos de referência
   listados lá (whatsapp.routes.ts, whatsappOutbox.service.ts, IWhatsAppProvider.ts,
   MetaCloudWhatsAppProvider.ts, tenant.ts, socket.ts, schema.prisma).
2. Implemente UMA tarefa por vez, na ordem da seção "Ordem de Execução Recomendada".
   Comece pela Tarefa 0.1. NÃO pule etapas.
3. Respeite TODAS as convenções da tabela "Convenções OBRIGATÓRIAS":
   - multi-tenant: toda query filtra por companyId via getCompanyId(req);
   - Prisma camelCase com @map para snake_case;
   - migrations só via `npx prisma format && npx prisma validate && npx prisma migrate dev --name <nome>`;
   - realtime via emitToCompany/getIO;
   - todo método novo de envio deve ser implementado nos 3 providers (Meta, Mock, Murilo);
   - rotas novas registradas em server.ts.
4. Ao terminar cada tarefa: rode o CRITÉRIO DE ACEITE da tarefa, rode `npm run build:api`
   (e `npm run build:web` se mexeu no front), conserte erros, e só então faça um commit
   pequeno e descritivo (ex.: "feat(webhook): valida assinatura HMAC da Meta").
5. NUNCA commite secrets. Variáveis novas vão em apps/api/.env.example (sem valor real).
   Avise quais valores reais eu preciso preencher no .env local.
6. Mudanças cirúrgicas: não refatore o que não faz parte da tarefa atual.
7. Para a Tarefa 0.4 (deploy), que é setup manual de plataforma, apenas me forneça o
   passo a passo e a lista de env vars — não tente automatizar o que exige minhas credenciais.

ENTREGÁVEL DE CADA TAREFA:
- código implementado seguindo as convenções;
- critério de aceite verificado (descreva como testou);
- migration aplicada quando houver mudança de schema;
- commit feito;
- um resumo de 2-3 linhas do que mudou e o que eu preciso configurar (se algo).

Comece confirmando que leu o plano e listando, em 1 linha cada, as Tarefas 0.1 a 0.4.
Depois implemente a Tarefa 0.1 (Validação de Assinatura do Webhook Meta).
Pare após cada tarefa e aguarde minha confirmação antes de seguir para a próxima.
```

---

*Gerado em 2026-06-08 a partir da análise do wacrm (MIT) e da arquitetura real do SigmaCRM.*
