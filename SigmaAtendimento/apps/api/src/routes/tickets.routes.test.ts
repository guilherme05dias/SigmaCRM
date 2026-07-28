import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const TECHNICIAN_ID = '11111111-1111-4111-8111-111111111111';
const COMPANY_ID = '22222222-2222-4222-8222-222222222222';
const TICKET_ID = '33333333-3333-4333-8333-333333333333';

const mocks = vi.hoisted(() => {
    const transaction = {
        ticket: {
            update: vi.fn(),
            findUnique: vi.fn(),
        },
        ticketFieldService: { upsert: vi.fn() },
        fieldVisitScheduleChange: { create: vi.fn() },
        ticketTimeline: { create: vi.fn() },
    };

    return {
        currentUser: {
            id: '11111111-1111-4111-8111-111111111111',
            companyId: '22222222-2222-4222-8222-222222222222',
            role: 'TECHNICIAN',
        },
        transaction,
        prisma: {
            ticket: { findFirst: vi.fn() },
            user: { findFirst: vi.fn() },
            department: { findFirst: vi.fn() },
            $transaction: vi.fn(async (callback: (tx: typeof transaction) => unknown) => callback(transaction)),
        },
    };
});

vi.mock('../lib/prisma', () => ({ prisma: mocks.prisma }));
vi.mock('../middlewares/auth.middleware', () => ({
    authMiddleware: (req: any, _res: any, next: any) => {
        req.user = { ...mocks.currentUser };
        next();
    },
}));
vi.mock('../middlewares/authorization.middleware', () => ({
    canViewAll: () => false,
}));
vi.mock('../lib/tenant', () => ({
    companyScope: () => ({ companyId: '22222222-2222-4222-8222-222222222222' }),
    getCompanyId: () => '22222222-2222-4222-8222-222222222222',
}));
vi.mock('../socket', () => ({ emitToCompany: vi.fn() }));
vi.mock('../services/protocol.service', () => ({ generateProtocol: vi.fn() }));
vi.mock('../services/whatsappOutbox.service', () => ({ sendTextWithOutbox: vi.fn() }));
vi.mock('../services/notification.service', () => ({
    notifyFieldVisitAssigned: vi.fn(),
    notifyFieldVisitScheduleChanged: vi.fn(),
    notifyFieldVisitStatusChanged: vi.fn(),
    notifyTicketAssigned: vi.fn(),
}));

import ticketsRouter from './tickets.routes';

const app = express();
app.use(express.json());
app.use('/api/tickets', ticketsRouter);

const assignedTicket = {
    id: TICKET_ID,
    companyId: COMPANY_ID,
    status: 'QUEUED',
    notesInternal: 'Observação anterior',
    assignedUserId: null,
    fieldService: {
        technicianId: TECHNICIAN_ID,
        scheduledAt: null,
        status: 'SCHEDULED',
    },
    conversation: null,
};

describe('permissões do técnico no chamado externo', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.prisma.ticket.findFirst.mockResolvedValue(assignedTicket);
        mocks.transaction.ticket.update.mockResolvedValue({ id: TICKET_ID });
        mocks.transaction.ticket.findUnique.mockResolvedValue({
            ...assignedTicket,
            status: 'IN_PROGRESS',
            notesInternal: 'Equipamento revisado no local',
        });
        mocks.transaction.ticketTimeline.create.mockResolvedValue({ id: 'timeline-1' });
    });

    it('permite ao técnico atribuído alterar status e observações', async () => {
        const response = await request(app)
            .patch(`/api/tickets/${TICKET_ID}`)
            .send({
                status: 'IN_PROGRESS',
                notesInternal: 'Equipamento revisado no local',
            });

        expect(response.status).toBe(200);
        expect(mocks.transaction.ticket.update).toHaveBeenCalledWith({
            where: { id: TICKET_ID },
            data: {
                status: 'IN_PROGRESS',
                notesInternal: 'Equipamento revisado no local',
            },
        });
        expect(mocks.transaction.ticketTimeline.create).toHaveBeenCalledWith({
            data: expect.objectContaining({
                ticketId: TICKET_ID,
                type: 'NOTE',
                actorUserId: TECHNICIAN_ID,
                payload: { action: 'NOTES_UPDATED' },
            }),
        });
    });

    it('bloqueia a edição quando o chamado pertence a outro técnico', async () => {
        mocks.prisma.ticket.findFirst.mockResolvedValue({
            ...assignedTicket,
            fieldService: {
                ...assignedTicket.fieldService,
                technicianId: '44444444-4444-4444-8444-444444444444',
            },
        });

        const response = await request(app)
            .patch(`/api/tickets/${TICKET_ID}`)
            .send({ notesInternal: 'Tentativa sem atribuição' });

        expect(response.status).toBe(403);
        expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
    });

    it('mantém campos administrativos bloqueados para o técnico', async () => {
        const response = await request(app)
            .patch(`/api/tickets/${TICKET_ID}`)
            .send({ priority: 'CRITICAL' });

        expect(response.status).toBe(403);
        expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
    });

    it('impede o técnico de criar um chamado para outro técnico', async () => {
        const response = await request(app)
            .post('/api/tickets')
            .send({
                contactId: '55555555-5555-4555-8555-555555555555',
                title: 'Atendimento externo',
                priority: 'MEDIUM',
                technicianId: '44444444-4444-4444-8444-444444444444',
                assignedUserId: '44444444-4444-4444-8444-444444444444',
                serviceType: 'PRESENCIAL',
                onSiteRequired: true,
            });

        expect(response.status).toBe(403);
        expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
    });
});
