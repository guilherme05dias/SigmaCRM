import { IWhatsAppProvider, ParsedIncomingPayload, WhatsAppHistoryChat, WhatsAppHistorySyncOptions } from "../IWhatsAppProvider";
import { metaCloudConfig } from "../config/metaCloud.config";
import { MetaCloudWebhookPayload } from "../config/metaCloud.types";

export class MetaCloudWhatsAppProvider implements IWhatsAppProvider {

    async sendText(payload: { to: string; body: string; }): Promise<{ waMessageId: string }> {
        const payloadToSend = {
            messaging_product: "whatsapp",
            recipient_type: "individual",
            to: payload.to,
            type: "text",
            text: {
                preview_url: false,
                body: payload.body
            }
        };

        const endpoint = `${metaCloudConfig.baseUrl}/${metaCloudConfig.phoneNumberId}/messages`;

        console.log(`[MetaCloudWhatsAppProvider] LOG_ONLY: Would send POST to ${endpoint}`);
        console.log(`[MetaCloudWhatsAppProvider] Payload:`, JSON.stringify(payloadToSend, null, 2));

        // Mock success for now since we aren't calling the real API
        return Promise.resolve({ waMessageId: "meta_mock_" + Date.now() });
    }

    async parseIncoming(payload: any): Promise<ParsedIncomingPayload> {
        const typedPayload = payload as MetaCloudWebhookPayload;
        const result: ParsedIncomingPayload = {
            contact: {
                phone: "",
                name: ""
            },
            messages: []
        };

        if (typedPayload.object !== 'whatsapp_business_account' || !typedPayload.entry) {
            return result;
        }

        const changes = typedPayload.entry[0]?.changes;
        if (!changes) return result;

        const value = changes[0]?.value;
        if (!value) return result;

        if (value.contacts && value.contacts.length > 0) {
            result.contact.phone = value.contacts[0].wa_id;
            result.contact.name = value.contacts[0].profile.name;
        }

        if (value.messages && value.messages.length > 0) {
            for (const msg of value.messages) {
                // Ensure we have contact phone if missing
                if (!result.contact.phone) {
                    result.contact.phone = msg.from;
                }

                if (msg.type === 'text' && msg.text) {
                    result.messages.push({
                        waMessageId: msg.id,
                        direction: 'INBOUND',
                        type: 'TEXT',
                        body: msg.text.body
                    });
                }
            }
        }

        return result;
    }

    async listSessions(): Promise<any[]> {
        console.log("[MetaCloudWhatsAppProvider] listSessions is not applicable for Cloud API");
        return [];
    }

    async checkContact(phone: string): Promise<{ exists: boolean; phone: string; name?: string | null; wid?: string | null }> {
        const normalizedPhone = phone.replace(/\D/g, '');
        return { exists: true, phone: normalizedPhone, name: null, wid: `${normalizedPhone}@wa` };
    }

    async syncHistory(_options: WhatsAppHistorySyncOptions = {}): Promise<WhatsAppHistoryChat[]> {
        return [];
    }

    async createSession(sessionName?: string): Promise<any> {
        console.log("[MetaCloudWhatsAppProvider] createSession is not applicable for Cloud API");
        return { message: "Session is managed by Meta Cloud externally" };
    }

    async disconnectSession(sessionName?: string): Promise<any> {
        console.log("[MetaCloudWhatsAppProvider] disconnectSession is managed by Meta Cloud externally", sessionName);
        return { message: "Session is managed by Meta Cloud externally" };
    }

    async sendMedia(payload: { to: string; type: "IMAGE" | "AUDIO" | "VIDEO" | "DOCUMENT"; mediaUrl: string; caption?: string; sessionId?: string }): Promise<{ waMessageId: string }> {
        console.log(`[MetaCloudWhatsAppProvider] LOG_ONLY: Would send media POST to ${metaCloudConfig.baseUrl}/${metaCloudConfig.phoneNumberId}/messages`);
        return Promise.resolve({ waMessageId: "meta_mock_media_" + Date.now() });
    }
}
