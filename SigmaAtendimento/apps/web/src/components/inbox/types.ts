export interface Message {
    id: string;
    conversationId?: string;
    direction: 'INBOUND' | 'OUTBOUND' | 'SYSTEM';
    type: 'TEXT' | 'IMAGE' | 'AUDIO' | 'VIDEO' | 'DOCUMENT';
    body: string | null;
    createdAt: string;
    user?: {
        id: string;
        nome: string;
        role: string;
        department?: {
            nome: string;
        };
    };
}

export interface Conversation {
    id: string;
    contactId: string;
    contact: { phone: string; name: string | null; createdAt?: string; email?: string | null };
    status: 'OPEN' | 'ASSIGNED' | 'CLOSED';
    department?: { id: string; name: string } | null;
    assignedUser: { id: string; nome: string } | null;
    messages: Message[]; // preview
    createdAt?: string | Date;
    lastMessageAt?: string | Date;
    startedAt?: string | null;
    closedAt?: string | null;
    totalHandleTimeSeconds?: number | null;
}
