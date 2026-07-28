import { AssistantTaskActivityType, AssistantTaskSource, AssistantTaskStatus, NotificationType, TicketPriority } from '@prisma/client';
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { getCompanyId } from '../lib/tenant';
import { authMiddleware } from '../middlewares/auth.middleware';
import { canViewAll, requireAdminOrSupervisor } from '../middlewares/authorization.middleware';
import { rateLimit } from '../middlewares/rateLimit.middleware';
import { findAssistantTaskReferences } from '../services/assistant-knowledge.service';
import { analyzeMainTickets, assistantCustomerDisplayName, getAssistantStatus, planAssistantTask, testAssistantConnection } from '../services/assistant.service';
import { createNotification } from '../services/notification.service';

const router = Router();
router.use(authMiddleware);

const AnalyzeSchema = z.object({
    periodDays: z.coerce.number().int().min(1).max(90).default(30),
    limit: z.coerce.number().int().min(5).max(30).default(15),
    confirmMinimizedDataProcessing: z.boolean({
        required_error: 'Confirme o processamento local dos dados minimizados antes de analisar.',
        invalid_type_error: 'Confirme o processamento local dos dados minimizados antes de analisar.',
    }).refine((value) => value === true, {
        message: 'Confirme o processamento local dos dados minimizados antes de analisar.',
    }),
});

const TaskInputSchema = z.object({
    title: z.string().trim().min(2).max(160),
    description: z.string().trim().max(1_000).nullable().optional(),
    priority: z.nativeEnum(TicketPriority).default(TicketPriority.MEDIUM),
    dueAt: z.string().datetime().nullable().optional(),
    assignedUserId: z.string().uuid().nullable().optional(),
    ticketId: z.string().uuid().nullable().optional(),
    conversationId: z.string().uuid().nullable().optional(),
    customerId: z.string().uuid().nullable().optional(),
    contactId: z.string().uuid().nullable().optional(),
    serviceTopicId: z.string().uuid().nullable().optional(),
    fieldServiceId: z.string().uuid().nullable().optional(),
    analysisId: z.string().uuid().nullable().optional(),
}).strict();

const TaskPatchSchema = z.object({
    title: z.string().trim().min(2).max(160).optional(),
    description: z.string().trim().max(1_000).nullable().optional(),
    priority: z.nativeEnum(TicketPriority).optional(),
    dueAt: z.string().datetime().nullable().optional(),
    assignedUserId: z.string().uuid().nullable().optional(),
    serviceTopicId: z.string().uuid().nullable().optional(),
    status: z.nativeEnum(AssistantTaskStatus).optional(),
}).strict();

const ChecklistItemCreateSchema = z.object({
    text: z.string().trim().min(1, 'Informe o tópico da checklist.').max(240),
}).strict();

const ChecklistItemsBulkCreateSchema = z.object({
    items: z.array(z.string().trim().min(1, 'Informe o tópico da checklist.').max(240)).min(1).max(7),
}).strict().transform((data) => ({
    items: Array.from(new Set(data.items)),
}));

const ChecklistItemPatchSchema = z.object({
    text: z.string().trim().min(1, 'Informe o tópico da checklist.').max(240).optional(),
    completed: z.boolean().optional(),
}).strict().refine((data) => data.text !== undefined || data.completed !== undefined, {
    message: 'Informe o que deseja alterar.',
});

const TaskPlanInputSchema = z.object({
    context: z.string().trim().max(2_000).nullable().optional(),
}).strict();

const TaskListQuerySchema = z.object({
    scope: z.enum(['mine', 'team']).default('mine'),
    status: z.nativeEnum(AssistantTaskStatus).optional(),
    assignedUserId: z.string().uuid().optional(),
    priority: z.nativeEnum(TicketPriority).optional(),
    source: z.nativeEnum(AssistantTaskSource).optional(),
    serviceTopicId: z.string().uuid().optional(),
    search: z.string().trim().max(120).optional(),
});

