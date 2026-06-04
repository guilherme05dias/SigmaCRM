# Supabase

Projeto configurado: `aprjeyqponmepdrjvxtc`.

## Aplicar schema

Use o arquivo versionado:

```text
database/supabase/migrations/20260601000100_initial_schema.sql
```

Alternativas:

- Pelo Codex MCP gravável: aplicar a migration `initial_servicocrm_schema`.
- Pelo SQL Editor do Supabase: colar e executar o conteúdo de `database/supabase/supabase_schema.sql`.
- Pelo script local: preencher `frontend/streamlit/.streamlit/secrets.toml` e executar a partir da raiz:

```powershell
python frontend\streamlit\migrate_to_supabase.py
```

O script aplica o schema primeiro. Se existir `crm_tecnicos.db`, ele também migra dados locais para o PostgreSQL.

## Segredos locais

Crie `frontend/streamlit/.streamlit/secrets.toml` a partir de `frontend/streamlit/.streamlit/secrets.example.toml`.

Para o bridge WhatsApp, crie `backend/whatsapp-bridge/.env` a partir de `backend/whatsapp-bridge/.env.example`.

Não versionar `secrets.toml`, `.env`, senha do banco ou `service_role key`.
