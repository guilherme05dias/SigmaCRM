# Plano completo de correcoes

Este plano transforma a auditoria tecnica, de seguranca e UX/UI em um backlog executavel. A ordem prioriza bloqueios de producao, depois integridade das regras de negocio e, por fim, qualidade de uso.

## Criterios gerais de conclusao

- `npm run typecheck` e `npm run build` devem passar na raiz de `SigmaAtendimento`.
- Webhooks externos devem rejeitar requisicoes sem autenticacao valida.
- Nenhum supervisor pode criar ou promover usuarios para `ADMIN`.
- A API deve aplicar autorizacao por papel e por campo, alem do isolamento por `companyId`.
- Todas as tabelas do schema exposto devem ter RLS e politicas coerentes.
- Navegacao e operacoes principais devem funcionar por teclado e em 390 px de largura.
- Os fluxos criticos devem possuir testes automatizados reproduziveis.

## Fase 1 — Seguranca bloqueadora

1. Fechar webhooks por padrao.
   - Proibir provider `mock` em producao.
   - Exigir segredo para Evolution e UAZAPI.
   - Exigir assinatura valida para Meta Cloud.
   - Recusar inicializacao ou requisicao quando a configuracao estiver incompleta.
2. Proteger autenticacao.
   - Resposta uniforme para credenciais invalidas.
   - Rate limit no login.
   - Nao registrar identificadores de tentativas invalidas.
3. Corrigir escalada de privilegios.
   - Schemas explicitos para criacao e atualizacao de usuarios.
   - Somente administrador atribui o papel `ADMIN`.
   - Supervisor limitado a papeis operacionais permitidos.

## Fase 2 — Isolamento e autorizacao de negocio

1. Completar RLS nas tabelas adicionadas depois da migration inicial.
2. Revisar Edge Functions que usam `service_role`.
   - Validar token interno antes de criar o client privilegiado.
   - Nao aceitar `companyId` arbitrario do payload.
   - Confirmar que conversa, contato e empresa pertencem ao mesmo tenant.
3. Aplicar autorizacao por campo em chamados.
   - Administrador/supervisor: atribuicao, prioridade, setor e excecoes.
   - Atendente: dados operacionais do chamado sob sua responsabilidade.
   - Tecnico: agenda, execucao, materiais e resultado da visita atribuida.
4. Manter trilha de auditoria para mudancas sensiveis.

## Fase 3 — UX, acessibilidade e responsividade

1. Redesenhar bottom navigation para no maximo cinco destinos primarios.
2. Agrupar destinos secundarios em um menu `Mais` acessivel.
3. Adicionar nome acessivel e `aria-current` aos links por icone.
4. Tornar menu de usuario utilizavel por clique, teclado, Escape e toque.
5. Garantir alvos de toque de pelo menos 44 x 44 px.
6. Simplificar a hierarquia do dashboard.
   - Priorizar fila, atendimentos ativos e visitas que exigem acao.
   - Mover indicadores historicos para uma faixa secundaria compacta.
7. Implementar recuperacao de falhas com mensagem contextual e `Tentar novamente`.

## Fase 4 — Testes e prevencao de regressao

1. Testes de RBAC e escalada de privilegios.
2. Testes de isolamento entre duas empresas.
3. Testes de autenticacao e assinatura de webhooks.
4. Testes das transicoes e campos permitidos por papel em chamados.
5. Testes de navegacao por teclado e nomes acessiveis.
6. Verificacao responsiva em 390, 768, 1280 e 1440 px.
7. Incluir typecheck, build e testes no pipeline de CI.

## Fase 5 — Autenticacao de sessao

A migracao do JWT armazenado em Web Storage para cookie `HttpOnly`, `Secure` e `SameSite` deve ser executada como uma entrega propria, pois altera simultaneamente API, frontend, CORS e estrategia de logout/renovacao. Ate essa migracao, reduzir a validade do token, aplicar CSP rigorosa e evitar qualquer renderizacao de HTML nao confiavel.

## Validacao final

1. Executar typecheck, build e suite de testes.
2. Revisar o diff para garantir que alteracoes locais anteriores foram preservadas.
3. Repetir auditoria estatica de UI.
4. Validar visualmente desktop, mobile, light e dark mode.
5. Revisar migrations sem aplica-las automaticamente em producao.
6. Documentar riscos residuais e passos de deploy.