const taskInclude = {
    assignedUser: { select: { id: true, name: true, role: true } },
    createdBy: { select: { id: true, name: true } },
    customer: { select: { id: true, name: true } },
    serviceTopic: { select: { id: true, name: true, active: true } },
    contact: {
        select: {
            id: true,
            name: true,
            phone: true,
            business: { select: { id: true, name: true } },
            customer: {
                select: {
                    id: true,
                    name: true,
                    businesses: { select: { id: true, name: true }, orderBy: { name: 'asc' as const } },
                },
            },
        },
    },
    ticket: {
        select: {
            id: true,
            protocol: true,
            title: true,
            customer: { select: { id: true, name: true } },
            contact: {
                select: {
                    id: true,
                    name: true,
                    phone: true,
                    business: { select: { id: true, name: true } },
                    customer: { select: { id: true, name: true, businesses: { select: { id: true, name: true } } } },
                },
            },
        },
    },
    conversation: {
        select: {
            id: true,
            contact: {
                select: {
                    id: true,
                    name: true,
                    phone: true,
                    business: { select: { id: true, name: true } },
                    customer: { select: { id: true, name: true, businesses: { select: { id: true, name: true } } } },
                },
            },
        },
    },
    fieldService: {
        select: {
            id: true,
            scheduledAt: true,
            visitAddress: true,
            ticket: { select: { id: true, protocol: true, title: true } },
        },
    },
} as const;

function sendError(res: any, error: unknown, fallback: string) {
    if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.issues[0]?.message || 'Dados inválidos.' });
    }
    const status = error instanceof Error && 'status' in error ? Number((error as any).status) : 500;
    if (status >= 500) console.error(`[assistant] ${fallback}`, error);
    return res.status(status).json({ error: error instanceof Error ? error.message : fallback });
}

async function validateTaskRelations(companyId: string, data: z.infer<typeof TaskInputSchema> | z.infer<typeof TaskPatchSchema>) {
    const checks: Promise<unknown>[] = [];

    if (data.assignedUserId) {
        checks.push(prisma.user.findFirstOrThrow({ where: { id: data.assignedUserId, companyId, active: true }, select: { id: true } }));
    }
    if ('ticketId' in data && data.ticketId) {
        checks.push(prisma.ticket.findFirstOrThrow({ where: { id: data.ticketId, companyId }, select: { id: true } }));
    }
    if ('conversationId' in data && data.conversationId) {
        checks.push(prisma.conversation.findFirstOrThrow({ where: { id: data.conversationId, companyId }, select: { id: true } }));
    }
    if ('customerId' in data && data.customerId) {
        checks.push(prisma.customer.findFirstOrThrow({ where: { id: data.customerId, companyId }, select: { id: true } }));
    }
    if ('contactId' in data && data.contactId) {
        checks.push(prisma.contact.findFirstOrThrow({ where: { id: data.contactId, companyId }, select: { id: true } }));
    }
    if ('serviceTopicId' in data && data.serviceTopicId) {
        checks.push(prisma.serviceTopic.findFirstOrThrow({ where: { id: data.serviceTopicId, companyId }, select: { id: true } }));
    }
    if ('fieldServiceId' in data && data.fieldServiceId) {
        checks.push(prisma.ticketFieldService.findFirstOrThrow({ where: { id: data.fieldServiceId, companyId }, select: { id: true } }));
    }
    if ('analysisId' in data && data.analysisId) {
        checks.push(prisma.assistantAnalysis.findFirstOrThrow({ where: { id: data.analysisId, companyId }, select: { id: true } }));
    }

    try {
        await Promise.all(checks);
    } catch {
        throw Object.assign(new Error('Um dos vínculos da tarefa não pertence a esta empresa.'), { status: 400 });
    }
}

