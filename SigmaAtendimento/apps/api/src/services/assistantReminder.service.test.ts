import { beforeEach, describe, expect, it, vi } from 'vitest';

const prismaMock = vi.hoisted(() => ({
    assistantTask: {
        findMany: vi.fn(),
        updateMany: vi.fn(),
    },
    conversation: {
        findMany: vi.fn(),
    },
    notification: {
        findFirst: vi.fn(),
    },
}));

const createNotificationMock = vi.hoisted(() => vi.fn());

vi.mock('../lib/prisma', () => ({ prisma: prismaMock }));
vi.mock('./notification.service', () => ({ createNotification: createNotificationMock }));

import { env } from '../config/env';
import { processDueAssistantTasks, processUnansweredCustomerConversations } from './assistantReminder.service';

describe('lembretes do assistente', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        env.assistantCustomerReplyReminderMinutes = 30;
        env.assistantCustomerReplyDigestIntervalMinutes = 60;
        env.assistantUndatedTaskReminderHours = 24;
        prismaMock.conversation.findMany.mockResolvedValue([]);
        prismaMock.notification.findFirst.mockResolvedValue(null);
    });

    it('gera somente uma notificação interna para uma tarefa vencida após obter o lock', async () => {
        const now = new Date('2026-07-20T18:00:00.000Z');
        prismaMock.assistantTask.findMany.mockResolvedValue([{
            id: 'task-1',
            companyId: 'company-1',
            assignedUserId: 'user-1',
            createdByUserId: 'user-2',
            ticketId: 'ticket-1',
            title: 'Revisar chamado crítico',
        }]);
        prismaMock.assistantTask.updateMany.mockResolvedValue({ count: 1 });
        createNotificationMock.mockResolvedValue({ id: 'notification-1' });

        await expect(processDueAssistantTasks(now)).resolves.toBe(1);

        expect(prismaMock.assistantTask.updateMany).toHaveBeenCalledWith({
            where: { id: 'task-1', status: { in: ['PENDING', 'IN_PROGRESS', 'WAITING'] }, remindedAt: null },
            data: { remindedAt: now },
        });
        expect(prismaMock.assistantTask.findMany).toHaveBeenCalledWith(expect.objectContaining({
            where: expect.objectContaining({
                remindedAt: null,
                OR: [
                    { dueAt: { lte: now } },
                    { dueAt: null, createdAt: { lte: new Date('2026-07-19T18:00:00.000Z') } },
                ],
            }),
        }));
        expect(createNotificationMock).toHaveBeenCalledWith(expect.objectContaining({
            companyId: 'company-1',
            userId: 'user-1',
            type: 'ASSISTANT_TASK_DUE',
            link: '/tasks',
            payload: {
                mascotAgentId: 'FOLLOWUP_MASCOT',
                mascotKind: 'TASK_PENDING',
                assistantTaskId: 'task-1',
                ticketId: 'ticket-1',
            },
        }));
    });

    it('não duplica o lembrete quando outra execução já reivindicou a tarefa', async () => {
        prismaMock.assistantTask.findMany.mockResolvedValue([{
            id: 'task-2',
            companyId: 'company-1',
            assignedUserId: null,
            createdByUserId: 'user-2',
            ticketId: null,
            title: 'Revisar fila',
        }]);
        prismaMock.assistantTask.updateMany.mockResolvedValue({ count: 0 });

        await expect(processDueAssistantTasks()).resolves.toBe(0);
        expect(createNotificationMock).not.toHaveBeenCalled();
    });

    it('lembra o atendente quando a última mensagem do cliente está sem resposta', async () => {
        const now = new Date('2026-07-20T18:00:00.000Z');
        prismaMock.conversation.findMany.mockResolvedValue([{
            id: 'conversation-1',
            companyId: 'company-1',
            assignedUserId: 'user-1',
            messages: [{
                id: 'message-1',
                direction: 'INBOUND',
                createdAt: new Date('2026-07-20T17:20:00.000Z'),
            }],
        }]);
        createNotificationMock.mockResolvedValue({ id: 'notification-2' });

        await expect(processUnansweredCustomerConversations(now)).resolves.toBe(1);

        expect(prismaMock.conversation.findMany).toHaveBeenCalledWith(expect.objectContaining({
            where: expect.objectContaining({
                companyId: { not: null },
                status: 'ASSIGNED',
                assignedUserId: { not: null },
                lastMessageAt: { lte: new Date('2026-07-20T17:30:00.000Z') },
            }),
        }));
        expect(prismaMock.notification.findFirst).toHaveBeenCalledWith({
            where: {
                companyId: 'company-1',
                userId: 'user-1',
                type: 'ASSISTANT_TASK_DUE',
                createdAt: { gte: new Date('2026-07-20T17:00:00.000Z') },
                payload: { path: ['mascotKind'], equals: 'CUSTOMER_REPLY_DIGEST' },
            },
            select: { id: true },
        });
        expect(createNotificationMock).toHaveBeenCalledWith({
            companyId: 'company-1',
            userId: 'user-1',
            type: 'ASSISTANT_TASK_DUE',
            title: 'Mascote Sigma: 1 cliente aguardando',
            body: 'Há 1 atendimento sem resposta há pelo menos 30 minutos.',
            link: '/inbox',
            payload: {
                mascotAgentId: 'FOLLOWUP_MASCOT',
                mascotKind: 'CUSTOMER_REPLY_DIGEST',
                conversationIds: ['conversation-1'],
            },
        });
    });

    it('não lembra quando a equipe respondeu ou quando já existe aviso para a última mensagem', async () => {
        const now = new Date('2026-07-20T18:00:00.000Z');
        prismaMock.conversation.findMany.mockResolvedValue([{
            id: 'conversation-outbound',
            companyId: 'company-1',
            assignedUserId: 'user-1',
            messages: [{ id: 'message-outbound', direction: 'OUTBOUND', createdAt: new Date('2026-07-20T17:00:00.000Z') }],
        }, {
            id: 'conversation-reminded',
            companyId: 'company-1',
            assignedUserId: 'user-1',
            messages: [{ id: 'message-inbound', direction: 'INBOUND', createdAt: new Date('2026-07-20T17:10:00.000Z') }],
        }]);
        prismaMock.notification.findFirst.mockResolvedValue({ id: 'existing-reminder' });

        await expect(processUnansweredCustomerConversations(now)).resolves.toBe(0);

        expect(prismaMock.notification.findFirst).toHaveBeenCalledTimes(1);
        expect(createNotificationMock).not.toHaveBeenCalled();
    });
});
