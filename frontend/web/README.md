# ServiçoCRM Web

Nova versão web do ServiçoCRM, criada em paralelo ao app Streamlit.

## Stack

- Next.js App Router
- TypeScript
- Supabase
- CSS design system próprio com componentes no estilo shadcn/ui

## Comandos

```powershell
npm install
npm run dev
```

Servidor padrão:

```text
http://localhost:3000
```

## Estado Atual

Etapa atual da migração:

- Layout web profissional com sidebar e topbar.
- Rotas principais criadas.
- Supabase conectado para dados operacionais.
- Login web com sessão assinada.
- Permissões padrão por perfil.
- Atendimentos com criação, edição, detalhe e log de alterações.
- WhatsApp com listagem, detalhe de conversa e leitura server-side de mensagens.

## Variáveis de Ambiente

```env
NEXT_PUBLIC_SUPABASE_URL=https://aprjeyqponmepdrjvxtc.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sua_chave_anon_ou_publishable
NEXT_PUBLIC_APP_URL=https://seu-dominio.com
SUPABASE_SERVICE_ROLE_KEY=sua_service_role_key_apenas_no_servidor
WHATSAPP_WEBHOOK_SECRET=defina_um_segredo_forte_para_o_bridge
META_WEBHOOK_VERIFY_TOKEN=mesmo_token_configurado_no_painel_da_meta
META_APP_SECRET=app_secret_da_meta_para_validar_assinatura_opcional
META_PHONE_NUMBER_ID=id_do_numero_no_whatsapp_cloud_api
META_WABA_ID=id_da_conta_whatsapp_business
```

`SUPABASE_SERVICE_ROLE_KEY` nunca deve usar prefixo `NEXT_PUBLIC_`.

## Ingestão de Mensagens WhatsApp

Endpoint interno para o bridge gravar mensagens recebidas/enviadas:

```text
POST /api/whatsapp/messages
Header: x-webhook-secret: valor_de_WHATSAPP_WEBHOOK_SECRET
```

Payload:

```json
{
  "contactName": "Cliente Teste",
  "contactNumber": "5511999999999",
  "direction": "in",
  "body": "Mensagem recebida do cliente",
  "timestamp": "2026-06-02T16:30:00.000Z",
  "waMessageId": "opcional",
  "linkedAttendanceId": 1
}
```

O endpoint cria/atualiza a conversa em `whatsapp_conversations` e grava o conteúdo em `whatsapp_messages`.

Diagnostico de configuracao:

```text
GET /api/whatsapp/health
```

## Webhook da Meta Cloud API

Guia detalhado: [META_WHATSAPP_SETUP.md](./META_WHATSAPP_SETUP.md)

Callback URL para configurar no painel da Meta:

```text
https://seu-dominio.com/api/whatsapp/meta-webhook
```

Verify token:

```text
META_WEBHOOK_VERIFY_TOKEN
```

Eventos necessários no Webhooks da Meta:

```text
messages
```

O endpoint aceita:

- `GET` de verificação da Meta com `hub.challenge`.
- `POST` com payload oficial da Cloud API.
- Mensagens `text`, `button` e `interactive`.
- Eventos de status são ignorados por enquanto, porque o CRM só acompanha conteúdo recebido.

Se `META_APP_SECRET` estiver configurado, o endpoint valida `x-hub-signature-256`.

## Checklist Pendente

- [ ] Configurar `SUPABASE_SERVICE_ROLE_KEY` no ambiente local/produção.
- [ ] Configurar `WHATSAPP_WEBHOOK_SECRET`.
- [ ] Configurar `META_WEBHOOK_VERIFY_TOKEN`.
- [ ] Configurar o callback `/api/whatsapp/meta-webhook` no app da Meta.
- [ ] Conectar o bridge real do WhatsApp ao endpoint `/api/whatsapp/messages`.
- [ ] Testar leitura em `/whatsapp/[id]` e no detalhe do atendimento vinculado.
