# Roadmap do ServiçoCRM — Tela por Tela

**Versão:** 1.0 · **Data:** 2026-06-01
**Como ler:** cada seção descreve **como a tela funciona hoje** (comportamento real do
código) e o **roadmap** de evolução. Prioridades: 🔴 alta · 🟡 média · 🟢 baixa.
Contexto de produto: SaaS comercial (4–10 usuários por empresa); prioridade de
evolução = **relatórios gerenciais**; pré-requisitos do 1º cliente pagante =
**onboarding de empresa + segurança reforçada + relatórios**.

Fluxo de navegação (definido em [main.py](main.py) + [auth.py](auth.py)):
`Login → (sidebar por perfil) → Dashboard · Atendimentos · Resumo por data ·
Técnicos · Clientes · Usuários · WhatsApp · Sobre`.

---

## 0. Estrutura transversal (todas as telas)

### Como funciona hoje
- **Roteamento** em [main.py](main.py): inicializa banco/auth, aplica o tema
  (`style_app`), exige login (`require_authentication`) e renderiza a página
  escolhida na sidebar, sempre checando `can_access_page`.
- **Sidebar** ([ui.py](ui.py) `sidebar_navigation`): logo, perfil/nome, menu por
  rádio filtrado pelas páginas permitidas do usuário, botão de sair e rodapé.
- **Design system** ([design_system.py](design_system.py)): tokens Meta (canvas
  branco, cobalto, pills) consumidos pelo CSS global.
- **Feedback de ação**: helper `_run_ui_action` → executa, mostra toast e dá
  `st.rerun()`. Mensagens "flash" sobrevivem ao rerun via `session_state`.
- **Permissões**: `_can("acao:...")` controla a habilitação dos botões; o RBAC real
  vive em [auth.py](auth.py).

### Roadmap
- 🔴 **Isolamento multi-tenant**: adicionar `tenant_id` no contexto da sessão e
  propagar em todas as queries (ver ROADMAP global no fim).
- 🟡 **Estado de navegação por URL** (query params) para deep-link/refresh.
- 🟢 Migrar blocos HTML inline restantes para classes CSS reutilizáveis.

---

## 1. Login / Autenticação

### Como funciona hoje
- `require_authentication` esconde sidebar/header e centraliza um card de login
  com logo, título e formulário (usuário + senha).
- `authenticate_user` (em [auth.py](auth.py)) busca o usuário, valida a senha com
  **PBKDF2-HMAC-SHA256** (comparação em tempo constante) e grava `last_login`.
- Em sucesso, salva o usuário em `session_state["auth_user"]` e recarrega.
- Mostra um rodapé com as **credenciais padrão** (gerente/atendente/tecnico).

### Roadmap
- 🔴 **Remover credenciais padrão da tela** e forçar **troca de senha no 1º acesso**.
- 🔴 **Recuperação de senha** (e-mail) — hoje só o gerente redefine manualmente.
- 🟡 **Bloqueio por tentativas** (rate limit) e log de acessos suspeitos.
- 🟡 **"Lembrar-me" / expiração de sessão** configurável.
- 🟢 Suporte a SSO/Google quando virar SaaS multi-empresa.

---

## 2. Dashboard

### Como funciona hoje
- `show_dashboard`: faixa de dica + **3 atalhos rápidos** (novo atendimento /
  cliente / técnico) que mudam a página ativa, respeitando as páginas permitidas.
- Carrega atendimentos, técnicos e clientes e exibe **5 métricas**: total,
  concluídos, pendentes, técnicos, clientes.
- Duas tabelas: **atendimentos por status** e **top 10 clientes** (agregação pandas).

### Roadmap (🔴 prioridade declarada: relatórios gerenciais)
- 🔴 **Gráficos** (já há `plotly` nas dependências, ainda não usado): série temporal
  de atendimentos, pizza de status, barras de prioridade.
- 🔴 **Produtividade por técnico**: nº de atendimentos, % concluídos, horas
  trabalhadas, tempo médio de resolução.
- 🔴 **Indicadores de SLA**: chamados vencidos / a vencer.
- 🟡 **Filtro de período** global no topo do dashboard.
- 🟡 **Avaliação média do cliente** (campo `customer_rating` já existe no modelo).
- 🟢 Exportar o dashboard como PDF/print.

---

## 3. Atendimentos

Tela com **duas abas** (`show_attendances`): "Novo atendimento" e "Lista e gestão".

