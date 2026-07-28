import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
    const transaction = {
        conversation: { update: vi.fn() },
        conversationReport: { create: vi.fn() },
        whatsAppOutbox: { deleteMany: vi.fn() },
        whatsAppInboundEvent: { deleteMany: vi.fn() },
        message: { deleteMany: vi.fn() },
    };

    return {
        transaction,
        prisma: {
            conversation: { findFirst: vi.fn() },
            serviceTopic: { findFirst: vi.fn() },
            settings: { findUnique: vi.fn() },
            $transaction: vi.fn(async (callback: (tx: typeof transaction) => unknown) => callback(transaction)),
        },
        sendText: vi.fn(),
    };
});

vi.mock('../lib/prisma', () => ({ prisma: mocks.prisma }));
vi.mock('../middlewares/auth.middleware', () => ({
    authMiddleware: (req: any, _res: any, next: any) => {
        req.user = {
            id: '11111111-1111-4111-8111-111111111111',
            companyId: '22222222-2222-4222-8222-222222222222',
            role: 'ADMIN',
        };
        next();
    },
}));
vi.mock('../middlewares/authorization.middleware', () => ({
    canViewAll: () => true,
    requireAdminOrSupervisor: (_req: any, _res: any, next: any) => next(),
}));
vi.mock('../lib/tenant', () => ({
    getCompanyId: () => '22222222-2222-4222-8222-222222222222',
}));
vi.mock('../socket', () => ({
    getIO: () => ({ to: () => ({ emit: vi.fn() }) }),
    emitToCompany: vi.fn(),
}));
vi.mock('../whatsapp', () => ({
    getWhatsAppProvider: () => ({ sendText: mocks.sendText }),
}));
vi.mock('../middlewares/rateLimit.middleware', () => ({
    rateLimit: () => (_req: any, _res: any, next: any) => next(),
}));
vi.mock('../services/protocol.service', () => ({ generateProtocol: vi.fn() }));
vi.mock('../services/whatsappOutbox.service', () => ({ sendTextWithOutbox: vi.fn() }));
vi.mock('../services/notification.service', () => ({
    notifyConversationTransferred: vi.fn(),
    notifyFieldVisitAssigned: vi.fn(),
}));
vi.mock('../services/conversationFallback.service', () => ({
    cancelConversationFallback: vi.fn(),
}));
vi.mock('../lib/contactDisplayName', () => ({
    formatContactDisplayName: () => 'Cliente de teste',
}));
vi.mock('../services/conversationClosure.service', () => ({
    getConversationClosureBehavior: () => ({
        shouldRequestSatisfaction: false,
        closingText: null,
    }),
}));

import inboxRouter from './inbox.routes';

const app = express();
app.use(express.json());
app.use('/api/inbox', inboxRouter);

describe('encerramento de conversa', () => {
    beforeEach(() => {
        vi.clearAllMocks();

        mocks.prisma.conversation.findFirst.mockResolvedValue({
            id: '33333333-3333-4333-8333-333333333333',
            companyId: '22222222-2222-4222-8222-222222222222',
            status: 'ASSIGNED',
            assignedUserId: '11111111-1111-4111-8111-111111111111',
            startedAt: new Date('2026-07-27T12:00:00.000Z'),
            contact: {
                name: 'Cliente',
                phone: '5549999999999',
                businessId: null,
                includeInServiceReports: true,
                customer: null,
            },
        });
        mocks.prisma.serviceTopic.findFirst.mockResolvedValue({
            id: '44444444-4444-4444-8444-444444444444',
            name: 'Suporte',
        });
        mocks.prisma.settings.findUnique.mockResolvedValue(null);
        mocks.transaction.conversation.update.mockResolvedValue({
            id: '33333333-3333-4333-8333-333333333333',
            companyId: '22222222-2222-4222-8222-222222222222',
            status: 'CLOSED',
            contact: { phone: '5549999999999' },
        });
        mocks.transaction.conversationReport.create.mockResolvedValue({ id: 'report-1' });
        mocks.transaction.whatsAppOutbox.deleteMany.mockResolvedValue({ count: 0 });
        mocks.transaction.whatsAppInboundEvent.deleteMany.mockResolvedValue({ count: 0 });
        mocks.transaction.message.deleteMany.mockResolvedValue({ count: 5 });
    });

    it('preserva as mensagens para consulta no histórico', async () => {
        const response = await request(app)
            .post('/api/inbox/conversations/33333333-3333-4333-8333-333333333333/close')
            .send({
                result: 'Resolvido',
                summary: 'Atendimento concluído',
                serviceTopicId: '44444444-4444-4444-8444-444444444444',
                closureMode: 'SILENT',
            });

        expect(response.status).toBe(200);
        expect(mocks.transaction.conversation.update).toHaveBeenCalled();
        expect(mocks.transaction.conversationReport.create).toHaveBeenCalled();
        expect(mocks.transaction.message.deleteMany).not.toHaveBeenCalled();
    });
});
