# Roadmap — Sigma Atendimento + CRM

**Versão:** 2.0  
**Data:** 2026-07-09  
**Produto ativo:** `SigmaAtendimento`

## Princípio de execução

A ordem abaixo reduz retrabalho: primeiro estabiliza segurança e dados, depois implementa os fluxos operacionais e, por último, deriva painéis e relatórios de informações já confiáveis.

Cada etapa deve terminar com:

- typecheck;
- build de produção;
- testes automatizados relevantes;
- validação do fluxo principal;
- documentação atualizada.

## Etapa 1 — Fundação, segurança e consistência

### Objetivo

Deixar uma base segura para as demais funcionalidades.

### Entregas

- consolidar `SigmaAtendimento` como aplicação oficial;
- identificar claramente `frontend/`, `backend/` e `database/` como legado;
- criar middleware de autorização por perfil;
- restringir gestão de usuários, setores e configurações;
- remover o segredo JWT padrão e impedir boot inseguro em produção;
- restringir CORS HTTP e Socket.io;
- remover a exclusão de dados ao iniciar sessão do WhatsApp;
- substituir alterações de schema em runtime por migrations;
- atualizar dependências vulneráveis;
- tornar obrigatório o escopo da empresa nas entidades de negócio;
- testar isolamento entre empresas;
- alinhar contratos compartilhados com o schema Prisma.

### Critério de pronto

Usuários não conseguem executar ações de perfis superiores, nenhum fluxo operacional apaga histórico e os testes de segurança passam.

## Etapa 2 — CRM e cadastros fundamentais

### Objetivo

Estabilizar as entidades que serão usadas por atendimentos e visitas.

### Entregas

- cadastro de empresas clientes;
- múltiplos contatos por cliente;
- endereço completo;
- vínculo automático de contato pelo telefone;
- complemento posterior dos dados;
- catálogo administrável de sistemas/assuntos;
- opção **Outro** com descrição;
- cadastro de setores;
- configuração do técnico padrão;
- ficha do cliente com histórico unificado.

### Critério de pronto

É possível localizar um contato pelo telefone, vinculá-lo a uma empresa e consultar seu histórico.

## Etapa 3 — Fila e atendimento WhatsApp

### Objetivo

Implementar o núcleo operacional do produto sem acoplá-lo ao provedor final.

### Entregas

- criação automática de atendimento na primeira mensagem;
- menu numérico de setores;
- timeout de 2 minutos;
- encaminhamento para técnico padrão;
- mensagem automática de entrada na fila;
- filas por setor;
- botão **Assumir** com proteção contra concorrência;
- vários atendimentos ativos por profissional;
- registro de horários da jornada;
- histórico completo de mensagens;
- funcionamento fora do expediente;
- eventos em tempo real;
- testes usando provider mock.

### Critério de pronto

Uma mensagem simulada percorre triagem, fila, atribuição e atendimento sem perda ou duplicidade.

## Etapa 4 — Encerramento e histórico

### Objetivo

Transformar conversas em registros úteis para operação e gestão.

### Entregas

- ação **Finalizar atendimento**;
- resultado, resumo e sistema/assunto obrigatórios;
- observações opcionais;
- criação de novo atendimento após cada encerramento;
- histórico somente leitura;
- vínculo entre atendimento, conversa, contato, cliente e profissional;
- tempos de espera e atendimento;
- trilha de auditoria.

### Critério de pronto

Todo atendimento encerrado possui responsável, horários, classificação e resumo consultáveis.

## Etapa 5 — Chamados e visitas técnicas

### Objetivo

Fechar o ciclo entre suporte remoto e atendimento presencial.

### Entregas

- abertura de chamado a partir do atendimento;
- escolha do técnico por quem conduz a conversa;
- data definida ou **Não definido**;
- estados Pendente, Agendada, Em atendimento, Concluída e Cancelada;
- alteração de agendamento com motivo obrigatório;
- histórico de alterações;
- conclusão com resultado e serviço executado obrigatórios;
- tempo, materiais e fotos opcionais;
- notificação interna ao técnico;
- permissões de edição por perfil.

### Critério de pronto

Um atendimento pode gerar uma visita, ser acompanhado até a conclusão e manter auditoria completa.

## Etapa 6 — Painel de visitas

### Objetivo

Dar visibilidade operacional à agenda da equipe.

### Entregas

- calendário;
- lista;
- filtros por técnico e status;
- visitas sem data em área de pendências;
- detalhes e histórico da visita;
- indicadores de visitas do dia;
- notificações internas.

### Critério de pronto

Todos visualizam a operação; somente usuários autorizados alteram os registros.

## Etapa 7 — Dashboard e relatórios

### Objetivo

Construir gestão sobre dados consolidados das etapas anteriores.

### Entregas

- fila atual;
- atendimentos ativos;
- visitas do dia;
- últimos atendimentos e visitas;
- visão individual para profissionais;
- visão completa para administrador e supervisor;
- relatórios por profissional, setor e período;
- relatórios de visitas por técnico e status;
- ranking de sistemas e assuntos;
- tempo médio de espera e atendimento;
- conversão de atendimento em visita;
- clientes com maior volume;
- exportação.

### Critério de pronto

Indicadores conferem com os registros operacionais e respeitam o escopo de cada perfil.

## Etapa 8 — Escolha e integração do WhatsApp real

### Objetivo

Selecionar a alternativa mais segura e sustentável após validar o produto com provider mock.

### Avaliação obrigatória

- Meta Cloud API e mudanças recentes;
- Evolution API;
- soluções locais baseadas em WhatsApp Web;
- custo;
- estabilidade;
- risco de bloqueio;
- webhooks e idempotência;
- mensagens de mídia;
- templates;
- janela de atendimento;
- recuperação e sincronização de histórico;
- facilidade de deploy e suporte.

### Entregas

- matriz comparativa;
- decisão registrada em ADR;
- implementação pelo contrato de provider existente;
- entrada e saída ponta a ponta;
- retry/outbox;
- health check;
- monitoramento;
- teste com um número real.

### Critério de pronto

Mensagem real entra, aparece na fila, recebe resposta e mantém rastreabilidade ponta a ponta.

## Backlog posterior

- múltiplos números;
- operação SaaS multiempresa;
- distribuição automática por carga;
- IA para classificação e resumo;
- PWA ou aplicativo móvel;
- SLA e escalonamento;
- confirmação ou assinatura do cliente;
- notificações externas de visitas;
- financeiro e faturamento.

## Dependências entre etapas

```text
Fundação
   ↓
CRM e cadastros
   ↓
Fila WhatsApp
   ↓
Encerramento e histórico
   ↓
Chamados e visitas
   ↓
Painel de visitas
   ↓
Dashboard e relatórios
   ↓
Provider WhatsApp real
```
