# SigmaCRM

Workspace do produto **Sigma Atendimento + CRM**.

O produto ativo fica em [`SigmaAtendimento`](SigmaAtendimento/), um monorepo npm com:

- `apps/api`: API Express + Prisma + Postgres/Supabase + Socket.io + JWT.
- `apps/web`: React 18 + Vite + Tailwind + React Router.
- `apps/whatsapp-api`: API WhatsApp local opcional.
- `packages/shared`: contratos/tipos compartilhados.

As pastas antigas `frontend/`, `backend/` e `database/` são legado/histórico da migração e não representam mais a arquitetura principal.

## Começo rápido

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

## Documentação principal

- [Estrutura do projeto](docs/PROJECT_STRUCTURE.md)
- [PRD — requisitos do produto](docs/PRD.md)
- [Roadmap](docs/ROADMAP.md)
- [Referência da API](docs/API.md)
- [Arquitetura](docs/ARCHITECTURE.md)
- [Deploy e ambiente](docs/DEPLOYMENT.md)

## Validação

```powershell
cd SigmaAtendimento
npm run typecheck
npm run build
```

## Segurança

Não versionar `.env`, chaves Supabase, tokens Meta/WhatsApp, sessões do WhatsApp, bancos locais, logs, `node_modules/` ou `dist/`.
