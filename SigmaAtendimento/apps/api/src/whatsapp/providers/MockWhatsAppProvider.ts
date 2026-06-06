import { IWhatsAppProvider, ParsedIncomingPayload, SessionSummary, WhatsAppHistoryChat, WhatsAppHistorySyncOptions } from "../IWhatsAppProvider";
import { PrismaClient, MessageDirection, MessageType, ConversationStatus } from '@prisma/client';

const prisma = new PrismaClient();

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

        try {
            const contact = await prisma.contact.findUnique({
                where: { phone: cleanTo }
            });

            if (!contact) {
                console.log(`[MOCK WAHA] Contact ${cleanTo} not found. Returning fake ID.`);
                return { waMessageId: messageId };
            }

            const conversation = await prisma.conversation.findFirst({
                where: {
                    contactId: contact.id,
                    status: { not: ConversationStatus.CLOSED }
                },
                orderBy: { updatedAt: 'desc' }
            });

            if (conversation) {
                await prisma.message.create({
                    data: {
                        conversationId: conversation.id,
                        direction: MessageDirection.OUTBOUND,
                        type: MessageType.TEXT,
                        body: body,
                        waMessageId: messageId
                    }
                });
                console.log(`[MOCK WAHA] Created OUTBOUND txt message in DB for conv ${conversation.id}`);
            }

        } catch (error) {
            console.error('[MOCK WAHA] Error inserting outbound message to DB:', error);
        }

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

        try {
            const contact = await prisma.contact.findUnique({
                where: { phone: cleanTo }
            });

            if (contact) {
                const conversation = await prisma.conversation.findFirst({
                    where: { contactId: contact.id, status: { not: ConversationStatus.CLOSED } }
                });

                if (conversation) {
                    await prisma.message.create({
                        data: {
                            conversationId: conversation.id,
                            direction: MessageDirection.OUTBOUND,
                            type: Array.from(Object.values(MessageType)).includes(type as any) ? (type as MessageType) : MessageType.DOCUMENT,
                            body: caption || null,
                            mediaUrl: mediaUrl,
                            waMessageId: messageId
                        }
                    });
                    console.log(`[MOCK WAHA] Created OUTBOUND media message in DB for conv ${conversation.id}`);
                }
            }
        } catch (error) {
            console.error('[MOCK WAHA] Error inserting outbound media message to DB:', error);
        }

        return { waMessageId: messageId };
    }

    async parseIncoming(payload: any): Promise<ParsedIncomingPayload> {
        console.log(`[MOCK WAHA] parseIncoming called with payload:`, payload);

        const data = payload?.payload || payload;
        const fromRaw = data.from || '00000000000@c.us';
        const from = fromRaw.replace('@c.us', '');
        const senderName = data._data?.notifyName || data.pushname || 'Simulated Contact';
        const body = data.body || '';
        const messageId = data.id || typeof data.id === 'object' ? data.id.id : `mock_in_${Date.now()}`;
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
