# Plano de implementação — Sigma Atendimento

Atualizado em 21/07/2026.

## Objetivo

Levar o sistema do estado funcional em rede local para uma base pronta para publicação e adicionar um assistente interno local via Ollama. O assistente analisa os principais chamados, sugere prioridades e ajuda a controlar tarefas e lembretes. Ele não responde clientes.

## Plano executado

1. **Diagnóstico e arquitetura — concluído.**
   - Fluxos, permissões, banco, deploy e riscos inventariados.
   - Supabase definido como fonte de verdade para novas migrations; `schema.prisma` continua sendo a fonte de tipos do Prisma.
2. **Dependências — concluído para riscos altos de produção.**
   - Express, Socket.IO, React Router, `ws`, `lodash`, `qs` e dependências relacionadas atualizadas.
   - O risco restante é moderado e isolado no `uuid@8` interno do ExcelJS. O Sigma usa apenas `uuid.v4()` sem buffer, fora do vetor descrito pelo advisory. A exportação XLSX tem teste automatizado.
3. **Banco e RLS — concluído.**
   - Índices compostos de relatórios aplicados.
   - Chaves estrangeiras receberam índices de cobertura.
   - Policies RLS passaram a avaliar o tenant uma vez por consulta.
   - Advisor de segurança sem alertas e advisor de performance sem avisos.
4. **CI e produção — implementação local concluída; publicação depende do ambiente externo.**
   - GitHub Actions executa instalação limpa, Prisma, typecheck, testes, build e auditoria de produção.
   - A API valida segredos distintos, CORS, empresa padrão e configuração do assistente ao iniciar em produção.
5. **Assistente interno local via Ollama — concluído.**
   - Análise estruturada com o modelo local `llama3.2:1b`, escolhido após teste de desempenho nesta máquina.
   - O modelo recebe apenas referências opacas e sinais operacionais. Título, descrição, protocolo, observações, nomes e identificadores reais ficam no Sigma.
   - O endpoint é restrito ao loopback e modelos com `cloud` no nome são bloqueados pelo backend.
   - Nenhuma ferramenta de WhatsApp é fornecida ao modelo.
   - Sugestões exigem aceite humano para virar tarefa.
   - Tarefas manuais e sugeridas possuem prioridade, prazo, responsável e lembrete interno.
   - Administradores e supervisores podem testar o modelo local com um chamado inteiramente fictício, sem consultar dados reais.
   - Toda análise real exige autorização informada na interface e um sinal explícito validado novamente pelo backend.
6. **Validação local — concluída.**
   - 63 testes automatizados, incluindo as garantias de privacidade, permissão, execução somente local, contingência de timeout e autorização informada do assistente, além de typecheck, build, auditoria de produção e validação Prisma aprovados.
   - Migrations aplicadas e tabelas do assistente protegidas por RLS.
   - Tela do assistente validada no navegador sem erros ou avisos no console.

## Barreira estrutural contra respostas ao cliente

O módulo do assistente depende apenas de consultas de chamados e das tabelas internas `AssistantAnalysis` e `AssistantTask`. A requisição local ao Ollama não declara tools/functions. As rotas do assistente não importam providers de WhatsApp, outbox nem rotas de envio. Os chamados são processados como referências temporárias `T-xxx`, contendo somente prioridade, status, prazo, idade, presença de responsável, setor/assunto e pontuação operacional. O teste de conexão usa exclusivamente metadados fictícios e não toca no banco de chamados. Portanto, mesmo uma resposta inesperada do modelo não possui caminho executável para contatar um cliente nem recebe o texto dos clientes.

## Configuração do assistente

Variáveis somente no backend:

```env
ASSISTANT_ENABLED=true
OLLAMA_BASE_URL=http://127.0.0.1:11434
OLLAMA_ASSISTANT_MODEL=llama3.2:1b
OLLAMA_TIMEOUT_MS=90000
ASSISTANT_REMINDER_INTERVAL_MS=60000
```

Configure `OLLAMA_NO_CLOUD=1` no ambiente do Ollama. O backend recusa endpoints fora de `localhost` e modelos com `cloud` no nome. O navegador nunca acessa a porta 11434 diretamente; sem o Ollama, tarefas e lembretes continuam funcionando e apenas a análise fica indisponível.

Se o modelo exceder 90 segundos, estiver indisponível ou devolver JSON inválido, o Sigma conclui a solicitação pelas regras operacionais locais já calculadas no backend. A tela identifica esse resultado como `Contingência local`, sem perder a priorização nem as sugestões de tarefas.

## Migrations

Novas alterações de banco devem seguir este fluxo:

1. `npx supabase migration new nome_da_migration`
2. editar o SQL criado em `supabase/migrations`;
3. atualizar `apps/api/prisma/schema.prisma` quando houver mudança de modelo;
4. executar `npx prisma format` e `npx prisma validate`;
5. aplicar a migration Supabase e executar os advisors de segurança e performance.

As migrations antigas em `apps/api/prisma/migrations` permanecem como histórico legado e não devem ser usadas com `prisma migrate deploy` no banco atual.

## Dependências externas para publicar

- domínio e URLs públicas para web e API;
- segredos de produção novos e distintos;
- máquina do servidor com capacidade para executar o modelo Ollama escolhido;
- destino de deploy escolhido e credenciais correspondentes;
- monitoramento externo e rotina confirmada de restauração de backup;
- homologação final com usuários reais.