async function resolveTaskContext(companyId: string, data: z.infer<typeof TaskInputSchema>) {
    let ticketId = data.ticketId || null;
    let conversationId = data.conversationId || null;
    let customerId = data.customerId || null;
    let contactId = data.contactId || null;
    let serviceTopicId = data.serviceTopicId || null;
    let source: AssistantTaskSource = data.analysisId ? AssistantTaskSource.AI : AssistantTaskSource.MANUAL;

    if (data.fieldServiceId) {
        const visit = await prisma.ticketFieldService.findFirstOrThrow({
            where: { id: data.fieldServiceId, companyId },
            select: { ticketId: true, ticket: { select: { customerId: true, contactId: true, conversationId: true, serviceTopicId: true } } },
        });
        ticketId = visit.ticketId;
        conversationId ||= visit.ticket.conversationId;
        customerId = visit.ticket.customerId || customerId;
        contactId = visit.ticket.contactId;
        serviceTopicId = visit.ticket.serviceTopicId || serviceTopicId;
        source = AssistantTaskSource.VISIT;
    } else if (ticketId) {
        const ticket = await prisma.ticket.findFirstOrThrow({
            where: { id: ticketId, companyId },
            select: { customerId: true, contactId: true, conversationId: true, serviceTopicId: true, contact: { select: { customerId: true } } },
        });
        conversationId ||= ticket.conversationId;
        customerId = ticket.customerId || ticket.contact.customerId || customerId;
        contactId = ticket.contactId;
        serviceTopicId = ticket.serviceTopicId || serviceTopicId;
        if (!data.analysisId) source = AssistantTaskSource.TICKET;
    } else if (conversationId) {
        const conversation = await prisma.conversation.findFirstOrThrow({
            where: { id: conversationId, companyId },
            select: { contactId: true, serviceTopicId: true, contact: { select: { customerId: true } } },
        });
        customerId = conversation.contact.customerId || customerId;
        contactId = conversation.contactId;
        serviceTopicId = conversation.serviceTopicId || serviceTopicId;
        source = AssistantTaskSource.CONVERSATION;
    }

    if (contactId && !customerId) {
        const contact = await prisma.contact.findFirstOrThrow({
            where: { id: contactId, companyId },
            select: { customerId: true },
        });
        customerId = contact.customerId;
    }

    return { ticketId, conversationId, customerId, contactId, serviceTopicId, fieldServiceId: data.fieldServiceId || null, source };
}

function canAccessTask(role: string | undefined, userId: string | undefined, task: { createdByUserId: string; assignedUserId: string | null }) {
    return canViewAll(role) || Boolean(userId && (task.assignedUserId === userId || (!task.assignedUserId && task.createdByUserId === userId)));
}

router.get('/status', (_req, res) => {
    res.json(getAssistantStatus());
});

router.post(
    '/connection-test',
    requireAdminOrSupervisor,
    rateLimit(60_000, 2, (req) => `${req.user?.companyId}:${req.user?.id}:assistant-connection-test`),
    async (_req, res) => {
        try {
            const connection = await testAssistantConnection();
            res.json({ connection });
        } catch (error) {
            sendError(res, error, 'Erro ao testar a conexão com o assistente local.');
        }
    },
);

router.get('/analyses/latest', requireAdminOrSupervisor, async (req, res) => {
    try {
        const companyId = getCompanyId(req);
        const analysis = await prisma.assistantAnalysis.findFirst({
            where: { companyId },
            orderBy: { createdAt: 'desc' },
        });
        const result = analysis?.result as any;
        const ticketIds = Array.from(new Set<string>([
            ...(result?.prioritizedTickets || []).map((item: any) => String(item.ticketId)),
            ...(result?.taskSuggestions || []).map((item: any) => item.ticketId ? String(item.ticketId) : '').filter(Boolean),
        ]));
        const sourceTickets = ticketIds.length > 0 ? await prisma.ticket.findMany({
            where: { companyId, id: { in: ticketIds } },
            select: { id: true, protocol: true, title: true, priority: true, status: true, dueAt: true },
        }) : [];
        const contactIds = Array.from(new Set<string>(
            (result?.topCustomers || []).map((item: any) => String(item.contactId)).filter(Boolean),
        ));
        const currentContacts = contactIds.length > 0 ? await prisma.contact.findMany({
            where: { companyId, id: { in: contactIds } },
            select: {
                id: true,
                name: true,
                phone: true,
            },
        }) : [];
        const currentNameByContactId = new Map(currentContacts.map((contact) => [
            contact.id,
            assistantCustomerDisplayName(contact),
        ]));
        const hydratedResult = result ? {
            ...result,
            topCustomers: (result.topCustomers || []).map((item: any) => ({
                ...item,
                name: currentNameByContactId.get(String(item.contactId)) || item.name,
            })),
        } : result;
        res.json({ analysis: analysis ? { ...analysis, result: hydratedResult, sourceTickets } : null });
    } catch (error) {
        sendError(res, error, 'Erro ao consultar a última análise.');
    }
});

