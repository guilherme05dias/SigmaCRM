import {
    IWhatsAppProvider,
    ParsedIncomingPayload,
    SessionSummary,
    WhatsAppContactCheck,
    WhatsAppHistoryChat,
    WhatsAppHistorySyncOptions,
} from "../IWhatsAppProvider";
import { metaCloudConfig } from "../config/metaCloud.config";
import {
    MetaCloudWebhookPayload,
    MetaCloudIncomingMessage,
    MetaCloudMessageType,
    MetaMediaInfoResponse,
    MetaSendMessageResponse,
} from "../config/metaCloud.types";

export class MetaCloudWhatsAppProvider implements IWhatsAppProvider {

    // ─── Session management (not applicable for Cloud API) ──────────────────

    async createSession(_sessionId: string): Promise<void> {
        // Cloud API sessions are managed by Meta — no-op
    }

    async disconnectSession(_sessionId: string): Promise<void> {
        // Cloud API sessions are managed by Meta — no-op
    }

    async listSessions(): Promise<SessionSummary[]> {
        const configured = Boolean(metaCloudConfig.accessToken && metaCloudConfig.phoneNumberId);
        return [
            {
                name: "meta-cloud",
                status: configured ? "CONNECTED" : "NOT_CONFIGURED",
            },
        ];
    }

    // ─── Contact validation ──────────────────────────────────────────────────

    async checkContact(phone: string): Promise<WhatsAppContactCheck> {
        const normalized = this.normalizePhone(phone);
        // Meta Cloud API does not expose a public contacts lookup endpoint for
        // most access tiers. We optimistically assume the number exists and let
        // the send call fail if it doesn't.
        return { exists: true, phone: normalized, name: null, wid: `${normalized}@s.whatsapp.net` };
    }

    // ─── History (not available via Cloud API) ───────────────────────────────

    async syncHistory(_options: WhatsAppHistorySyncOptions = {}): Promise<WhatsAppHistoryChat[]> {
        // The Cloud API does not expose conversation history.
        return [];
    }

    // ─── Outgoing messages ───────────────────────────────────────────────────

    async sendText(params: { to: string; body: string; sessionId?: string }): Promise<{ waMessageId: string }> {
        return this.callMessagesApi({
            to: this.normalizePhone(params.to),
            type: "text",
            text: { preview_url: false, body: params.body },
        });
    }

    async sendMedia(params: {
        to: string;
        type: "IMAGE" | "AUDIO" | "VIDEO" | "DOCUMENT";
        mediaUrl: string;
        caption?: string;
        sessionId?: string;
    }): Promise<{ waMessageId: string }> {
        const metaType = this.toMetaMediaType(params.type);
        const mediaObject: Record<string, string> = { link: params.mediaUrl };
        if (params.caption) mediaObject.caption = params.caption;

        return this.callMessagesApi({
            to: this.normalizePhone(params.to),
            type: metaType,
            [metaType]: mediaObject,
        });
    }

    // ─── Incoming webhook parsing ────────────────────────────────────────────

    async parseIncoming(payload: any): Promise<ParsedIncomingPayload> {
        const result: ParsedIncomingPayload = {
            contact: { phone: "", name: null },
            messages: [],
        };

        const typedPayload = payload as MetaCloudWebhookPayload;

        if (typedPayload.object !== "whatsapp_business_account" || !typedPayload.entry?.length) {
            return result;
        }

        const value = typedPayload.entry[0]?.changes?.[0]?.value;
        if (!value) return result;

        // Populate contact from the contacts array when present
        if (value.contacts?.length) {
            result.contact.phone = this.normalizePhone(value.contacts[0].wa_id);
            result.contact.name = value.contacts[0].profile.name || null;
        }

        if (!value.messages?.length) return result;

        for (const msg of value.messages) {
            if (!result.contact.phone) {
                result.contact.phone = this.normalizePhone(msg.from);
            }

            const parsed = await this.parseMessage(msg);
            if (parsed) result.messages.push(parsed);
        }

        return result;
    }

    // ─── Helpers ─────────────────────────────────────────────────────────────

