# Sigma Atendimento

Bem-vindo ao repositório do **Sigma Atendimento**, um sistema de suporte técnico humanizado via WhatsApp. A arquitetura está montada em um Monorepo gerenciado via npm workspaces.

## Como rodar o projeto localmente (Fundação V1)

### 1. Instalação de Dependências
Na raiz do projeto, instale as bibliotecas de todas as workspaces:
```bash
npm install
```

### 2. Configuração do Banco de Dados (Postgres Supabase)
Crie um arquivo `.env` na pasta `apps/api` e adicione a URL da sua connection string do **Supabase Postgres**:
```bash
# apps/api/.env
DATABASE_URL="postgresql://postgres.[SEU_PROJETO]:[SUA_SENHA]@aws-0-sa-east-1.pooler.supabase.com:6543/postgres"
```

Em seguida, rode as migrations do Prisma para atualizar o schema:
```bash
npm run prisma:migrate --workspace=@sigma/api
```
Isso criará as tabelas `Company`, `User` e `Department`.

### 3. Rodando a Aplicação
Graças aos scripts do monorepo, você pode rodar o Frontend e o Backend separadamente ou juntos.

- **Para rodar ambas as aplicações simultâneas:**
```bash
npm run dev
```

- **Para rodar apenas a API (porta 3333):**
```bash
npm run dev:api
```

- **Para rodar apenas o Frontend (porta 5173):**
```bash
npm run dev:web
```

### 4. Acesso Inicial e Testes (Dados Seed)
Para testar a interface já populada com dados fictícios, você deve rodar o script de Seed na API. Ele criará `Departamentos` (Suporte N1, Financeiro, etc) e `Usuários`.

1. Rode o comando de injeção de dados a partir da raiz do projeto:
```bash
npm run prisma:seed --workspace=@sigma/api
```

2. Acesse o painel pelo navegador: `http://localhost:5173`.
3. Utilize uma das seguintes credenciais de teste para visualizar diferentes papéis. Todas as senhas são `123456`.
  - Admin: `admin@sigma.com`
  - Supervisor: `alice@sigma.com`
  - Atendentes: `atendente1@sigma.com`, `atendente2@sigma.com`, `atendente3@sigma.com`

4. Navegue livremente para visualizar a listagem de **Usuários**, **Departamentos** e o **Dashboard** inicial.

## Integração com WhatsApp - WAHA (DEV / Testes)

Nesta fase de desenvolvimento e testes, utilizamos a API não oficial **WAHA (WhatsApp HTTP API)** para lidar com mensagens. **Aviso:** Esta solução é apenas para testes em ambiente local/dev, e futuramente será substituída pela integração com a API Oficial (Meta) via o mesmo `IWhatsAppProvider`.

### Configurando o WAHA localmente
Você pode subir a API do WAHA facilmente via Docker:
```bash
docker run -d --name waha -p 3000:3000 devlikeapro/waha:latest
```

Após iniciar, o banco do WAHA pode exigir escaneamento do QR Code com um aparelho de testes.

### Variáveis de Ambiente
Configure no seu arquivo `apps/api/.env` os seguintes campos para conectar o backend ao WAHA:
```bash
WHATSAPP_API_BASE_URL="http://localhost:3000/api"
WHATSAPP_API_TOKEN="" # se houver configurado algum X-Api-Key no Docker
```

### Configurando o Webhook
No painel de dashboard do seu container WAHA, defina a URL de Webhook apontando para a sua API local (Substitua a URL pelo seu ngrok / localtunnel se necessário para testar webhooks):
```text
http://localhost:3333/api/whatsapp/webhook
```

Com isso feito, as mensagens do WhatsApp (texto e mídia básica) fluirão para a aba "Inbox" do dashboard do aplicativo.

## Verificação Estática
Para realizar a verificação de tipos e criar uma build do Backend em ambiente de deploy (`dist`), execute na raiz:
```bash
npm run typecheck
npm run build:api
```