router.post(
    '/analyze',
    requireAdminOrSupervisor,
    rateLimit(60_000, 3, (req) => `${req.user?.companyId}:${req.user?.id}:assistant`),
    async (req, res) => {
        try {
            const companyId = getCompanyId(req);
            const requestedByUserId = req.user?.id;
            if (!requestedByUserId) return res.status(401).json({ error: 'Usuário não identificado.' });
            const parsed = AnalyzeSchema.parse(req.body || {});
            const { confirmMinimizedDataProcessing: _confirmation, ...analysisInput } = parsed;
            const analysis = await analyzeMainTickets({ companyId, requestedByUserId, ...analysisInput });
            res.status(201).json({ analysis });
        } catch (error) {
            sendError(res, error, 'Erro ao analisar os chamados.');
        }
    },
);

router.get('/tasks', async (req, res) => {
    try {
        const companyId = getCompanyId(req);
        const userId = req.user?.id;
        if (!userId) return res.status(401).json({ error: 'Usuário não identificado.' });
        const query = TaskListQuerySchema.parse(req.query);
        const teamScope = query.scope === 'team' && canViewAll(req.user?.role);
        if (query.assignedUserId && !teamScope && query.assignedUserId !== userId) {
            return res.status(403).json({ error: 'Você não pode consultar as tarefas de outro usuário.' });
        }
        const ownership = teamScope
            ? (query.assignedUserId ? { assignedUserId: query.assignedUserId } : {})
            : { OR: [{ assignedUserId: userId }, { assignedUserId: null, createdByUserId: userId }] };
        const search = query.search?.trim();

        const tasks = await prisma.assistantTask.findMany({
            where: {
                companyId,
                ...(query.status ? { status: query.status } : {}),
                ...(query.priority ? { priority: query.priority } : {}),
                ...(query.source ? { source: query.source } : {}),
                ...(query.serviceTopicId ? { serviceTopicId: query.serviceTopicId } : {}),
                ...ownership,
                ...(search ? {
                    AND: [{
                        OR: [
                            { title: { contains: search, mode: 'insensitive' as const } },
                            { description: { contains: search, mode: 'insensitive' as const } },
                            { customer: { name: { contains: search, mode: 'insensitive' as const } } },
                            { serviceTopic: { name: { contains: search, mode: 'insensitive' as const } } },
                            { contact: { name: { contains: search, mode: 'insensitive' as const } } },
                            { contact: { phone: { contains: search } } },
                            { contact: { business: { name: { contains: search, mode: 'insensitive' as const } } } },
                            { contact: { customer: { name: { contains: search, mode: 'insensitive' as const } } } },
                            { ticket: { protocol: { contains: search, mode: 'insensitive' as const } } },
                            { ticket: { title: { contains: search, mode: 'insensitive' as const } } },
                            { ticket: { contact: { phone: { contains: search } } } },
                            { conversation: { contact: { name: { contains: search, mode: 'insensitive' as const } } } },
                            { conversation: { contact: { phone: { contains: search } } } },
                        ],
                    }],
                } : {}),
            },
            orderBy: [{ status: 'asc' }, { dueAt: 'asc' }, { createdAt: 'desc' }],
            take: 500,
            include: {
                ...taskInclude,
                _count: {
                    select: { checklistItems: true },
                },
                checklistItems: {
                    where: { completedAt: { not: null } },
                    select: { id: true },
                },
            },
        });
        res.json({
            tasks: tasks.map(({ _count, checklistItems, ...task }) => ({
                ...task,
                checklistProgress: {
                    total: _count.checklistItems,
                    completed: checklistItems.length,
                },
            })),
        });
    } catch (error) {
        sendError(res, error, 'Erro ao listar tarefas.');
    }
});

