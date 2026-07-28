import { beforeEach, describe, expect, it, vi } from 'vitest';

const prismaMock = vi.hoisted(() => ({
    conversation: { findMany: vi.fn() },
    ticket: { findMany: vi.fn() },
    message: { groupBy: vi.fn() },
    ticketFieldService: { count: vi.fn() },
}));

vi.mock('../lib/prisma', () => ({ prisma: prismaMock }));

import { buildReportsSummary } from './reports.service';

const baseConversation = {
    id: 'conversation-1', status: 'ASSIGNED', queuedAt: null, assignedAt: null, startedAt: null,
    closedAt: null, totalHandleTimeSeconds: null, rating: null, departmentId: null, department: null,
    serviceTopicId: null, serviceTopic: null, tickets: [],
};

const ticket = {
    id: 'ticket-1', conversationId: 'conversation-1', status: 'SCHEDULED_FIELD_SERVICE',
    departmentId: null, department: null,
    fieldService: {
        status: 'SCHEDULED', technicianId: 'tech-1', technician: { name: 'Timoteo' },
        scheduledAt: new Date('2026-07-18T12:00:00.000Z'), startedAt: null, finishedAt: null,
    },
};

function context(type: 'all' | 'attendance' | 'ticket' = 'all') {
    return {
        companyId: 'company-1', userId: 'admin-1', seesAll: true,
        filters: { from: '2026-07-01', to: '2026-07-18', type },
        startInclusive: new Date('2026-07-01T03:00:00.000Z'),
        endExclusive: new Date('2026-07-19T03:00:00.000Z'),
    } as any;
}

describe('resumo de atividades por responsável', () => {
    beforeEach(() => {
        prismaMock.conversation.findMany.mockResolvedValue([
            { ...baseConversation, assignedUserId: 'admin-1', assignedUser: { name: 'Guilherme' } },
            { ...baseConversation, id: 'conversation-2', assignedUserId: 'supervisor-1', assignedUser: { name: 'Carlos' } },
        ]);
        prismaMock.ticket.findMany.mockResolvedValue([ticket]);
        prismaMock.message.groupBy.mockResolvedValue([]);
        prismaMock.ticketFieldService.count.mockResolvedValue(0);
    });

    it('conta Atendimentos pelo responsável real, independentemente do perfil', async () => {
        const summary = await buildReportsSummary(context('all'));

        expect(summary.technicians).toEqual([
            { userId: 'supervisor-1', userName: 'Carlos', attendanceCount: 1, ticketCount: 0, totalCount: 1 },
            { userId: 'admin-1', userName: 'Guilherme', attendanceCount: 1, ticketCount: 0, totalCount: 1 },
            { userId: 'tech-1', userName: 'Timoteo', attendanceCount: 0, ticketCount: 1, totalCount: 1 },
        ]);
    });

    it('não mistura Atendimentos quando o filtro seleciona somente Chamados', async () => {
        const summary = await buildReportsSummary(context('ticket'));

        expect(summary.technicians).toEqual([
            { userId: 'tech-1', userName: 'Timoteo', attendanceCount: 0, ticketCount: 1, totalCount: 1 },
        ]);
    });
});
