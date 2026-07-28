import { ConversationCloseMode } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { getConversationClosureBehavior } from './conversationClosure.service';

describe('modos de encerramento do atendimento', () => {
    it('envia despedida e avaliação no encerramento com avaliação', () => {
        const result = getConversationClosureBehavior({
            closeMode: ConversationCloseMode.WITH_RATING,
            includeInServiceReports: true,
            closingMessage: 'Obrigado pelo contato.\n\nComo você avalia nosso atendimento?',
        });

        expect(result.shouldRequestSatisfaction).toBe(true);
        expect(result.closingText).toBe('Obrigado pelo contato.\n\nComo você avalia nosso atendimento?');
    });

    it('envia somente a despedida no encerramento por inatividade', () => {
        const result = getConversationClosureBehavior({
            closeMode: ConversationCloseMode.INACTIVITY,
            includeInServiceReports: true,
            closingMessage: 'Mensagem normal que não deve ser usada.',
            inactivityClosingMessage: 'Encerramos por falta de resposta.',
        });

        expect(result.shouldRequestSatisfaction).toBe(false);
        expect(result.closingText).toBe('Encerramos por falta de resposta.');
    });

    it('não gera nenhuma mensagem no encerramento silencioso', () => {
        const result = getConversationClosureBehavior({
            closeMode: ConversationCloseMode.SILENT,
            includeInServiceReports: true,
            closingMessage: 'Esta mensagem não deve ser enviada.',
        });

        expect(result.shouldSendClosingMessage).toBe(false);
        expect(result.shouldRequestSatisfaction).toBe(false);
        expect(result.closingText).toBe('');
    });
});
