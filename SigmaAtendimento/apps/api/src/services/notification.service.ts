import { NotificationType, UserRole } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { emitToUser } from '../socket';

interface CreateNotificationInput {
    companyId?: string | null;
    userId?: string | null;
    type: NotificationType;
    title: string;
    body?: string | null;
    link?: string | null;
    payload?: unknown;
}

export async function createNotification(input: CreateNotificationInput) {
    if (!input.userId) return null;

    const notification = await prisma.notification.create({
        data: {
            companyId: input.companyId ?? undefined,
            userId: input.userId,
            type: input.type,
            title: input.title,
            body: input.body ?? undefined,
            link: input.link ?? undefined,
            payload: input.payload === undefined ? undefined : input.payload as any,
        },
    });

    emitToUser(input.userId, 'notification:new', notification);
    return notification;
}

export async function notifyFieldVisitAssigned(input: {
    companyId?: string | null;
    technicianId?: string | null;
    ticketId: string;
    protocol?: string | null;
    title: string;
    scheduledAt?: Date | string | null;
}) {
    return createNotification({
        companyId: input.companyId,
        userId: input.technicianId,
        type: NotificationType.FIELD_VISIT_ASSIGNED,
        title: 'Chamado atribuído',
        body: `${input.protocol || 'Chamado'} — ${input.title}`,
        link: `/tickets/${input.ticketId}`,
        payload: {
            ticketId: input.ticketId,
            protocol: input.protocol ?? null,
            scheduledAt: input.scheduledAt ?? null,
        },
    });
}

export async function notifyFieldVisitScheduleChanged(input: {
    companyId?: string | null;
    technicianId?: string | null;
    ticketId: string;
    protocol?: string | null;
    title: string;
    previousScheduledAt?: Date | null;
    newScheduledAt?: Date | null;
    reason: string;
}) {
    return createNotification({
        companyId: input.companyId,
        userId: input.technicianId,
        type: NotificationType.FIELD_VISIT_SCHEDULE_CHANGED,
        title: 'Agenda do chamado alterada',
        body: `${input.protocol || 'Chamado'} — ${input.reason}`,
        link: `/tickets/${input.ticketId}`,
        payload: {
            ticketId: input.ticketId,
            protocol: input.protocol ?? null,
            previousScheduledAt: input.previousScheduledAt ?? null,
            newScheduledAt: input.newScheduledAt ?? null,
            reason: input.reason,
        },
    });
}

const fieldVisitStatusLabels: Record<string, string> = {
    PENDING: 'Pendente',
    SCHEDULED: 'Agendada',
    IN_PROGRESS: 'Em atendimento',
    COMPLETED: 'Concluida',
    CANCELED: 'Cancelada',
};

export async function notifyFieldVisitStatusChanged(input: {
    companyId?: string | null;
    technicianId?: string | null;
    ticketId: string;
    protocol?: string | null;
    title: string;
    previousStatus?: string | null;
    newStatus: string;
}) {
    return createNotification({
        companyId: input.companyId,
        userId: input.technicianId,
        type: NotificationType.FIELD_VISIT_STATUS_CHANGED,
        title: 'Status do chamado atualizado',
        body: `${input.protocol || 'Chamado'} - ${fieldVisitStatusLabels[input.newStatus] || input.newStatus}`,
        link: `/tickets/${input.ticketId}`,
        payload: {
            ticketId: input.ticketId,
            protocol: input.protocol ?? null,
            previousStatus: input.previousStatus ?? null,
            newStatus: input.newStatus,
        },
    });
}

export async function notifyTicketAssigned(input: {
    companyId?: string | null;
    userId?: string | null;
    ticketId: string;
    protocol?: string | null;
    title: string;
    priority?: string | null;
}) {
    return createNotification({
        companyId: input.companyId,
        userId: input.userId,
        type: NotificationType.TICKET_ASSIGNED,
        title: 'Novo chamado atribuído',
        body: `${input.protocol || 'Chamado'} - ${input.title}`,
        link: `/tickets/${input.ticketId}`,
        payload: {
            ticketId: input.ticketId,
            protocol: input.protocol ?? null,
            priority: input.priority ?? null,
        },
    });
}

export async function notifyConversationTransferred(input: {
    companyId?: string | null;
    userId?: string | null;
    conversationId: string;
    contactName?: string | null;
    contactPhone?: string | null;
    departmentName?: string | null;
}) {
    const contactLabel = input.contactName?.trim() || input.contactPhone || 'Cliente';

    return createNotification({
        companyId: input.companyId,
        userId: input.userId,
        type: NotificationType.CONVERSATION_TRANSFERRED,
        title: 'Conversa transferida para você',
        body: input.departmentName
            ? `${contactLabel} - setor ${input.departmentName}`
            : contactLabel,
        link: '/inbox',
        payload: {
            conversationId: input.conversationId,
            contactName: input.contactName ?? null,
            contactPhone: input.contactPhone ?? null,
            departmentName: input.departmentName ?? null,
        },
    });
}

export async function notifyConversationFallbackAssigned(input: {
    companyId?: string | null;
    userId?: string | null;
    conversationId: string;
    contactName?: string | null;
    contactPhone?: string | null;
}) {
    const contactLabel = input.contactName?.trim() || input.contactPhone || 'Cliente';

    return createNotification({
        companyId: input.companyId,
        userId: input.userId,
        type: 'CONVERSATION_FALLBACK_ASSIGNED' as NotificationType,
        title: 'Conversa encaminhada pelo fallback automático',
        body: `${contactLabel} - cliente entrou sem escolher setor`,
        link: '/inbox',
        payload: {
            conversationId: input.conversationId,
            contactName: input.contactName ?? null,
            contactPhone: input.contactPhone ?? null,
        },
    });
}

export async function notifyConversationQueued(input: {
    companyId: string;
    conversationId: string;
    contactName?: string | null;
    contactPhone?: string | null;
}) {
    const recipients = await prisma.user.findMany({
        where: {
            companyId: input.companyId,
            active: true,
            role: { in: [UserRole.ADMIN, UserRole.SUPERVISOR, UserRole.TECHNICIAN] },
        },
        select: { id: true },
    });
    const contactLabel = input.contactName?.trim() || input.contactPhone || 'Cliente';
    await Promise.all(recipients.map((recipient) => createNotification({
        companyId: input.companyId,
        userId: recipient.id,
        type: NotificationType.CONVERSATION_QUEUED,
        title: 'Nova conversa na fila',
        body: `${contactLabel} aguarda atendimento.`,
        link: '/inbox',
        payload: { conversationId: input.conversationId, contactName: input.contactName ?? null, contactPhone: input.contactPhone ?? null },
    })));
}
