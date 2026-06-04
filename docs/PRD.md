# PRD — ServiçoCRM (SigmaCRM)

**Documento de Requisitos de Produto**
**Versão:** 1.0
**Data:** 2026-06-01
**Status:** Em produção (MVP entregue, evoluindo)

---

## 1. Visão Geral

### 1.1 Resumo
ServiçoCRM é um sistema de gestão de atendimentos técnicos voltado para
pequenas e médias operações de suporte (assistências técnicas, prestadores de
TI, equipes de campo). Centraliza o ciclo de vida do atendimento — do primeiro
contato à resolução — junto ao cadastro de clientes, equipe técnica e
integração nativa com WhatsApp.

### 1.2 Problema
Operações de suporte técnico de pequeno porte tipicamente controlam
atendimentos por planilhas, cadernos ou conversas soltas de WhatsApp. Isso gera:
- Perda de histórico e dificuldade de rastrear status de cada chamado.
- Falta de padronização (protocolo, prioridade, SLA informal).
- Ausência de visão gerencial (volume, produtividade por técnico, pendências).
- Conversas de WhatsApp desconectadas do registro formal do atendimento.

### 1.3 Proposta de Valor
Um CRM leve, em português, com:
- Registro padronizado de atendimentos com **protocolo automático**.
- **Dashboard** gerencial com métricas em tempo real.
- **Integração com WhatsApp** que captura conversas e as vincula a atendimentos.
- Controle de acesso por perfil (gerente, atendente, técnico).
- Baixíssimo custo de operação (Streamlit + Supabase free tier).

### 1.4 Objetivos de Negócio
| Objetivo | Métrica de sucesso |
|----------|--------------------|
| Centralizar atendimentos | 100% dos chamados registrados no sistema |
| Reduzir perda de histórico | Histórico completo por cliente e protocolo |
| Dar visão gerencial | Dashboard consultado diariamente pela gestão |
| Integrar WhatsApp ao fluxo | Conversas vinculadas a atendimentos |

---

## 2. Público-Alvo e Personas

### 2.1 Persona — Gerente / Dono da operação
- **Necessidades:** visão geral, produtividade da equipe, gestão de usuários,
  acesso total ao sistema.
- **Dores:** não sabe quantos chamados estão abertos nem quem está sobrecarregado.

### 2.2 Persona — Atendente / Recepção
- **Necessidades:** registrar novos chamados rápido, cadastrar clientes,
  acompanhar fila de atendimentos.
- **Dores:** retrabalho ao recadastrar o mesmo cliente, falta de protocolo.

### 2.3 Persona — Técnico de campo/remoto
- **Necessidades:** ver seus chamados, atualizar status e registrar resolução.
- **Dores:** não tem onde anotar o que foi feito de forma rastreável.

---

## 3. Escopo

### 3.1 Dentro do escopo (MVP atual)
- Cadastro e gestão de **técnicos**, **clientes** e **atendimentos**.
- **Protocolo automático** por dia (`ATD<AAAAMMDD>-<sequência>`).
- **Dashboard** com métricas e atalhos.
- **Resumo diário** por data.
- **Exportação CSV**.
- **Autenticação** por usuário/senha e **RBAC** por perfil.
- **Gestão de usuários** (criação, edição, permissões granulares).
- **Integração WhatsApp** (captura de mensagens, conversas, vínculo a atendimento).
- **Health check** operacional na sidebar.

### 3.2 Fora do escopo (por enquanto)
- App mobile nativo (acesso é via navegador/rede local ou Tailscale).
- Faturamento/financeiro e emissão de notas.
- Assinatura/SLA contratual automatizado com alertas.
- Multi-tenant (uma instância = uma operação).
- Envio ativo de mensagens pelo WhatsApp a partir do CRM (atualmente captura/leitura).

---

## 4. Requisitos Funcionais

### 4.1 Autenticação e Controle de Acesso
- **RF-01** O sistema deve exigir login (usuário + senha) para qualquer acesso.
- **RF-02** Senhas devem ser armazenadas com hash seguro (PBKDF2-HMAC-SHA256).
- **RF-03** O acesso a páginas e ações deve respeitar o perfil do usuário (RBAC).
- **RF-04** Perfis padrão:
  - `gerente`: acesso total.
  - `atendente`: Dashboard, Atendimentos, Resumo, Clientes.
  - `tecnico`: Dashboard, Atendimentos, Resumo.
