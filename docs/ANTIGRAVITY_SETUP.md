# Setup de Agentes/Skills/MCP no Google Antigravity — ServiçoCRM

Este documento traz (1) a curadoria de skills/MCP/rules para este projeto e
(2) um **prompt pronto** para colar no agente do Antigravity, que faz a
descoberta, o download e a instalação — com verificação e segurança.

> Você é o cérebro (arquitetura/curadoria); o modelo executor do Antigravity
> (Gemini 3.x / Claude 4.6 / GPT-OSS) é o braço que instala e configura.

---

## 1. Curadoria recomendada

**MCP servers**
- `@supabase/mcp-server-supabase` (ou HTTP `https://mcp.supabase.com/mcp`) — schema, migrations, RLS. **Começar em read-only.**
- `context7` — documentação atualizada (Streamlit, Supabase, SQLAlchemy, Pydantic).

**Skills**
- Postgres/Supabase best practices (oficiais) — RLS, índices, migrations.
- `security-auditor` — auth, validação, segredos.
- `code-review` / `pr-review`.
- `test-driven-development`, `debugging-strategies`.
- `python` / `refactoring`.

**Repos de skills (GitHub)**
- Oficial Google: `npx skills install github.com/google/skills`
- Catálogo grande: `sickn33/antigravity-awesome-skills` (`npx antigravity-awesome-skills`)
- Alternativo: `rmyndharis/antigravity-skills` (`npx @rmyndharis/antigravity-skills install <skill>`)

**Rules** — criar `AGENTS.md` + `GEMINI.md` no projeto com as convenções.

---

## 2. PROMPT PARA COLAR NO ANTIGRAVITY

