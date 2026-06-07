import { IWhatsAppProvider, ParsedIncomingPayload, SessionSummary, WhatsAppHistoryChat, WhatsAppHistorySyncOptions } from "../IWhatsAppProvider";

export class MockWhatsAppProvider implements IWhatsAppProvider {
    async createSession(sessionId: string): Promise<void> {
        console.log(`[MOCK WAHA] createSession called with sessionId: ${sessionId}`);
    }

    async disconnectSession(sessionId: string): Promise<void> {
        console.log(`[MOCK WAHA] disconnectSession called with sessionId: ${sessionId}`);
    }

    async listSessions(): Promise<SessionSummary[]> {
        console.log(`[MOCK WAHA] listSessions called`);
        return [
            {
                name: "default",
                status: "WORKING"
            }
        ];
    }

    async checkContact(phone: string): Promise<{ exists: boolean; phone: string; name?: string | null; wid?: string | null }> {
        const normalizedPhone = phone.replace(/\D/g, '');
        return {
            exists: normalizedPhone.length >= 10 && !normalizedPhone.endsWith('0000'),
            phone: normalizedPhone,
            name: normalizedPhone.length >= 10 ? `Contato ${normalizedPhone.slice(-4)}` : null,
            wid: normalizedPhone.length >= 10 ? `${normalizedPhone}@c.us` : null,
        };
    }

    async syncHistory(_options: WhatsAppHistorySyncOptions = {}): Promise<WhatsAppHistoryChat[]> {
        return [];
    }

    async sendText(params: { to: string; body: string; sessionId?: string }): Promise<{ waMessageId: string }> {
        const { to, body, sessionId } = params;
        console.log(`[MOCK WAHA] sendText called. To: ${to}, Message: "${body}", SessionId: ${sessionId || 'default'}`);

        const cleanTo = to.replace('@c.us', '');
        const messageId = `mock_${Date.now()}`;
        console.log(`[MOCK WAHA] Message accepted for ${cleanTo}. Returning fake ID.`);
        return { waMessageId: messageId };
    }

    async sendMedia(params: {
        to: string;
        type: "IMAGE" | "AUDIO" | "VIDEO" | "DOCUMENT";
        mediaUrl: string;
        caption?: string;
        sessionId?: string;
    }): Promise<{ waMessageId: string }> {
        const { to, type, mediaUrl, caption, sessionId } = params;
        console.log(`[MOCK WAHA] sendMedia. To: ${to}, Type: ${type}, Url: ${mediaUrl}`);

        const cleanTo = to.replace('@c.us', '');
        const messageId = `mock_media_${Date.now()}`;
        console.log(`[MOCK WAHA] Media accepted for ${cleanTo}. Returning fake ID.`);
        return { waMessageId: messageId };
    }

    async parseIncoming(payload: any): Promise<ParsedIncomingPayload> {
        console.log(`[MOCK WAHA] parseIncoming called with payload:`, payload);

        const data = payload?.payload || payload;
        const fromRaw = data.from || '00000000000@c.us';
        const from = fromRaw.replace('@c.us', '');
        const senderName = data._data?.notifyName || data.pushname || 'Simulated Contact';
        const body = data.body || '';
        const messageId = typeof data.id === 'object' ? data.id.id : (data.id || `mock_in_${Date.now()}`);
        const hasMedia = data.hasMedia || false;

        return {
            contact: {
                phone: from,
                name: senderName
            },
            messages: [
                {
                    direction: "INBOUND",
                    type: "TEXT",
                    body: body,
                    waMessageId: messageId,
                }
            ]
        };
    }
}
