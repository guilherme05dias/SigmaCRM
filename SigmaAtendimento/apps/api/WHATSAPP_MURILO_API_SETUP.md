# WhatsApp Provider - murilo1of1/whatsapp-api

Este backend suporta o provider `murilo-api`, baseado no repositório:
https://github.com/murilo1of1/whatsapp-api

Referencia completa de endpoints: `docs/API.md`.

## 1. Subir a API externa integrada

```powershell
cd SigmaAtendimento/apps/whatsapp-api
npm install
copy .env.example .env
npm start
```

Por padrão, essa API sobe em `http://localhost:3000` e encaminha mensagens recebidas
para `http://localhost:3334/api/whatsapp/webhook`.

`.env` esperado para uso local:

```env
WHATSAPP_API_PORT=3000
SIGMA_WEBHOOK_URL=http://localhost:3334/api/whatsapp/webhook
SIGMA_WHATSAPP_BASE_URL=http://localhost:3334/api/whatsapp
CHROME_EXECUTABLE_PATH=C:\Program Files\Google\Chrome\Application\chrome.exe
```

## 2. Configurar o SigmaAtendimento API

No `.env` de `SigmaAtendimento/apps/api`:

```env
WHATSAPP_PROVIDER=murilo-api
MURILO_WHATSAPP_API_BASE_URL=http://localhost:3000
MURILO_WHATSAPP_DEFAULT_SESSION_ID=default
```

Depois suba o backend a partir da raiz do monorepo:

```powershell
npm run dev:api
```

## 3. Fluxo de conexão

Iniciar sessão:

```http
POST /api/whatsapp/sessions/default/start
Authorization: Bearer <token-admin-ou-supervisor>
```

Buscar QR Code:

```http
GET /api/whatsapp/sessions/default/qrcode
Authorization: Bearer <token-admin-ou-supervisor>
```

Abrir QR Code escaneável no navegador:

```http
GET /api/whatsapp/sessions/default/qrcode-page
Authorization: Bearer <token-admin-ou-supervisor>
```

Observação: os endpoints de QR e sessão são protegidos no Sigma. Na tela de
Configurações, o frontend usa o token do usuário logado. Links diretos no navegador
sem `Authorization` não devem funcionar.

Desconectar:

```http
POST /api/whatsapp/sessions/default/disconnect
Authorization: Bearer <token-admin-ou-supervisor>
```

Sincronizar histórico:

```http
POST /api/whatsapp/sessions/default/sync-history
Authorization: Bearer <token-admin-ou-supervisor>
```

Enviar mensagem continua pelo fluxo existente das telas do Sigma. Internamente, o
provider chama:

```http
POST {MURILO_WHATSAPP_API_BASE_URL}/send-message/{sessionId}
```

com payload:

```json
{
  "para": "5511999999999",
  "mensagem": "Texto da mensagem"
}
```

Antes de enviar, a API local resolve o destino com `client.getNumberId()`. Isso é
necessário porque o WhatsApp Web pode retornar contatos como `@lid`; forçar `@c.us`
pode fazer o envio falhar mesmo quando o número possui WhatsApp.

## 4. Recebimento de mensagens

A cópia local da API externa foi estendida com:

- `GET /start-session/:sessionId`
- `GET /get-qrcode/:sessionId`
- `GET /get-qrcode-image/:sessionId`
- `GET /sessions`
- `GET /history/:sessionId`
- `POST /check-number/:sessionId`
- `POST /disconnect-session/:sessionId`
- `POST /send-message/:sessionId`
- `client.on('message', ...)` e `client.on('message_create', ...)` encaminhando para `SIGMA_WEBHOOK_URL`

Configuração padrão:

```env
SIGMA_WEBHOOK_URL=http://localhost:3334/api/whatsapp/webhook
```

Depois que o QR Code for escaneado, mensagens recebidas pelo WhatsApp Web devem ser
encaminhadas para:

```http
POST /api/whatsapp/webhook
```

O payload encaminhado inclui `phone` e `wid`. O Sigma prefere `phone` para associar
a resposta ao contato correto quando o WhatsApp Web usa IDs `@lid`.

O recebimento ainda pode ser testado manualmente pelo endpoint:

```http
POST /api/whatsapp/debug/mock-whatsapp/incoming
Authorization: Bearer <token-admin-ou-supervisor>
```

## 5. Validacao rapida

Com os tres serviços rodando:

```powershell
Invoke-WebRequest http://localhost:3000/sessions
Invoke-WebRequest http://localhost:3334/health
Invoke-WebRequest http://localhost:5173
```

Fluxo esperado:

1. Sessao `default` em `READY`.
2. Enviar mensagem pelo Inbox.
3. Receber no WhatsApp.
4. Responder pelo WhatsApp.
5. Resposta aparecer na conversa do Inbox.