    private async parseMessage(msg: MetaCloudIncomingMessage) {
        const type = this.mapMessageType(msg.type);

        if (msg.type === "text" && msg.text) {
            return {
                waMessageId: msg.id,
                direction: "INBOUND" as const,
                type,
                body: msg.text.body,
            };
        }

        const mediaTypes: MetaCloudMessageType[] = ["image", "audio", "video", "document", "sticker"];
        if (mediaTypes.includes(msg.type)) {
            const mediaObj = (msg as any)[msg.type] as { id?: string; caption?: string } | undefined;
            const mediaId = mediaObj?.id;

            return {
                waMessageId: msg.id,
                direction: "INBOUND" as const,
                type,
                body: mediaObj?.caption || undefined,
                // Stored as a proxy path so the frontend can request it via our API,
                // which fetches fresh download URLs from Meta on demand (Meta URLs expire in 5 min).
                mediaUrl: mediaId ? `/api/whatsapp/media/${mediaId}` : undefined,
            };
        }

        // Unsupported type — store as system note so the conversation is not lost
        return {
            waMessageId: msg.id,
            direction: "INBOUND" as const,
            type: "TEXT" as const,
            body: `[Mensagem do tipo '${msg.type}' não suportada]`,
        };
    }

    private async callMessagesApi(body: Record<string, unknown>): Promise<{ waMessageId: string }> {
        if (!metaCloudConfig.accessToken || !metaCloudConfig.phoneNumberId) {
            throw new Error(
                "META_WHATSAPP_ACCESS_TOKEN e META_WHATSAPP_PHONE_NUMBER_ID são obrigatórios. " +
                "Configure essas variáveis no .env.",
            );
        }

        const endpoint = `${metaCloudConfig.baseUrl}/${metaCloudConfig.phoneNumberId}/messages`;
        const response = await fetch(endpoint, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${metaCloudConfig.accessToken}`,
            },
            body: JSON.stringify({
                messaging_product: "whatsapp",
                recipient_type: "individual",
                ...body,
            }),
            signal: AbortSignal.timeout(metaCloudConfig.timeout),
        });

        const data = (await response.json().catch(() => ({}))) as Partial<MetaSendMessageResponse> & {
            error?: { message?: string; code?: number };
        };

        if (!response.ok) {
            const detail = data?.error?.message || `HTTP ${response.status}`;
            throw new Error(`Meta Cloud API: ${detail}`);
        }

        return { waMessageId: data.messages?.[0]?.id || `meta_${Date.now()}` };
    }

    /** Fetches a fresh download URL from Meta for a given media ID. */
    async resolveMediaUrl(mediaId: string): Promise<{ url: string; mimeType: string } | null> {
        if (!metaCloudConfig.accessToken) return null;

        try {
            const response = await fetch(`${metaCloudConfig.baseUrl}/${mediaId}`, {
                headers: { Authorization: `Bearer ${metaCloudConfig.accessToken}` },
                signal: AbortSignal.timeout(metaCloudConfig.timeout),
            });

            if (!response.ok) return null;
            const data = (await response.json()) as MetaMediaInfoResponse;
            return { url: data.url, mimeType: data.mime_type };
        } catch {
            return null;
        }
    }

    private normalizePhone(value: string): string {
        return String(value || "").replace(/\D/g, "");
    }

    private mapMessageType(type: MetaCloudMessageType): "TEXT" | "IMAGE" | "AUDIO" | "VIDEO" | "DOCUMENT" {
        if (type === "image" || type === "sticker") return "IMAGE";
        if (type === "audio") return "AUDIO";
        if (type === "video") return "VIDEO";
        if (type === "document") return "DOCUMENT";
        return "TEXT";
    }

    private toMetaMediaType(type: "IMAGE" | "AUDIO" | "VIDEO" | "DOCUMENT"): string {
        const map: Record<string, string> = {
            IMAGE: "image",
            AUDIO: "audio",
            VIDEO: "video",
            DOCUMENT: "document",
        };
        return map[type] ?? "document";
    }
}
