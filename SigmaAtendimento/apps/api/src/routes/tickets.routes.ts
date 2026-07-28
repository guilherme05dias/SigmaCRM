import { Router } from 'express';
import { FieldVisitStatus, TicketChannel, TicketPriority, TicketStatus, ServiceType } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { emitToCompany } from '../socket';
import { authMiddleware } from '../middlewares/auth.middleware';
import { canViewAll } from '../middlewares/authorization.middleware';
import { companyScope, getCompanyId } from '../lib/tenant';
import { normalizePhone, phoneAliases } from '../lib/phone';
import { generateProtocol } from '../services/protocol.service';
import { assertTransition } from '../services/ticketStatus';
import { notifyFieldVisitAssigned, notifyFieldVisitScheduleChanged, notifyFieldVisitStatusChanged, notifyTicketAssigned } from '../services/notification.service';
import { sendTextWithOutbox } from '../services/whatsappOutbox.service';
import { z } from 'zod';

const router = Router();
router.use(authMiddleware);

const fieldServiceShape = {
    serviceType: z.nativeEnum(ServiceType).optional(),
    equipment: z.string().optional().nullable(),
    technicianId: z.string().uuid().optional().nullable(),
    onSiteRequired: z.boolean().optional(),
    visitAddress: z.string().optional().nullable(),
    visitWindowStart: z.string().datetime().optional().nullable(),
    visitWindowEnd: z.string().datetime().optional().nullable(),
    scheduledAt: z.string().datetime().optional().nullable(),
    startedAt: z.string().datetime().optional().nullable(),
    finishedAt: z.string().datetime().optional().nullable(),
    hoursSpent: z.number().optional().nullable(),
    resolution: z.string().optional().nullable(),
    result: z.string().optional().nullable(),
    serviceDescription: z.string().optional().nullable(),
    materialsUsed: z.string().optional().nullable(),
    photos: z.array(z.string()).optional().nullable(),
};

const CreateTicketSchema = z.object({
    contactId: z.string().uuid(),
    customerId: z.string().uuid().optional().nullable(),
    conversationId: z.string().uuid().optional().nullable(),
    title: z.string().min(1),
    description: z.string().optional().nullable(),
    category: z.string().optional().nullable(),
    channel: z.nativeEnum(TicketChannel).optional(),
    priority: z.nativeEnum(TicketPriority),
    departmentId: z.string().uuid().optional().nullable(),
    assignedUserId: z.string().uuid().optional().nullable(),
    notesInternal: z.string().optional().nullable(),
    fieldVisitStatus: z.nativeEnum(FieldVisitStatus).optional(),
    ...fieldServiceShape,
});

const UpdateTicketSchema = z.object({
    status: z.nativeEnum(TicketStatus).optional(),
    priority: z.nativeEnum(TicketPriority).optional(),
    assignedUserId: z.string().uuid().optional().nullable(),
    departmentId: z.string().uuid().optional().nullable(),
    title: z.string().min(1).optional(),
    description: z.string().optional().nullable(),
    category: z.string().optional().nullable(),
    notesInternal: z.string().optional().nullable(),
    scheduleChangeReason: z.string().optional().nullable(),
    fieldVisitStatus: z.nativeEnum(FieldVisitStatus).optional(),
    ...fieldServiceShape,
}).strict();

const normalizeCnpj = (value: string) => value.replace(/\D/g, '');

