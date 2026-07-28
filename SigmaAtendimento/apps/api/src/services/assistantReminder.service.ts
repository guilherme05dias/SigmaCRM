import { AssistantTaskStatus, ConversationStatus, MessageDirection, NotificationType } from '@prisma/client';
import { env } from '../config/env';
import { prisma } from '../lib/prisma';
import { createNotification } from './notification.service';

let timer: NodeJS.Timeout | null = null;
let tasksRunning = false;
let customerRepliesRunning = false;

export async function processDueAssistantTasks(now = new Date()) {
    if (tasksRunning) return 0;
    tasksRunning = true;
    let notified = 0;

    try {
        const undatedTaskCutoff = new Date(now.getTime() - env.assistantUndatedTaskReminderHours * 3_600_000);
        const dueTasks = await prisma.assistantTask.findMany({
            where: {
                status: { in: [AssistantTaskStatus.PENDING, AssistantTaskStatus.IN_PROGRESS, AssistantTaskStatus.WAITING] },
                remindedAt: null,
                OR: [
                    { dueAt: { lte: now } },
                    { dueAt: null, createdAt: { lte: undatedTaskCutoff } },
                ],
            },
            orderBy: { dueAt: 'asc' },
            take: 100,
        });

        for (const task of dueTasks) {
            const claim = await prisma.assistantTask.updateMany({
                where: {
                    id: task.id,
                    status: { in: [AssistantTaskStatus.PENDING, AssistantTaskStatus.IN_PROGRESS, AssistantTaskStatus.WAITING] },
                    remindedAt: null,
                },
                data: { remindedAt: now },
            });
            if (claim.count === 0) continue;

            try {
                await createNotification({
                    companyId: task.companyId,
                    userId: task.assignedUserId || task.createdByUserId,
                    type: NotificationType.ASSISTANT_TASK_DUE,
                    title: 'Mascote Sigma: tarefa pendente',
                    body: task.dueAt
                        ? `O prazo terminou e a tarefa ainda não foi concluída: ${task.title}`
                        : `Esta tarefa continua aberta há mais de ${env.assistantUndatedTaskReminderHours} hora(s): ${task.title}`,
                    link: '/tasks',
                    payload: {
                        mascotAgentId: 'FOLLOWUP_MASCOT',
                        mascotKind: 'TASK_PENDING',
                        assistantTaskId: task.id,
                        ticketId: task.ticketId,
                    },
                });
                notified += 1;
            } catch (error) {
                await prisma.assistantTask.updateMany({
                    where: { id: task.id, remindedAt: now },
                    data: { remindedAt: null },
                });
                console.error('[assistant-reminders] Falha ao notificar tarefa', task.id, error);
            }
        }
    } finally {
        tasksRunning = false;
    }

    return notified;
}

export async function processUnansweredCustomerConversations(now = new Date()) {
    if (customerRepliesRunning) return 0;
    customerRepliesRunning = true;
    let notified = 0;

    try {
        const replyCutoff = new Date(now.getTime() - env.assistantCustomerReplyReminderMinutes * 60_000);
        const conversations = await prisma.conversation.findMany({
            where: {
                companyId: { not: null },
                status: ConversationStatus.ASSIGNED,
                assignedUserId: { not: null },
                lastMessageAt: { lte: replyCutoff },
                contact: { isWhatsAppGroup: false },
            },
            orderBy: { lastMessageAt: 'asc' },
            take: 100,
            select: {
                id: true,
                companyId: true,
                assignedUserId: true,
                messages: {
                    orderBy: { createdAt: 'desc' },
                    take: 1,
                    select: { id: true, direction: true, createdAt: true },
                },
            },
        });

        const pendingByResponsible = new Map<string, {
            companyId: string;
            userId: string;
            conversationIds: string[];
        }>();

        for (const conversation of conversations) {
            const lastMessage = conversation.messages[0];
            if (
                !lastMessage
                || lastMessage.direction !== MessageDirection.INBOUND
                || lastMessage.createdAt > replyCutoff
                || !conversation.companyId
                || !conversation.assignedUserId
            ) {
                continue;
            }

            const groupKey = `${conversation.companyId}:${conversation.assignedUserId}`;
            const group = pendingByResponsible.get(groupKey) || {
                companyId: conversation.companyId,
                userId: conversation.assignedUserId,
                conversationIds: [],
            };
            group.conversationIds.push(conversation.id);
            pendingByResponsible.set(groupKey, group);
        }

        const digestCutoff = new Date(now.getTime() - env.assistantCustomerReplyDigestIntervalMinutes * 60_000);
        for (const group of pendingByResponsible.values()) {
            const existingReminder = await prisma.notification.findFirst({
                where: {
                    companyId: group.companyId,
                    userId: group.userId,
                    type: NotificationType.ASSISTANT_TASK_DUE,
                    createdAt: { gte: digestCutoff },
                    payload: { path: ['mascotKind'], equals: 'CUSTOMER_REPLY_DIGEST' },
                },
                select: { id: true },
            });
            if (existingReminder) continue;

            try {
                const pendingCount = group.conversationIds.length;
                await createNotification({
                    companyId: group.companyId,
                    userId: group.userId,
                    type: NotificationType.ASSISTANT_TASK_DUE,
                    title: `Mascote Sigma: ${pendingCount} cliente${pendingCount === 1 ? '' : 's'} aguardando`,
                    body: `Há ${pendingCount} atendimento${pendingCount === 1 ? '' : 's'} sem resposta há pelo menos ${env.assistantCustomerReplyReminderMinutes} minutos.`,
                    link: '/inbox',
                    payload: {
                        mascotAgentId: 'FOLLOWUP_MASCOT',
                        mascotKind: 'CUSTOMER_REPLY_DIGEST',
                        conversationIds: group.conversationIds,
                    },
                });
                notified += 1;
            } catch (error) {
                console.error('[assistant-reminders] Falha ao notificar clientes aguardando resposta', group.userId, error);
            }
        }
    } finally {
        customerRepliesRunning = false;
    }

    return notified;
}

export function startAssistantReminderWorker() {
    if (timer) return;

    const processAllMascotReminders = () => Promise.all([
        processDueAssistantTasks(),
        processUnansweredCustomerConversations(),
    ]);

    void processAllMascotReminders().catch((error) => {
        console.error('[assistant-reminders] Falha no processamento inicial', error);
    });
    timer = setInterval(() => {
        void processAllMascotReminders().catch((error) => {
            console.error('[assistant-reminders] Falha no processamento', error);
        });
    }, env.assistantReminderIntervalMs);
    timer.unref?.();
}
