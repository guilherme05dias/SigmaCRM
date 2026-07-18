export interface ParsedIncomingMessage {
    direction: "INBOUND" | "OUTBOUND";
    type: "TEXT" | "IMAGE" | "AUDIO" | "VIDEO" | "DOCUMENT";
    body?: string;
    mediaUrl?: string;
    waMessageId?: string;
    replyToProviderMessageId?: string | null;
    timestamp?: number | null;
    event?: "MESSAGE" | "EDIT" | "DELETE" | "REACTION";
}

export interface ParsedIncomingPayload {
    contact: { phone: string; name?: string | null; isGroup?: boolean };
    messages: ParsedIncomingMessage[];
    /** History webhooks can contain messages from more than one contact. */
    batches?: Array<{
        contact: { phone: string; name?: string | null; isGroup?: boolean };
        messages: ParsedIncomingMessage[];
    }>;
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
    replyToProviderMessageId?: string | null;
    timestamp?: number | null;
}

export interface WhatsAppHistoryChat {
    phone: string;
    name?: string | null;
    avatarUrl?: string | null;
    unreadCount?: number;
    lastMessageAt?: number | null;
    messages: WhatsAppHistoryMessage[];
}

export interface WhatsAppHistorySyncOptions {
    chatLimit?: number;
    messageLimit?: number;
    sessionId?: string;
    phone?: string;
}

export interface WhatsAppUnreadChat {
    phone: string;
    unreadCount: number;
}

export interface WhatsAppGroup {
    id: string;
    name: string;
    participantCount?: number | null;
    unreadCount?: number;
    lastMessageAt?: number | null;
}

export interface IWhatsAppProvider {
    createSession(sessionId: string): Promise<void>;
    disconnectSession(sessionId: string): Promise<void>;
    listSessions(): Promise<SessionSummary[]>;
    getQrCode?(): Promise<string | null>;
    checkContact(phone: string, sessionId?: string): Promise<WhatsAppContactCheck>;
    syncHistory(options?: WhatsAppHistorySyncOptions): Promise<WhatsAppHistoryChat[]>;
    getProfilePictureUrl?(params: { phone: string; sessionId?: string }): Promise<string | null>;
    requestHistorySync?(params: { phone: string; messageId?: string; count?: number }): Promise<void>;
    listChatUnreadCounts?(): Promise<WhatsAppUnreadChat[]>;
    listGroups?(options?: { limit?: number; sessionId?: string }): Promise<WhatsAppGroup[]>;
    markChatRead?(params: { phone: string; read?: boolean }): Promise<void>;
    reactToMessage?(params: { phone: string; messageId: string; emoji: string }): Promise<void>;
    editMessage?(params: { phone: string; messageId: string; body: string }): Promise<{ waMessageId?: string }>;
    parseIncoming(payload: any): Promise<ParsedIncomingPayload>;
    sendText(params: { to: string; body: string; sessionId?: string; replyToMessageId?: string }): Promise<{ waMessageId: string }>;
    sendMedia(params: {
        to: string;
        type: "IMAGE" | "AUDIO" | "VIDEO" | "DOCUMENT";
        mediaUrl: string;
        caption?: string;
        sessionId?: string;
        replyToMessageId?: string;
    }): Promise<{ waMessageId: string }>;
    downloadMedia?(params: { messageId: string }): Promise<{ data: Buffer; contentType: string }>;
}