const isValidCnpj = (value: string) => {
    const cnpj = normalizeCnpj(value);
    if (cnpj.length !== 14 || /^(\d)\1{13}$/.test(cnpj)) return false;

    const calculateDigit = (base: string, weights: number[]) => {
        const sum = base
            .split('')
            .reduce((total, digit, index) => total + Number(digit) * weights[index], 0);
        const remainder = sum % 11;
        return remainder < 2 ? 0 : 11 - remainder;
    };

    const firstDigit = calculateDigit(cnpj.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
    const secondDigit = calculateDigit(`${cnpj.slice(0, 12)}${firstDigit}`, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
    return cnpj.endsWith(`${firstDigit}${secondDigit}`);
};

const optionalText = z.string().trim().optional().nullable();
const normalizeDocument = (value?: string | null) => {
    if (value === undefined) return undefined;
    if (value === null) return null;
    const trimmed = value.trim();
    if (!trimmed) return null;
    return trimmed.replace(/\D/g, '') || trimmed;
};

const CustomerInfoSchema = z.object({
    customerName: optionalText,
    customerDocument: optionalText.transform(normalizeDocument),
    contactName: optionalText,
    contactPhone: optionalText.transform((value) => value ? normalizePhone(value) : null),
    businessName: optionalText,
    businessCnpj: optionalText.transform((value) => value ? normalizeCnpj(value) : null).refine((value) => !value || isValidCnpj(value), 'CNPJ invalido'),
}).strict();

const attendantUpdateFields = new Set([
    'status', 'title', 'description', 'category', 'notesInternal',
]);
const technicianUpdateFields = new Set([
    'equipment', 'visitAddress', 'visitWindowStart', 'visitWindowEnd',
    'scheduledAt', 'scheduleChangeReason', 'startedAt', 'finishedAt',
    'hoursSpent', 'resolution', 'result', 'serviceDescription',
    'materialsUsed', 'photos', 'fieldVisitStatus',
]);

const ticketInclude = {
    contact: { include: { business: true, customer: { include: { businesses: { orderBy: { name: 'asc' as const } } } } } },
    customer: { include: { businesses: { orderBy: { name: 'asc' as const } } } },
    assignedUser: true,
    department: true,
    serviceTopic: true,
    fieldService: { include: { technician: true, scheduleChanges: { include: { changedByUser: true }, orderBy: { createdAt: 'desc' } } } },
    evaluation: true,
} as const;

const toDate = (v?: string | null) => (v ? new Date(v) : null);

function userTicketScope(req: any) {
    if (canViewAll(req.user?.role)) return {};
    const userId = req.user?.id;
    if (!userId) return { id: '__NO_USER__' };

    return {
        OR: [
            { assignedUserId: userId },
            { fieldService: { is: { technicianId: userId } } },
            { conversation: { is: { assignedUserId: userId } } },
        ],
    };
}

function canUpdateTicketFields(req: any, ticket: {
    assignedUserId?: string | null;
    fieldService?: { technicianId?: string | null } | null;
    conversation?: { assignedUserId?: string | null } | null;
}, fields: string[]) {
    if (canViewAll(req.user?.role)) return true;
    const userId = req.user?.id;
    if (!userId) return false;

    if (req.user?.role === 'ATTENDANT') {
        const isAssociated = ticket.assignedUserId === userId || ticket.conversation?.assignedUserId === userId;
        return isAssociated && fields.every((field) => attendantUpdateFields.has(field));
    }
    if (req.user?.role === 'TECHNICIAN') {
        const isAssignedTechnician = ticket.fieldService?.technicianId === userId;
        return isAssignedTechnician && fields.every((field) => technicianUpdateFields.has(field));
    }
    return false;
}

function extractFieldService(data: Record<string, any>) {
    const keys = Object.keys(fieldServiceShape);
    const fs: Record<string, any> = {};
    let has = false;
    for (const k of keys) {
        if (data[k] !== undefined) {
            has = true;
            fs[k] = ['visitWindowStart', 'visitWindowEnd', 'scheduledAt', 'startedAt', 'finishedAt'].includes(k)
                ? toDate(data[k])
                : data[k];
        }
    }
    if (data.fieldVisitStatus !== undefined) {
        has = true;
        fs.status = data.fieldVisitStatus;
    }
    return { has, fs };
}

function formatDateTime(value?: Date | string | null) {
    if (!value) return 'A definir';
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return 'A definir';
    return date.toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
    }) + ' as ' + date.toLocaleTimeString('pt-BR', {
        hour: '2-digit',
        minute: '2-digit',
    });
}

