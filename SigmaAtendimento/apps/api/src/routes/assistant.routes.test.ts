import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const COMPANY_ID = '22222222-2222-4222-8222-222222222222';
const OTHER_USER_ID = '33333333-3333-4333-8333-333333333333';
const TASK_ID = '44444444-4444-4444-8444-444444444444';
const SERVICE_TOPIC_ID = '55555555-5555-4555-8555-555555555555';
const CHECKLIST_ITEM_ID = '66666666-6666-4666-8666-666666666666';

const authUser = vi.hoisted(() => ({
    id: '11111111-1111-4111-8111-111111111111',
    companyId: '22222222-2222-4222-8222-222222222222',
    role: 'ATTENDANT',
}));

const prismaMock = vi.hoisted(() => {
    const mock: any = {
        user: { findFirstOrThrow: vi.fn() },
        ticket: { findFirstOrThrow: vi.fn(), findMany: vi.fn() },
        conversation: { findFirstOrThrow: vi.fn() },
        contact: { findMany: vi.fn(), findFirstOrThrow: vi.fn() },
        customer: { findFirstOrThrow: vi.fn() },
        serviceTopic: { findFirstOrThrow: vi.fn() },
        assistantAnalysis: { findFirstOrThrow: vi.fn(), findFirst: vi.fn() },
        assistantTask: {
            findMany: vi.fn(),
            create: vi.fn(),
            findFirst: vi.fn(),
            update: vi.fn(),
        },
        assistantTaskChecklistItem: {
            findFirst: vi.fn(),
            create: vi.fn(),
            update: vi.fn(),
            delete: vi.fn(),
        },
        assistantTaskActivity: { create: vi.fn() },
    };
    mock.$transaction = vi.fn(async (callback: (transaction: any) => unknown) => callback(mock));
    return mock;
});

const assistantMocks = vi.hoisted(() => ({
    analyzeMainTickets: vi.fn(),
    assistantCustomerDisplayName: vi.fn(),
    getAssistantStatus: vi.fn(),
    planAssistantTask: vi.fn(),
    testAssistantConnection: vi.fn(),
}));
const knowledgeMocks = vi.hoisted(() => ({
    findAssistantTaskReferences: vi.fn(),
}));

vi.mock('../middlewares/auth.middleware', () => ({
    authMiddleware: (req: any, _res: any, next: any) => {
        req.user = { ...authUser };
        next();
    },
}));

vi.mock('../middlewares/rateLimit.middleware', () => ({
    rateLimit: () => (_req: any, _res: any, next: any) => next(),
}));

vi.mock('../lib/prisma', () => ({ prisma: prismaMock }));
vi.mock('../services/assistant-knowledge.service', () => knowledgeMocks);
vi.mock('../services/assistant.service', () => assistantMocks);

import assistantRouter from './assistant.routes';

const app = express();
app.use(express.json());
app.use('/api/assistant', assistantRouter);