router.post('/tasks', async (req, res) => {
    try {
        const companyId = getCompanyId(req);
        const createdByUserId = req.user?.id;
        if (!createdByUserId) return res.status(401).json({ error: 'Usuário não identificado.' });
        const data = TaskInputSchema.parse(req.body);
        await validateTaskRelations(companyId, data);
        const context = await resolveTaskContext(companyId, data);
        const assignedUserId = data.assignedUserId || createdByUserId;
        if (!canViewAll(req.user?.role) && assignedUserId !== createdByUserId) {
            return res.status(403).json({ error: 'Somente supervisores e administradores podem delegar tarefas.' });
        }

        const task = await prisma.assistantTask.create({
            data: {
                companyId,
                createdByUserId,
                title: data.title,
                description: data.description,
                priority: data.priority,
                dueAt: data.dueAt ? new Date(data.dueAt) : null,
                assignedUserId,
                ticketId: context.ticketId,
                conversationId: context.conversationId,
                customerId: context.customerId,
                contactId: context.contactId,
                serviceTopicId: context.serviceTopicId,
                fieldServiceId: context.fieldServiceId,
                analysisId: data.analysisId,
                source: context.source,
                activities: {
                    create: {
                        companyId,
                        actorUserId: createdByUserId,
                        type: AssistantTaskActivityType.CREATED,
                        payload: { source: context.source, assignedUserId },
                    },
                },
            },
            include: taskInclude,
        });
        if (assignedUserId !== createdByUserId) {
            await createNotification({
                companyId,
                userId: assignedUserId,
                type: NotificationType.ASSISTANT_TASK_ASSIGNED,
                title: 'Nova tarefa delegada',
                body: task.title,
                link: '/tasks',
                payload: { assistantTaskId: task.id },
            });
        }
        res.status(201).json({ task });
    } catch (error) {
        sendError(res, error, 'Erro ao criar tarefa.');
    }
});

router.get('/tasks/:id', async (req, res) => {
    try {
        const companyId = getCompanyId(req);
        const task = await prisma.assistantTask.findFirst({
            where: { id: req.params.id, companyId },
            include: {
                ...taskInclude,
                activities: {
                    orderBy: { createdAt: 'desc' },
                    take: 50,
                    include: { actor: { select: { id: true, name: true } } },
                },
                checklistItems: {
                    orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
                },
            },
        });
        if (!task) return res.status(404).json({ error: 'Tarefa não encontrada.' });
        if (!canAccessTask(req.user?.role, req.user?.id, task)) {
            return res.status(403).json({ error: 'Você não tem permissão para consultar esta tarefa.' });
        }
        res.json({ task });
    } catch (error) {
        sendError(res, error, 'Erro ao consultar tarefa.');
    }
});

router.post(
    '/tasks/:id/plan',
    rateLimit(60_000, 8, (req) => `${req.user?.companyId}:${req.user?.id}:assistant-task-plan`),
    async (req, res) => {
        try {
            const companyId = getCompanyId(req);
            const data = TaskPlanInputSchema.parse(req.body || {});
            const task = await prisma.assistantTask.findFirst({
                where: { id: req.params.id, companyId },
                select: {
                    id: true,
                    title: true,
                    description: true,
                    createdByUserId: true,
                    assignedUserId: true,
                    ticketId: true,
                    conversationId: true,
                    serviceTopic: { select: { id: true, name: true } },
                },
            });
            if (!task) return res.status(404).json({ error: 'Tarefa não encontrada.' });
            if (!canAccessTask(req.user?.role, req.user?.id, task)) {
                return res.status(403).json({ error: 'Você não tem permissão para planejar esta tarefa.' });
            }

            const references = await findAssistantTaskReferences({
                companyId,
                title: task.title,
                description: task.description,
                context: data.context,
                serviceTopicId: task.serviceTopic?.id,
                serviceTopicName: task.serviceTopic?.name,
                ticketId: task.ticketId,
                conversationId: task.conversationId,
            });
            const plan = await planAssistantTask({
                title: task.title,
                description: task.description,
                context: data.context,
                serviceTopic: task.serviceTopic?.name,
                references,
            });
            res.json({ plan });
        } catch (error) {
            sendError(res, error, 'Erro ao sugerir etapas para a tarefa.');
        }
    },
);

