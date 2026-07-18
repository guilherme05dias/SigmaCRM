# Análise de Código e Arquitetura - SigmaCRM

Neste documento, consolido os resultados de uma varredura completa na arquitetura, no backend (Express + Prisma), frontend (React) e integrações do SigmaCRM. O projeto está caminhando bem, mas existem débitos técnicos e pontos cegos que precisam ser resolvidos antes de ganhar escala de produção.

---

## 1. Falhas de Segurança 🔒

> [!CAUTION]
> Estas falhas devem ser tratadas com prioridade alta, pois podem expor a aplicação a vulnerabilidades.

*   **Validação do Webhook da Meta e Evolution:** A verificação de assinatura da Meta tem uma ponta solta. O script em `verifyMetaSignature.ts` exibe um `console.warn` quando o `META_APP_SECRET` não está configurado e pula a validação, o que é um risco em produção se a variável estiver ausente. Na Evolution, o token via `req.query.token` funciona, mas não é a forma mais segura (ideal seria via Header `apikey`).
    *   **Como corrigir:** No Meta, lance um Erro 500 ou 401 rígido se o secret faltar em produção (nunca permita "bypass"). Para a Evolution, verifique se a API deles suporta autenticação do Webhook via Headers.
*   **Rate Limiting em Memória:** O middleware `rateLimit.middleware.ts` salva os "buckets" na memória RAM da própria API via `Map`.
    *   **Como corrigir:** Se a API for escalada em mais de 1 instância (ex: Railway com réplicas), o bloqueio falhará. Implemente o `redis` (via pacote `redis` ou `@upstash/redis`) para guardar a contagem de acessos de forma centralizada.
*   **Segurança de JWT e Expiração:** O frontend valida o JWT no `App.tsx` apenas quebrando as três partes (`split('.')`). Ele não avalia se o token está expirado.
    *   **Como corrigir:** No frontend, decodifique o payload do JWT com `jwt-decode` e avalie `exp * 1000 < Date.now()`. Isso impede que a tela seja exibida rapidamente para ser "kickada" pela primeira requisição 401.

## 2. Pontos de Melhoria e Gargalos de Performance 🚀

> [!WARNING]
> Esses pontos farão o CRM ficar lento à medida que a base de clientes crescer.

*   **Falta de Paginação Real (N+1 oculto):** Arquivos como `contacts.routes.ts`, `inbox.routes.ts` e `conversations.routes.ts` usam `take: 100`, mas **NÃO usam** `skip` nem `cursor`. 
    *   **Impacto:** Você limitou para nunca travar a API trazendo 1 milhão de registros de vez (o que é ótimo), mas limitou o cliente a **ver apenas os últimos N contatos/mensagens para sempre**. O botão "carregar mais" no frontend não tem como funcionar no backend.
    *   **Como corrigir:** Implemente paginação via Cursor (mais performático para chat) ou Offset (`skip` + `take`). No endpoint de `inbox`, retorne também um `nextCursor` para o frontend.
*   **Escalabilidade do Socket.io:** O Socket.io hoje trabalha apenas na memória da instância NodeJS (`getIO()`).
    *   **Como corrigir:** Ao ir para produção no Railway/Render e aumentar a quantidade de dynos/instâncias, os eventos de socket emitidos em um servidor não chegarão aos usuários conectados em outro. Instale o `@socket.io/redis-adapter` atrelado a um servidor Redis.
*   **Exclusão Pesada (Rota de LGPD):** A rota `DELETE /:id/data` em `contacts.routes.ts` puxa TODOS os IDs de conversas e tickets do usuário para o array e faz vários `deleteMany` pesados. Se um usuário tiver 10 mil mensagens, a memória do Node irá disparar e a transação pode falhar (Timeout do Banco).
    *   **Como corrigir:** No arquivo `schema.prisma`, use `onDelete: Cascade` nas chaves estrangeiras (ex: `Conversation` e `Ticket`). Dessa forma, um simples `prisma.contact.delete({ where: { id } })` mandará o banco de dados destruir todo o histórico debaixo daquele id com performance de banco nativo, economizando 40 linhas de código frágil.

## 3. Qualidade de Código e Pontas Soltas (Arquitetura) 🛠️

> [!NOTE]
> Melhorias estruturais que tornarão o código mais limpo e amigável para futuros desenvolvedores.

*   **Manejo Centralizado de Erros (Os "catch (error: any)"):** A aplicação tem centenas de rotas com a mesma estrutura de try/catch usando `catch (error: any) res.status(500).json(...)`. Isso esconde erros reais do console ou envia mensagens técnicas ao usuário (se `error.message` vazar stack traces).
    *   **Como corrigir:** Crie um `errorHandler.middleware.ts`. Jogue os erros nas rotas usando `next(error)`. No middleware central, capture e distinga entre `AppError` (esperado: retorna 400/404) e `InternalError` (inesperado: alerta no log, retorna 500 "Ocorreu um erro interno").
*   **Múltiplas Buscas de Empresa Default:** No webhook de WhatsApp, o código cria a empresa `findFirst` para definir o escopo em `getWebhookCompanyId`. Se o banco tiver várias empresas ativas, qual receberá a mensagem? Hoje ele pega a "mais antiga" (orderBy createdAt). Se o sistema virar Multi-tenant de fato (SaaS), essa arquitetura vai mandar mensagem de clientes de uma empresa pro número da outra.
    *   **Como corrigir:** O Webhook de WhatsApp (tanto Meta quanto Evolution) permite enviar parâmetros na URL. Cadastre a URL do webhook como `/webhook/evolution/ID_DA_EMPRESA`. Assim, você não precisa fazer uma query frágil para "adivinhar" quem é a dona do WhatsApp conectado.
*   **Gerenciamento de Tipagem com Prisma:** Há consultas pesadas com `include`. Muitas vezes no frontend os tipos não batem ou ficam implícitos.
    *   **Como corrigir:** Gere tipos complexos usando as ferramentas do prisma: `import { Prisma } from '@prisma/client'; type ContactWithConversations = Prisma.ContactGetPayload<{ include: { conversations: true } }>`. Reutilize isso para o frontend.

## 4. Front-End 🎨

> [!TIP]
> Boas práticas para o React/Vite.

*   **Rerenderização do Inbox:** Verifique se as mensagens de WebSocket do chat não estão provocando o rerender da tela lateral (lista de contatos) inteira. Se a store ou context do React não for otimizada, um digitando... (typing indicator) causa gargalos pesados.
    *   **Como corrigir:** Isole o estado das mensagens do estado da lista lateral, ou utilize Zustand.
*   **Otimização do Vite (Chunking):** Todas as páginas (Inbox, Settings, Dash) estão no mesmo pacote. O carregamento inicial será pesado.
    *   **Como corrigir:** Use `React.lazy()` e `<Suspense>` no `App.tsx` para fazer o Code Splitting, carregando os recursos de "Configurações", por exemplo, apenas quando o usuário clicar na aba correspondente.