function priorityLabel(priority: TicketPriority) {
    const labels: Record<TicketPriority, string> = {
        LOW: 'Baixa',
        MEDIUM: 'Media',
        HIGH: 'Alta',
        CRITICAL: 'Critica',
    };
    return labels[priority] || priority;
}

function formatTicketGroupMessage(ticket: any) {
    const protocol = ticket.protocol || `#${ticket.id.slice(0, 8)}`;
    const rawContactName = ticket.contact?.name?.trim();
    const contactPhone = ticket.contact?.phone?.trim();
    const contactName = rawContactName && rawContactName !== contactPhone ? rawContactName : null;
    const customerName = ticket.customer?.name || ticket.contact?.customer?.name || null;
    const business = ticket.contact?.business;
    const fieldService = ticket.fieldService;
    const technicianName = fieldService?.technician?.name || ticket.assignedUser?.name || 'A definir';
    const customerLine = customerName ? `- Cliente: ${customerName}` : null;
    const businessLine = business
        ? `- Empresa: ${business.name}${business.cnpj ? `\n- CNPJ: ${business.cnpj}` : ''}`
        : null;
    const contactLine = contactName
        ? `- Contato: ${contactName}${contactPhone ? `\n- Telefone: ${contactPhone}` : ''}`
        : contactPhone
            ? `- Contato: ${contactPhone}`
            : null;
    const description = ticket.description?.trim();
    const notesInternal = ticket.notesInternal?.trim();

    return [
        '*NOVO CHAMADO / ATENDIMENTO*',
        '----------------------------',
        `*${protocol}*`,
        `*${ticket.title}*`,
        '',
        '*Cliente*',
        customerLine,
        businessLine,
        contactLine,
        '',
        '*Agenda*',
        `- Tecnico: ${technicianName}`,
        `- Data: ${formatDateTime(fieldService?.scheduledAt)}`,
        fieldService?.visitAddress ? `- Local: ${fieldService.visitAddress}` : null,
        fieldService?.equipment ? `- Sistema/equipamento: ${fieldService.equipment}` : null,
        '',
        '*Classificacao*',
        `- Prioridade: ${priorityLabel(ticket.priority)}`,
        ticket.department?.name ? `- Departamento: ${ticket.department.name}` : null,
        '',
        description ? `*Descricao*\n${description}` : null,
        notesInternal ? `\n*Observacao interna*\n${notesInternal}` : null,
    ].filter((line) => line !== null && line !== undefined).join('\n');
}

async function assertTenantReferences(companyId: string, refs: {
    contactId?: string | null;
    customerId?: string | null;
    conversationId?: string | null;
    departmentId?: string | null;
    assignedUserId?: string | null;
    technicianId?: string | null;
}) {
    if (refs.contactId) {
        const contact = await prisma.contact.findFirst({ where: { id: refs.contactId, companyId }, select: { id: true } });
        if (!contact) throw Object.assign(new Error('Contato não encontrado nesta empresa'), { status: 404 });
    }
    if (refs.customerId) {
        const customer = await prisma.customer.findFirst({ where: { id: refs.customerId, companyId }, select: { id: true } });
        if (!customer) throw Object.assign(new Error('Cliente não encontrado nesta empresa'), { status: 404 });
    }
    if (refs.conversationId) {
        const conversation = await prisma.conversation.findFirst({ where: { id: refs.conversationId, companyId }, select: { id: true } });
        if (!conversation) throw Object.assign(new Error('Conversa não encontrada nesta empresa'), { status: 404 });
    }
    if (refs.departmentId) {
        const department = await prisma.department.findFirst({ where: { id: refs.departmentId, companyId }, select: { id: true } });
        if (!department) throw Object.assign(new Error('Departamento não encontrado nesta empresa'), { status: 404 });
    }
    if (refs.assignedUserId) {
        const user = await prisma.user.findFirst({ where: { id: refs.assignedUserId, companyId }, select: { id: true } });
        if (!user) throw Object.assign(new Error('Usuário responsável não encontrado nesta empresa'), { status: 404 });
    }
    if (refs.technicianId) {
        const technician = await prisma.user.findFirst({ where: { id: refs.technicianId, companyId }, select: { id: true } });
        if (!technician) throw Object.assign(new Error('Técnico não encontrado nesta empresa'), { status: 404 });
    }
}

