# Diário de desenvolvimento — Supabase + UAZAPI

Data: 2026-07-10

## Implementado

- Configuração base `SigmaAtendimento/supabase/config.toml`.
- Edge Function `SigmaAtendimento/supabase/functions/uazapi-webhook`.
- Webhook público para receber eventos da UAZAPI sem precisar expor o backend local.
- Gravação direta no Supabase/Postgres das tabelas:
  - `Contact`;
  - `Conversation`;
  - `Message`;
  - `WhatsAppInboundEvent`.
- Suporte ao provider `UAZAPI` no enum Prisma `WhatsAppProvider`.
- Migration `20260710153000_add_uazapi_provider`.
- Variáveis de ambiente Supabase/UAZAPI nos exemplos.
- Guia `SigmaAtendimento/docs/SUPABASE_UAZAPI_SETUP.md`.

## Decisão técnica

- Manter Prisma + API Express por enquanto.
- Usar Supabase como Postgres oficial.
- Usar Supabase Edge Function para o webhook público grátis da UAZAPI.
- Implementar envio de mensagens por Edge Function em uma próxima etapa, depois de validar recebimento.

## Validação

Executado:

```powershell
cd SigmaAtendimento
npm run prisma:generate --workspace=@sigma/api
npm run typecheck
```

Resultado:

- Prisma Client gerado com sucesso.
- Typecheck do monorepo passou.

## Conexão MCP Supabase

Projeto conectado:

- Nome: `SigmaCRM`
- Project ref: `fiayxnorzxvrxambetds`
- Região: `sa-east-1`
- Status: `ACTIVE_HEALTHY`

Aplicado no banco remoto:

- schema público do SigmaCRM;
- migrations registradas em `_prisma_migrations`;
- seed inicial com empresa `SigmaPDV`;
- usuários iniciais:
  - `admin@sigmapdv.com`;
  - `supervisor@sigmapdv.com`;
  - `atendente@sigmapdv.com`;
  - `tecnico@sigmapdv.com`;
- tópicos iniciais de atendimento;
- técnico padrão da empresa;
- correções dos advisors de segurança do Supabase.

Status dos advisors:

- Segurança: sem lints pendentes.
- Performance: existem recomendações informativas de índices/FKs e políticas RLS a otimizar depois que o fluxo principal estiver validado.

Bloqueio atual:

- deploy da Edge Function `uazapi-webhook` depende de autenticação do Supabase CLI:
  - `supabase login`, ou
  - variável `SUPABASE_ACCESS_TOKEN`.

## Deploy da Edge Function

Status atualizado:

- Edge Function `uazapi-webhook` publicada no Supabase.
- Função ativa com `verify_jwt = false`, adequada para receber webhook externo da UAZAPI.
- Secrets configurados:
  - `UAZAPI_WEBHOOK_SECRET`;
  - `SIGMA_DEFAULT_COMPANY_ID`.
- Teste com payload simulado `message.received` retornou `ok: true`.
- Confirmação no banco:
  - contato de teste criado/atualizado;
  - conversa criada;
  - mensagens gravadas.
- Teste real da UAZAPI recebido com sucesso:
  - evento `messages`;
  - instância `sigma-teste`;
  - mensagens reais salvas em `WhatsAppInboundEvent`, `Conversation` e `Message`.
- Correção aplicada após o teste real:
  - parser da UAZAPI agora prioriza `message.sender_pn`, `chat.phone` e `message.chatid` antes de IDs `lid`;
  - nome do contato pode vir de `message.senderName` ou `chat.wa_name`.

## Provider UAZAPI no backend Express

Implementado:

- provider `UazApiWhatsAppProvider`;
- seleção via `WHATSAPP_PROVIDER=uazapi`;
- parser do payload real da UAZAPI reaproveitando o formato validado na Edge Function;
- suporte inicial para `sendText`;
- endpoint de envio configurável por `UAZAPI_SEND_TEXT_PATH`;
- env examples atualizados;
- documentação atualizada no guia Supabase + UAZAPI.
- opção `UAZAPI_SEND_VIA_SUPABASE_EDGE=true`, permitindo que a API Express use a Edge Function `uazapi-send-message` como ponte de envio com `record=false`.

Validação:

```powershell
cd SigmaAtendimento
npm run typecheck
```

Resultado:

- typecheck passou.
- Edge Function `uazapi-send-message` publicada e validada.
- Envio direto pela Edge Function validado com retorno `ok: true`.
- Envio vinculado a atendimento validado:
  - `Message` gravada como `OUTBOUND`;
  - `WhatsAppOutbox` gravado como `SENT`;
  - `providerMessageId` retornado pela UAZAPI.
- Modo `record=false` validado:
  - mensagem enviada pela UAZAPI;
  - não gerou duplicidade no histórico do atendimento.

Observação:

- a documentação pública da UAZAPI cita um SDK Node, mas `uazapi-sdk` não existe no npm público;
- por isso o envio foi implementado de forma configurável, aguardando confirmação do endpoint REST oficial de envio.

## Status operacional atual

Validado em produção/Supabase:

- instância nova da UAZAPI recebendo mensagem real;
- webhook `uazapi-webhook` recebendo evento `messages`;
- mensagem real `teste 7` salva no atendimento existente;
- `UAZAPI_TOKEN` da nova instância salvo nos secrets do Supabase;
- `uazapi-send-message` funcionando para envio.

Pendência antes de usar o painel local como canal principal:

- `SigmaAtendimento/apps/api/.env` local ainda aponta para um Supabase antigo e `WHATSAPP_PROVIDER=evolution`;
- para o botão de responder do painel local usar a integração validada, o `.env` da API precisa apontar para o projeto `fiayxnorzxvrxambetds` e usar `WHATSAPP_PROVIDER=uazapi`.
- por segurança, não registrar tokens/senhas reais em documentação versionada.

Mitigação criada:

- script `SigmaAtendimento/scripts/configure-supabase-uazapi-env.ps1`;
- faz backup do `.env` atual;
- solicita a senha do banco no terminal;
- gera um novo `SIGMA_INTERNAL_TOKEN`;
- salva o token nos secrets do Supabase;
- escreve o `.env` local com `WHATSAPP_PROVIDER=uazapi` e `UAZAPI_SEND_VIA_SUPABASE_EDGE=true`.

## Validação pelo painel local

Executado:

- `apps/api/.env` alinhado ao Supabase `fiayxnorzxvrxambetds`;
- API local iniciada em `http://localhost:3334`;
- frontend Vite iniciado em `http://127.0.0.1:5173`;
- `apps/web/.env` criado com `VITE_API_URL=http://127.0.0.1:3334`;
- CORS local ajustado para aceitar `localhost` e `127.0.0.1`;
- login pelo painel com usuário seed;
- abertura do Inbox;
- conversa `SUPORTE SIGMA PDV` assumida pelo usuário `Guilherme`;
- mensagem enviada pela tela:
  - gravada como `Message.OUTBOUND`;
  - recebeu `waMessageId`;
  - gravou `WhatsAppOutbox` com status `SENT`;
  - provider `UAZAPI`;
  - `lastError = null`.

Resultado:

- fluxo UI → API Express → Supabase Edge Function → UAZAPI → Supabase/Postgres validado ponta-a-ponta.

URL do webhook:

```text
https://fiayxnorzxvrxambetds.supabase.co/functions/v1/uazapi-webhook?token=44fd858f3c0b4d008997a717e56c56f2
```

Observação de segurança:

- revogar o token pessoal do Supabase usado para deploy após concluir esta sessão;
- manter o token do webhook apenas no painel da UAZAPI e nos secrets do Supabase.