### 3a. Novo atendimento (`_attendance_form`)
**Como funciona hoje**
- Visível apenas para quem tem `attendance:create`; senão mostra aviso.
- Exige ao menos **um técnico ativo** cadastrado.
- Formulário em 2 colunas: dados do chamado (título, técnico, status,
  prioridade, modalidade, canal, categoria, equipamento) + dados do cliente
  (nome, empresa, telefone, e-mail, cidade, segmento, status).
- Campos longos: descrição, próxima ação, resolução.
- Ao salvar: **`get_or_create_client`** (evita duplicar cliente por nome) →
  **`generate_protocol`** (`ATD<data>-<seq>`) → cria o atendimento; se status =
  "Concluído", grava `solved_at`.

**Roadmap**
- 🟡 **Validação de contato** (telefone/e-mail) e máscara de telefone.
- 🟡 **Autocompletar cliente existente** em vez de redigitar todos os campos.
- 🟡 Campo `customer_contact` é coletado mas **não é persistido** — ligar ao modelo
  ou remover.
- 🟢 Upload de anexos (foto do equipamento, print do erro).
- 🟢 Modelos de atendimento (templates por categoria).

### 3b. Lista e gestão (`_attendance_list`)
**Como funciona hoje**
- Métricas (total/concluídos/pendentes) + **filtros**: técnico, status e busca
  textual (protocolo/cliente/título).
- Tabela com colunas principais + **exportação CSV** (`_export_csv`, UTF-8 BOM).
- Expander **"Atualizar status/resolução"**: por protocolo, edita status,
  resolução, próxima ação e horas (requer `attendance:update`).
- Expander **"Excluir atendimento"**: com confirmação obrigatória
  (requer `attendance:delete`).

**Roadmap**
- 🟡 **Edição completa** do atendimento (hoje só status/resolução/horas/ação).
- 🟡 **Paginação/ordenação** server-side para volumes grandes.
- 🟡 **Filtro por período e prioridade**.
- 🟢 **Histórico/auditoria** de mudanças de status por atendimento.
- 🟢 Ações em lote (atualizar vários chamados).

---

## 4. Resumo por data

### Como funciona hoje
- `show_daily_summary`: seletor de data → filtra atendimentos cujo `opened_at`
  começa naquela data (comparação de string `YYYY-MM-DD`).
- Métricas do dia + tabelas: **status do dia**, **top 5 técnicos**, **lista do dia**.

### Roadmap
- 🟡 **Intervalo de datas** (de/até) em vez de um único dia.
- 🟡 **Comparativo** (hoje vs. ontem / semana vs. semana).
- 🟡 Robustez: filtrar por data real exige `opened_at` como **timestamp** no banco
  (hoje é TEXT — ver roadmap global).
- 🟢 Agendar envio do resumo diário por e-mail/WhatsApp.

---

## 5. Técnicos

### Como funciona hoje
- `show_technicians` (requer página "Técnicos"): formulário de cadastro (nome,
  especialidade, telefone, e-mail, ativo) + lista da equipe.
- Expander **editar status** (toggle ativo/inativo, requer `technician:update`).
- Expander **excluir** com confirmação (requer `technician:delete`).
- Persistência via `TechnicianRepository`.

### Roadmap
- 🟡 **Edição completa** do técnico (hoje a lista só permite alternar ativo).
- 🟡 **Proteção referencial**: bloquear/avisar exclusão de técnico com
  atendimentos vinculados (FK existe no schema).
- 🟡 Vincular técnico a um **usuário de login** (hoje são entidades separadas).
- 🟢 Indicadores de carga por técnico (ligado ao dashboard).

---

## 6. Clientes

### Como funciona hoje
- `show_clients` (requer página "Clientes" + `client:create` p/ salvar): formulário
  completo (nome, empresa, telefone, e-mail, cidade, segmento, status, observações).
- Lista da base + expander para **alterar status** (Ativo/Em negociação/Inativo;
  requer `client:update`). Ordenação prioriza ativos.
- Persistência via `ClientRepository`; `get_by_name` sustenta o "obter ou criar".

### Roadmap
- 🟡 **Edição completa** do cliente na própria lista (já existe
  `update_client_profile` no backend, hoje **não usado** pela UI).
- 🟡 **Busca/filtro** de clientes (a lista cresce rápido).
- 🟡 **Visão 360°**: histórico de atendimentos + conversas WhatsApp do cliente.
- 🟢 Deduplicação por telefone/e-mail (hoje só por nome).
- 🟢 Importação em massa (CSV).