// LISTAR (escopado por empresa)
router.get('/', async (req, res) => {
    try {
        const { status, priority, contactId, customerId, assignedUserId, departmentId, technicianId, fieldVisitStatus, visitOnly } = req.query;
        const where: any = { ...companyScope(req), ...userTicketScope(req) };
        if (status) where.status = status;
        if (priority) where.priority = priority;
        if (contactId) where.contactId = contactId;
        if (customerId) where.customerId = customerId;
        if (assignedUserId) where.assignedUserId = assignedUserId;
        if (departmentId) where.departmentId = departmentId;
        if (technicianId || fieldVisitStatus || visitOnly === 'true') {
            where.fieldService = {
                is: {
                    ...(technicianId ? { technicianId: String(technicianId) } : {}),
                    ...(fieldVisitStatus ? { status: String(fieldVisitStatus) as FieldVisitStatus } : {}),
                },
            };
        }

        const tickets = await prisma.ticket.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            include: ticketInclude,
        });
        res.json(tickets);
    } catch (error: any) {
        res.status(error?.status ?? 500).json({ error: error?.message ?? 'Failed to fetch tickets' });
    }
});

// DETALHE
router.get('/:id', async (req, res) => {
    try {
        const ticket = await prisma.ticket.findFirst({
            where: { id: req.params.id, ...companyScope(req), ...userTicketScope(req) },
            include: { ...ticketInclude, timeline: { orderBy: { createdAt: 'desc' } } },
        });
        if (!ticket) return res.status(404).json({ error: 'Ticket not found' });
        res.json(ticket);
    } catch (error: any) {
        res.status(error?.status ?? 500).json({ error: error?.message ?? 'Failed to fetch ticket' });
    }
});

router.post('/:id/notify-group', async (req, res) => {
    try {
        const companyId = getCompanyId(req);
        const settings = await prisma.settings.findUnique({
            where: { companyId },
            select: { externalServiceGroupId: true, externalServiceGroupName: true },
        });
        if (!settings?.externalServiceGroupId) {
            return res.status(400).json({ error: 'Grupo de avisos de atendimento externo nÃ£o configurado.' });
        }

        const ticket = await prisma.ticket.findFirst({
            where: { id: req.params.id, ...companyScope(req), ...userTicketScope(req) },
            include: {
                contact: { include: { business: true, customer: true } },
                customer: true,
                assignedUser: true,
                department: true,
                fieldService: { include: { technician: true } },
            },
        });
        if (!ticket) return res.status(404).json({ error: 'Ticket not found' });

        const body = formatTicketGroupMessage(ticket);
        const sent = await sendTextWithOutbox({
            companyId,
            toPhone: settings.externalServiceGroupId,
            body,
        });

        await prisma.ticketTimeline.create({
            data: {
                companyId,
                ticketId: ticket.id,
                type: 'MESSAGE',
                actorUserId: req.user?.id,
                payload: {
                    action: 'EXTERNAL_SERVICE_GROUP_NOTIFIED',
                    groupId: settings.externalServiceGroupId,
                    groupName: settings.externalServiceGroupName,
                    outboxId: sent.outboxId,
                    waMessageId: sent.waMessageId,
                },
            },
        });

        res.json({
            ok: true,
            groupId: settings.externalServiceGroupId,
            groupName: settings.externalServiceGroupName,
            outboxId: sent.outboxId,
            waMessageId: sent.waMessageId,
        });
    } catch (error: any) {
        res.status(error?.status ?? 500).json({ error: error?.message ?? 'Failed to notify group' });
    }
});

