# Setup do SigmaCRM

Este guia descreve como preparar o ambiente local depois da reorganizacao do projeto.

## Pre-requisitos

- Node.js LTS.
- npm.
- Python 3.11+.
- Acesso ao projeto Supabase.
- Chaves locais para Supabase e WhatsApp, quando os fluxos forem testados.

## Estrutura de Trabalho

Use a raiz do projeto como ponto de partida para cada modulo:

```powershell
cd "C:\Users\Guilherme Dias\Desktop\SigmaCRM"
```

## 1. Configurar o Web

Entre na aplicacao Next.js a partir da raiz:

```powershell
cd frontend\web
npm install
```

Crie o arquivo local:

```powershell
copy .env.example .env.local
```

Preencha:

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
NEXT_PUBLIC_APP_URL=
SUPABASE_SERVICE_ROLE_KEY=
WHATSAPP_WEBHOOK_SECRET=
META_WEBHOOK_VERIFY_TOKEN=
META_APP_SECRET=
META_PHONE_NUMBER_ID=
META_WABA_ID=
LOCAL_AUTH_USERNAME=
LOCAL_AUTH_FULL_NAME=
LOCAL_AUTH_ROLE=
LOCAL_AUTH_PASSWORD_HASH=
```

Notas de seguranca:

- Somente variaveis `NEXT_PUBLIC_*` podem ir para o navegador.
- `SUPABASE_SERVICE_ROLE_KEY` deve ficar apenas no servidor.
- `.env.local` nao deve ser versionado.

Rodar em desenvolvimento:

```powershell
npm run dev
```

URL padrao:

```text
http://localhost:3000
```

Validacao posterior:

```powershell
npm run build
```

## 2. Configurar o Streamlit

Entre no app Streamlit a partir da raiz:

```powershell
cd frontend\streamlit
pip install -r requirements.txt
```

Crie o arquivo de segredos:

```powershell
copy .streamlit\secrets.example.toml .streamlit\secrets.toml
```

Preencha:

```toml
[database]
user = "postgres"
password = "sua_senha"
host = "db.aprjeyqponmepdrjvxtc.supabase.co"
port = 5432
dbname = "postgres"
```

Rodar:

```powershell
streamlit run main.py
```

Alternativa:

```powershell
run_app.bat
```

## 3. Configurar o Bridge WhatsApp

Entre no bridge a partir da raiz:

```powershell
cd backend\whatsapp-bridge
npm install
```

Crie o arquivo local:

```powershell
copy .env.example .env
```

Preencha:

```env
SUPABASE_URL=
SUPABASE_KEY=
```

`SUPABASE_KEY` deve ser uma chave com permissao suficiente para gravar mensagens. Nao commitar `.env`.

Rodar:

```powershell
npm start
```

O primeiro uso pode exigir leitura de QR code do WhatsApp Web. As pastas de sessao e cache ficam locais e devem permanecer fora do Git.

## 4. Banco Supabase

Arquivos versionados:

```text
database/supabase/supabase_schema.sql
database/supabase/migrations/
```

Para aplicar schema e migrar dados locais pelo script atual:

```powershell
python frontend\streamlit\migrate_to_supabase.py
```

Esse script depende de `frontend/streamlit/.streamlit/secrets.toml`.

Antes de criar novas tabelas ou funcoes:

- Criar migration versionada.
- Revisar RLS em tabelas expostas no schema `public`.
- Evitar `SECURITY DEFINER` salvo quando for realmente necessario e revisado.
- Rodar advisors do Supabase quando a CLI/MCP estiver disponivel.

## 5. Ordem Recomendada de Validacao

Quando for possivel testar:

1. `frontend/web`: `npm install` e `npm run build`.
2. `frontend/streamlit`: `pip install -r requirements.txt` e `streamlit run main.py`.
3. `backend/whatsapp-bridge`: `npm install` e `npm start`.
4. Validar conexao Supabase.
5. Validar ingestao WhatsApp no endpoint `/api/whatsapp/messages`.
6. Validar webhook Meta em `/api/whatsapp/meta-webhook`, se esse fluxo estiver ativo.

## 6. Itens Que Nao Devem Ser Versionados

- `frontend/web/.env.local`
- `backend/whatsapp-bridge/.env`
- `frontend/streamlit/.streamlit/secrets.toml`
- `node_modules/`
- `.next/`
- `__pycache__/`
- `*.log`
- `*.db`, `*.sqlite`, `*.sqlite3`
- `.wwebjs_auth/`
- `.wwebjs_cache/`

## Status

Esta documentacao foi preparada sem executar os modulos localmente. A validacao de build, runtime e conexao com Supabase ficou pendente para a proxima janela de teste.