router.post('/tasks/:id/checklist/bulk', async (req, res) => {
    try {
        const companyId = getCompanyId(req);
        const userId = req.user?.id;
        const data = ChecklistItemsBulkCreateSchema.parse(req.body);
        const task = await prisma.assistantTask.findFirst({ where: { id: req.params.id, companyId } });
        if (!task) return res.status(404).json({ error: 'Tarefa não encontrada.' });
        if (!canAccessTask(req.user?.role, userId, task)) {
            return res.status(403).json({ error: 'Você não tem permissão para alterar esta tarefa.' });
        }

        const lastItem = await prisma.assistantTaskChecklistItem.findFirst({
            where: { taskId: task.id, companyId },
            orderBy: { position: 'desc' },
            select: { position: true },
        });
        const items = await prisma.$transaction(async (transaction) => {
            const createdItems = [];
            for (const [index, text] of data.items.entries()) {
                const created = await transaction.assistantTaskChecklistItem.create({
                    data: {
                        companyId,
                        taskId: task.id,
                        text,
                        position: (lastItem?.position ?? -1) + index + 1,
                    },
                });
                createdItems.push(created);
                await transaction.assistantTaskActivity.create({
                    data: {
                        companyId,
                        taskId: task.id,
                        actorUserId: userId,
                        type: AssistantTaskActivityType.UPDATED,
                        payload: { action: 'CHECKLIST_ITEM_ADDED', itemText: created.text, source: 'ASSISTANT_PLAN' },
                    },
                });
            }
            return createdItems;
        });
        res.status(201).json({ items });
    } catch (error) {
        sendError(res, error, 'Erro ao adicionar as etapas sugeridas.');
    }
});

router.post('/tasks/:id/checklist', async (req, res) => {
    try {
        const companyId = getCompanyId(req);
        const userId = req.user?.id;
        const data = ChecklistItemCreateSchema.parse(req.body);
        const task = await prisma.assistantTask.findFirst({ where: { id: req.params.id, companyId } });
        if (!task) return res.status(404).json({ error: 'Tarefa não encontrada.' });
        if (!canAccessTask(req.user?.role, userId, task)) {
            return res.status(403).json({ error: 'Você não tem permissão para alterar esta tarefa.' });
        }

        const lastItem = await prisma.assistantTaskChecklistItem.findFirst({
            where: { taskId: task.id, companyId },
            orderBy: { position: 'desc' },
            select: { position: true },
        });
        const item = await prisma.$transaction(async (transaction) => {
            const created = await transaction.assistantTaskChecklistItem.create({
                data: {
                    companyId,
                    taskId: task.id,
                    text: data.text,
                    position: (lastItem?.position ?? -1) + 1,
                },
            });
            await transaction.assistantTaskActivity.create({
                data: {
                    companyId,
                    taskId: task.id,
                    actorUserId: userId,
                    type: AssistantTaskActivityType.UPDATED,
                    payload: { action: 'CHECKLIST_ITEM_ADDED', itemText: created.text },
                },
            });
            return created;
        });
        res.status(201).json({ item });
    } catch (error) {
        sendError(res, error, 'Erro ao adicionar tópico à tarefa.');
    }
});

router.patch('/tasks/:id/checklist/:itemId', async (req, res) => {
    try {
        const companyId = getCompanyId(req);
        const userId = req.user?.id;
        const data = ChecklistItemPatchSchema.parse(req.body);
        const task = await prisma.assistantTask.findFirst({ where: { id: req.params.id, companyId } });
        if (!task) return res.status(404).json({ error: 'Tarefa não encontrada.' });
        if (!canAccessTask(req.user?.role, userId, task)) {
            return res.status(403).json({ error: 'Você não tem permissão para alterar esta tarefa.' });
        }
        const existing = await prisma.assistantTaskChecklistItem.findFirst({
            where: { id: req.params.itemId, taskId: task.id, companyId },
        });
        if (!existing) return res.status(404).json({ error: 'Tópico não encontrado.' });

        const action = data.completed === true
            ? 'CHECKLIST_ITEM_COMPLETED'
            : data.completed === false
                ? 'CHECKLIST_ITEM_REOPENED'
                : 'CHECKLIST_ITEM_UPDATED';
        const item = await prisma.$transaction(async (transaction) => {
            const updated = await transaction.assistantTaskChecklistItem.update({
                where: { id: existing.id },
                data: {
                    text: data.text,
                    completedAt: data.completed === undefined ? undefined : data.completed ? new Date() : null,
                },
            });
            await transaction.assistantTaskActivity.create({
                data: {
                    companyId,
                    taskId: task.id,
                    actorUserId: userId,
                    type: AssistantTaskActivityType.UPDATED,
                    payload: { action, itemText: updated.text },
                },
            });
            return updated;
        });
        res.json({ item });
    } catch (error) {
        sendError(res, error, 'Erro ao atualizar tópico da tarefa.');
    }
});