router.patch('/:id/customer-info', async (req, res) => {
    try {
        const companyId = getCompanyId(req);
        const parsed = CustomerInfoSchema.safeParse(req.body);
        if (!parsed.success) {
            return res.status(400).json({ error: 'Dados invalidos', details: parsed.error.issues });
        }

        const existing = await prisma.ticket.findFirst({
            where: { id: req.params.id, ...companyScope(req), ...userTicketScope(req) },
            include: {
                contact: { include: { business: true, customer: true } },
                customer: true,
            },
        });
        if (!existing) return res.status(404).json({ error: 'Ticket not found' });

        const { customerName, customerDocument, contactName, contactPhone, businessName, businessCnpj } = parsed.data;
        const hasBusinessData = Boolean((businessName && businessName.trim()) || businessCnpj);
        const hasCustomerData = Boolean(customerName || customerDocument !== undefined);
        const hasChanges = Boolean(hasCustomerData || contactName || contactPhone || hasBusinessData);
        if (!hasChanges) return res.status(400).json({ error: 'Nenhum dado de cliente foi informado.' });

        const updated = await prisma.$transaction(async (tx) => {
            let customerId = existing.customerId || existing.contact.customerId || null;
            let businessId = existing.contact.businessId || null;

            if (!customerId && (hasCustomerData || hasBusinessData)) {
                const createdCustomer = await tx.customer.create({
                    data: {
                        companyId,
                        name: customerName || existing.contact.name || existing.contact.phone || 'Cliente sem nome',
                        document: customerDocument || null,
                        status: 'ATIVO',
                    },
                    select: { id: true },
                });
                customerId = createdCustomer.id;
            }

            if (customerId && hasCustomerData) {
                await tx.customer.updateMany({
                    where: { id: customerId, companyId },
                    data: {
                        ...(customerName ? { name: customerName } : {}),
                        ...(customerDocument !== undefined ? { document: customerDocument || null } : {}),
                    },
                });
            }

            if (customerId && hasBusinessData) {
                if (businessId) {
                    const currentBusiness = await tx.customerBusiness.findFirst({
                        where: { id: businessId, companyId, customerId },
                        select: { id: true, name: true, cnpj: true },
                    });
                    if (currentBusiness) {
                        await tx.customerBusiness.update({
                            where: { id: currentBusiness.id },
                            data: {
                                name: businessName || currentBusiness.name,
                                ...(businessCnpj ? { cnpj: businessCnpj } : {}),
                            },
                        });
                    }
                } else if (businessCnpj) {
                    const createdBusiness = await tx.customerBusiness.create({
                        data: {
                            companyId,
                            customerId,
                            name: businessName || customerName || existing.customer?.name || existing.contact.name || 'Empresa',
                            cnpj: businessCnpj,
                        },
                        select: { id: true },
                    });
                    businessId = createdBusiness.id;
                }
            }

            if (contactPhone && contactPhone !== existing.contact.phone) {
                const duplicated = await tx.contact.findFirst({
                    where: {
                        id: { not: existing.contactId },
                        phone: { in: phoneAliases(contactPhone) },
                        companyId,
                    },
                    select: { id: true },
                });
                if (duplicated) throw Object.assign(new Error('Telefone/WhatsApp ja cadastrado em outro contato.'), { status: 409 });
            }

            await tx.contact.update({
                where: { id: existing.contactId },
                data: {
                    ...(contactName ? { name: contactName } : {}),
                    ...(contactPhone ? { phone: contactPhone } : {}),
                    ...(customerId ? { customerId } : {}),
                    ...(businessId !== existing.contact.businessId ? { businessId } : {}),
                },
            });

            if (customerId && customerId !== existing.customerId) {
                await tx.ticket.update({
                    where: { id: existing.id },
                    data: { customerId },
                });
            }

            await tx.ticketTimeline.create({
                data: {
                    companyId,
                    ticketId: existing.id,
                    type: 'NOTE',
                    actorUserId: req.user?.id,
                    payload: { action: 'CUSTOMER_INFO_UPDATED' },
                },
            });

            return tx.ticket.findUnique({
                where: { id: existing.id },
                include: { ...ticketInclude, timeline: { orderBy: { createdAt: 'desc' } } },
            });
        });

        emitToCompany(companyId, 'ticket:updated', updated);
        res.json(updated);
    } catch (error: any) {
        if (error?.code === 'P2002') {
            return res.status(409).json({ error: 'Este CNPJ ja esta vinculado a outro cliente.' });
        }
        res.status(error?.status ?? 500).json({ error: error?.message ?? 'Failed to update customer info' });
    }
});

