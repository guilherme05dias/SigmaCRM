# Setup grátis: Supabase + UAZAPI

Este caminho mantém o projeto no plano gratuito no início:

- Banco/Auth/Storage/Edge Function: Supabase Free.
- Frontend: Vercel Free, quando formos publicar a tela.
- WhatsApp: instância grátis da UAZAPI, enquanto atender o volume de teste.

## 1. Criar o projeto no Supabase

1. Acesse o Supabase e crie um projeto.
2. Em **Project Settings > Database**, copie:
   - connection string pooler para `DATABASE_URL`;
   - connection string direta para `DIRECT_URL`.
3. Em **Project Settings > API**, copie:
   - `SUPABASE_URL`;
   - `anon key`;
   - `service_role key`.

> A `service_role key` é segredo de servidor. Nunca use no frontend/Vite.

## 2. Rodar migrations do Prisma no Supabase

No projeto local:

```powershell
copy .env.example .env
npm install
npm run prisma:generate --workspace=@sigma/api
npm run prisma:migrate --workspace=@sigma/api
npm run prisma:seed --workspace=@sigma/api
```

O Prisma continuará sendo usado pela API Express, mas o banco será o Postgres do Supabase.

## 3. Deploy da Edge Function do webhook

Função criada:

```text
supabase/functions/uazapi-webhook/index.ts
```

Ela recebe eventos da UAZAPI e grava diretamente:

- `Contact`
- `Conversation`
- `Message`
- `WhatsAppInboundEvent`

Variáveis necessárias na Edge Function:

```env
SUPABASE_URL=https://PROJECT_REF.supabase.co
SUPABASE_SERVICE_ROLE_KEY=...
UAZAPI_WEBHOOK_SECRET=um-segredo-qualquer
SIGMA_DEFAULT_COMPANY_ID=opcional-id-da-empresa
```

Deploy:

```powershell
supabase functions deploy uazapi-webhook --no-verify-jwt
supabase secrets set SUPABASE_URL=https://PROJECT_REF.supabase.co
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=SEU_SERVICE_ROLE
supabase secrets set UAZAPI_WEBHOOK_SECRET=SEU_SEGREDO
```

## 4. URL para configurar na UAZAPI

Use a URL da Edge Function com token:

```text
https://PROJECT_REF.supabase.co/functions/v1/uazapi-webhook?token=SEU_SEGREDO
```

Eventos recomendados:

- `message.received`
- `message.status`
- `instance.status`

Na primeira fase, a função processa mensagens recebidas. Eventos de status podem chegar, mas serão ignorados se não tiverem mensagem.

## 5. Envio de mensagens via Supabase Edge Function

Função criada:

```text
supabase/functions/uazapi-send-message/index.ts
```

Ela envia texto pela UAZAPI e registra:

- `Message`, quando receber `conversationId`;
- `WhatsAppOutbox`, sempre;
- `Conversation.lastMessageAt`, quando houver atendimento vinculado.

Variáveis necessárias na Edge Function:

```env
SUPABASE_URL=https://PROJECT_REF.supabase.co
SUPABASE_SERVICE_ROLE_KEY=...
SIGMA_INTERNAL_TOKEN=um-segredo-interno-para-envio
SIGMA_DEFAULT_COMPANY_ID=opcional-id-da-empresa
UAZAPI_BASE_URL=https://free.uazapi.com
UAZAPI_TOKEN=TOKEN_DA_INSTANCIA
UAZAPI_DEFAULT_SESSION_ID=sigma-teste
UAZAPI_SEND_TEXT_PATH=/send/text
```

Deploy:

```powershell
supabase functions deploy uazapi-send-message --no-verify-jwt
supabase secrets set SIGMA_INTERNAL_TOKEN=SEU_SEGREDO_INTERNO
supabase secrets set UAZAPI_TOKEN=TOKEN_DA_INSTANCIA
supabase secrets set UAZAPI_BASE_URL=https://free.uazapi.com
supabase secrets set UAZAPI_DEFAULT_SESSION_ID=sigma-teste
supabase secrets set UAZAPI_SEND_TEXT_PATH=/send/text
```

Exemplo de chamada:

