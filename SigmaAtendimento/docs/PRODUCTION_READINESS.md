# Prontidão para produção

Atualizado em 21/07/2026.

## Concluído

- [x] Aplicação funcional na rede local, com web e API respondendo.
- [x] Integração UAZAPI, health-check e reconciliação automática saudáveis.
- [x] Dependências de produção atualizadas; nenhuma vulnerabilidade alta ou crítica no gate de produção.
- [x] Índices de relatórios e de chaves estrangeiras aplicados no Supabase.
- [x] Policies RLS otimizadas; advisor de segurança sem alertas e advisor de performance sem avisos.
- [x] Supabase definido como fonte de verdade para novas migrations, com o schema Prisma sincronizado.
- [x] CI criado para instalação limpa, Prisma, typecheck, testes, build e auditoria de produção.
- [x] Ambiente de produção protegido por validações de CORS, segredos, webhook e configuração do assistente.
- [x] Assistente interno implementado para análise de chamados, tarefas e lembretes, sem capacidade de responder clientes.
- [x] Validação local aprovada: 63 testes, typecheck, build, rotas autenticadas, inferência Ollama real e inspeção visual sem erros de console.
- [x] Teste de conexão Ollama protegido por perfil e rate limit, usando somente dados sintéticos e exibindo erros operacionais do modelo local.
- [x] Endpoint Ollama restrito ao loopback, modelos cloud bloqueados e nenhuma queda automática para API externa.
- [x] Timeout, indisponibilidade ou JSON inválido do modelo degradam para regras operacionais locais, sem deixar a análise sem resultado.
- [x] Análise real bloqueada na interface e no backend até uma autorização explícita dos metadados minimizados.

## Dependências externas antes da publicação

- [ ] Definir domínio, HTTPS e URLs públicas da web, API e Socket.IO.
- [ ] Gerar segredos novos e distintos para JWT, webhook e token interno.
- [ ] Confirmar que a chave OpenAI compartilhada na conversa foi revogada; o Sigma não precisa mais de uma chave nova.
- [ ] Escolher o destino de deploy e fornecer as credenciais correspondentes.
- [ ] Publicar frontend e API e homologar os fluxos pelo endereço público.
- [ ] Configurar monitoramento externo, alertas, rotação de logs e confirmar um teste de restauração de backup.
- [ ] Fazer a homologação final com usuários e dispositivos reais.
- [ ] Revisar as alterações, criar commit e enviar ao repositório remoto quando a entrega for aprovada.

## Risco aceito e monitorado

O audit de produção mantém dois avisos moderados herdados do `uuid@8` usado internamente pelo ExcelJS. O uso do Sigma é apenas a geração comum de UUID na exportação XLSX, fora do vetor com buffer descrito pelo advisory, e essa exportação possui teste automatizado. O gate bloqueia qualquer vulnerabilidade alta ou crítica.
