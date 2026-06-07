# Sigma Atendimento — Referencia da API

**Atualizado em:** 2026-06-07

Esta referencia descreve a API ativa do produto `SigmaAtendimento`.
O codigo fica em `SigmaAtendimento/apps/api`.

## Base local

Com o `.env.example` atual, a API roda em:

```text
http://localhost:3334
```

Endpoints publicos de saude:

```http
GET /
GET /health
```

Observacao: o codigo tem fallback interno para `PORT=3333` caso `PORT` nao seja
configurado. No projeto atual, configure `PORT=3334` para alinhar Web, webhook e docs.

## Autenticacao

Exceto onde indicado como publico, as rotas usam JWT:

```http
Authorization: Bearer <token>
```

Login:

```http
POST /api/auth/login
Content-Type: application/json
```

```json
{
  "email": "admin@dragonbyte.com",
  "password": "123456"
}
```

Resposta:

```json
{
  "token": "...",
  "user": {
    "id": "...",
    "email": "admin@dragonbyte.com",
    "name": "Guilherme",
    "role": "ADMIN",
    "companyId": "..."
  }
}
```

Usuario autenticado:

```http
GET /api/auth/me
```

## Regras de tenancy e permissoes

- Todas as rotas de negocio usam `companyId` do JWT.
- IDs relacionados precisam pertencer a mesma empresa.
- `ADMIN` e `SUPERVISOR` acessam operacoes administrativas.
- Endpoints operacionais de WhatsApp exigem `ADMIN` ou `SUPERVISOR`.
- Webhooks publicos de WhatsApp nao usam JWT, porque sao chamados por provedores.

## Rotas principais

| Metodo | Rota | Auth | Uso |
|---|---|---:|---|
| `POST` | `/api/auth/login` | Nao | Login e emissao do JWT |
| `GET` | `/api/auth/me` | Sim | Usuario logado |
| `GET` | `/api/reports/summary` | Sim | Resumo do dashboard |
| `GET` | `/api/settings` | Sim | Configuracoes do sistema |
| `PUT` | `/api/settings` | Sim | Atualizar configuracoes |

## Usuarios

| Metodo | Rota | Auth | Uso |
|---|---|---:|---|
| `GET` | `/api/users` | Sim | Listar usuarios da empresa |
| `POST` | `/api/users` | Sim | Criar usuario |
| `PUT` | `/api/users/:id` | Sim | Atualizar usuario |
| `DELETE` | `/api/users/:id` | Sim | Remover/desativar usuario |

Ao criar ou alterar senha, envie `password` ou `passwordHash`. O backend grava hash
com `bcryptjs`.

Campo de assinatura de mensagem do usuario:

```json
{
  "messageSignature": "Guilherme Dias | Suporte tecnico"
}
```

Quando configurada, a assinatura entra no inicio das mensagens enviadas pelo Inbox.

## Departamentos

| Metodo | Rota | Auth | Uso |
|---|---|---:|---|
| `GET` | `/api/departments` | Sim | Listar departamentos |
| `POST` | `/api/departments` | Sim | Criar departamento |
| `PUT` | `/api/departments/:id` | Sim | Atualizar departamento |
| `DELETE` | `/api/departments/:id` | Sim | Remover departamento |

## Clientes e contatos

Clientes:

| Metodo | Rota | Auth | Uso |
|---|---|---:|---|
| `GET` | `/api/customers` | Sim | Listar clientes |
| `GET` | `/api/customers/:id` | Sim | Detalhar cliente |
| `POST` | `/api/customers` | Sim | Criar cliente |
| `PATCH` | `/api/customers/:id` | Sim | Atualizar cliente |
| `DELETE` | `/api/customers/:id` | Sim | Remover cliente |

Contatos:

| Metodo | Rota | Auth | Uso |
|---|---|---:|---|
| `GET` | `/api/contacts` | Sim | Listar contatos |
| `GET` | `/api/contacts/:id` | Sim | Detalhar contato |
| `POST` | `/api/contacts` | Sim | Criar contato |
| `PATCH` | `/api/contacts/:id` | Sim | Atualizar contato |
| `DELETE` | `/api/contacts/:id/data` | Sim | LGPD: remover dados do contato |

Query params de contatos:

- `query`: busca por nome, telefone ou email.
- `customerId`: filtra por cliente.
- `take`: limite entre `1` e `500`; padrao atual `100`.

`Contact.phone` e unico por empresa, nao global.

## Conversas

Estas rotas sao a API preferencial para o Inbox atual.

| Metodo | Rota | Auth | Uso |
|---|---|---:|---|
| `GET` | `/api/conversations` | Sim | Listar conversas da empresa |
| `POST` | `/api/conversations/start` | Sim | Iniciar conversa ativa pelo telefone |
| `GET` | `/api/conversations/:id/messages` | Sim | Listar mensagens paginadas |
| `POST` | `/api/conversations/:id/take` | Sim | Assumir conversa |
| `POST` | `/api/conversations/:id/transfer` | Sim | Transferir fila/usuario |
| `POST` | `/api/conversations/:id/messages` | Sim | Enviar mensagem |

Iniciar conversa:

```json
{
  "phone": "5549999999999",
  "name": "Cliente opcional",
  "departmentId": "opcional"
}
```

Antes de criar conversa, o backend valida o numero no provider WhatsApp. Se o numero
nao possuir WhatsApp, retorna `404`.

Listar mensagens:

```http
GET /api/conversations/:id/messages?take=50&cursor=<messageId>
```

Resposta:

```json
{
  "data": [],
  "meta": {
    "hasMore": false,
    "nextCursor": null
  }
}
```

Enviar mensagem:

```json
{
  "body": "Texto da mensagem"
}
```

Se o provider falhar, a rota retorna erro `503` com a mensagem do provider.

