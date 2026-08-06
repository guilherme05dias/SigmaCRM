import { describe, expect, it } from 'vitest';
import type { QuotedMessage } from './types';
import { messagePreviewText } from './messagePresentation';

function message(type: QuotedMessage['type'], body: string | null = null): QuotedMessage {
    return {
        id: `message-${type}`,
        direction: 'INBOUND',
        type,
        body,
        createdAt: '2026-08-06T12:00:00.000Z',
    };
}

describe('prévia de mensagens na lista de conversas', () => {
    it.each([
        ['IMAGE', 'Imagem'],
        ['AUDIO', 'Áudio'],
        ['VIDEO', 'Vídeo'],
        ['DOCUMENT', 'Documento'],
    ] as const)('identifica uma mensagem %s sem legenda como %s', (type, expected) => {
        expect(messagePreviewText(message(type))).toBe(expected);
    });

    it('mantém a legenda do arquivo quando ela existe', () => {
        expect(messagePreviewText(message('DOCUMENT', 'Relatório mensal.pdf'))).toBe('Relatório mensal.pdf');
    });

    it('mantém vazio apenas quando ainda não existe conteúdo de mensagem', () => {
        expect(messagePreviewText(message('TEXT'))).toBe('');
    });
});
