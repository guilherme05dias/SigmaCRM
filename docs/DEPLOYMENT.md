# Deploy e Ambiente - Sigma Atendimento

Este guia prepara o deploy do monorepo `SigmaAtendimento` sem executar deploy real. Ele cobre variaveis, ordem de build, banco Supabase/Postgres, RLS e WhatsApp.

Referencia de endpoints da API: [API.md](API.md).

## Escopo

- API: `SigmaAtendimento/apps/api`
- Web: `SigmaAtendimento/apps/web`
- API WhatsApp local: `SigmaAtendimento/apps/whatsapp-api`
- Exemplo de ambiente: `SigmaAtendimento/.env.example`

Se o deploy separar API, Web e WhatsApp API em servicos diferentes, copie apenas as variaveis necessarias para cada servico. Nunca crie valores reais de segredo dentro do repositorio.

## Variaveis Obrigatorias

API:

```env
DATABASE_URL=
DIRECT_URL=
JWT_SECRET=
PORT=
CORS_ORIGIN=
DEFAULT_COMPANY_ID=
# ou SIGMA_DEFAULT_COMPANY_ID=
```

Web:

```env
VITE_API_URL=
VITE_SOCKET_URL=
```

WhatsApp via `murilo1of1/whatsapp-api`:

```env
WHATSAPP_PROVIDER=murilo-api
MURILO_WHATSAPP_API_BASE_URL=
MURILO_WHATSAPP_DEFAULT_SESSION_ID=
```

WhatsApp API local, quando usar `SigmaAtendimento/apps/whatsapp-api`:

```env
WHATSAPP_API_PORT=
SIGMA_WEBHOOK_URL=
SIGMA_WHATSAPP_BASE_URL=
CHROME_EXECUTABLE_PATH=
```

Meta Cloud API, se o provider oficial for usado:

```env
WHATSAPP_PROVIDER=meta-cloud
META_WHATSAPP_API_BASE_URL=
META_WHATSAPP_PHONE_NUMBER_ID=
META_WHATSAPP_ACCESS_TOKEN=
META_WHATSAPP_VERIFY_TOKEN=
```

## Preparacao Local ou Servidor

A partir da raiz do monorepo:

```powershell
cd "C:\Users\Guilherme Dias\Desktop\SigmaCRM\SigmaAtendimento"
npm install
copy .env.example .env
```

Preencha `.env` com valores reais do ambiente. O arquivo `.env` nao deve ser versionado.

## Banco, Prisma e Supabase

Gere o client Prisma:

```powershell
npm run prisma:generate --workspace=@sigma/api
```

Aplique migrations em desenvolvimento local:

```powershell
npm run prisma:migrate --workspace=@sigma/api
```

Em servidor/producao, use `migrate deploy` a partir de `apps/api`:

```powershell
cd SigmaAtendimento\apps\api
npx prisma migrate deploy --schema=prisma/schema.prisma
```

Seed opcional para ambiente de teste:

```powershell
npm run prisma:seed --workspace=@sigma/api
```

Notas para Supabase/RLS:

- A migration de RLS deve ser aplicada no Supabase antes de liberar acesso externo.
- Valide as policies em ambiente Supabase com roles reais, especialmente tabelas no schema `public`.
- RLS controla linhas; se a Data API estiver habilitada, grants e exposicao de schema tambem precisam estar corretos.
- Nunca exponha `service_role`, chaves secretas ou senhas no frontend.
- No frontend Vite, qualquer variavel `VITE_*` vai para o navegador; use apenas URLs publicas e chaves publicaveis.
- Evite usar `user_metadata` como fonte de autorizacao em policies; autorizacao deve vir de dados confiaveis do backend ou claims controladas.

## Build

Build da API:

```powershell
npm run build:api
```

Build do Web:

```powershell
npm run build:web
```

Build completo:

```powershell
npm run build
```

Verificacao de tipos:

```powershell
npm run typecheck
```

## Start da API

Depois do build:

```powershell
npm run start --workspace=@sigma/api
```

A API deve responder em:

```text
GET http://localhost:3334/health
```

O `.env.example` usa `PORT=3334`. O codigo tem fallback interno para `3333` se
`PORT` nao existir; por isso, configure `PORT` explicitamente. Se `PORT` for
alterado, atualize tambem `VITE_API_URL`, `VITE_SOCKET_URL`, `CORS_ORIGIN`,
`SIGMA_WEBHOOK_URL` e `SIGMA_WHATSAPP_BASE_URL`.

## Configuracao do Frontend

O frontend Vite precisa conhecer a URL publica da API:

```env
VITE_API_URL=https://api.seu-dominio.com
VITE_SOCKET_URL=https://api.seu-dominio.com
```

Em deploy estatico, publique o conteudo gerado por:

```powershell
npm run build:web
```

O artefato fica em `SigmaAtendimento/apps/web/dist`.

## WhatsApp Real

Para usar a API `murilo1of1/whatsapp-api`:

1. Suba `SigmaAtendimento/apps/whatsapp-api` ou a instancia externa equivalente.
2. Configure `WHATSAPP_PROVIDER=murilo-api` na API Sigma.
3. Configure `MURILO_WHATSAPP_API_BASE_URL` apontando para a API WhatsApp.
4. Configure `MURILO_WHATSAPP_DEFAULT_SESSION_ID=default`, ou mantenha o mesmo id usado na tela de configuracoes.
5. Escaneie o QR Code com um celular real.
6. Garanta que o webhook consiga chamar a API Sigma:

```env
SIGMA_WEBHOOK_URL=https://api.seu-dominio.com/api/whatsapp/webhook
```

Se a API WhatsApp estiver fora da mesma rede, a URL da API Sigma precisa ser publica e acessivel por HTTPS. Conversas antigas e contatos so serao sincronizados depois da sessao estar conectada e do endpoint de sincronizacao ser acionado.

As rotas operacionais de WhatsApp no Sigma exigem JWT de `ADMIN` ou `SUPERVISOR`.
Os webhooks `/api/whatsapp/webhook` e `/api/whatsapp/webhooks/meta` sao publicos
por necessidade de integracao externa.

Com `murilo-api`, a API WhatsApp local resolve o destino com `client.getNumberId()`
antes de enviar. Isso suporta contatos retornados pelo WhatsApp Web como `@lid`.

## Checklist Antes de Produzir

- `.env` preenchido fora do Git.
- `DATABASE_URL` e `DIRECT_URL` testadas.
- `JWT_SECRET` forte e diferente do ambiente local.
- `CORS_ORIGIN` restrito ao dominio do frontend.
- Migrations aplicadas.
- Historico Prisma consistente; se uma coluna ja existir e a migration falhar, resolver
  com `prisma migrate resolve` somente depois de confirmar que o efeito da migration
  ja existe no banco.
- RLS validado no Supabase.
- `npm run typecheck` executado.
- `npm run build` executado.
- WhatsApp conectado por QR Code, se `murilo-api`.
- Webhook publico e HTTPS validado, se necessario.
- Nenhuma chave `service_role` exposta no frontend.

## Pendencias Operacionais

- Executar teste real ponta-a-ponta do WhatsApp com celular.
- Validar policies RLS diretamente no Supabase.
- Definir plataforma final de hospedagem da API e do Web.
- Configurar observabilidade/logs no ambiente escolhido.