// CRIAR (gera protocolo + opcional field service + timeline)
router.post('/', async (req, res) => {
    try {
        const companyId = getCompanyId(req);
        const parsed = CreateTicketSchema.safeParse(req.body);
        if (!parsed.success) {
            return res.status(400).json({ error: 'Dados inválidos', details: parsed.error.issues });
        }
        const { contactId, customerId, conversationId, title, description, category, channel, priority, departmentId, assignedUserId, notesInternal } = parsed.data;
        const { has: hasFS, fs } = extractFieldService(parsed.data);
        await assertTenantReferences(companyId, {
            contactId,
            customerId,
            conversationId,
            departmentId,
            assignedUserId,
            technicianId: parsed.data.technicianId,
        });

        const ticket = await prisma.$transaction(async (tx) => {
            const protocol = await generateProtocol(companyId, tx);
            const created = await tx.ticket.create({
                data: {
                    companyId,
                    protocol,
                    contactId,
                    customerId: customerId ?? undefined,
                    conversationId: conversationId ?? undefined,
                    title,
                    description,
                    category,
                    channel: channel ?? TicketChannel.WHATSAPP,
                    priority,
                    status: TicketStatus.NEW,
                    departmentId: departmentId ?? undefined,
                    assignedUserId: assignedUserId ?? undefined,
                    notesInternal,
                },
            });
            if (hasFS) {
                await tx.ticketFieldService.create({ data: { companyId, ticketId: created.id, ...fs } });
            }
            await tx.ticketTimeline.create({
                data: { companyId, ticketId: created.id, type: 'CREATED', actorUserId: req.user?.id, payload: { protocol } },
            });
            return tx.ticket.findUnique({ where: { id: created.id }, include: ticketInclude });
        });

        if (ticket?.fieldService?.technicianId) {
            await notifyFieldVisitAssigned({
                companyId,
                technicianId: ticket.fieldService.technicianId,
                ticketId: ticket.id,
                protocol: ticket.protocol,
                title: ticket.title,
                scheduledAt: ticket.fieldService.scheduledAt,
            });
        }
        if (ticket?.assignedUserId) {
            await notifyTicketAssigned({
                companyId,
                userId: ticket.assignedUserId,
                ticketId: ticket.id,
                protocol: ticket.protocol,
                title: ticket.title,
                priority: ticket.priority,
            });
        }

        emitToCompany(companyId, 'ticket:new', ticket);
        res.status(201).json(ticket);
    } catch (error: any) {
        res.status(error?.status ?? 500).json({ error: error?.message ?? 'Failed to create ticket' });
    }
});

