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

export interface WhatsAppContactCheck {
    exists: boolean;
    phone: string;
    name?: string | null;
    wid?: string | null;
}

export interface WhatsAppHistoryMessage {
    direction: "INBOUND" | "OUTBOUND";
    type: "TEXT" | "IMAGE" | "AUDIO" | "VIDEO" | "DOCUMENT";
    body?: string | null;
    mediaUrl?: string | null;
    waMessageId?: string | null;
    timestamp?: number | null;
}

export interface WhatsAppHistoryChat {
    phone: string;
    name?: string | null;
    unreadCount?: number;
    lastMessageAt?: number | null;
    messages: WhatsAppHistoryMessage[];
}

export interface WhatsAppHistorySyncOptions {
    chatLimit?: number;
    messageLimit?: number;
    sessionId?: string;
}

export interface IWhatsAppProvider {
    createSession(sessionId: string): Promise<void>;
    disconnectSession(sessionId: string): Promise<void>;
    listSessions(): Promise<SessionSummary[]>;
    checkContact(phone: string, sessionId?: string): Promise<WhatsAppContactCheck>;
    syncHistory(options?: WhatsAppHistorySyncOptions): Promise<WhatsAppHistoryChat[]>;
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
