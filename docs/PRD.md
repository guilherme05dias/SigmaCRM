# PRD — Sigma Atendimento + CRM

**Versão:** 2.0  
**Data:** 2026-07-09  
**Status:** Requisitos de produto validados para a próxima evolução

## 1. Visão do produto

O Sigma Atendimento + CRM centraliza o relacionamento com clientes desde o primeiro contato pelo WhatsApp até a eventual execução de uma visita técnica.

O fluxo principal é:

1. cliente envia uma mensagem;
2. o sistema identifica ou cria o contato pelo telefone;
3. um registro de atendimento é criado automaticamente;
4. o cliente escolhe um setor por menu numérico;
5. o atendimento entra na fila do setor;
6. um atendente ou técnico assume a conversa;
7. o atendimento é resolvido remotamente ou gera um chamado para visita;
8. todo o histórico permanece vinculado ao cliente no CRM.

Inicialmente, o sistema atenderá uma única empresa e um único número de WhatsApp. A estrutura multiempresa existente será preservada para evolução futura.

## 2. Perfis

### Administrador

- acesso completo;
- gerencia usuários, setores, sistemas/assuntos e configurações;
- visualiza indicadores de toda a equipe;
- define o técnico padrão da empresa.

### Supervisor

- acompanha todas as filas, atendimentos e visitas;
- transfere atendimentos;
- visualiza indicadores gerais;
- acompanha produtividade e histórico.

### Atendente

- visualiza filas permitidas;
- assume e conduz vários atendimentos simultâneos;
- cadastra e complementa clientes;
- encerra atendimentos;
- abre e agenda visitas técnicas.

### Técnico

- pode assumir atendimentos do WhatsApp;
- recebe e executa visitas;
- altera agendamentos mediante justificativa;
- registra o resultado da visita;
- visualiza os próprios indicadores.

## 3. Atendimento pelo WhatsApp

### 3.1 Entrada e identificação

- Cada nova conversa após um atendimento encerrado cria um novo atendimento.
- O contato é criado automaticamente pelo número de telefone.
- Uma empresa cliente pode possuir vários contatos.
- O cliente poderá continuar enviando detalhes enquanto aguarda na fila.
- Todas as mensagens devem permanecer registradas.

### 3.2 Triagem

- A triagem inicial usa menu numérico.
- O cliente escolhe um setor.
- Após a escolha, o sistema informa que a equipe está finalizando outros atendimentos e assumirá assim que possível.
- Se não houver escolha em até 2 minutos, o atendimento é direcionado para um técnico padrão da empresa.
- O técnico padrão é configurado pelo administrador.

### 3.3 Fila e atribuição

- Cada setor possui uma fila.
- O primeiro profissional disponível assume manualmente.
- Atendentes e técnicos podem assumir.
- Um profissional pode manter vários atendimentos ativos, sem limite inicial.
- O registro deve conter pelo menos:
  - cliente e contato;
  - setor;
  - data e hora da primeira mensagem;
  - data e hora em que foi assumido;
  - profissional responsável;
  - histórico completo de mensagens;
  - data e hora do encerramento;
  - indicação de chamado ou visita gerada.

### 3.4 Encerramento

- O atendimento só é encerrado quando o profissional clicar em **Finalizar atendimento**.
- Campos obrigatórios:
  - resultado;
  - resumo do atendimento;
  - sistema ou assunto relacionado.
- Observações são opcionais.
- O sistema/assunto é escolhido em catálogo administrável, com opção **Outro** para texto livre.

### 3.5 Fora do expediente

- O sistema informa o horário de funcionamento.
- A mensagem é registrada.
- O cliente permanece na fila para o próximo expediente.

## 4. CRM

### 4.1 Empresa cliente

Campos previstos:

- nome;
- CNPJ ou CPF;
- endereço;
- sistemas utilizados;
- observações;
- situação cadastral.

### 4.2 Contatos

