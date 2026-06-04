# SigmaCRM

Workspace organizado como monorepo para separar as camadas do sistema SigmaCRM.

## Estrutura

```text
frontend/
  web/        Next.js App Router, TypeScript e Supabase
  streamlit/  Aplicacao Streamlit legada/operacional
backend/
  whatsapp-bridge/  Bridge Node.js para captura WhatsApp
database/
  supabase/   Schema e migrations PostgreSQL/Supabase
  data/       Arquivos de dados usados em migracoes
docs/         PRD, roadmap, design system e setup
```

## Documentacao

- [Arquitetura](docs/ARCHITECTURE.md)
- [Setup local](docs/SETUP.md)
- [Roadmap](docs/ROADMAP.md)
- [PRD](docs/PRD.md)

## Comandos Principais

Web:

```powershell
cd frontend\web
npm install
npm run dev
```

Streamlit:

```powershell
cd frontend\streamlit
pip install -r requirements.txt
streamlit run main.py
```

Bridge WhatsApp:

```powershell
cd backend\whatsapp-bridge
npm install
npm start
```

## Banco de Dados

As migrations Supabase ficam em `database/supabase/migrations/`.

Para aplicar o schema e migrar dados locais, configure `frontend/streamlit/.streamlit/secrets.toml` e execute:

```powershell
python frontend\streamlit\migrate_to_supabase.py
```

## Segredos e Artefatos Locais

Nao versionar `.env`, `.env.local`, `.streamlit/secrets.toml`, bancos SQLite locais, logs, caches, `node_modules/`, `.next/` ou sessoes do WhatsApp Web.
