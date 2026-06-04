# Setup Meta WhatsApp Cloud API

Este arquivo resume o que precisa ser configurado para o ServiçoCRM acompanhar mensagens recebidas pelo WhatsApp.

## 1. Variáveis do App

Arquivo local:

```text
frontend/web/.env.local
```

Variáveis já preparadas:

```env
AUTH_SECRET=gerado_localmente
WHATSAPP_WEBHOOK_SECRET=gerado_localmente
META_WEBHOOK_VERIFY_TOKEN=gerado_localmente
```

Variáveis que ainda precisam ser preenchidas:

```env
SUPABASE_SERVICE_ROLE_KEY=
META_APP_SECRET=
META_PHONE_NUMBER_ID=
META_WABA_ID=
```

`SUPABASE_SERVICE_ROLE_KEY` vem do painel do Supabase. Ela deve ficar apenas no servidor e nunca pode ter prefixo `NEXT_PUBLIC_`.

`META_APP_SECRET` vem do app criado no Meta Developers. Com ela configurada, o endpoint valida `x-hub-signature-256`.

`META_PHONE_NUMBER_ID` e `META_WABA_ID` ficam registrados para conferencia operacional. A leitura atual nao depende deles, mas eles ajudam a validar se o webhook esta vindo do numero correto.

## 2. Callback da Meta

Use uma URL publica HTTPS. Localhost nao funciona direto no painel da Meta.

```text
https://seu-dominio.com/api/whatsapp/meta-webhook
```

Para teste local com tunnel, use a URL HTTPS do tunnel:

```text
https://seu-tunnel.example/api/whatsapp/meta-webhook
```

## 3. Verify Token

No campo Verify Token do painel da Meta, use o mesmo valor configurado em:

```env
META_WEBHOOK_VERIFY_TOKEN
```

## 4. Evento Necessario

No Webhooks da Meta, assine:

```text
messages
```

## 5. Fluxo Esperado

1. A Meta faz `GET /api/whatsapp/meta-webhook` com `hub.challenge`.
2. O app valida `META_WEBHOOK_VERIFY_TOKEN`.
3. A Meta envia mensagens por `POST /api/whatsapp/meta-webhook`.
4. O app grava ou atualiza `whatsapp_conversations`.
5. O app grava o conteudo em `whatsapp_messages`.
6. O gestor visualiza em `/whatsapp`, `/whatsapp/[id]` e no detalhe do atendimento vinculado.

## 6. Teste de Verificacao Local

Com servidor rodando:

```powershell
curl.exe "http://localhost:3000/api/whatsapp/meta-webhook?hub.mode=subscribe&hub.verify_token=SEU_TOKEN&hub.challenge=teste"
```

Resposta esperada quando o token esta correto:

```text
teste
```

Resposta esperada quando o token esta errado:

```json
{"ok":false,"message":"Webhook nao verificado."}
```

## 7. Diagnostico Local

Com servidor rodando:

```powershell
curl.exe "http://localhost:3000/api/whatsapp/health"
```

Esse endpoint mostra quais variaveis ja estao configuradas sem expor valores secretos.

## 8. Teste de Gravacao Local

Depois de preencher `SUPABASE_SERVICE_ROLE_KEY`, teste a gravacao pelo endpoint generico:

```powershell
curl.exe -X POST "http://localhost:3000/api/whatsapp/messages" `
  -H "Content-Type: application/json" `
  -H "x-webhook-secret: VALOR_DE_WHATSAPP_WEBHOOK_SECRET" `
  --data-binary "@whatsapp-test-payload.json"
```

Depois acesse:

```text
http://localhost:3000/whatsapp
```

## 9. Teste do Payload Oficial da Meta

Depois de preencher `SUPABASE_SERVICE_ROLE_KEY`, teste o endpoint da Meta com o arquivo de exemplo:

```powershell
curl.exe -X POST "http://localhost:3000/api/whatsapp/meta-webhook" `
  -H "Content-Type: application/json" `
  --data-binary "@meta-webhook-test-payload.json"
```

Se `META_APP_SECRET` estiver configurado, esse teste manual sem assinatura retornara `401`. Nesse caso, use o teste da propria Meta no painel ou assine o corpo com o app secret.

## 10. Checklist do Painel da Meta

- App criado no Meta Developers.
- WhatsApp Business Platform ativo.
- Numero de telefone configurado.
- Callback URL apontando para `/api/whatsapp/meta-webhook`.
- Verify token igual a `META_WEBHOOK_VERIFY_TOKEN`.
- Campo `messages` assinado.
- `META_APP_SECRET` copiado para o ambiente do servidor.
- `META_PHONE_NUMBER_ID` anotado no ambiente.
- `META_WABA_ID` anotado no ambiente.

## 11. O que nao esta implementado

- Envio de mensagens pelo CRM.
- Templates WhatsApp.
- Download de midias.
- Vinculo automatico inteligente entre conversa e atendimento.

O escopo atual e apenas acompanhamento/leitura de conversas.