```
Você é um agente de setup do meu workspace no Google Antigravity. Objetivo:
instalar e configurar skills, MCP servers e rules adequados a ESTE projeto, com
segurança e verificação. Não altere o código da aplicação nesta tarefa — apenas
configure o ambiente de agentes.

CONTEXTO DO PROJETO
- App: "ServiçoCRM", CRM de atendimentos técnicos virando SaaS comercial.
- Stack: Python + Streamlit (frontend), PostgreSQL via Supabase (SQLAlchemy +
  psycopg2), bridge WhatsApp em Node.js. Validação com Pydantic v2.
- Arquitetura em camadas: ui.py -> backend.py -> services.py -> repositories.py.
- Design system atual: baseado no da Meta (canvas branco, azul cobalto #0064E0,
  botões "pill", tipografia Montserrat, ícones Lucide, SEM emojis). Tokens em
  design_system.py; ícones em icons.py (Lucide).
- Prioridades: multi-tenant com RLS no Supabase, segurança (migrar auth para
  Supabase Auth), relatórios gerenciais, e adicionar testes (hoje não há).

PASSO 0 — VERIFICAR DOCS (não confie em comandos de memória)
1. Leia a doc atual de MCP: https://antigravity.google/docs/mcp
2. Leia a doc de skills/CLI: https://antigravity.google/docs/cli-features
3. Confirme os caminhos e comandos atuais (eles mudam por versão):
   - MCP: ~/.gemini/config/mcp_config.json
   - Skills (workspace): <projeto>/.agents/skills/  | (global) ~/.gemini/antigravity/skills/
   - Rules: AGENTS.md / GEMINI.md (workspace e global)
   Ajuste os passos abaixo ao que a doc disser.

PASSO 1 — MCP SERVERS
1. Configure o Supabase MCP em mcp_config.json. Use OAuth se disponível; caso
   exija token (PAT), NÃO escreva o token em arquivo versionado — me peça o
   valor ou use variável de ambiente. Configure em modo READ-ONLY primeiro:
   {
     "mcpServers": {
       "supabase": {
         "command": "npx",
         "args": ["-y", "@supabase/mcp-server-supabase@latest", "--read-only"]
       }
     }
   }
   (No Windows, prefixe com "cmd /c" se a doc indicar.)
2. Adicione um MCP de documentação (ex.: context7) se a doc recomendar.
3. Reinicie a sessão e confirme que os servidores aparecem conectados.

PASSO 2 — SKILLS
1. Prefira skills OFICIAIS (Google/Supabase). Instale a base oficial:
   npx skills install github.com/google/skills
2. Do catálogo da comunidade, instale APENAS estas (revise cada uma antes):
   - postgres / supabase best practices (RLS, índices, migrations)
   - security-auditor
   - code-review (ou pr-review)
   - test-driven-development
   - debugging-strategies
   - python / refactoring
   Pode usar: npx antigravity-awesome-skills   (selecione só as acima)
   ou:        npx @rmyndharis/antigravity-skills install <skill>
3. Instale no ESCOPO DO WORKSPACE (<projeto>/.agents/skills/) sempre que possível,
   para manter o projeto autocontido.

PASSO 3 — RULES DO PROJETO
Crie/atualize AGENTS.md (e GEMINI.md) na raiz do projeto com estas regras:
- Respeitar a arquitetura em camadas ui -> backend -> services -> repositories;
  nunca acessar o banco direto da UI.
- Validação sempre via schemas Pydantic v2 (usar @field_validator, não @validator).
- Design system: usar tokens de design_system.py e ícones Lucide de icons.py.
  PROIBIDO usar emojis na UI. Botões em pill; cobalto = ação primária.
- Segredos (Supabase, WhatsApp) nunca commitados; usar
  frontend/streamlit/.streamlit/secrets.toml e backend/whatsapp-bridge/.env
  (ja no .gitignore).
- Multi-tenant: toda nova tabela/coluna deve considerar tenant_id + RLS.
- Antes de mudanças de schema, gerar migration e validar RLS.

SEGURANÇA (obrigatório)
- Skills da comunidade são código de terceiros: revise o conteúdo de cada skill
  antes de ativar; descarte as que executem scripts não auditáveis.
- Fixe versões (@latest só após revisão); evite hooks automáticos não revisados.
- Não exponha tokens em arquivos versionados.

ENTREGÁVEL FINAL (relatório)
- Liste o que foi instalado: skills (nome + origem + escopo + caminho), MCP
  servers (status de conexão) e os arquivos de rules criados.
- Aponte qualquer skill que você recusou instalar e por quê.
- Sugira 3 próximos passos de uso (ex.: rodar security-auditor no auth.py).
```

---

## 3. Notas de segurança e fontes

- **Risco de supply chain:** skills/MCP da comunidade são código de terceiros.
  Prefira repositórios oficiais (Google, Supabase), revise antes de ativar e
  fixe versões.
- **Windows:** chamadas `npx` em MCP podem exigir prefixo `cmd /c`.
- **Tokens:** o Supabase MCP pode pedir PAT — use OAuth quando possível e nunca
  versione segredos.

### Fontes
- [Configuring MCP Servers and Skills for Antigravity (Medium / Google Cloud)](https://medium.com/google-cloud/configuring-mcp-servers-and-skills-for-antigravity-cli-and-ide-a938c7eebb78)
- [Antigravity Docs — MCP](https://antigravity.google/docs/mcp)
- [Antigravity Docs — CLI features](https://antigravity.google/docs/cli-features)
- [Antigravity Rules: AGENTS.md & Examples](https://agentpedia.codes/blog/user-rules)
- [Google Cloud Blog — Official Skills Repository](https://cloud.google.com/blog/topics/developers-practitioners/level-up-your-agents-announcing-googles-official-skills-repository)
- [sickn33/antigravity-awesome-skills](https://github.com/sickn33/antigravity-awesome-skills)
- [rmyndharis/antigravity-skills](https://github.com/rmyndharis/antigravity-skills)
- [Supabase MCP Server — Docs](https://supabase.com/docs/guides/getting-started/mcp)
