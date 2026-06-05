import { IWhatsAppProvider, ParsedIncomingPayload, SessionSummary } from "../IWhatsAppProvider";

type SendMessageResponse = {
    message?: string;
    status?: string;
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

    async listSessions(): Promise<SessionSummary[]> {
        const response = await fetch(`${this.baseUrl}/get-qrcode/${encodeURIComponent(this.defaultSessionId)}`);

        return [
            {
                name: this.defaultSessionId,
                status: response.ok ? "QR_AVAILABLE_OR_AUTH_PENDING" : "EXTERNAL_API_CONFIGURED",
            },
        ];
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
        if (!response.ok) {
            throw new Error(payload?.message || payload?.error || `Falha ao enviar mensagem WhatsApp (${response.status})`);
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
