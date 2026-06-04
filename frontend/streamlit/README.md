# ServiçoCRM

Sistema em Python com Streamlit + SQLite para gestão de atendimentos técnicos, clientes e equipe.

## Visão Geral

- Front-end em `ui.py` com design system próprio
- Camada de regras e escrita centralizada no `backend.py`
- Persistência local com SQLite em `crm_tecnicos.db`
- Navegação por páginas: Dashboard, Atendimentos, Resumo por data, Técnicos, Clientes e Sobre

## Design Atual

- Branding: **ServiçoCRM**
- Paleta principal: dourado, marrom e vinho (tokens em `design_system.py`)
- Componentes com hover e feedback visual (cards, botões, sidebar, métricas)
- Hero de entrada com logo automática (`assets/logo.png`)

## Padrões Profissionais Aplicados

- Logging centralizado com rotação de arquivo (`app_logging.py`)
- Exceções de domínio padronizadas (`errors.py`) para validação, configuração e dados
- Camada `backend.py` com tratamento consistente de erros por operação
- Health check operacional exibido na sidebar da aplicação (status, backend e volumes)
- Estrutura em camadas com separação clara de UI, serviço e persistência

## Estrutura do Projeto

- `config.py`: constantes e título da aplicação
- `design_system.py`: tokens de cor, tipografia e spacing
- `database.py`: conexão e operações SQL base
- `repositories.py`: acesso a dados via SQLAlchemy
- `services.py`: regras de negócio
- `backend.py`: interface unificada consumida pelo front
- `ui.py`: layout, componentes e páginas Streamlit
- `main.py`: ponto de entrada

## Como Rodar

1. Instale dependências:

```bash
pip install -r requirements.txt
```

2. Execute:

```bash
streamlit run main.py
```

Ou use `run_app.bat` (já com auto-reload habilitado).

## Funcionalidades

- Dashboard com métricas e atalhos rápidos
- Cadastro e gestão de técnicos
- Cadastro e gestão de clientes
- Registro de atendimento com protocolo automático
- Lista de atendimentos com filtros e atualização de status
- Exportação CSV
- Resumo diário por data

## Segurança e Acesso

- Login por usuário e senha
- Controle de acesso por perfil (RBAC)
	- `gerente`: acesso total
	- `atendente`: dashboard, atendimentos, resumo e clientes
	- `tecnico`: dashboard, atendimentos e resumo

Credenciais iniciais (trocar em produção):

- `gerente` / `gerente123`
- `atendente` / `atendente123`
- `tecnico` / `tecnico123`

## Observação

O arquivo `crm_tecnicos.db` é criado automaticamente na primeira execução.
