import {
    IWhatsAppProvider,
    ParsedIncomingPayload,
    SessionSummary,
    WhatsAppContactCheck,
    WhatsAppHistoryChat,
    WhatsAppHistorySyncOptions,
} from "../IWhatsAppProvider";

type SendMessageResponse = {
    message?: string;
    status?: string;
    error?: string;
};

type SessionResponse = {
    name?: string;
    id?: string;
    status?: string;
    hasQrCode?: boolean;
};

type CheckNumberResponse = {
    exists?: boolean;
    phone?: string;
    name?: string | null;
    wid?: string | null;
    message?: string;
    error?: string;
};

type HistoryResponse = {
    chats?: WhatsAppHistoryChat[];
    message?: string;
    error?: string;
};

export class MuriloWhatsAppApiProvider implements IWhatsAppProvider {
    private readonly baseUrl = (process.env.MURILO_WHATSAPP_API_BASE_URL || "http://localhost:3000").replace(/\/$/, "");
    private readonly defaultSessionId = process.env.MURILO_WHATSAPP_DEFAULT_SESSION_ID || "default";

    async createSession(sessionId: string): Promise<void> {
        const response = await fetch(`${this.baseUrl}/start-session/${encodeURIComponent(sessionId)}`);
        if (response.ok) return;

        const payload = await this.readJson<SendMessageResponse>(response);
        if (response.status === 400 && payload?.message?.includes("já está ativa")) {
            return;
        }

        throw new Error(payload?.message || `Falha ao iniciar sessão WhatsApp (${response.status})`);
    }

    async disconnectSession(sessionId: string): Promise<void> {
        const response = await fetch(`${this.baseUrl}/disconnect-session/${encodeURIComponent(sessionId)}`, {
            method: "POST",
        });
        if (response.ok) return;

        const payload = await this.readJson<SendMessageResponse>(response);
        throw new Error(payload?.message || payload?.error || `Falha ao desconectar sessão WhatsApp (${response.status})`);
    }

    async listSessions(): Promise<SessionSummary[]> {
        const response = await fetch(`${this.baseUrl}/sessions`);
        const payload = await this.readJson<SessionResponse[]>(response);
        const session = payload?.find((item) => item.name === this.defaultSessionId || item.id === this.defaultSessionId);

        if (response.ok && session?.status) {
            return [
                {
                    name: session.name || session.id || this.defaultSessionId,
                    status: session.status,
                },
            ];
        }

        return [
            {
                name: this.defaultSessionId,
                status: response.ok ? "EXTERNAL_API_CONFIGURED" : "EXTERNAL_API_UNAVAILABLE",
            },
        ];
    }

    async checkContact(phone: string, sessionId?: string): Promise<WhatsAppContactCheck> {
        const normalizedPhone = this.normalizePhone(phone);
        const resolvedSessionId = sessionId || this.defaultSessionId;
        const response = await fetch(`${this.baseUrl}/check-number/${encodeURIComponent(resolvedSessionId)}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ phone: normalizedPhone }),
        });

        const payload = await this.readJson<CheckNumberResponse>(response);
        if (!response.ok) {
            throw new Error(payload?.message || payload?.error || `Falha ao validar número WhatsApp (${response.status})`);
        }

        return {
            exists: Boolean(payload?.exists),
            phone: payload?.phone || normalizedPhone,
            name: payload?.name || null,
            wid: payload?.wid || null,
        };
    }

    async syncHistory(options: WhatsAppHistorySyncOptions = {}): Promise<WhatsAppHistoryChat[]> {
        const resolvedSessionId = options.sessionId || this.defaultSessionId;
        const params = new URLSearchParams({
            chatLimit: String(options.chatLimit || 100),
            messageLimit: String(options.messageLimit || 50),
        });
        const response = await fetch(`${this.baseUrl}/history/${encodeURIComponent(resolvedSessionId)}?${params.toString()}`);
        const payload = await this.readJson<HistoryResponse>(response);

        if (!response.ok) {
            throw new Error(payload?.message || payload?.error || `Falha ao sincronizar histórico WhatsApp (${response.status})`);
        }

        return payload?.chats || [];
    }

    async sendText(params: { to: string; body: string; sessionId?: string }): Promise<{ waMessageId: string }> {
        const response = await this.sendMessage(params.sessionId, {
            para: this.normalizePhone(params.to),
            mensagem: params.body,
        });

        return { waMessageId: `murilo_text_${Date.now()}_${response.status || "sent"}` };
    }

    async sendMedia(params: {
        to: string;
        type: "IMAGE" | "AUDIO" | "VIDEO" | "DOCUMENT";
        mediaUrl: string;
        caption?: string;
        sessionId?: string;
    }): Promise<{ waMessageId: string }> {
        if (params.type !== "DOCUMENT") {
            throw new Error("A API murilo1of1/whatsapp-api atual só envia texto e arquivo PDF/base64.");
        }

        const media = await this.toBase64Document(params.mediaUrl);
        const response = await this.sendMessage(params.sessionId, {
            para: this.normalizePhone(params.to),
            nomeArquivo: media.fileName,
            arquivoBase64: media.base64,
            mensagem: params.caption,
        });

        return { waMessageId: `murilo_doc_${Date.now()}_${response.status || "sent"}` };
    }

    async parseIncoming(payload: any): Promise<ParsedIncomingPayload> {
        const data = payload?.message || payload?.payload || payload;
        const fromRaw = data?.from || data?.author || data?._data?.from || "";
        const from = this.normalizePhone(fromRaw);
        const body = data?.body || data?.text || data?.mensagem || "";
        const senderName = data?._data?.notifyName || data?.pushname || data?.name || null;
        const id = typeof data?.id === "object" ? data.id.id : data?.id;

        if (!from || !body) {
            return { contact: { phone: from, name: senderName }, messages: [] };
        }

        return {
            contact: { phone: from, name: senderName },
            messages: [
                {
                    direction: "INBOUND",
                    type: "TEXT",
                    body,
                    waMessageId: id || `murilo_in_${Date.now()}`,
                },
            ],
        };
    }

    private async sendMessage(sessionId: string | undefined, body: Record<string, unknown>): Promise<SendMessageResponse> {
        const resolvedSessionId = sessionId || this.defaultSessionId;
        const response = await fetch(`${this.baseUrl}/send-message/${encodeURIComponent(resolvedSessionId)}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        });

        const payload = await this.readJson<SendMessageResponse>(response);
        if (response.status !== 200 || payload?.status === "restarting") {
            const details = [payload?.message, payload?.error].filter(Boolean).join(" ");
            throw new Error(details || `Falha ao enviar mensagem WhatsApp (${response.status})`);
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
        return value.replace("@c.us", "").replace(/\D/g, "");
    }

    private async toBase64Document(mediaUrl: string): Promise<{ base64: string; fileName: string }> {
        if (mediaUrl.startsWith("data:")) {
            const [, base64 = ""] = mediaUrl.split(",");
            return { base64, fileName: "documento.pdf" };
        }

        const response = await fetch(mediaUrl);
        if (!response.ok) {
            throw new Error(`Falha ao baixar mídia para envio (${response.status})`);
        }

        const arrayBuffer = await response.arrayBuffer();
        const fileName = mediaUrl.split("/").pop()?.split("?")[0] || "documento.pdf";
        return {
            base64: Buffer.from(arrayBuffer).toString("base64"),
            fileName,
        };
    }
}
