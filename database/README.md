# Database legado

Esta pasta contém scripts e migrations antigas usadas na fase anterior do projeto.

## Conteúdo

- `supabase/`: schema e migrations antigas do Supabase.
- `data/`: dados e notas históricas.

## Regra atual

Não criar migrations novas aqui.

As migrations oficiais do produto ativo ficam em:

```text
SigmaAtendimento/apps/api/prisma/migrations/
```

Mudanças de banco devem ser feitas pelo Prisma/migrations do app ativo.
