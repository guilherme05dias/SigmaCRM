# Sigma Atendimento + CRM — Produto

## Nome

Sigma Atendimento + CRM

## Plataforma

Web

## Registro

Product UI / dashboard operacional.

## Visão

O Sigma Atendimento + CRM centraliza o relacionamento com clientes desde a primeira mensagem no WhatsApp até a abertura, agendamento e conclusão de visitas técnicas presenciais.

O produto deve substituir controles paralelos em planilhas e conversas soltas, mantendo tudo rastreável: quem chamou, quem atendeu, qual setor foi escolhido, qual assunto foi tratado, se houve chamado, qual técnico executou a visita e qual foi o resultado.

## Usuários

### Administrador

- Configura usuários, setores, sistemas/assuntos e parâmetros da empresa.
- Visualiza todos os atendimentos, chamados, visitas e relatórios.
- Mantém o técnico padrão para fallback de atendimentos.

### Supervisor

- Acompanha filas, atendimentos ativos, histórico e visitas.
- Visualiza indicadores de toda a equipe.
- Apoia transferências e acompanhamento operacional.

### Atendente

- Assume conversas do WhatsApp.
- Conduz o atendimento remoto.
- Complementa dados de contatos/clientes.
- Encerra atendimentos com resultado, resumo e assunto.
- Abre chamado/visita técnica quando necessário.

### Técnico

- Pode assumir atendimentos.
- Recebe visitas técnicas.
- Altera agenda com justificativa.
- Registra execução da visita, resultado, materiais, tempo e anexos.

## Fluxo principal

1. Cliente chama no WhatsApp.
2. Sistema cria ou identifica o contato pelo telefone.
3. Conversa entra na fila.
4. Cliente escolhe um setor.
5. Um profissional clica em “Assumir”.
6. O atendimento acontece pelo chat.
7. Se necessário, o profissional cria um chamado/visita.
8. O técnico agenda ou deixa a data como “Não definido”.
9. A visita aparece no painel de visitas.
10. O técnico registra a execução.
11. O atendimento e a visita ficam no histórico do cliente.

## Superfícies principais

- Dashboard operacional.
- Inbox WhatsApp.
- Chamados.
- Detalhe do chamado/visita.
- Painel de visitas.
- Clientes/CRM.
- Usuários.
- Setores.
- Sistemas e assuntos.
- Relatórios.
- Configurações.

## Estado atual do escopo

O sistema começa com uma única empresa e um único número de WhatsApp, mas preserva campos de `companyId` para evolução futura.

## Princípios do produto

- Rastreamento acima de improviso.
- Operação simples para atendentes e técnicos.
- Poucos cliques para assumir, responder, criar chamado e finalizar.
- Histórico confiável.
- Permissões claras por perfil.
- Interface densa quando necessário, mas legível e consistente.

## Fora do escopo inicial

- App mobile nativo.
- Financeiro/faturamento.
- Distribuição automática avançada por carga.
- Múltiplos números de WhatsApp.
- Multiempresa comercial.
- IA para classificação automática.