---

## 7. Usuários (gestão / RBAC)

### Como funciona hoje
- `show_users_management` (página "Usuários", padrão só do gerente).
- **Criar usuário** (login, nome, cargo, senha) via `create_user`.
- Por usuário, dois sub-tabs:
  - **Perfil & Permissões**: nome, cargo, ativo, e permissões **granulares**
    (páginas e ações) com opção "usar padrão do cargo".
  - **Redefinir senha**.
- Protege o próprio usuário (não muda o próprio cargo/ativo). Aviso de que
  permissões só valem após novo login.

### Roadmap
- 🔴 **Escopo por empresa (tenant)**: cada gerente só vê/gestiona usuários da sua
  empresa — peça central do multi-tenant.
- 🟡 **Trilha de auditoria** (quem criou/alterou/desativou quem e quando).
- 🟡 **Política de senha** (força mínima) e expiração.
- 🟢 Convite por e-mail em vez de senha definida manualmente.

---

## 8. WhatsApp

### Como funciona hoje
- `show_whatsapp` (página "WhatsApp", padrão só do gerente).
- **Auto-refresh a cada 30s** (`st_autorefresh`); botão "Sincronizar agora".
- O **bridge Node.js** ([backend/whatsapp-bridge/index.js](../backend/whatsapp-bridge/index.js)) captura
  mensagens (entrada/saída de contatos individuais) e grava direto no Supabase;
  o Python só **lê/atualiza** ([whatsapp_parser.py](whatsapp_parser.py)).
- Filtros (período/status) + métricas (conversas, mensagens, resolvidas, abertas).
- Lista de conversas em expanders: aba **Mensagens** (renderiza texto e
  **localização** com mapa) e aba **Ações** (mudar status, **vincular a
  atendimento**, anotações).

### Roadmap
- 🔴 **Multi-tenant do bridge** (DESAFIO PRINCIPAL): o bridge é 1 processo por
  número de WhatsApp; em SaaS, cada empresa tem o seu. Planejar worker por tenant
  ou migrar para a **WhatsApp Cloud API** oficial.
- 🟡 **Responder pelo CRM** (envio) — decisão de produto foi *manter só
  captura/leitura* por ora; reavaliar depois.
- 🟡 Criar atendimento **a partir** de uma conversa (1 clique).
- 🟢 Busca por conteúdo de mensagem; status "em_andamento" exposto na UI.

---

## 9. Sobre

### Como funciona hoje
- `show_about`: card institucional estático. Também é a tela de **fallback**
  quando o usuário não tem acesso à página solicitada.

### Roadmap
- 🟢 Mostrar **versão/build**, status do sistema (reusar `health_check`) e links
  de suporte.
- 🟢 Substituir o fallback por uma página "Sem acesso" dedicada.

---

## Roadmap global (transversal a todas as telas)

### 🔴 Curto prazo — fundação SaaS e higiene
1. **Multi-tenancy**: `tenant_id` em todas as tabelas + **RLS do Supabase**;
   contexto de empresa na sessão. (Recomendação técnica já alinhada.)
2. **Onboarding de empresa**: fluxo de criação de nova empresa + gerente inicial.
3. **Segurança**: troca de senha obrigatória, recuperação de senha, fim das
   credenciais padrão expostas.
4. **Higiene**: corrigir [README.md](README.md) e `health_check` (citam SQLite, mas
   o backend é PostgreSQL); remover backends legados (Excel/Sheets); migrar
   validadores Pydantic v1 → v2.

### 🟡 Médio prazo — valor de produto
5. **Relatórios gerenciais** (prioridade declarada): dashboard com gráficos,
   produtividade por técnico, SLA, avaliação do cliente.
6. **Datas como `TIMESTAMP`** no schema (hoje TEXT) — destrava filtros/ordenação.
7. **Edição completa** de clientes/técnicos/atendimentos na UI.
8. **Testes automatizados** e inicialização do repositório **git** + CI.

### 🟢 Longo prazo — escala
9. **Cobrança** integrada (gateway) e planos por faixa.
10. **WhatsApp Cloud API** (substitui o bridge não oficial) e envio pelo CRM.
11. **PWA/mobile** dedicado; SSO.

> Observação: os arquivos `DESIGN-meta (1).md` (design system padrão atual),
> [PRD.md](PRD.md) e este ROADMAP devem ser mantidos juntos como a documentação
> viva do produto.
