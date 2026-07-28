export type NotificationType =
    | 'FIELD_VISIT_ASSIGNED'
    | 'FIELD_VISIT_SCHEDULE_CHANGED'
    | 'FIELD_VISIT_STATUS_CHANGED'
    | 'TICKET_ASSIGNED'
    | 'CONVERSATION_TRANSFERRED'
    | 'CONVERSATION_FALLBACK_ASSIGNED'
    | 'ASSISTANT_TASK_DUE';

export interface NotificationItem {
    id: string;
    type: NotificationType | string;
    title: string;
    body?: string | null;
    link?: string | null;
    payload?: {
        mascotAgentId?: string;
        mascotKind?: 'TASK_PENDING' | 'CUSTOMER_REPLY_DIGEST' | string;
        assistantTaskId?: string;
        conversationIds?: string[];
        [key: string]: unknown;
    } | null;
    readAt?: string | null;
    createdAt: string;
}

export interface NotificationsResponse {
    items: NotificationItem[];
    unreadCount: number;
}

export const notificationTypeLabels: Record<string, string> = {
    FIELD_VISIT_ASSIGNED: 'Chamado atribuído',
    FIELD_VISIT_SCHEDULE_CHANGED: 'Agenda alterada',
    FIELD_VISIT_STATUS_CHANGED: 'Status do chamado',
    TICKET_ASSIGNED: 'Chamado atribuído',
    CONVERSATION_TRANSFERRED: 'Conversa transferida',
    CONVERSATION_FALLBACK_ASSIGNED: 'Fallback automático',
    ASSISTANT_TASK_DUE: 'Lembrete do mascote',
};

export function getNotificationTypeLabel(type: string) {
    return notificationTypeLabels[type] || 'Notificação';
}

export function isMascotNotification(notification: NotificationItem) {
    return notification.type === 'ASSISTANT_TASK_DUE'
        && notification.payload?.mascotAgentId === 'FOLLOWUP_MASCOT';
}

export function formatNotificationDate(value: string) {
    return new Intl.DateTimeFormat('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
    }).format(new Date(value));
}
