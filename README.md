# SigmaCRM

Workspace do produto **Sigma Atendimento + CRM**.

O produto ativo fica em [`SigmaAtendimento`](SigmaAtendimento/), um monorepo npm com:

- `apps/api`: API Express + Prisma + Postgres/Supabase + Socket.io + JWT.
- `apps/web`: React 18 + Vite + Tailwind + React Router.
- `apps/whatsapp-api`: API WhatsApp local baseada em `murilo1of1/whatsapp-api`, quando presente.
- `packages/shared`: contratos/tipos compartilhados.

As pastas antigas `frontend/`, `backend/` e `database/` são legado/histórico da migração do CRM Streamlit e não representam mais a arquitetura principal.

## Começo Rápido

```powershell
cd SigmaAtendimento
npm install
copy .env.example .env
npm run prisma:generate --workspace=@sigma/api
npm run prisma:migrate --workspace=@sigma/api
npm run dev
```

Web: `http://localhost:5173`
API: `http://localhost:3334`

## Documentação Principal

- [Plano de ação](docs/ACTION_PLAN.md)
- [Resumo de execução](docs/EXECUTION_SUMMARY.md)
- [Referência da API](docs/API.md)
- [Deploy e ambiente](docs/DEPLOYMENT.md)
- [Decisões de arquitetura](docs/ARCHITECTURE_DECISIONS.md)

## Validação

```powershell
cd SigmaAtendimento
npm run typecheck
npm run build
```

## Segurança

Não versionar `.env`, chaves Supabase, tokens Meta/WhatsApp, sessões do WhatsApp, bancos locais, logs, `node_modules/` ou `dist/`.
