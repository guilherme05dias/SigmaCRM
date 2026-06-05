export interface ParsedIncomingMessage {
    direction: "INBOUND" | "OUTBOUND";
    type: "TEXT" | "IMAGE" | "AUDIO" | "VIDEO" | "DOCUMENT";
    body?: string;
    mediaUrl?: string;
    waMessageId?: string;
}

export interface ParsedIncomingPayload {
    contact: { phone: string; name?: string | null };
    messages: ParsedIncomingMessage[];
}

export interface SessionSummary {
    name: string;
    status: string;
}

export interface IWhatsAppProvider {
    createSession(sessionId: string): Promise<void>;
    listSessions(): Promise<SessionSummary[]>;
    parseIncoming(payload: any): Promise<ParsedIncomingPayload>;
    sendText(params: { to: string; body: string; sessionId?: string }): Promise<{ waMessageId: string }>;
    sendMedia(params: {
        to: string;
        type: "IMAGE" | "AUDIO" | "VIDEO" | "DOCUMENT";
        mediaUrl: string;
        caption?: string;
        sessionId?: string;
    }): Promise<{ waMessageId: string }>;
}