// ATUALIZAR (valida transição de status; field service via upsert; timeline)
router.patch('/:id', async (req, res) => {
    try {
        const companyId = getCompanyId(req);
        const parsed = UpdateTicketSchema.safeParse(req.body);
        if (!parsed.success) {
            return res.status(400).json({ error: 'Dados inválidos', details: parsed.error.issues });
        }

        const existing = await prisma.ticket.findFirst({
            where: { id: req.params.id, ...companyScope(req) },
            include: { fieldService: true, conversation: { select: { assignedUserId: true } } },
        });
        if (!existing) return res.status(404).json({ error: 'Ticket not found' });
        const requestedFields = Object.keys(parsed.data).filter((field) => parsed.data[field as keyof typeof parsed.data] !== undefined);
        if (requestedFields.length === 0) {
            return res.status(400).json({ error: 'Nenhum campo foi informado para atualização.' });
        }
        if (!canUpdateTicketFields(req, existing, requestedFields)) {
            return res.status(403).json({ error: 'Você não tem permissão para alterar estes campos do chamado.' });
        }

        const { status, priority, assignedUserId, departmentId, title, description, category, notesInternal, scheduleChangeReason } = parsed.data;
        const { has: hasFS, fs } = extractFieldService(parsed.data);
        await assertTenantReferences(companyId, {
            departmentId,
            assignedUserId,
            technicianId: parsed.data.technicianId,
        });

        const scheduledAtWasProvided = parsed.data.scheduledAt !== undefined;
        const previousScheduledAt = existing.fieldService?.scheduledAt ?? null;
        const nextScheduledAt = scheduledAtWasProvided ? toDate(parsed.data.scheduledAt) : previousScheduledAt;
        const scheduleChanged = scheduledAtWasProvided
            && (previousScheduledAt?.getTime() ?? null) !== (nextScheduledAt?.getTime() ?? null);
        const previousTechnicianId = existing.fieldService?.technicianId ?? null;
        const nextTechnicianId = parsed.data.technicianId !== undefined ? parsed.data.technicianId : previousTechnicianId;
        const technicianChanged = parsed.data.technicianId !== undefined && previousTechnicianId !== nextTechnicianId;
        const previousFieldVisitStatus = existing.fieldService?.status ?? null;
        const nextFieldVisitStatus = parsed.data.fieldVisitStatus !== undefined
            ? parsed.data.fieldVisitStatus
            : previousFieldVisitStatus;
        const fieldVisitStatusChanged = parsed.data.fieldVisitStatus !== undefined && previousFieldVisitStatus !== nextFieldVisitStatus;

        if (scheduleChanged && !scheduleChangeReason?.trim()) {
            return res.status(400).json({ error: 'Informe o motivo da alteração de agenda' });
        }

        const data: any = {};
        if (status && status !== existing.status) {
            assertTransition(existing.status, status, { isAdmin: req.user?.role === 'ADMIN' });
            data.status = status;
            if (status === TicketStatus.RESOLVED) data.solvedAt = new Date();
            if (status === TicketStatus.CLOSED) data.closedAt = new Date();
        }
        if (priority) data.priority = priority;
        if (assignedUserId !== undefined) data.assignedUserId = assignedUserId;
        if (departmentId !== undefined) data.departmentId = departmentId;
        if (title) data.title = title;
        if (description !== undefined) data.description = description;
        if (category !== undefined) data.category = category;
        if (notesInternal !== undefined) data.notesInternal = notesInternal;

        const ticket = await prisma.$transaction(async (tx) => {
            await tx.ticket.update({ where: { id: existing.id }, data });
            if (hasFS) {
                const fieldService = await tx.ticketFieldService.upsert({
                    where: { ticketId: existing.id },
                    create: { companyId, ticketId: existing.id, ...fs },
                    update: fs,
                });
                if (scheduleChanged) {
                    await tx.fieldVisitScheduleChange.create({
                        data: {
                            companyId,
                            fieldServiceId: fieldService.id,
                            changedByUserId: req.user?.id,
                            previousScheduledAt,
                            newScheduledAt: nextScheduledAt,
                            reason: scheduleChangeReason!.trim(),
                        },
                    });
                    await tx.ticketTimeline.create({
                        data: {
                            companyId,
                            ticketId: existing.id,
                            type: 'FIELD_SERVICE',
                            actorUserId: req.user?.id,
                            payload: {
                                action: 'SCHEDULE_CHANGED',
                                previousScheduledAt,
                                newScheduledAt: nextScheduledAt,
                                reason: scheduleChangeReason!.trim(),
                            },
                        },
                    });
                }
            }
            if (data.status) {
                await tx.ticketTimeline.create({
                    data: { companyId, ticketId: existing.id, type: 'STATUS_CHANGE', actorUserId: req.user?.id, payload: { from: existing.status, to: data.status } },
                });
            }
            if (assignedUserId !== undefined && assignedUserId !== existing.assignedUserId) {
                await tx.ticketTimeline.create({
                    data: { companyId, ticketId: existing.id, type: 'ASSIGNMENT', actorUserId: req.user?.id, payload: { assignedUserId } },
                });
            }
            return tx.ticket.findUnique({ where: { id: existing.id }, include: ticketInclude });
        });

        if (ticket?.fieldService?.technicianId && technicianChanged) {
            await notifyFieldVisitAssigned({
                companyId,
                technicianId: ticket.fieldService.technicianId,
                ticketId: ticket.id,
                protocol: ticket.protocol,
                title: ticket.title,
                scheduledAt: ticket.fieldService.scheduledAt,
            });
        }

        if (ticket?.fieldService?.technicianId && scheduleChanged) {
            await notifyFieldVisitScheduleChanged({
                companyId,
                technicianId: ticket.fieldService.technicianId,
                ticketId: ticket.id,
                protocol: ticket.protocol,
                title: ticket.title,
                previousScheduledAt,
                newScheduledAt: nextScheduledAt,
                reason: scheduleChangeReason!.trim(),
            });
        }

        if (ticket?.fieldService?.technicianId && nextFieldVisitStatus && fieldVisitStatusChanged) {
            await notifyFieldVisitStatusChanged({
                companyId,
                technicianId: ticket.fieldService.technicianId,
                ticketId: ticket.id,
                protocol: ticket.protocol,
                title: ticket.title,
                previousStatus: previousFieldVisitStatus,
                newStatus: nextFieldVisitStatus,
            });
        }
        if (assignedUserId !== undefined && assignedUserId !== existing.assignedUserId && ticket?.assignedUserId) {
            await notifyTicketAssigned({
                companyId,
                userId: ticket.assignedUserId,
                ticketId: ticket.id,
                protocol: ticket.protocol,
                title: ticket.title,
                priority: ticket.priority,
            });
        }

        emitToCompany(companyId, 'ticket:updated', ticket);
        res.json(ticket);
    } catch (error: any) {
        res.status(error?.status ?? 500).json({ error: error?.message ?? 'Failed to update ticket' });
    }
});

// AVALIAÇÃO (CSAT) — ADR-03
router.post('/:id/evaluation', async (req, res) => {
    try {
        const companyId = getCompanyId(req);
        const rating = Number(req.body?.rating);
        if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
            return res.status(400).json({ error: 'rating deve ser inteiro entre 1 e 5' });
        }
        const existing = await prisma.ticket.findFirst({
            where: { id: req.params.id, ...companyScope(req), ...userTicketScope(req) },
        });
        if (!existing) return res.status(404).json({ error: 'Ticket not found' });

        const evaluation = await prisma.ticketEvaluation.upsert({
            where: { ticketId: existing.id },
            create: { companyId, ticketId: existing.id, rating, comment: req.body?.comment ?? null },
            update: { rating, comment: req.body?.comment ?? null },
        });
        await prisma.ticketTimeline.create({
            data: { companyId, ticketId: existing.id, type: 'EVALUATION', actorUserId: req.user?.id, payload: { rating } },
        });
        res.status(201).json(evaluation);
    } catch (error: any) {
        res.status(error?.status ?? 500).json({ error: error?.message ?? 'Failed to save evaluation' });
    }
});

export default router;