- **RF-05** O gerente pode sobrescrever permissões por usuário (páginas e ações).
- **RF-06** O gerente pode criar usuários, ativar/inativar e redefinir senhas.

### 4.2 Técnicos
- **RF-07** Cadastrar técnico (nome, especialidade, telefone, e-mail, ativo).
- **RF-08** Editar e ativar/inativar técnico.
- **RF-09** Excluir técnico (com proteção de integridade referencial).

### 4.3 Clientes
- **RF-10** Cadastrar cliente (nome, empresa, telefone, e-mail, cidade,
  segmento, observações, status).
- **RF-11** "Obter ou criar" cliente por nome para evitar duplicidade no registro rápido.
- **RF-12** Editar perfil e alterar status (Ativo / Em negociação / Inativo).
- **RF-13** Listagem priorizando clientes ativos.

### 4.4 Atendimentos
- **RF-14** Registrar atendimento com protocolo automático único por dia.
- **RF-15** Campos: título, descrição, técnico, cliente, status, prioridade,
  canal, tipo de serviço, prazo, equipamento, categoria, próxima ação, resolução,
  tempo gasto, avaliação do cliente (1–5).
- **RF-16** Atualizar status e acompanhamento por protocolo.
- **RF-17** Listagem com filtros e atualização de status.
- **RF-18** Excluir atendimento.
- **RF-19** Valores controlados por listas: status, prioridade, canal, tipo de serviço.

### 4.5 Dashboard e Relatórios
- **RF-20** Exibir métricas-chave (volumes de técnicos, clientes, atendimentos).
- **RF-21** Resumo diário de atendimentos por data.
- **RF-22** Exportar dados em CSV.

### 4.6 Integração WhatsApp
- **RF-23** Capturar mensagens (entrada e saída) de contatos individuais em tempo real.
- **RF-24** Agrupar mensagens em conversas por número de contato.
- **RF-25** Listar conversas com filtros por período e status (aberto/resolvido).
- **RF-26** Visualizar o histórico de mensagens de uma conversa.
- **RF-27** Vincular uma conversa a um atendimento.
- **RF-28** Marcar status da conversa e registrar anotações.
- **RF-29** Ignorar grupos, canais e broadcasts (apenas contatos individuais).

### 4.7 Operação
- **RF-30** Health check exibindo status, backend e volumes na sidebar.
- **RF-31** Logging centralizado com rotação de arquivo.

---

## 5. Requisitos Não Funcionais

| Código | Requisito |
|--------|-----------|
| RNF-01 | **Usabilidade:** interface em português, design system próprio, responsiva para uso em celular na rede local. |
| RNF-02 | **Segurança:** senhas com PBKDF2; segredos fora do versionamento (`secrets.toml`, `.env`); chave service_role do Supabase nunca commitada. |
| RNF-03 | **Disponibilidade:** banco gerenciado (Supabase) com `pool_pre_ping` para resiliência de conexão. |
| RNF-04 | **Custo:** operável em planos gratuitos (Streamlit + Supabase). |
| RNF-05 | **Manutenibilidade:** arquitetura em camadas, validação por schemas Pydantic, exceções de domínio padronizadas. |
| RNF-06 | **Portabilidade:** execução local via `.bat`, acesso remoto via Tailscale; bridge WhatsApp multiplataforma (Node.js). |
| RNF-07 | **Observabilidade:** logs com rotação e health check operacional. |
| RNF-08 | **Desempenho:** índices no banco para protocolo e data de abertura; autorefresh controlado na UI. |

---

## 6. Arquitetura Técnica

### 6.1 Stack
- **Front-end / App:** Python 3 + Streamlit, com `streamlit-autorefresh` e Plotly.
- **Validação:** Pydantic v2.
- **Persistência:** PostgreSQL gerenciado (Supabase) via SQLAlchemy + psycopg2.
- **Integração WhatsApp:** Node.js com `whatsapp-web.js`, gravando no Supabase via REST API.

