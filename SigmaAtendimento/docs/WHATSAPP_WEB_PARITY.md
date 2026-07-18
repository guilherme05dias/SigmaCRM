# Paridade com WhatsApp Web

Auditoria funcional do Sigma Atendimento em 13/07/2026. O objetivo é comparar o fluxo de atendimento com os recursos centrais do WhatsApp Web; recursos próprios do Sigma (fila, responsável, protocolo e histórico de atendimento) são registrados separadamente.

Legenda: **Implementado** = utilizável de ponta a ponta; **Parcial** = existe, mas faltam estados ou interações do WhatsApp; **Ausente** = não há fluxo correspondente no produto.

## Mensagens e mídia

| Funcionalidade | Status | Situação no Sigma |
|---|---|---|
| Enviar e receber texto | Implementado | Tempo real, histórico e envio pela UAZAPI. |
| Responder uma mensagem | Implementado | Seleção na bolha, prévia no compositor, `replyid`, vínculo persistido, citação na bolha e navegação até a original. |
| Imagens | Implementado | Envio, recebimento, visualização e download. |
| Áudios e notas de voz | Parcial | Grava, envia e reproduz; faltam forma de onda, pausa/retomada da gravação, prévia do rascunho, velocidade e reprodução fora da conversa. |
| Vídeos | Implementado | Envio, recebimento, reprodução e download. |
| Documentos | Implementado | Envio, recebimento e download. |
| Arrastar/colar arquivos | Ausente | O anexo depende do seletor de arquivos. |
| Reações | Parcial | É possível enviar reação; o Sigma ainda não persiste nem renderiza o conjunto de reações recebido. |
| Editar mensagem enviada | Ausente | WhatsApp permite edição por até 15 minutos. |
| Apagar para mim/todos | Ausente | Não há menu nem sincronização de exclusão. |
| Encaminhar mensagem | Ausente | Não implementado. |
| Copiar mensagem por ação | Ausente | Só é possível selecionar texto pelo navegador. |
| Favoritar mensagem | Ausente | Não há mensagens com estrela. |
| Fixar mensagem no chat | Ausente | Não implementado. |
| Informações da mensagem | Ausente | Não há painel com horários de envio, entrega e leitura. |
| Confirmações de envio/entrega/leitura | Parcial | A interface mostra confirmação visual, mas não persiste os estados reais do evento `messages_update`. |
| Emoji no compositor | Ausente | Há seletor de reações, não um seletor de emojis para o texto. |
| GIFs e stickers | Ausente | Não há busca, envio nem renderização específica. |
| Prévia de links | Ausente | Links aparecem como texto, sem cartão rico. |
| Visualização única | Ausente | Fotos, vídeos e áudios de visualização única não possuem tratamento específico. |
| Mensagens temporárias | Ausente | Não há timer, expiração nem aviso de conversa temporária. |
| Enviar contato | Ausente | Não implementado. |
| Localização ao vivo/estática | Ausente | Não implementado. |
| Enquetes | Ausente | Não implementado. |

## Conversas, contatos e organização

| Funcionalidade | Status | Situação no Sigma |
|---|---|---|
| Histórico completo e mensagens antigas | Implementado | Importação, paginação e solicitação de mensagens anteriores. |
| Fotos de perfil | Implementado | Consultadas na UAZAPI e armazenadas no contato. |
| Buscar/iniciar conversa por contato | Implementado | Pesquisa e validação do número no WhatsApp. |
| Buscar dentro da conversa | Ausente | Não há pesquisa por texto nas mensagens do chat aberto. |
| Marcar conversa como lida | Implementado | O chat é marcado como lido ao ser aberto. |
| Marcar como não lida | Ausente | Não implementado. |
| Filtro Todas/Não lidas/Grupos | Ausente | As abas atuais são operacionais do CRM: Conversas, Fila e Histórico. |
| Arquivar conversa | Ausente | Histórico do atendimento não equivale ao arquivo pessoal do WhatsApp. |
| Silenciar notificações | Ausente | Não há configuração por conversa. |
| Fixar/favoritar conversa | Ausente | Não implementado. |
| Indicador digitando/gravando | Ausente | Eventos de presença não são tratados. |
| Online e visto por último | Ausente | Não implementado. |
| Bloquear/denunciar contato | Ausente | Não implementado na interface. |
| Papel de parede e temas por chat | Ausente | Há tema global claro/escuro, não tema individual de conversa. |
| Notificações do navegador | Parcial | Há notificações internas do CRM; não há push equivalente ao WhatsApp Web. |

## Grupos, contas e comunicação ampliada

| Funcionalidade | Status | Situação no Sigma |
|---|---|---|
| Sincronização da instância/QR | Implementado | Conexão, status e QR da sessão UAZAPI. |
| Vários números/contas simultâneos | Ausente | O fluxo ativo usa uma instância/número padrão. |
| Grupos e administração de grupos | Ausente | O modelo atual normaliza apenas conversas individuais. |
| Comunidades | Ausente | Não faz parte do produto atual. |
| Canais | Ausente | Não faz parte do produto atual. |
| Status | Ausente | Não há publicação ou visualização de status. |
| Chamadas de voz/vídeo e histórico | Ausente | Não há eventos, interface ou mídia de chamada. |
| Lista de transmissão | Ausente | Não implementado. |
| Catálogo, pedidos e pagamentos | Ausente | Não fazem parte do escopo atual do atendimento. |

## Recursos próprios do Sigma

Estão implementados e não existem da mesma forma no WhatsApp Web: fila de atendimento, responsável e departamento, transferência, abertura/fechamento de atendimento, criação de chamado, visita técnica, avaliação, assinatura do atendente, métricas, relatórios e histórico separado das conversas ativas.

## Prioridade recomendada

1. **P0 — confiabilidade da conversa:** persistir/renderizar reações, estados reais de envio/entrega/leitura, menu de ações por mensagem, busca dentro do chat e estado de falha/reenvio.
2. **P1 — produtividade:** editar, apagar, encaminhar, copiar, favoritar, filtros de não lidas, marcar como não lida, silenciar e fixar conversas.
3. **P2 — mídia completa:** emoji/GIF/sticker, arrastar e colar anexos, contatos, localização, enquetes, visualização única e áudio avançado.
4. **P3 — expansão de canal:** grupos, múltiplos números, chamadas, status, comunidades e canais; implementar somente se fizerem sentido para a operação do CRM.

## Referências funcionais

- [Edição de mensagens no WhatsApp](https://about.fb.com/news/2023/05/edit-whatsapp-messages/)
- [Filtros de conversa](https://about.fb.com/news/2024/04/whatsapp-chat-filters/)
- [Recursos de mensagens de voz](https://about.fb.com/news/2022/03/new-voice-message-features-on-whatsapp/)
- [Mensagens de voz de visualização única](https://about.fb.com/news/2023/12/whatsapp-view-once-voice-messages/)
- [Mensagens temporárias](https://about.fb.com/news/2021/12/whatsapp-default-disappearing-messages-multiple-durations/)
- [Fotos e vídeos de visualização única](https://about.fb.com/news/2021/08/view-once-photos-and-videos-on-whatsapp/)
- [Reações, enquetes e compartilhamento de arquivos](https://about.fb.com/news/2022/04/our-vision-for-communities-on-whatsapp/)
- [Chamadas e sincronização em múltiplos dispositivos](https://about.fb.com/news/2023/03/faster-speeds-improved-calling-whatsapp-desktop/)
- [Documentação da UAZAPI](https://docs.uazapi.com/)