- Uma empresa cliente pode possuir vários contatos.
- Cada contato possui telefone, nome, e-mail e função, quando disponíveis.
- O telefone do WhatsApp é a identificação inicial.
- Os dados podem ser complementados durante ou após o atendimento.
- O histórico de atendimentos e visitas deve ser consultável na ficha do cliente.

### 4.3 Sistemas e assuntos

- Administradores mantêm o catálogo de sistemas/assuntos.
- O catálogo é usado no encerramento dos atendimentos e nos relatórios.
- A opção **Outro** exige uma descrição livre.

## 5. Chamados e visitas técnicas

### 5.1 Abertura

- Um atendimento do WhatsApp não gera automaticamente uma visita.
- Quem estiver conduzindo o atendimento decide se é necessário abrir o chamado.
- Essa pessoa escolhe o técnico responsável.
- O atendente pode combinar a data com o cliente ou deixar o agendamento como **Não definido**.
- O chamado permanece vinculado ao atendimento de origem, cliente, contato e conversa.

### 5.2 Status

Fluxo da visita:

`Pendente → Agendada → Em atendimento → Concluída`

Uma visita também pode ser `Cancelada`.

### 5.3 Alteração de agendamento

O técnico responsável pode alterar a data, mas deve informar o motivo. O histórico deve registrar:

- data e hora da alteração;
- usuário responsável;
- valor anterior;
- novo valor;
- motivo.

### 5.4 Conclusão

Campos disponíveis:

- resultado;
- descrição do serviço executado;
- tempo gasto;
- materiais utilizados;
- fotos.

Somente resultado e descrição do serviço são obrigatórios.

### 5.5 Painel de visitas

- Visualização em calendário e lista.
- Filtros por técnico e status.
- Todos podem visualizar todas as visitas.
- Alterações respeitam as permissões do perfil.
- O técnico recebe notificação dentro do sistema quando uma visita lhe é atribuída.

## 6. Dashboard e relatórios

### 6.1 Dashboard operacional

Deve destacar:

- fila atual;
- atendimentos ativos;
- visitas do dia;
- últimos atendimentos pelo WhatsApp;
- últimas visitas;
- alertas e notificações.

Cada profissional vê seus próprios indicadores. Administradores e supervisores veem toda a equipe.

### 6.2 Relatórios

- atendimentos por profissional, setor e período;
- visitas por técnico, status e período;
- sistemas e assuntos mais solicitados;
- tempo de espera e tempo de atendimento;
- conversão de atendimentos em visitas;
- clientes com maior volume de solicitações.

## 7. Requisitos não funcionais

- Interface web responsiva e em português.
- Atualizações em tempo real na fila e nas conversas.
- Senhas protegidas com hash forte.
- Autorização aplicada no backend por perfil.
- Segredos obrigatórios e sem valores padrão em produção.
- Auditoria das alterações relevantes.
- Histórico não deve ser apagado ao iniciar ou reconectar o WhatsApp.
- Build, typecheck e testes automatizados no pipeline.
- Preservar isolamento por empresa, apesar da operação inicial single-company.

## 8. Integração WhatsApp

- A primeira versão opera com um único número.
- A escolha do provedor permanece pendente.
- A decisão deverá considerar as mudanças recentes da Meta, custo, estabilidade, suporte a webhooks, mídia, histórico, templates e risco de bloqueio.
- O domínio de atendimento não deve depender de um provedor específico.

## 9. Fora do escopo inicial

- múltiplas empresas em operação comercial;
- múltiplos números de WhatsApp;
- aplicativo móvel nativo;
- financeiro, faturamento e emissão de notas;
- distribuição automática por carga;
- IA para classificação automática do setor;
- notificações de visita por e-mail ou WhatsApp.

## 10. Critérios de sucesso

- Todo contato recebido gera um atendimento rastreável.
- Nenhuma conversa é perdida enquanto aguarda na fila.
- É possível saber quem atendeu, quando assumiu e como encerrou.
- Visitas permanecem ligadas ao atendimento que as originou.
- Alterações de agendamento são auditáveis.
- Gestão consegue consultar volume, produtividade e principais assuntos.
- Operação diária não depende de planilhas paralelas.
