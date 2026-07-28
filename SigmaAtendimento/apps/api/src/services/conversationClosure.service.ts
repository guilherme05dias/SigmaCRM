import { ConversationCloseMode } from '@prisma/client';

export const DEFAULT_CLOSING_WITH_RATING_MESSAGE = 'Atendimento encerrado. Se precisar de algo, envie uma nova mensagem.\n\nDe 1 a 10, qual nota você dá para este atendimento? Responda apenas com um número.';
export const DEFAULT_INACTIVITY_CLOSING_MESSAGE = 'Encerramos este atendimento por falta de resposta. Quando precisar, envie uma nova mensagem e retomaremos o atendimento.';

export function getConversationClosureBehavior(input: {
    closeMode: ConversationCloseMode;
    includeInServiceReports: boolean;
    closingMessage?: string | null;
    inactivityClosingMessage?: string | null;
}) {
    const shouldSendClosingMessage = input.closeMode !== ConversationCloseMode.SILENT;
    const shouldRequestSatisfaction = input.closeMode === ConversationCloseMode.WITH_RATING
        && input.includeInServiceReports;
    const closingText = shouldSendClosingMessage
        ? [
            (input.closeMode === ConversationCloseMode.INACTIVITY
                ? input.inactivityClosingMessage?.trim() || DEFAULT_INACTIVITY_CLOSING_MESSAGE
                : input.closingMessage?.trim() || DEFAULT_CLOSING_WITH_RATING_MESSAGE),
        ].filter(Boolean).join('\n\n')
        : '';

    return { shouldSendClosingMessage, shouldRequestSatisfaction, closingText };
}