describe('rotas do assistente interno', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        authUser.role = 'ATTENDANT';
        prismaMock.assistantTask.findMany.mockResolvedValue([]);
        prismaMock.user.findFirstOrThrow.mockResolvedValue({ id: USER_ID });
        prismaMock.ticket.findFirstOrThrow.mockResolvedValue({ id: TASK_ID });
        prismaMock.conversation.findFirstOrThrow.mockResolvedValue({ id: TASK_ID });
        prismaMock.assistantAnalysis.findFirstOrThrow.mockResolvedValue({ id: TASK_ID });
        prismaMock.contact.findMany.mockResolvedValue([]);
        prismaMock.contact.findFirstOrThrow.mockResolvedValue({ id: TASK_ID, customerId: null });
        prismaMock.customer.findFirstOrThrow.mockResolvedValue({ id: TASK_ID });
        prismaMock.serviceTopic.findFirstOrThrow.mockResolvedValue({ id: SERVICE_TOPIC_ID });
        assistantMocks.assistantCustomerDisplayName.mockImplementation((contact: any) => contact.name || 'Contato sem nome');
        assistantMocks.getAssistantStatus.mockReturnValue({
            enabled: false,
            model: 'llama3.2:1b',
            provider: 'ollama',
            localOnly: true,
            mode: 'internal_analysis_only',
            canSendCustomerMessages: false,
        });
        assistantMocks.planAssistantTask.mockResolvedValue({
            understanding: 'O acesso precisa ser validado antes da correção.',
            steps: ['Confirmar o erro', 'Reproduzir o acesso', 'Validar a correção'],
            analysisMode: 'LOCAL_MODEL',
            references: [],
        });
        knowledgeMocks.findAssistantTaskReferences.mockResolvedValue([]);
    });

    it('limita a lista do atendente à empresa e às tarefas próprias', async () => {
        const response = await request(app).get('/api/assistant/tasks');

        expect(response.status).toBe(200);
        expect(prismaMock.assistantTask.findMany).toHaveBeenCalledWith(expect.objectContaining({
            where: {
                companyId: COMPANY_ID,
                OR: [{ assignedUserId: USER_ID }, { assignedUserId: null, createdByUserId: USER_ID }],
            },
            include: expect.objectContaining({
                _count: { select: { checklistItems: true } },
                checklistItems: {
                    where: { completedAt: { not: null } },
                    select: { id: true },
                },
            }),
        }));
    });

    it('atualiza o ranking com o nome atual salvo no contato do CRM', async () => {
        authUser.role = 'ADMIN';
        prismaMock.assistantAnalysis.findFirst.mockResolvedValue({
            id: 'analysis-1',
            createdAt: new Date('2026-07-21T12:00:00.000Z'),
            result: {
                prioritizedTickets: [],
                taskSuggestions: [],
                topCustomers: [{ contactId: 'contact-1', name: 'Nome antigo', conversationCount: 2 }],
            },
        });
        prismaMock.contact.findMany.mockResolvedValue([{
            id: 'contact-1',
            name: 'Contato salvo no CRM',
            phone: '554999999999',
            customer: { name: 'Empresa vinculada' },
            business: null,
        }]);

        const response = await request(app).get('/api/assistant/analyses/latest');

        expect(response.status).toBe(200);
        expect(response.body.analysis.result.topCustomers[0].name).toBe('Contato salvo no CRM');
        expect(prismaMock.contact.findMany).toHaveBeenCalledWith(expect.objectContaining({
            where: { companyId: COMPANY_ID, id: { in: ['contact-1'] } },
        }));
    });

    it('cria tarefa manual apenas após uma ação explícita do usuário', async () => {
        const task = { id: TASK_ID, title: 'Revisar chamado', source: 'MANUAL' };
        prismaMock.assistantTask.create.mockResolvedValue(task);

        const response = await request(app)
            .post('/api/assistant/tasks')
            .send({ title: 'Revisar chamado', priority: 'HIGH' });

        expect(response.status).toBe(201);
        expect(response.body.task).toEqual(task);
        expect(prismaMock.assistantTask.create).toHaveBeenCalledWith(expect.objectContaining({
            data: expect.objectContaining({
                companyId: COMPANY_ID,
                createdByUserId: USER_ID,
                assignedUserId: USER_ID,
                source: 'MANUAL',
            }),
        }));
    });

    it('mantém o contato do CRM vinculado à tarefa e herda seu cliente', async () => {
        const task = { id: TASK_ID, title: 'Retornar ao contato', source: 'MANUAL' };
        prismaMock.contact.findFirstOrThrow.mockResolvedValue({ id: TASK_ID, customerId: 'customer-1' });
        prismaMock.assistantTask.create.mockResolvedValue(task);

        const response = await request(app)
            .post('/api/assistant/tasks')
            .send({ title: 'Retornar ao contato', contactId: TASK_ID });

        expect(response.status).toBe(201);
        expect(prismaMock.contact.findFirstOrThrow).toHaveBeenCalledWith(expect.objectContaining({
            where: { id: TASK_ID, companyId: COMPANY_ID },
        }));
        expect(prismaMock.assistantTask.create).toHaveBeenCalledWith(expect.objectContaining({
            data: expect.objectContaining({ contactId: TASK_ID, customerId: 'customer-1' }),
        }));
    });

    it('valida e vincula o sistema/produto no tenant autenticado', async () => {
        const task = { id: TASK_ID, title: 'Atualizar o sistema', source: 'MANUAL' };
        prismaMock.assistantTask.create.mockResolvedValue(task);

        const response = await request(app)
            .post('/api/assistant/tasks')
            .send({ title: 'Atualizar o sistema', serviceTopicId: SERVICE_TOPIC_ID });

        expect(response.status).toBe(201);
        expect(prismaMock.serviceTopic.findFirstOrThrow).toHaveBeenCalledWith(expect.objectContaining({
            where: { id: SERVICE_TOPIC_ID, companyId: COMPANY_ID },
        }));
        expect(prismaMock.assistantTask.create).toHaveBeenCalledWith(expect.objectContaining({
            data: expect.objectContaining({ serviceTopicId: SERVICE_TOPIC_ID }),
        }));
    });

    it('rejeita vínculo com usuário de outra empresa', async () => {
        prismaMock.user.findFirstOrThrow.mockRejectedValue(new Error('not found'));

        const response = await request(app)
            .post('/api/assistant/tasks')
            .send({ title: 'Tarefa indevida', assignedUserId: OTHER_USER_ID });

        expect(response.status).toBe(400);
        expect(response.body.error).toContain('não pertence a esta empresa');
        expect(prismaMock.user.findFirstOrThrow).toHaveBeenCalledWith(expect.objectContaining({
            where: { id: OTHER_USER_ID, companyId: COMPANY_ID, active: true },
        }));
        expect(prismaMock.assistantTask.create).not.toHaveBeenCalled();
    });

    it('impede atendente de alterar tarefa de outro usuário', async () => {
        prismaMock.assistantTask.findFirst.mockResolvedValue({
            id: TASK_ID,
            companyId: COMPANY_ID,
            createdByUserId: OTHER_USER_ID,
            assignedUserId: OTHER_USER_ID,
        });

        const response = await request(app)
            .patch(`/api/assistant/tasks/${TASK_ID}`)
            .send({ status: 'COMPLETED' });

        expect(response.status).toBe(403);
        expect(prismaMock.assistantTask.update).not.toHaveBeenCalled();
    });

    it('adiciona um tópico à checklist da própria tarefa', async () => {
        const task = { id: TASK_ID, companyId: COMPANY_ID, createdByUserId: USER_ID, assignedUserId: USER_ID };
        const item = { id: CHECKLIST_ITEM_ID, taskId: TASK_ID, text: 'Validar o acesso', position: 0, completedAt: null };
        prismaMock.assistantTask.findFirst.mockResolvedValue(task);
        prismaMock.assistantTaskChecklistItem.findFirst.mockResolvedValue(null);
        prismaMock.assistantTaskChecklistItem.create.mockResolvedValue(item);

        const response = await request(app)
            .post(`/api/assistant/tasks/${TASK_ID}/checklist`)
            .send({ text: 'Validar o acesso' });

        expect(response.status).toBe(201);
        expect(response.body.item).toEqual(item);
        expect(prismaMock.assistantTaskChecklistItem.create).toHaveBeenCalledWith({
            data: expect.objectContaining({ companyId: COMPANY_ID, taskId: TASK_ID, text: 'Validar o acesso', position: 0 }),
        });
        expect(prismaMock.assistantTaskActivity.create).toHaveBeenCalledWith({
            data: expect.objectContaining({ payload: { action: 'CHECKLIST_ITEM_ADDED', itemText: 'Validar o acesso' } }),
        });
    });

    it('entende a tarefa e sugere pequenas etapas sem gravá-las automaticamente', async () => {
        prismaMock.assistantTask.findFirst.mockResolvedValue({
            id: TASK_ID,
            title: 'Corrigir acesso ao sistema',
            description: 'Usuário recebe erro ao entrar.',
            companyId: COMPANY_ID,
            createdByUserId: USER_ID,
            assignedUserId: USER_ID,
            ticketId: null,
            conversationId: null,
            serviceTopic: { id: SERVICE_TOPIC_ID, name: 'Sigma PDV' },
        });

        const response = await request(app)
            .post(`/api/assistant/tasks/${TASK_ID}/plan`)
            .send({ context: 'O erro começou após a atualização.' });

        expect(response.status).toBe(200);
        expect(response.body.plan.steps).toHaveLength(3);
        expect(knowledgeMocks.findAssistantTaskReferences).toHaveBeenCalledWith({
            companyId: COMPANY_ID,
            title: 'Corrigir acesso ao sistema',
            description: 'Usuário recebe erro ao entrar.',
            context: 'O erro começou após a atualização.',
            serviceTopicId: SERVICE_TOPIC_ID,
            serviceTopicName: 'Sigma PDV',
            ticketId: null,
            conversationId: null,
        });
        expect(assistantMocks.planAssistantTask).toHaveBeenCalledWith({
            title: 'Corrigir acesso ao sistema',
            description: 'Usuário recebe erro ao entrar.',
            context: 'O erro começou após a atualização.',
            serviceTopic: 'Sigma PDV',
            references: [],
        });
        expect(prismaMock.assistantTaskChecklistItem.create).not.toHaveBeenCalled();
    });

    it('adiciona o plano confirmado em uma única transação e preserva a ordem', async () => {
        const task = { id: TASK_ID, companyId: COMPANY_ID, createdByUserId: USER_ID, assignedUserId: USER_ID };
        prismaMock.assistantTask.findFirst.mockResolvedValue(task);
        prismaMock.assistantTaskChecklistItem.findFirst.mockResolvedValue({ position: 1 });
        prismaMock.assistantTaskChecklistItem.create.mockImplementation(async ({ data }: any) => ({ id: `item-${data.position}`, ...data }));

        const response = await request(app)
            .post(`/api/assistant/tasks/${TASK_ID}/checklist/bulk`)
            .send({ items: ['Reproduzir o problema', 'Identificar a causa', 'Validar a solução'] });

        expect(response.status).toBe(201);
        expect(response.body.items).toHaveLength(3);
        expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
        expect(prismaMock.assistantTaskChecklistItem.create).toHaveBeenNthCalledWith(1, {
            data: expect.objectContaining({ taskId: TASK_ID, text: 'Reproduzir o problema', position: 2 }),
        });
        expect(prismaMock.assistantTaskChecklistItem.create).toHaveBeenNthCalledWith(3, {
            data: expect.objectContaining({ taskId: TASK_ID, text: 'Validar a solução', position: 4 }),
        });
        expect(prismaMock.assistantTaskActivity.create).toHaveBeenCalledWith({
            data: expect.objectContaining({
                payload: expect.objectContaining({ action: 'CHECKLIST_ITEM_ADDED', source: 'ASSISTANT_PLAN' }),
            }),
        });
    });

    it('marca um tópico da checklist como concluído', async () => {
        const task = { id: TASK_ID, companyId: COMPANY_ID, createdByUserId: USER_ID, assignedUserId: USER_ID };
        const existing = { id: CHECKLIST_ITEM_ID, taskId: TASK_ID, companyId: COMPANY_ID, text: 'Validar o acesso', completedAt: null };
        prismaMock.assistantTask.findFirst.mockResolvedValue(task);
        prismaMock.assistantTaskChecklistItem.findFirst.mockResolvedValue(existing);
        prismaMock.assistantTaskChecklistItem.update.mockResolvedValue({ ...existing, completedAt: new Date() });

        const response = await request(app)
            .patch(`/api/assistant/tasks/${TASK_ID}/checklist/${CHECKLIST_ITEM_ID}`)
            .send({ completed: true });

        expect(response.status).toBe(200);
        expect(prismaMock.assistantTaskChecklistItem.update).toHaveBeenCalledWith(expect.objectContaining({
            where: { id: CHECKLIST_ITEM_ID },
            data: expect.objectContaining({ completedAt: expect.any(Date) }),
        }));
        expect(prismaMock.assistantTaskActivity.create).toHaveBeenCalledWith({
            data: expect.objectContaining({ payload: { action: 'CHECKLIST_ITEM_COMPLETED', itemText: 'Validar o acesso' } }),
        });
    });

    it('remove um tópico da checklist mantendo o registro no histórico', async () => {
        const task = { id: TASK_ID, companyId: COMPANY_ID, createdByUserId: USER_ID, assignedUserId: USER_ID };
        const existing = { id: CHECKLIST_ITEM_ID, taskId: TASK_ID, companyId: COMPANY_ID, text: 'Validar o acesso' };
        prismaMock.assistantTask.findFirst.mockResolvedValue(task);
        prismaMock.assistantTaskChecklistItem.findFirst.mockResolvedValue(existing);

        const response = await request(app).delete(`/api/assistant/tasks/${TASK_ID}/checklist/${CHECKLIST_ITEM_ID}`);

        expect(response.status).toBe(204);
        expect(prismaMock.assistantTaskChecklistItem.delete).toHaveBeenCalledWith({ where: { id: CHECKLIST_ITEM_ID } });
        expect(prismaMock.assistantTaskActivity.create).toHaveBeenCalledWith({
            data: expect.objectContaining({ payload: { action: 'CHECKLIST_ITEM_REMOVED', itemText: 'Validar o acesso' } }),
        });
    });

    it('não permite que atendente execute análise por IA', async () => {
        const response = await request(app)
            .post('/api/assistant/analyze')
            .send({ periodDays: 7, limit: 15, confirmMinimizedDataProcessing: true });

        expect(response.status).toBe(403);
        expect(assistantMocks.analyzeMainTickets).not.toHaveBeenCalled();
    });

    it('restringe o teste de conexao a administradores e supervisores', async () => {
        const forbiddenResponse = await request(app).post('/api/assistant/connection-test');

        expect(forbiddenResponse.status).toBe(403);
        expect(assistantMocks.testAssistantConnection).not.toHaveBeenCalled();

        authUser.role = 'ADMIN';
        assistantMocks.testAssistantConnection.mockResolvedValue({
            ok: true,
            model: 'llama3.2:1b',
            provider: 'ollama',
            localOnly: true,
            latencyMs: 120,
            usedSyntheticData: true,
            canSendCustomerMessages: false,
        });

        const allowedResponse = await request(app).post('/api/assistant/connection-test');

        expect(allowedResponse.status).toBe(200);
        expect(allowedResponse.body.connection).toMatchObject({ ok: true, usedSyntheticData: true });
        expect(assistantMocks.testAssistantConnection).toHaveBeenCalledOnce();
    });

    it('permite análise interna para administrador no tenant autenticado', async () => {
        authUser.role = 'ADMIN';
        assistantMocks.analyzeMainTickets.mockResolvedValue({ id: 'analysis-1' });

        const response = await request(app)
            .post('/api/assistant/analyze')
            .send({ periodDays: 7, limit: 15, confirmMinimizedDataProcessing: true });

        expect(response.status).toBe(201);
        expect(assistantMocks.analyzeMainTickets).toHaveBeenCalledWith({
            companyId: COMPANY_ID,
            requestedByUserId: USER_ID,
            periodDays: 7,
            limit: 15,
        });
    });

    it('recusa análise real sem confirmação explícita dos metadados minimizados', async () => {
        authUser.role = 'ADMIN';

        const response = await request(app)
            .post('/api/assistant/analyze')
            .send({ periodDays: 7, limit: 15 });

        expect(response.status).toBe(400);
        expect(response.body.error).toContain('Confirme o processamento local');
        expect(assistantMocks.analyzeMainTickets).not.toHaveBeenCalled();
    });
});
