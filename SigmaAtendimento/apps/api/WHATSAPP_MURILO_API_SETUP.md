# WhatsApp Provider - murilo1of1/whatsapp-api

Este backend suporta o provider `murilo-api`, baseado no repositório:
https://github.com/murilo1of1/whatsapp-api

## 1. Subir a API externa integrada

```bash
cd SigmaAtendimento/apps/whatsapp-api
npm install
npm start
```

Por padrão, essa API sobe em `http://localhost:3000` e encaminha mensagens recebidas
para `http://localhost:3334/api/whatsapp/webhook`.

## 2. Configurar o SigmaAtendimento API

No `.env` de `SigmaAtendimento/apps/api`:

```env
WHATSAPP_PROVIDER=murilo-api
MURILO_WHATSAPP_API_BASE_URL=http://localhost:3000
MURILO_WHATSAPP_DEFAULT_SESSION_ID=default
```

Depois suba o backend:

```bash
npm run dev
```

## 3. Fluxo de conexão

Iniciar sessão:

```http
POST /api/whatsapp/sessions/default/start
```

Buscar QR Code:

```http
GET /api/whatsapp/sessions/default/qrcode
```

Abrir QR Code escaneável no navegador:

```http
GET /api/whatsapp/sessions/default/qrcode-page
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

## 4. Recebimento de mensagens

A cópia local da API externa foi estendida com:

- `GET /start-session/:sessionId`
- `GET /get-qrcode/:sessionId`
- `GET /get-qrcode-image/:sessionId`
- `GET /sessions`
- `POST /send-message/:sessionId`
- `client.on('message', ...)` encaminhando para `SIGMA_WEBHOOK_URL`

Configuração padrão:

```env
SIGMA_WEBHOOK_URL=http://localhost:3334/api/whatsapp/webhook
```

Depois que o QR Code for escaneado, mensagens recebidas pelo WhatsApp Web devem ser
encaminhadas para:

```http
POST /api/whatsapp/webhook
```

O recebimento ainda pode ser testado manualmente pelo endpoint:

```http
POST /api/whatsapp/debug/mock-whatsapp/incoming
```
