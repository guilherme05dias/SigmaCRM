export interface MessageUser {
    id: string;
    name?: string;
    nome?: string;
    role: string;
    specialty?: string | null;
    department?: {
        name?: string;
        nome?: string;
    } | null;
}

export interface QuotedMessage {
    id: string;
    direction: 'INBOUND' | 'OUTBOUND' | 'SYSTEM';
    type: 'TEXT' | 'IMAGE' | 'AUDIO' | 'VIDEO' | 'DOCUMENT';
    body: string | null;
    mediaUrl?: string | null;
    waMessageId?: string | null;
    editedAt?: string | null;
    deletedAt?: string | null;
    deletedByCustomer?: boolean;
    createdAt: string;
    user?: MessageUser | null;
}

export interface Message extends QuotedMessage {
    id: string;
    conversationId?: string;
    replyToMessageId?: string | null;
    replyToMessage?: QuotedMessage | null;
}

export interface OutgoingMessagePayload {
    body?: string;
    type: Message['type'];
    mediaUrl?: string;
    fileName?: string;
    replyToMessageId?: string;
}

export interface Conversation {
    id: string;
    contactId: string;
    contact: {
        phone: string;
        name: string | null;
        avatarUrl?: string | null;
        createdAt?: string;
        email?: string | null;
        isWhatsAppGroup?: boolean;
        welcomeMessageEnabled?: boolean;
        includeInServiceReports?: boolean;
        businessId?: string | null;
        business?: {
            id: string;
            name: string;
            cnpj: string;
        } | null;
        customer?: {
            id: string;
            name: string;
            businesses: Array<{
                id: string;
                name: string;
                cnpj: string;
            }>;
        } | null;
    };
    status: 'OPEN' | 'ASSIGNED' | 'CLOSED';
    department?: { id: string; name: string } | null;
    serviceTopic?: { id: string; name: string } | null;
    serviceTopicId?: string | null;
    otherTopicDescription?: string | null;
    closeResult?: string | null;
    closeSummary?: string | null;
    closeNotes?: string | null;
    closeMode?: 'WITH_RATING' | 'INACTIVITY' | 'SILENT' | null;
    fieldServiceRequired?: boolean;
    unreadCount: number;
    assignedUserId?: string | null;
    assignedUser: { id: string; name?: string; nome?: string } | null;
    messages: Message[]; // preview
    createdAt?: string | Date;
    lastMessageAt?: string | Date;
    startedAt?: string | null;
    closedAt?: string | null;
    totalHandleTimeSeconds?: number | null;
}