## Inbox legado/compatibilidade

Tambem existem rotas em `/api/inbox`, mantidas por compatibilidade:

| Metodo | Rota |
|---|---|
| `GET` | `/api/inbox/conversations` |
| `GET` | `/api/inbox/conversations/:id/messages` |
| `POST` | `/api/inbox/conversations/:id/take` |
| `POST` | `/api/inbox/conversations/:id/transfer` |
| `POST` | `/api/inbox/conversations/:id/close` |
| `POST` | `/api/inbox/conversations/:id/messages` |
| `POST` | `/api/inbox/conversations/:id/tickets` |

Para novas telas, prefira `/api/conversations`.

## Tickets

| Metodo | Rota | Auth | Uso |
|---|---|---:|---|
| `GET` | `/api/tickets` | Sim | Listar chamados |
| `GET` | `/api/tickets/:id` | Sim | Detalhar chamado |
| `POST` | `/api/tickets` | Sim | Criar chamado |
| `PATCH` | `/api/tickets/:id` | Sim | Atualizar chamado |
| `POST` | `/api/tickets/:id/evaluation` | Sim | Registrar CSAT |

IDs como `customerId`, `contactId`, `conversationId`, `departmentId`,
`assignedUserId` e `technicianId` sao validados contra a empresa do JWT.

## WhatsApp — rotas do Sigma

Provider configurado por:

```env
WHATSAPP_PROVIDER=mock|murilo-api|meta-cloud
```

Rotas operacionais, todas exigem JWT e role `ADMIN` ou `SUPERVISOR`:

| Metodo | Rota | Uso |
|---|---|---|
| `GET` | `/api/whatsapp/sessions` | Listar status das sessoes |
| `POST` | `/api/whatsapp/sessions/:sessionId/start` | Iniciar sessao |
| `POST` | `/api/whatsapp/sessions/:sessionId/disconnect` | Desconectar sessao |
| `POST` | `/api/whatsapp/sessions/:sessionId/sync-history` | Sincronizar historico |
| `GET` | `/api/whatsapp/sessions/:sessionId/qrcode` | QR em texto |
| `GET` | `/api/whatsapp/sessions/:sessionId/qrcode-image` | QR em data URL |
| `GET` | `/api/whatsapp/sessions/:sessionId/qrcode-page` | Pagina HTML do QR |
| `GET` | `/api/whatsapp/outbox` | Listar outbox |
| `POST` | `/api/whatsapp/outbox/retry` | Reprocessar mensagens falhas |
| `POST` | `/api/whatsapp/debug/mock-whatsapp/incoming` | Simular inbound com auth |

Webhooks publicos:

| Metodo | Rota | Uso |
|---|---|---|
| `GET` | `/api/whatsapp/webhook` | Verificacao de webhook |
| `POST` | `/api/whatsapp/webhook` | Entrada de mensagens |
| `GET` | `/api/whatsapp/webhooks/meta` | Verificacao Meta |
| `POST` | `/api/whatsapp/webhooks/meta` | Entrada Meta |

O webhook grava `WhatsAppInboundEvent` para idempotencia e cria/atualiza conversa,
contato e mensagens. Para o provider `murilo-api`, a API local envia tambem `phone`
e `wid`; o Sigma prefere `phone` para evitar separar conversas quando o WhatsApp Web
usa IDs `@lid`.

## API WhatsApp local (`apps/whatsapp-api`)

Servico local baseado em `whatsapp-web.js`, normalmente em:

```text
http://localhost:3000
```

Variaveis:

```env
WHATSAPP_API_PORT=3000
SIGMA_WEBHOOK_URL=http://localhost:3334/api/whatsapp/webhook
SIGMA_WHATSAPP_BASE_URL=http://localhost:3334/api/whatsapp
CHROME_EXECUTABLE_PATH=C:\Program Files\Google\Chrome\Application\chrome.exe
```

Endpoints locais:

| Metodo | Rota | Uso |
|---|---|---|
| `GET` | `/start-session/:sessionId` | Criar sessao WhatsApp Web |
| `GET` | `/sessions` | Listar sessoes locais |
| `GET` | `/history/:sessionId` | Buscar historico e contatos |
| `POST` | `/disconnect-session/:sessionId` | Desconectar e remover sessao |
| `POST` | `/check-number/:sessionId` | Validar se numero tem WhatsApp |
| `POST` | `/send-message/:sessionId` | Enviar texto/documento |
| `GET` | `/get-qrcode/:sessionId` | Obter QR bruto |
| `GET` | `/get-qrcode-image/:sessionId` | Obter QR em data URL |

Envio local:

```json
{
  "para": "5549999999999",
  "mensagem": "Texto"
}
```

A API local chama `client.getNumberId()` antes de enviar. Isso e necessario para
suportar contatos que o WhatsApp Web identifica como `@lid`.

Quando um `@lid` e resolvido para um telefone real, a API local persiste o mapa em
`apps/whatsapp-api/src/sessions/wid-phone-map.json` (diretorio ignorado pelo Git).
Esse mapa evita duplicar contatos no Sigma apos reinicios da API WhatsApp.

## Socket.io

O frontend conecta na API com JWT e entra em salas por empresa/conversa.

Eventos principais emitidos pelo backend:

- `conversation:new`
- `conversation:updated`
- `message:new`

O evento `conversation:join` valida se a conversa pertence a empresa do token antes
de entrar na sala `conversation:<id>`.

## Validacao rapida

```powershell
cd SigmaAtendimento
npm run typecheck
npm run build
```

Smoke test local:

```powershell
Invoke-WebRequest http://localhost:3334/health
Invoke-WebRequest http://localhost:3000/sessions
Invoke-WebRequest http://localhost:5173
```
