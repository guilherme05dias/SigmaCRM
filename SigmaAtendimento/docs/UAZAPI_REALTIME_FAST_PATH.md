# UAZAPI: caminho rapido para atendimento em tempo real

Para a experiencia ficar parecida com WhatsApp Web, o caminho recomendado em producao e:

```text
UAZAPI -> API Express publica -> Supabase Postgres -> Socket.io -> Painel do atendente
```

## Por que este fluxo

A API Express ja mantem o Socket.io conectado com o navegador. Quando a mensagem chega, ela grava no Supabase e emite `message:new` e `conversation:updated` imediatamente, sem depender de polling da tela.

O caminho pela Supabase Edge Function continua util enquanto a API nao tem URL publica. Quando a API estiver publicada, prefira o webhook direto na API para menor atraso.

## URL do webhook na UAZAPI

Configure a UAZAPI para chamar:

```text
https://URL_PUBLICA_DA_API/api/whatsapp/webhook?token=SEU_SEGREDO
```

No ambiente da API:

```env
WHATSAPP_PROVIDER=uazapi
UAZAPI_WEBHOOK_SECRET=SEU_SEGREDO
```

## Eventos recomendados

Eventos:

- `messages`

Excluir eventos/mensagens:

- `wasSentByApi`

## Teste local validado

```text
POST http://127.0.0.1:3334/api/whatsapp/webhook?token=SEU_SEGREDO
```

Resultado esperado:

- token correto: `{"ok":true}` e mensagem gravada no Supabase;
- token incorreto: `401`.

Em 2026-07-10, o teste local validou:

- API build: OK;
- token errado no webhook direto: `401`;
- token correto no webhook direto: `{"ok":true}`;
- mensagem recebida gravada como ultima mensagem do atendimento;
- payload de conversa emitido com dados completos para o painel atualizar via socket.
