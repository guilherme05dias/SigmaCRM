import {
    IWhatsAppProvider,
    ParsedIncomingPayload,
    SessionSummary,
    WhatsAppContactCheck,
    WhatsAppHistoryChat,
    WhatsAppHistorySyncOptions,
} from "../IWhatsAppProvider";

type SendMessageResponse = {
    key?: {
        remoteJid?: string;
        fromMe?: boolean;
        id?: string;
    };
    message?: any;
    error?: string;
};

type SessionResponse = {
    instance?: {
        instanceName?: string;
        state?: string;
        status?: string;
    };
    error?: string;
};

type CheckNumberResponse = {
    exists?: boolean;
    jid?: string;
    error?: string;
};

export class EvolutionWhatsAppProvider implements IWhatsAppProvider {
    private readonly baseUrl = (process.env.EVOLUTION_API_URL || "http://localhost:8080").replace(/\/$/, "");
    private readonly apiKey = process.env.EVOLUTION_API_KEY || "";
    private readonly instanceName = process.env.EVOLUTION_INSTANCE_NAME || "sigma-principal";

    async createSession(sessionId: string): Promise<void> {
        const response = await fetch(`${this.baseUrl}/instance/create`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                apikey: this.apiKey,
            },
            body: JSON.stringify({
                instanceName: this.resolveSessionId(sessionId),
                integration: "WHATSAPP-BAILEYS",
                qrcode: true,
            }),
        });

        if (!response.ok) {
            const payload = await this.readJson<{ error?: string }>(response);
            throw new Error(payload?.error || `Falha ao criar instância Evolution (${response.status})`);
        }
    }

    async disconnectSession(sessionId: string): Promise<void> {
        const response = await fetch(`${this.baseUrl}/instance/logout/${encodeURIComponent(this.resolveSessionId(sessionId))}`, {
            method: "DELETE",
            headers: { apikey: this.apiKey },
        });

        if (!response.ok) {
            const payload = await this.readJson<{ error?: string }>(response);
            throw new Error(payload?.error || `Falha ao desconectar sessão Evolution (${response.status})`);
        }
    }

    async listSessions(): Promise<SessionSummary[]> {
        const response = await fetch(`${this.baseUrl}/instance/connectionState/${encodeURIComponent(this.instanceName)}`, {
            headers: { apikey: this.apiKey },
        });
        
        const payload = await this.readJson<SessionResponse>(response);
        
        if (response.ok && payload?.instance?.state) {
            let mappedStatus = "STARTING";
            const state = payload.instance.state.toLowerCase();
            if (state === "open") mappedStatus = "CONNECTED";
            else if (state === "connecting") mappedStatus = "QR_AVAILABLE_OR_AUTH_PENDING";
            else if (state === "close") mappedStatus = "NAO_INICIADO";
            
            return [
                {
                    name: payload.instance.instanceName || this.instanceName,
                    status: mappedStatus,
                },
            ];
        }

        return [
            {
                name: this.instanceName,
                status: response.ok ? "EXTERNAL_API_CONFIGURED" : "EXTERNAL_API_UNAVAILABLE",
            },
        ];
    }

    async checkContact(phone: string, sessionId?: string): Promise<WhatsAppContactCheck> {
        const normalizedPhone = this.normalizePhone(phone);
        const resolvedInstance = this.resolveSessionId(sessionId);
        const response = await fetch(`${this.baseUrl}/chat/whatsappNumbers/${encodeURIComponent(resolvedInstance)}`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                apikey: this.apiKey,
            },
            body: JSON.stringify({ numbers: [normalizedPhone] }),
        });

        const payload = await this.readJson<CheckNumberResponse[]>(response);
        if (!response.ok) {
            throw new Error(`Falha ao validar número Evolution (${response.status})`);
        }

        const result = Array.isArray(payload) ? payload[0] : payload;
        
        return {
            exists: Boolean(result?.exists),
            phone: normalizedPhone,
            name: null,
            wid: result?.jid || null,
        };
    }

    async syncHistory(options: WhatsAppHistorySyncOptions = {}): Promise<WhatsAppHistoryChat[]> {
        const resolvedInstance = this.resolveSessionId(options.sessionId);
        
        try {
            const response = await fetch(`${this.baseUrl}/chat/findChats/${encodeURIComponent(resolvedInstance)}`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    apikey: this.apiKey,
                },
                body: JSON.stringify({ limit: options.chatLimit || 100 })
            });

            if (!response.ok) return [];

            const chatsPayload = await this.readJson<any[]>(response);
            if (!Array.isArray(chatsPayload)) return [];

            const result: WhatsAppHistoryChat[] = [];

            for (const chat of chatsPayload) {
                const phone = this.normalizePhone(chat.remoteJid || chat.id || "");
                // Ignora contatos inválidos ou grupos
                if (!phone || phone.includes("g.us")) continue;

                result.push({
                    phone,
                    name: chat.pushName || chat.name || undefined,
                    unreadCount: chat.unreadCount || 0,
                    lastMessageAt: chat.conversationTimestamp || undefined,
                    messages: [], // Evolutions exige query separada para mensagens (findMessages). Retornamos os chats para sync básico de contatos.
                });
            }

            return result;
        } catch (error) {
            console.error("[Evolution] Falha ao sincronizar histórico:", error);
            return [];
        }
    }

    async sendText(params: { to: string; body: string; sessionId?: string }): Promise<{ waMessageId: string }> {
        const response = await this.sendMessage("sendText", params.sessionId, {
            number: this.normalizePhone(params.to),
            text: params.body,
        });

        return { waMessageId: response.key?.id || `evolution_text_${Date.now()}` };
    }

    async sendMedia(params: {
        to: string;
        type: "IMAGE" | "AUDIO" | "VIDEO" | "DOCUMENT";
        mediaUrl: string;
        caption?: string;
        sessionId?: string;
    }): Promise<{ waMessageId: string }> {
        let mediaType = "document";
        if (params.type === "IMAGE") mediaType = "image";
        if (params.type === "AUDIO") mediaType = "audio";
        if (params.type === "VIDEO") mediaType = "video";

        const response = await this.sendMessage("sendMedia", params.sessionId, {
            number: this.normalizePhone(params.to),
            mediatype: mediaType,
            media: params.mediaUrl, // Evolution accepts URL
            caption: params.caption,
        });

        return { waMessageId: response.key?.id || `evolution_media_${Date.now()}` };
    }

    async parseIncoming(payload: any): Promise<ParsedIncomingPayload> {
        // Eventos que não são mensagem (CONNECTION_UPDATE, QRCODE_UPDATED) -> retornar vazio
        if (payload?.event && payload.event !== "messages.upsert") {
            return { contact: { phone: "" }, messages: [] };
        }

        const data = payload?.data;
        if (!data || !data.key) {
            return { contact: { phone: "" }, messages: [] };
        }

        const from = this.normalizePhone(data.key.remoteJid || "");
        if (!from) {
            return { contact: { phone: from }, messages: [] };
        }

        const direction: "INBOUND" | "OUTBOUND" = data.key.fromMe ? "OUTBOUND" : "INBOUND";
        const waMessageId = data.key.id || `evolution_in_${Date.now()}`;
        const senderName = data.pushName || null;

        const msgObj = data.message || {};
        let body: string | undefined = undefined;
        let mediaUrl: string | undefined = undefined;
        let type: "TEXT" | "IMAGE" | "AUDIO" | "VIDEO" | "DOCUMENT" = "TEXT";

        if (msgObj.conversation) {
            body = msgObj.conversation;
        } else if (msgObj.extendedTextMessage?.text) {
            body = msgObj.extendedTextMessage.text;
        } else if (msgObj.imageMessage) {
            type = "IMAGE";
            body = msgObj.imageMessage.caption;
            mediaUrl = data.messageType === "imageMessage" ? data.base64 : undefined;
        } else if (msgObj.videoMessage) {
            type = "VIDEO";
            body = msgObj.videoMessage.caption;
            mediaUrl = data.messageType === "videoMessage" ? data.base64 : undefined;
        } else if (msgObj.audioMessage) {
            type = "AUDIO";
            mediaUrl = data.messageType === "audioMessage" ? data.base64 : undefined;
        } else if (msgObj.documentMessage) {
            type = "DOCUMENT";
            body = msgObj.documentMessage.fileName || msgObj.documentMessage.caption;
            mediaUrl = data.messageType === "documentMessage" ? data.base64 : undefined;
        }

        // Caso a media venha como base64, adaptamos para um formato data URI ou passamos pra frente.
        // A Evolution envia "base64" no objeto se base64 for habilitado.
        if (mediaUrl && !mediaUrl.startsWith("http") && !mediaUrl.startsWith("data:")) {
            // Define MIME type aproximado se não fornecido
            let mimeType = "application/octet-stream";
            if (type === "IMAGE") mimeType = msgObj.imageMessage?.mimetype || "image/jpeg";
            else if (type === "AUDIO") mimeType = msgObj.audioMessage?.mimetype || "audio/ogg";
            else if (type === "VIDEO") mimeType = msgObj.videoMessage?.mimetype || "video/mp4";
            else if (type === "DOCUMENT") mimeType = msgObj.documentMessage?.mimetype || "application/pdf";
            
            mediaUrl = `data:${mimeType};base64,${mediaUrl}`;
        }

        if (!body && !mediaUrl && type === "TEXT") {
            return { contact: { phone: from, name: senderName }, messages: [] };
        }

        return {
            contact: { phone: from, name: senderName },
            messages: [
                {
                    direction,
                    type,
                    body,
                    mediaUrl,
                    waMessageId,
                },
            ],
        };
    }

    private async sendMessage(endpoint: string, sessionId: string | undefined, body: Record<string, unknown>): Promise<SendMessageResponse> {
        const resolvedSessionId = this.resolveSessionId(sessionId);
        const response = await fetch(`${this.baseUrl}/message/${endpoint}/${encodeURIComponent(resolvedSessionId)}`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                apikey: this.apiKey,
            },
            body: JSON.stringify(body),
        });

        const payload = await this.readJson<SendMessageResponse>(response);
        if (response.status !== 200 && response.status !== 201) {
            throw new Error(payload?.error || `Falha ao enviar mensagem Evolution (${response.status})`);
        }

        return payload || {};
    }

    private async readJson<T>(response: Response): Promise<T | null> {
        try {
            return (await response.json()) as T;
        } catch {
            return null;
        }
    }

    private normalizePhone(value: string): string {
        return value.replace("@s.whatsapp.net", "").replace("@c.us", "").replace(/\D/g, "");
    }

    private resolveSessionId(sessionId?: string): string {
        return !sessionId || sessionId === "default" ? this.instanceName : sessionId;
    }
}