### 6.2 Camadas
```
main.py            → ponto de entrada e roteamento de páginas
 └─ ui.py          → componentes e páginas Streamlit
     └─ backend.py → fachada estável para a UI
         └─ services.py     → regras de negócio (CRMService)
             └─ repositories.py → acesso a dados (SQLAlchemy)
                 └─ PostgreSQL/Supabase
auth.py            → autenticação + RBAC
models.py          → schemas Pydantic
config.py          → constantes, listas controladas, URL do banco
errors.py          → exceções de domínio
app_logging.py     → logging com rotação
whatsapp_parser.py → leitura/escrita das conversas WhatsApp
backend/whatsapp-bridge/ → captura de mensagens (Node.js)
```

### 6.3 Modelo de Dados (principais tabelas)
- `technicians` — equipe técnica.
- `clients` — base de clientes.
- `attendances` — atendimentos (FK para técnico e cliente; protocolo único).
- `users` — autenticação e permissões (`allowed_pages`, `can_actions`).
- `whatsapp_conversations` — conversa por número, com vínculo opcional a atendimento.
- `whatsapp_messages` — mensagens individuais (direção in/out, dedup por `wa_message_id`).

Schema versionado em `supabase_schema.sql`.

### 6.4 Implantação
- Aplicação Streamlit executada localmente (`run_app.bat`) com acesso na rede
  local ou remoto via Tailscale (`start_with_tunnel.bat`).
- Bridge WhatsApp iniciado separadamente (`start_whatsapp.bat`); sessão
  persistida localmente após leitura do QR code.
- Segredos: `frontend/streamlit/.streamlit/secrets.toml` (app) e `backend/whatsapp-bridge/.env` (bridge).

---

## 7. Premissas e Dependências
- Conta e projeto **Supabase** provisionados, com schema aplicado.
- **Node.js** instalado na máquina que roda o bridge WhatsApp.
- Um número de WhatsApp dedicado para a operação técnica.
- Conexão de internet estável para o bridge e o banco gerenciado.

---

## 8. Riscos e Mitigações

| Risco | Impacto | Mitigação |
|-------|---------|-----------|
| Credenciais padrão fracas no seed inicial | Acesso indevido | Forçar troca de senha no primeiro acesso (backlog) |
| Bridge WhatsApp depende de sessão não oficial (`whatsapp-web.js`) | Quebra com mudanças do WhatsApp | Monitorar reconexão automática; avaliar API oficial no futuro |
| Timestamps armazenados como TEXT | Limita consultas por data no banco | Migrar para tipo `TIMESTAMP` (backlog) |
| Documentação desatualizada (cita SQLite) | Confusão de manutenção | Atualizar README e `health_check` (backlog) |
| Arquivos legados (Excel/Sheets) no repositório | Ruído de manutenção | Remover backends não utilizados |

---

## 9. Roadmap Sugerido

### Curto prazo (correções e higiene)
- Atualizar README e `health_check` para refletir PostgreSQL/Supabase.
- Remover backends legados (Excel/Google Sheets) não utilizados.
- Forçar troca das senhas padrão no primeiro login.
- Migrar validadores Pydantic para a sintaxe v2 (`@field_validator`).

### Médio prazo (evolução de produto)
- Filtros e busca avançada na lista de atendimentos.
- Indicadores de produtividade por técnico no dashboard.
- Alertas de prazo (SLA) para atendimentos próximos do vencimento.
- Envio de mensagens WhatsApp a partir do CRM.

### Longo prazo (escala)
- Multi-tenant para atender múltiplas operações.
- App mobile / PWA dedicado.
- Módulo financeiro (orçamento, faturamento).
- Testes automatizados e pipeline de CI.

---

## 10. Métricas de Acompanhamento do Produto
- Nº de atendimentos registrados / período.
- Tempo médio de resolução por atendimento.
- Atendimentos abertos vs. concluídos.
- Avaliação média do cliente (1–5).
- Conversas de WhatsApp vinculadas a atendimentos.
- Usuários ativos por perfil.
