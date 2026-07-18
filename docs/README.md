# Documentação — Sigma Atendimento + CRM

Este diretório concentra a documentação oficial do produto ativo.

## Leitura recomendada

1. [PRD.md](./PRD.md) — requisitos funcionais e regras de negócio.
2. [ROADMAP.md](./ROADMAP.md) — ordem de implementação.
3. [PROJECT_STRUCTURE.md](./PROJECT_STRUCTURE.md) — organização do repositório.
4. [ARCHITECTURE.md](./ARCHITECTURE.md) — visão técnica da arquitetura.
5. [API.md](./API.md) — endpoints e contratos da API.
6. [DEPLOYMENT.md](./DEPLOYMENT.md) — deploy e variáveis de ambiente.

## Estado atual do repositório

- `SigmaAtendimento/` é o produto ativo.
- `frontend/`, `backend/` e `database/` são legado/histórico e devem ser usados apenas como referência durante a migração.
- Novas decisões de produto devem ser registradas primeiro em `PRD.md` e depois quebradas em etapas no `ROADMAP.md`.
- Mudanças técnicas estruturais devem atualizar `PROJECT_STRUCTURE.md` e, quando necessário, `ARCHITECTURE.md`.

## Próxima frente de trabalho

A próxima etapa aprovada é a fundação técnica:

1. reforçar segurança, perfis e permissões;
2. consolidar banco/Prisma para CRM, contatos, setores e sistemas;
3. implementar fila de atendimento WhatsApp;
4. seguir para encerramento, visitas, painel, dashboard e relatórios.
