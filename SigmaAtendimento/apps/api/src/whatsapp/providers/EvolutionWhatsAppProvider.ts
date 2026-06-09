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
                instanceName: sessionId || this.instanceName,
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
        const response = await fetch(`${this.baseUrl}/instance/logout/${encodeURIComponent(sessionId || this.instanceName)}`, {
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
            return [
                {
                    name: payload.instance.instanceName || this.instanceName,
                    status: payload.instance.state,
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
        const resolvedInstance = sessionId || this.instanceName;
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
        // Implementado na Tarefa E.6
        return [];
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
        // Implementado na Tarefa E.4
        return { contact: { phone: "" }, messages: [] };
    }

    private async sendMessage(endpoint: string, sessionId: string | undefined, body: Record<string, unknown>): Promise<SendMessageResponse> {
        const resolvedSessionId = sessionId || this.instanceName;
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
}
