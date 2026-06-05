# M4 — Frontend Unificado (notas)

**Data:** 2026-06-05

## 1. Objetivo

Ligar o frontend React/Vite ao backend unificado, trazendo as primeiras telas de CRM
para dentro do Sigma.

## 2. Executado

- `apps/web/src/lib/api.ts` — camada central de API com:
  - `VITE_API_URL` ou fallback `http://localhost:3334`;
  - header `Authorization: Bearer <token>`;
  - tratamento de erro e redirect em `401`.
- `apps/web/src/pages/Dashboard.tsx` — novo dashboard em `/`, consumindo
  `/api/reports/summary`, com:
  - conversas;
  - mensagens;
  - chamados;
  - taxa de resolução;
  - CSAT;
  - ranking por departamento e técnico.
- `apps/web/src/pages/Customers.tsx` — nova tela `/customers`, consumindo
  `/api/customers`, com:
  - busca;
  - filtro por status;
  - métricas rápidas;
  - criação;
  - edição;
  - inativação.
- `apps/web/src/App.tsx` — Dashboard virou home (`/`) e Inbox foi movido para
  `/inbox`.
- `SigmaTopbar` e `SigmaSidebarIcon` — navegação atualizada com Dashboard, Inbox e
  Clientes.
- `Users`, `Departments` e `Tickets` — ajustes iniciais para usar token e contrato
  camelCase do backend novo.
- `Tickets` — status alinhados com `TicketStatus` (`NEW`, `QUEUED`, `IN_PROGRESS`,
  `SCHEDULED_FIELD_SERVICE`, `RESOLVED`, `CLOSED`, `CANCELED`) e leitura de
  `fieldService`.
- `Settings` — seção **Conexão WhatsApp** agora consulta `/api/whatsapp/sessions`,
  inicia sessão em `/api/whatsapp/sessions/default/start` e exibe QR Code escaneável
  vindo de `/api/whatsapp/sessions/default/qrcode-image`.

## 3. Validação

Comandos executados:

```bash
npm run build --workspace=@sigma/web
npm run typecheck
```

Ambos passaram.

## 4. Pendências do M4

- Testar visualmente no navegador com API e banco rodando.
- Escanear o QR Code com celular e validar envio/recebimento real.
- Ajustar Inbox para `/inbox` em qualquer deep link antigo.
- Refinar contratos compartilhados em `packages/shared` para camelCase.
- Substituir alguns componentes antigos baseados em Material Symbols por Lucide, se a
  direção visual final exigir isso.
