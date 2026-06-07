# Sigma Atendimento

Monorepo do produto unificado **atendimento WhatsApp + CRM técnico**.

## Estrutura

```text
apps/api        API Express, Prisma, Postgres/Supabase, Socket.io, JWT
apps/web        React + Vite + Tailwind
packages/shared Tipos/contratos compartilhados
```

## Ambiente

Crie `.env` a partir de `.env.example` e preencha os valores reais:

```powershell
copy .env.example .env
```

Variáveis principais:

- `DATABASE_URL` e `DIRECT_URL`
- `JWT_SECRET`
- `CORS_ORIGIN`
- `VITE_API_URL`
- `WHATSAPP_PROVIDER=mock|murilo-api|meta-cloud`
- `MURILO_WHATSAPP_API_BASE_URL`
- `MURILO_WHATSAPP_DEFAULT_SESSION_ID`
- `DEFAULT_COMPANY_ID` ou `SIGMA_DEFAULT_COMPANY_ID`

## Rodando Localmente

```powershell
npm install
npm run prisma:generate --workspace=@sigma/api
npm run prisma:migrate --workspace=@sigma/api
npm run prisma:seed --workspace=@sigma/api
npm run dev
```

Web: `http://localhost:5173`
API: `http://localhost:3334`

## Build e Typecheck

```powershell
npm run typecheck
npm run build
```

## WhatsApp

O provider padrão para desenvolvimento seguro é `mock`.

Para usar a API local baseada em `murilo1of1/whatsapp-api`:

```env
WHATSAPP_PROVIDER=murilo-api
MURILO_WHATSAPP_API_BASE_URL=http://localhost:3000
MURILO_WHATSAPP_DEFAULT_SESSION_ID=default
```

Depois, conecte o WhatsApp pela tela **Configurações > Integração WhatsApp**. O teste ponta-a-ponta real exige celular disponível, QR Code escaneado e webhook funcionando.

## Produção

Consulte [../docs/DEPLOYMENT.md](../docs/DEPLOYMENT.md).
