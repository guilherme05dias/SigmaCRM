import type { QuotedMessage } from './types';

// A API envia a assinatura ao cliente no formato "*Nome | Setor:*\nMensagem".
// No painel interno, a posição da bolha já identifica uma mensagem enviada.
const WHATSAPP_SIGNATURE_PREFIX = /^\*([^*\r\n]{1,160}):\*\r?\n/;

export function messageSignatureLabel(message: Pick<QuotedMessage, 'body' | 'direction' | 'deletedAt'>): string | null {
    if (message.deletedAt || message.direction !== 'OUTBOUND' || !message.body) return null;
    return message.body.match(WHATSAPP_SIGNATURE_PREFIX)?.[1]?.trim() || null;
}

export function displayMessageBody(message: Pick<QuotedMessage, 'body' | 'direction' | 'deletedAt' | 'deletedByCustomer'>): string {
    if (message.deletedAt) return message.deletedByCustomer ? 'Mensagem excluída pelo cliente' : 'Mensagem excluída';
    const body = message.body || '';
    if (message.direction !== 'OUTBOUND') return body;
    return body.replace(WHATSAPP_SIGNATURE_PREFIX, '').trimStart();
}

const MEDIA_PREVIEW_LABELS: Record<Exclude<QuotedMessage['type'], 'TEXT'>, string> = {
    IMAGE: 'Imagem',
    AUDIO: 'Áudio',
    VIDEO: 'Vídeo',
    DOCUMENT: 'Documento',
};

export function messagePreviewText(
    message: Pick<QuotedMessage, 'body' | 'direction' | 'type' | 'deletedAt' | 'deletedByCustomer'>,
): string {
    const body = displayMessageBody(message).trim();
    if (body) return body;
    if (message.type === 'TEXT') return '';
    return MEDIA_PREVIEW_LABELS[message.type];
}
