# Sigma — Handoff operacional

**Data:** 2026-06-07
**Fonte principal:** [ACTION_PLAN.md](ACTION_PLAN.md)
**Resumo executivo:** [EXECUTION_SUMMARY.md](EXECUTION_SUMMARY.md)

Este arquivo é o handoff atual para continuar o projeto sem refazer trabalho já
executado. Ele substitui os prompts antigos das ondas A/B/C.

## Estado atual

O produto ativo é `SigmaAtendimento`, um monorepo npm com:

- `apps/api`: Express, Prisma, PostgreSQL/Supabase, Socket.io, JWT.
- `apps/web`: React 18, Vite, React Router, Tailwind.
- `packages/shared`: contratos compartilhados.

Os diretórios `frontend/`, `backend/` e `database/` da raiz são legado do CRM
Streamlit e não devem receber novas funcionalidades.

## Ja concluido

- Autenticacao real com JWT, `/api/auth/me` e usuario logado no frontend.
- Shell principal, dark mode, design system e favicon.
- Inbox com fila, chats, historico, contatos, envio local otimista e Socket.io.
- Tickets com detalhe em `/tickets/:id`, encerramento de conversa e criacao de chamado.
- CSAT, mobile basico, skeletons, toasts, estados vazios e 404.
- Hash de senha com `bcryptjs` e compatibilidade para migrar senhas antigas no login.
- WhatsApp preparado com provedores `mock`, `murilo-api` e `meta-cloud`.
- Outbox WhatsApp com retry, inbound idempotente e webhook de entrada.
- Botao de desconectar WhatsApp e tela de configuracao de conexao.
- LGPD manual em clientes.
- CORS por `CORS_ORIGIN`, Dockerfile da API e `_redirects` da SPA.
- Correcoes de seguranca/tenant:
  - endpoints operacionais WhatsApp exigem autenticacao e role `ADMIN`/`SUPERVISOR`;
  - limpeza de conversas/atendimentos limitada ao tenant conectado;
  - `Contact.phone` unico por empresa, nao global;
  - listagem/leitura do Inbox filtrada por empresa;
  - join de socket valida a empresa da conversa;
  - IDs relacionados em tickets/conversas/contatos sao validados por tenant;
  - RLS tambem cobre `Company`.

## Validacoes locais

Comandos usados para validar o estado atual:

```powershell
$env:DATABASE_URL='postgresql://user:pass@localhost:5432/db'
$env:DIRECT_URL='postgresql://user:pass@localhost:5432/db'
npx prisma validate --schema=apps/api/prisma/schema.prisma
npm run typecheck
npm run build
```

Resultado esperado: schema Prisma valido, typecheck passando e build de API/Web
passando.

## Proximo passo real

O proximo bloco nao depende de criar mais telas. Depende de validar infraestrutura
e integracao real:

1. Aplicar migrations no banco Supabase real.
2. Verificar se a migration `Contact_companyId_phone_key` nao falha por telefones
   duplicados dentro da mesma empresa.
3. Rodar API e Web com `.env` real.
4. Conectar um WhatsApp real.
5. Enviar mensagem de um celular externo para o numero conectado.
6. Confirmar que a conversa cai na fila, envia boas-vindas, cria/atualiza contato e
   preserva historico.
7. Enviar mensagem pelo Inbox e confirmar recebimento no WhatsApp.
8. Validar RLS no Supabase com usuario/role sujeita a policy.
9. Preparar deploy final.

## Pendencias tecnicas

- Validacao humana do WhatsApp real com celular.
- Validacao de RLS no Supabase real.
- Retencao LGPD automatica/configuravel.
- Deploy com variaveis finais e smoke test externo.
- Polimento visual/mobile profundo depois do teste de uso.

## Comandos uteis

```powershell
cd SigmaAtendimento
npm install
npm run dev
npm run typecheck
npm run build
npx prisma migrate deploy --schema=apps/api/prisma/schema.prisma
```

Portas locais:

- Web: `http://localhost:5173`
- API: `http://localhost:3334`

## Variaveis relevantes

- `DATABASE_URL`
- `DIRECT_URL`
- `JWT_SECRET`
- `CORS_ORIGIN`
- `WHATSAPP_PROVIDER=mock|murilo-api|meta-cloud`
- `WHATSAPP_API_URL`
- `WHATSAPP_API_TOKEN`
- `WHATSAPP_SESSION_ID`
- `WHATSAPP_WEBHOOK_SECRET`

## Regra para proximos agentes

Nao refazer as ondas A1-A5, B1-B6, C1, C4, C5 ou C7 sem evidência de regressao.
Antes de alterar comportamento, leia `docs/ACTION_PLAN.md`,
`docs/EXECUTION_SUMMARY.md`, o schema Prisma e as rotas existentes.
