# Estrutura do projeto — SigmaCRM / Sigma Atendimento

Atualizado em: 2026-07-09

## Produto ativo

O produto ativo está em `SigmaAtendimento/`.

```text
SigmaAtendimento/
├─ apps/
│  ├─ api/            API Express + Prisma + Postgres/Supabase + Socket.io
│  ├─ web/            Frontend React + Vite + Tailwind
│  └─ whatsapp-api/   Serviço local opcional para WhatsApp Web
├─ packages/
│  └─ shared/         Tipos e contratos compartilhados
├─ infra/
│  └─ evolution/      Infra opcional para Evolution API
├─ docs/              Documentação técnica específica do monorepo
└─ package.json       Workspace npm principal
```

## Documentação principal

A documentação de produto e planejamento fica na pasta raiz `docs/`:

- `docs/PRD.md`: requisitos do sistema de atendimentos + CRM.
- `docs/ROADMAP.md`: ordem de desenvolvimento.
- `docs/API.md`: referência atual da API.
- `docs/ARCHITECTURE.md`: visão técnica.
- `docs/DEPLOYMENT.md`: ambiente e deploy.
- `docs/PROJECT_STRUCTURE.md`: este guia de organização.

## Pastas legadas

As pastas abaixo permanecem no repositório como histórico da evolução do projeto, mas não devem receber novas funcionalidades do produto principal:

```text
frontend/   Código legado do CRM web/Streamlit anterior
backend/    Bridge WhatsApp legado
database/   Scripts e schemas históricos de Supabase
```

Regra prática:

- Nova funcionalidade do sistema de atendimento/CRM: mexer em `SigmaAtendimento/`.
- Nova documentação de produto: mexer em `docs/`.
- Código legado: alterar apenas se for migração, consulta histórica ou correção explicitamente necessária.

## Primeira etapa de organização técnica

A base inicial de organização técnica deve priorizar:

1. Segurança e perfis de acesso.
2. Configuração centralizada da API.
3. Remoção de efeitos colaterais perigosos.
4. Padronização do CRM, contatos, setores e assuntos.
5. Só depois: fila WhatsApp, atendimento, visitas, dashboard e relatórios.

Essa ordem evita construir novas telas em cima de permissões e dados frágeis.