```powershell
$headers = @{ "x-internal-token" = "SEU_SEGREDO_INTERNO"; "Content-Type" = "application/json" }
$body = @{ to = "554999999999"; body = "Mensagem de teste" } | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri "https://PROJECT_REF.supabase.co/functions/v1/uazapi-send-message" -Headers $headers -Body $body
```

Quando a chamada vier da API Express, envie `record=false`. Nesse modo a Edge Function apenas dispara a mensagem na UAZAPI e retorna o `providerMessageId`; quem registra `Message` e `WhatsAppOutbox` continua sendo a API.

Observação: a documentação pública da UAZAPI cita um SDK Node, mas o pacote `uazapi-sdk` não está publicado no npm público. Por isso o endpoint de envio fica configurável em `UAZAPI_SEND_TEXT_PATH`. Se a UAZAPI informar outro caminho oficial de envio, ajuste somente a variável.

## 6. Envio de mensagens pela API Express

O backend já possui o provider `WHATSAPP_PROVIDER=uazapi`.

Variáveis:

```env
WHATSAPP_PROVIDER=uazapi
UAZAPI_BASE_URL=https://free.uazapi.com
UAZAPI_TOKEN=TOKEN_DA_INSTANCIA
UAZAPI_DEFAULT_SESSION_ID=sigma-teste
UAZAPI_SEND_TEXT_PATH=/send/text
UAZAPI_SEND_VIA_SUPABASE_EDGE=false
```

Esse caminho é útil para desenvolvimento local. Se quiser que a API Express envie usando a Edge Function como ponte segura, configure:

```env
WHATSAPP_PROVIDER=uazapi
SUPABASE_URL=https://PROJECT_REF.supabase.co
SIGMA_INTERNAL_TOKEN=mesmo-secret-configurado-no-supabase
UAZAPI_SEND_VIA_SUPABASE_EDGE=true
```

Nesse modo a API não precisa chamar a UAZAPI diretamente; ela chama `uazapi-send-message` com `record=false`, evitando duplicidade de histórico.

## 7. Ativar o painel local com Supabase + UAZAPI

Para o botão de responder no painel local usar a integração validada, o arquivo `apps/api/.env` precisa estar alinhado ao projeto Supabase atual.

Opção recomendada: rode o script interativo local. Ele pede a senha do banco, gera um `SIGMA_INTERNAL_TOKEN`, salva esse token nos secrets do Supabase e cria backup do `.env` antigo.

```powershell
cd SigmaAtendimento
.\scripts\configure-supabase-uazapi-env.ps1
```

Se a política de execução do PowerShell bloquear scripts locais, rode:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\configure-supabase-uazapi-env.ps1
```

Valores essenciais:

```env
DATABASE_URL=postgresql://postgres.PROJECT_REF:SENHA@aws-1-sa-east-1.pooler.supabase.com:6543/postgres?pgbouncer=true
DIRECT_URL=postgresql://postgres:SENHA@db.PROJECT_REF.supabase.co:5432/postgres

SUPABASE_URL=https://PROJECT_REF.supabase.co
DEFAULT_COMPANY_ID=ID_DA_EMPRESA_PADRAO
SIGMA_DEFAULT_COMPANY_ID=ID_DA_EMPRESA_PADRAO

WHATSAPP_PROVIDER=uazapi
UAZAPI_BASE_URL=https://free.uazapi.com
UAZAPI_DEFAULT_SESSION_ID=sigma-teste
UAZAPI_SEND_TEXT_PATH=/send/text
UAZAPI_SEND_VIA_SUPABASE_EDGE=true

SIGMA_INTERNAL_TOKEN=MESMO_VALOR_CONFIGURADO_NOS_SECRETS_DO_SUPABASE
```

Notas:

- `SIGMA_INTERNAL_TOKEN` precisa ser igual ao secret salvo no Supabase, pois protege a função `uazapi-send-message`.
- Se `UAZAPI_SEND_VIA_SUPABASE_EDGE=true`, a API local não precisa ter `UAZAPI_TOKEN`; o token fica apenas nos secrets da Edge Function.
- Não commite `.env` com valores reais.