router.delete('/tasks/:id/checklist/:itemId', async (req, res) => {
    try {
        const companyId = getCompanyId(req);
        const userId = req.user?.id;
        const task = await prisma.assistantTask.findFirst({ where: { id: req.params.id, companyId } });
        if (!task) return res.status(404).json({ error: 'Tarefa não encontrada.' });
        if (!canAccessTask(req.user?.role, userId, task)) {
            return res.status(403).json({ error: 'Você não tem permissão para alterar esta tarefa.' });
        }
        const existing = await prisma.assistantTaskChecklistItem.findFirst({
            where: { id: req.params.itemId, taskId: task.id, companyId },
        });
        if (!existing) return res.status(404).json({ error: 'Tópico não encontrado.' });

        await prisma.$transaction(async (transaction) => {
            await transaction.assistantTaskChecklistItem.delete({ where: { id: existing.id } });
            await transaction.assistantTaskActivity.create({
                data: {
                    companyId,
                    taskId: task.id,
                    actorUserId: userId,
                    type: AssistantTaskActivityType.UPDATED,
                    payload: { action: 'CHECKLIST_ITEM_REMOVED', itemText: existing.text },
                },
            });
        });
        res.status(204).send();
    } catch (error) {
        sendError(res, error, 'Erro ao remover tópico da tarefa.');
    }
});

router.patch('/tasks/:id', async (req, res) => {
    try {
        const companyId = getCompanyId(req);
        const userId = req.user?.id;
        const data = TaskPatchSchema.parse(req.body);
        await validateTaskRelations(companyId, data);

        const existing = await prisma.assistantTask.findFirst({ where: { id: req.params.id, companyId } });
        if (!existing) return res.status(404).json({ error: 'Tarefa não encontrada.' });
        if (!canAccessTask(req.user?.role, userId, existing)) {
            return res.status(403).json({ error: 'Você não tem permissão para alterar esta tarefa.' });
        }
        if (!canViewAll(req.user?.role) && data.assignedUserId !== undefined && data.assignedUserId !== existing.assignedUserId) {
            return res.status(403).json({ error: 'Somente supervisores e administradores podem reatribuir tarefas.' });
        }

        const dueAt = data.dueAt === undefined ? undefined : data.dueAt ? new Date(data.dueAt) : null;
        const previousStatus = existing.status;
        const nextStatus = data.status || existing.status;
        const assignmentChanged = data.assignedUserId !== undefined && data.assignedUserId !== existing.assignedUserId;
        const statusChanged = data.status !== undefined && data.status !== existing.status;
        const activityType = assignmentChanged
            ? AssistantTaskActivityType.ASSIGNED
            : data.status === AssistantTaskStatus.COMPLETED
                ? AssistantTaskActivityType.COMPLETED
                : previousStatus === AssistantTaskStatus.COMPLETED && statusChanged
                    ? AssistantTaskActivityType.REOPENED
                    : statusChanged
                        ? AssistantTaskActivityType.STATUS_CHANGED
                        : AssistantTaskActivityType.UPDATED;
        const task = await prisma.assistantTask.update({
            where: { id: existing.id },
            data: {
                ...data,
                dueAt,
                completedAt: nextStatus === AssistantTaskStatus.COMPLETED ? new Date() : statusChanged ? null : undefined,
                remindedAt: dueAt !== undefined || statusChanged ? null : undefined,
                activities: {
                    create: {
                        companyId,
                        actorUserId: userId,
                        type: activityType,
                        payload: {
                            fromStatus: previousStatus,
                            toStatus: nextStatus,
                            fromAssignedUserId: existing.assignedUserId,
                            toAssignedUserId: data.assignedUserId === undefined ? existing.assignedUserId : data.assignedUserId,
                        },
                    },
                },
            },
            include: taskInclude,
        });
        if (assignmentChanged && data.assignedUserId && data.assignedUserId !== userId) {
            await createNotification({
                companyId,
                userId: data.assignedUserId,
                type: NotificationType.ASSISTANT_TASK_ASSIGNED,
                title: 'Tarefa delegada para você',
                body: task.title,
                link: '/tasks',
                payload: { assistantTaskId: task.id },
            });
        }
        res.json({ task });
    } catch (error) {
        sendError(res, error, 'Erro ao atualizar tarefa.');
    }
});

export default router;
