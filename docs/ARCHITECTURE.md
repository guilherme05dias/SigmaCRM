# Arquitetura do SigmaCRM

Este documento registra a organizacao atual do SigmaCRM apos a separacao em camadas.

## Visao Geral

O projeto esta organizado como um monorepo com quatro areas principais:

```text
frontend/
  web/        Aplicacao principal em Next.js
  streamlit/  Aplicacao Streamlit legada/operacional
backend/
  whatsapp-bridge/  Servico Node.js para captura via WhatsApp Web
database/
  supabase/   Schema e migrations PostgreSQL/Supabase
  data/       Arquivos de apoio para migracao
docs/         Produto, arquitetura, setup e roadmap
```

## Papel de Cada Camada

### `frontend/web`

Aplicacao web principal do CRM.

- Stack: Next.js App Router, TypeScript, React e Supabase.
- Responsabilidades:
  - Login e sessao web.
  - Telas de dashboard, clientes, tecnicos, usuarios, atendimentos e WhatsApp.
  - Rotas internas de API para ingestao WhatsApp.
  - Acesso ao Supabase para dados operacionais.

O objetivo de evolucao e concentrar a experiencia principal nesta aplicacao.

### `frontend/streamlit`

Aplicacao Streamlit existente, mantida como interface operacional e apoio de migracao.

- Stack: Python, Streamlit, SQLAlchemy e Supabase/PostgreSQL.
- Responsabilidades:
  - Interface historica do CRM.
  - Apoio a rotinas de migracao.
  - Execucao local simples para operacao ou validacao de dados.

Enquanto a migracao para Next.js nao estiver completa, ela deve continuar funcional. Mudancas novas devem priorizar o `frontend/web`, salvo quando forem correcoes de compatibilidade ou migracao.

### `backend/whatsapp-bridge`

Servico Node.js separado da interface.

- Stack: Node.js, `whatsapp-web.js`, `dotenv`.
- Responsabilidades:
  - Capturar mensagens via sessao WhatsApp Web.
  - Persistir dados no Supabase ou enviar eventos para a API web.
  - Manter cache e sessao locais fora do versionamento.

Este modulo deve rodar como processo separado. Ele nao deve depender de arquivos dentro do Streamlit.

### `database/supabase`

Fonte versionada da estrutura de banco.

- `supabase_schema.sql`: schema consolidado.
- `migrations/`: historico incremental de alteracoes.
- `README.md`: instrucoes especificas da camada Supabase.

Novas alteracoes de schema devem gerar migrations versionadas antes de entrar em producao. Tabelas expostas no schema `public` devem considerar RLS, permissoes e politicas de acesso desde o inicio.

## Fluxos Principais

### CRM Web

```text
Usuario -> frontend/web -> Supabase
```

O usuario acessa o Next.js, autentica, navega pelo CRM e executa operacoes de clientes, tecnicos, usuarios e atendimentos.

### Streamlit Operacional

```text
Usuario local -> frontend/streamlit -> Supabase ou SQLite local
```

O Streamlit pode operar dados locais ou acessar Supabase, dependendo da configuracao. Para migracao, o script `frontend/streamlit/migrate_to_supabase.py` aplica o schema versionado e importa dados locais quando houver `crm_tecnicos.db`.

### WhatsApp via Bridge

```text
WhatsApp Web -> backend/whatsapp-bridge -> Supabase ou API web
```

O bridge roda separado, cria uma sessao local do WhatsApp Web e registra mensagens. Segredos e sessoes locais devem permanecer fora do Git.

### WhatsApp via Meta Cloud API

```text
Meta Webhook -> frontend/web/api/whatsapp/meta-webhook -> Supabase
```

O Next.js tambem tem endpoint para webhook oficial da Meta. Esse fluxo depende das variaveis `META_*` e da configuracao do callback no painel da Meta.

## Decisoes Arquiteturais

- O `frontend/web` e o destino principal da evolucao do produto.
- O `frontend/streamlit` fica como legado operacional e apoio ate a migracao terminar.
- O bridge WhatsApp pertence ao `backend/`, nao ao app Streamlit.
- O banco versionado pertence a `database/supabase/`.
- Segredos ficam somente em arquivos locais ignorados pelo Git ou em variaveis de ambiente da plataforma.
- `SUPABASE_SERVICE_ROLE_KEY` nunca deve ser exposta em cliente ou em variavel `NEXT_PUBLIC_*`.

## Riscos Atuais

- A raiz ainda precisa ser consolidada como repositorio Git oficial.
- Existe historico de `.git` aninhado em `frontend/streamlit`; manter ignorado ou remover quando a raiz assumir o versionamento.
- Validacao de build e execucao ficou pendente para uma etapa posterior.
- Algumas dependencias estao marcadas como `latest` no web; para estabilidade de producao, prefira versoes fixas.

## Proxima Evolucao Recomendada

1. Consolidar Git na raiz.
2. Validar build dos tres modulos.
3. Fechar setup de ambiente local.
4. Priorizar features novas no `frontend/web`.
5. Migrar gradualmente funcionalidades ainda exclusivas do Streamlit.
6. Reforcar RLS, auditoria e permissoes no Supabase antes de deploy publico.
