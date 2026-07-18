# Organização atual do projeto

Atualizado em: 2026-07-09

Este arquivo substitui o plano antigo de reorganização. A estrutura principal já foi consolidada em um monorepo npm chamado `SigmaAtendimento/`.

## Decisão atual

O app ativo é:

```text
SigmaAtendimento/
```

As pastas `frontend/`, `backend/` e `database/` são legado/histórico e não devem ser usadas como base para novas funcionalidades.

## Estrutura recomendada

```text
SigmaCRM/
├─ SigmaAtendimento/      Produto ativo
│  ├─ apps/api/           API Express, Prisma, Postgres/Supabase, Socket.io
│  ├─ apps/web/           React, Vite, Tailwind
│  ├─ apps/whatsapp-api/  Serviço local opcional de WhatsApp Web
│  └─ packages/shared/    Contratos/tipos compartilhados
├─ docs/                  Requisitos, roadmap, arquitetura e guias
├─ frontend/              Legado
├─ backend/               Legado
└─ database/              Legado
```

## Regra de manutenção

- Implementações novas entram em `SigmaAtendimento/`.
- Documentação de produto entra em `docs/`.
- Documentação técnica específica do monorepo pode entrar em `SigmaAtendimento/docs/`.
- Pastas legadas devem ser preservadas por enquanto, mas não expandidas.

## Próximas frentes de organização

1. Completar RBAC por perfil.
2. Remover alteração de schema em runtime e migrar para migration Prisma.
3. Padronizar roles do requisito: administrador, supervisor, atendente e técnico.
4. Tornar `companyId` obrigatório nas tabelas operacionais.
5. Criar cadastros centrais de setores e sistemas/assuntos.
6. Implementar fila WhatsApp por setor.
7. Implementar visitas técnicas com painel próprio.
