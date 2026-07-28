import { Router } from 'express';
import { ConversationCloseMode, ConversationStatus, FieldVisitStatus, MessageDirection, MessageType, TicketPriority, TicketStatus, ServiceType } from '@prisma/client';
import { getIO, emitToCompany } from '../socket';
import { authMiddleware } from '../middlewares/auth.middleware';
import { canViewAll } from '../middlewares/authorization.middleware';
import { getCompanyId } from '../lib/tenant';
import { generateProtocol } from '../services/protocol.service';
import { prisma } from '../lib/prisma';
import { sendTextWithOutbox } from '../services/whatsappOutbox.service';
import { notifyConversationTransferred, notifyFieldVisitAssigned } from '../services/notification.service';
import { rateLimit } from '../middlewares/rateLimit.middleware';
import { cancelConversationFallback } from '../services/conversationFallback.service';
import { z } from 'zod';
import { getWhatsAppProvider } from '../whatsapp';
import { formatContactDisplayName } from '../lib/contactDisplayName';
import { getConversationClosureBehavior } from '../services/conversationClosure.service';

const router = Router();
const whatsappProvider = getWhatsAppProvider();

function conversationScope(req: any) {
    const requestedScope = req.query?.scope === 'mine' ? 'mine' : 'all';
    if (canViewAll(req.user?.role) && requestedScope === 'all') return {};
    const userId = req.user?.id;
    if (!userId) return { id: '__NO_USER__' };

    return {
        OR: [
            { status: ConversationStatus.OPEN },
            { assignedUserId: userId },
        ],
    };
}

function canOperateConversation(req: any, conversation: { assignedUserId?: string | null }) {
    if (canViewAll(req.user?.role)) return true;
    return Boolean(req.user?.id && conversation.assignedUserId === req.user.id);
}

const GetMessagesSchema = z.object({
    take: z.string().optional().transform(v => v ? parseInt(v, 10) : 50),
    cursor: z.string().optional()
});

const TakeConversationSchema = z.object({
    userId: z.string().uuid()
});

const TransferConversationSchema = z.object({
    userId: z.string().uuid().optional(),
    departmentId: z.string().uuid().optional()
});

const SendMessageSchema = z.object({
    body: z.string().optional(),
    type: z.nativeEnum(MessageType).optional(),
    mediaUrl: z.string().optional()
}).refine(data => data.body || data.mediaUrl, {
    message: "Message body or mediaUrl is required"
});

const CreateTicketFromConvSchema = z.object({
    title: z.string().min(1),
    description: z.string().optional().nullable(),
    priority: z.nativeEnum(TicketPriority),
    customerId: z.string().uuid().optional().nullable(),
    // campos de execução -> TicketFieldService
    serviceType: z.nativeEnum(ServiceType).optional(),
    equipment: z.string().optional().nullable(),
    visitAddress: z.string().optional().nullable(),
    scheduledAt: z.string().datetime().optional().nullable(),
    visitWindowStart: z.string().datetime().optional().nullable(),
    visitWindowEnd: z.string().datetime().optional().nullable(),
    technicianId: z.string().uuid().optional().nullable(),
    notesInternal: z.string().optional().nullable(),
});

const CloseConversationSchema = z.object({
    result: z.string().trim().min(1),
    summary: z.string().trim().min(1),
    serviceTopicId: z.string().uuid(),
    customerBusinessId: z.string().uuid().optional().nullable(),
    otherTopicDescription: z.string().trim().optional().nullable(),
    notes: z.string().trim().optional().nullable(),
    fieldServiceRequired: z.boolean().optional(),
    closureMode: z.nativeEnum(ConversationCloseMode).optional(),
    sendSatisfactionSurvey: z.boolean().optional(),
});

router.use(authMiddleware);

// List conversations (with optional filters)
router.get('/conversations', async (req, res) => {
    try {
        const { status, assignedUserId, departmentId } = req.query;
        const companyId = getCompanyId(req);

        const where: any = { companyId, ...conversationScope(req) };
        if (status) where.status = status;
        if (assignedUserId) {
            where.assignedUserId = assignedUserId === 'unassigned' ? null : assignedUserId;
        }
        if (departmentId) where.departmentId = departmentId;

        const conversations = await prisma.conversation.findMany({
            where,
            orderBy: [{ lastMessageAt: 'desc' }, { id: 'desc' }],
            include: {
                contact: true,
                assignedUser: { select: { id: true, name: true, email: true } },
                department: true,
                serviceTopic: true,
                messages: {
                    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
                    take: 1 // Only load last message for snippet
                }
            }
        });

        res.json(conversations);
    } catch (error) {
        console.error('Error fetching conversations:', error);
        res.status(500).json({ error: 'Failed to fetch conversations' });
    }
});

// List ALL messages of a specific conversation
router.get('/conversations/:id/messages', async (req, res) => {
    try {
        const companyId = getCompanyId(req);
        const parsed = GetMessagesSchema.safeParse(req.query);
        if (!parsed.success) {
            return res.status(400).json({ error: 'Parâmetros inválidos', details: parsed.error.issues });
        }
        const { take, cursor } = parsed.data;

        const conversation = await prisma.conversation.findFirst({
            where: { id: req.params.id, companyId, ...conversationScope(req) },
            select: { id: true },
        });
        if (!conversation) return res.status(404).json({ error: 'Conversation not found' });

        const messages = await prisma.message.findMany({
            take: take + 1, // fetch one more to check if there is a next page
            where: { conversationId: req.params.id, companyId },
            ...(cursor && { skip: 1, cursor: { id: cursor } }),
            orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], // Order descending to get the latest messages
            include: {
                user: {
                    select: {
                        id: true,
                        name: true,
                        role: true,
                        department: { select: { name: true } }
                    }
                }
            }
        });

        let hasMore = false;
        if (messages.length > take) {
            hasMore = true;
            messages.pop(); // Remove the extra record
        }

        messages.reverse(); // Reverse back to chronological order for the client

        res.json({ messages, hasMore, nextCursor: hasMore ? messages[0].id : null });
    } catch (error) {
        console.error('Error fetching messages:', error);
        res.status(500).json({ error: 'Failed to fetch messages' });
    }
});

// Take conversation (Assign to user)
router.post('/conversations/:id/take', async (req, res) => {
    try {
        const companyId = getCompanyId(req);
        const parsed = TakeConversationSchema.safeParse(req.body);
        if (!parsed.success) return res.status(400).json({ error: 'Dados inválidos', details: parsed.error.issues });
        const { userId } = parsed.data;

        const currentConversation = await prisma.conversation.findFirst({ where: { id: req.params.id, companyId } });
        if (!currentConversation) {
            return res.status(404).json({ error: 'Conversation not found' });
        }
        const user = await prisma.user.findFirst({ where: { id: userId, companyId }, select: { id: true } });
        if (!user) return res.status(404).json({ error: 'Usuário não encontrado nesta empresa' });
        if (!canViewAll(req.user?.role) && userId !== req.user?.id) {
            return res.status(403).json({ error: 'Você só pode assumir atendimento para você mesmo' });
        }

        const dataToUpdate: any = {
            assignedUserId: userId,
            status: ConversationStatus.ASSIGNED
        };

        if (!currentConversation.startedAt) {
            dataToUpdate.startedAt = new Date();
        }

        const conversation = await prisma.conversation.update({
            where: { id: req.params.id },
            data: dataToUpdate,
            include: { contact: true, assignedUser: true, department: true }
        });
        cancelConversationFallback(conversation.id);
        emitToCompany(conversation.companyId, 'conversation:updated', conversation);
        res.json(conversation);
    } catch (error) {
        console.error('Error taking conversation:', error);
        res.status(500).json({ error: 'Failed to take conversation' });
    }
});

// Transfer conversation
router.post('/conversations/:id/transfer', async (req, res) => {
    try {
        const companyId = getCompanyId(req);
        const parsed = TransferConversationSchema.safeParse(req.body);
        if (!parsed.success) return res.status(400).json({ error: 'Dados inválidos', details: parsed.error.issues });
        const { userId, departmentId } = parsed.data;
        const currentConversation = await prisma.conversation.findFirst({
            where: { id: req.params.id, companyId },
            select: {
                id: true,
                assignedUserId: true,
                status: true,
                contact: { select: { name: true, phone: true } },
            },
        });
        if (!currentConversation) {
            return res.status(404).json({ error: 'Conversation not found' });
        }
        if ((currentConversation as any).status === ConversationStatus.CLOSED) {
            return res.status(409).json({ error: 'Conversa encerrada não pode ser transferida' });
        }
        if (!canOperateConversation(req, currentConversation)) {
            return res.status(403).json({ error: 'Você não tem permissão para transferir esta conversa' });
        }
        if (userId) {
            const user = await prisma.user.findFirst({ where: { id: userId, companyId }, select: { id: true } });
            if (!user) return res.status(404).json({ error: 'Usuário não encontrado nesta empresa' });
        }
        if (departmentId) {
            const department = await prisma.department.findFirst({ where: { id: departmentId, companyId }, select: { id: true } });
            if (!department) return res.status(404).json({ error: 'Departamento não encontrado nesta empresa' });
        }
        const previousAssignedUserId = currentConversation.assignedUserId ?? null;
        const data: any = {};
        if (userId !== undefined) data.assignedUserId = userId;
        if (departmentId !== undefined) data.departmentId = departmentId;

        // Mark as transferred
        data.isTransferred = true;

        const conversation = await prisma.conversation.update({
            where: { id: req.params.id },
            data,
            include: { contact: true, assignedUser: true, department: true }
        });
        if (conversation.assignedUserId || conversation.departmentId || conversation.status !== ConversationStatus.OPEN) {
            cancelConversationFallback(conversation.id);
        }
        if (conversation.assignedUserId && conversation.assignedUserId !== previousAssignedUserId) {
            await notifyConversationTransferred({
                companyId,
                userId: conversation.assignedUserId,
                conversationId: conversation.id,
                contactName: conversation.contact?.name,
                contactPhone: conversation.contact?.phone,
                departmentName: conversation.department?.name,
            });
        }
        emitToCompany(conversation.companyId, 'conversation:updated', conversation);
        res.json(conversation);
    } catch (error) {
        console.error('Error transferring conversation:', error);
        res.status(500).json({ error: 'Failed to transfer conversation' });
    }
});

// Close conversation
router.post('/conversations/:id/close', async (req, res) => {
    try {
        const conversationId = req.params.id;
        const parsed = CloseConversationSchema.safeParse(req.body);

        if (!parsed.success) {
            return res.status(400).json({ error: 'Dados invalidos', details: parsed.error.issues });
        }
        
        const companyId = getCompanyId(req);
        const currentConversation = await prisma.conversation.findFirst({
            where: { id: conversationId, companyId },
            include: {
                contact: {
                    include: {
                        business: true,
                        customer: {
                            include: { businesses: { orderBy: { name: 'asc' } } },
                        },
                    },
                },
            },
        });
        if (!currentConversation) {
            return res.status(404).json({ error: 'Conversation not found' });
        }
        if (currentConversation.status === ConversationStatus.CLOSED) {
            return res.status(409).json({ error: 'Atendimento ja encerrado' });
        }
        if (!canOperateConversation(req, currentConversation)) {
            return res.status(403).json({ error: 'Você precisa estar responsável por esta conversa para finalizá-la' });
        }

        const serviceTopic = await prisma.serviceTopic.findFirst({
            where: { id: parsed.data.serviceTopicId, companyId, active: true },
            select: { id: true, name: true },
        });

        if (!serviceTopic) {
            return res.status(400).json({ error: 'Sistema/assunto invalido ou inativo' });
        }

        if (serviceTopic.name.trim().toLowerCase() === 'outro' && !parsed.data.otherTopicDescription?.trim()) {
            return res.status(400).json({ error: 'Informe a descricao quando o assunto for Outro' });
        }

        const customerBusinesses = currentConversation.contact.customer?.businesses ?? [];
        const selectedBusinessId = parsed.data.customerBusinessId || currentConversation.contact.businessId;
        const selectedBusiness = selectedBusinessId
            ? customerBusinesses.find((business) => business.id === selectedBusinessId)
            : null;

        if (selectedBusinessId && !selectedBusiness) {
            return res.status(400).json({ error: 'Empresa invalida para este cliente' });
        }
        if (customerBusinesses.length > 0 && !selectedBusiness) {
            return res.status(400).json({ error: 'Selecione a empresa atendida' });
        }

        const closeMode = parsed.data.closureMode
            ?? (parsed.data.sendSatisfactionSurvey === false ? ConversationCloseMode.INACTIVITY : ConversationCloseMode.WITH_RATING);
        if (closeMode === ConversationCloseMode.WITH_RATING && currentConversation.contact.includeInServiceReports === false) {
            return res.status(400).json({ error: 'A avaliação está desativada para este contato. Escolha outro modo de encerramento.' });
        }

        const settings = await prisma.settings.findUnique({ where: { companyId } });
        const closureBehavior = getConversationClosureBehavior({
            closeMode,
            includeInServiceReports: currentConversation.contact.includeInServiceReports !== false,
            closingMessage: settings?.closingMessage,
            inactivityClosingMessage: settings?.inactivityClosingMessage,
        });
        const closedAt = new Date();
        const shouldRequestSatisfaction = closureBehavior.shouldRequestSatisfaction;
        let totalHandleTimeSeconds = null;
        if (currentConversation.startedAt) {
            totalHandleTimeSeconds = Math.floor((closedAt.getTime() - currentConversation.startedAt.getTime()) / 1000);
        }

        const personName = currentConversation.contact.name?.trim() || currentConversation.contact.phone;
        const reportBusinessName = selectedBusiness?.name?.trim()
            || currentConversation.contact.customer?.name?.trim()
            || null;
        const customerName = formatContactDisplayName({
            personName,
            phone: currentConversation.contact.phone,
            companyName: reportBusinessName,
        });
        const systemName = serviceTopic.name.trim().toLowerCase() === 'outro'
            ? `Outro: ${parsed.data.otherTopicDescription?.trim()}`
            : serviceTopic.name;

        const conversation = await prisma.$transaction(async (tx) => {
            const updatedConversation = await tx.conversation.update({
                where: { id: conversationId },
                data: {
                    status: ConversationStatus.CLOSED,
                    closedAt,
                    totalHandleTimeSeconds,
                    closeResult: parsed.data.result,
                    closeSummary: parsed.data.summary,
                    closeNotes: parsed.data.notes || null,
                    closeMode,
                    ratingRequestedAt: shouldRequestSatisfaction ? closedAt : null,
                    serviceTopicId: serviceTopic.id,
                    otherTopicDescription: parsed.data.otherTopicDescription || null,
                    fieldServiceRequired: parsed.data.fieldServiceRequired ?? false,
                },
                include: { contact: true, assignedUser: true, department: true, serviceTopic: true },
            });

            await tx.conversationReport.create({
                data: {
                    companyId,
                    conversationId,
                    customerName,
                    businessName: reportBusinessName,
                    businessCnpj: selectedBusiness?.cnpj ?? null,
                    systemName,
                    summary: parsed.data.summary,
                    observation: parsed.data.notes || null,
                    closeMode,
                    closedAt,
                },
            });

            await tx.whatsAppOutbox.deleteMany({ where: { companyId, conversationId } });
            await tx.whatsAppInboundEvent.deleteMany({ where: { companyId, conversationId } });

            return updatedConversation;
        });
        cancelConversationFallback(conversation.id);

        // Encerramento e pesquisa de satisfação: a resposta numérica do cliente
        // será registrada pelo webhook no atendimento recém-fechado.
        const closingText = closureBehavior.closingText;
        if (closingText) {
            try {
                await whatsappProvider.sendText({
                    to: conversation.contact.phone,
                    body: closingText,
                });
            } catch (err) {
                console.error('Error sending closing message via provider:', err);
            }
        }

        emitToCompany(conversation.companyId, 'conversation:updated', { ...conversation, messages: [] });
        res.json(conversation);
    } catch (error) {
        console.error('Error closing conversation:', error);
        res.status(500).json({ error: 'Failed to close conversation' });
    }
});

// Send new message
router.post('/conversations/:id/messages', rateLimit(60_000, 60), async (req, res) => {
    try {
        const conversationId = req.params.id;
        const parsed = SendMessageSchema.safeParse(req.body);
        if (!parsed.success) return res.status(400).json({ error: 'Dados inválidos', details: parsed.error.issues });
        
        const { body, type, mediaUrl } = parsed.data;
        const authUserId = req.user?.id || null;
        const companyId = getCompanyId(req);

        const conversation = await prisma.conversation.findFirst({
            where: { id: conversationId, companyId },
            include: { contact: true }
        });

        if (!conversation) {
            return res.status(404).json({ error: 'Conversation not found' });
        }
        if (conversation.status === ConversationStatus.CLOSED) {
            return res.status(409).json({ error: 'Conversa encerrada não pode receber novas mensagens' });
        }
        if (!canOperateConversation(req, conversation)) {
            return res.status(403).json({ error: 'Você precisa assumir esta conversa antes de responder' });
        }

        const messageType = type || MessageType.TEXT;
        let waMessageId: string | undefined;
        let outboxId: string | undefined;

        try {
            if (messageType === MessageType.TEXT || !mediaUrl) {
                const response = await sendTextWithOutbox({
                    companyId,
                    conversationId,
                    toPhone: conversation.contact.phone,
                    body: body || '',
                });
                waMessageId = response.waMessageId;
                outboxId = response.outboxId;
            } else {
                return res.status(501).json({ error: 'Envio de mídia ainda não usa outbox nesta rota.' });
            }
        } catch (err) {
            console.error('Provider failed to send message:', err);
            return res.status(500).json({ error: 'Provider failed to send message' });
        }

        const message = await prisma.message.create({
            data: {
                companyId,
                conversationId,
                direction: MessageDirection.OUTBOUND,
                type: messageType,
                body,
                mediaUrl,
                waMessageId,
                userId: authUserId
            },
            include: {
                user: {
                    select: {
                        id: true,
                        name: true,
                        role: true,
                        department: { select: { name: true } }
                    }
                }
            }
        });
        if (outboxId) {
            await prisma.whatsAppOutbox.update({
                where: { id: outboxId },
                data: { messageId: message.id },
            });
        }

        await prisma.conversation.update({
            where: { id: conversationId },
            data: { lastMessageAt: new Date() }
        });

        getIO().to(`conversation:${conversationId}`).emit('message:new', message);
        emitToCompany(conversation.companyId, 'conversation:updated', conversation);

        res.status(201).json(message);
    } catch (error) {
        console.error('Error sending message:', error);
        res.status(500).json({ error: 'Failed to send message' });
    }
});

// Create ticket from conversation
router.post('/conversations/:id/tickets', async (req, res) => {
    try {
        const conversationId = req.params.id;
        const parsed = CreateTicketFromConvSchema.safeParse(req.body);
        if (!parsed.success) return res.status(400).json({ error: 'Dados inválidos', details: parsed.error.issues });
        
        const companyId = getCompanyId(req);
        const {
            title, description, priority, customerId, serviceType, equipment,
            visitAddress, scheduledAt, visitWindowStart, visitWindowEnd,
            technicianId, notesInternal
        } = parsed.data;

        const conversation = await prisma.conversation.findFirst({
            where: { id: conversationId, companyId }
        });

        if (!conversation || conversation.companyId !== companyId) {
            return res.status(404).json({ error: 'Conversation not found' });
        }
        if (conversation.status === ConversationStatus.CLOSED) {
            return res.status(409).json({ error: 'Conversa encerrada não pode gerar novo chamado' });
        }
        if (!canOperateConversation(req, conversation)) {
            return res.status(403).json({ error: 'Você precisa estar responsável por esta conversa para criar chamado' });
        }

        const hasFieldService = !!(technicianId || visitAddress || scheduledAt || visitWindowStart || visitWindowEnd || equipment || serviceType);
        if (customerId) {
            const customer = await prisma.customer.findFirst({ where: { id: customerId, companyId }, select: { id: true } });
            if (!customer) return res.status(404).json({ error: 'Cliente não encontrado nesta empresa' });
        }
        if (technicianId) {
            const technician = await prisma.user.findFirst({ where: { id: technicianId, companyId, role: 'TECHNICIAN', active: true }, select: { id: true } });
            if (!technician) return res.status(404).json({ error: 'Técnico não encontrado nesta empresa' });
        }

        const ticket = await prisma.$transaction(async (tx) => {
            const protocol = await generateProtocol(companyId, tx);
            const created = await tx.ticket.create({
                data: {
                    companyId,
                    protocol,
                    contactId: conversation.contactId,
                    customerId: customerId ?? undefined,
                    conversationId: conversation.id,
                    departmentId: conversation.departmentId ?? undefined,
                    title,
                    description,
                    priority,
                    status: hasFieldService ? TicketStatus.SCHEDULED_FIELD_SERVICE : TicketStatus.NEW,
                    notesInternal,
                },
            });
            if (hasFieldService) {
                await tx.ticketFieldService.create({
                    data: {
                        companyId,
                        ticketId: created.id,
                        technicianId: technicianId ?? undefined,
                        serviceType: serviceType ?? ServiceType.PRESENCIAL,
                        status: scheduledAt ? FieldVisitStatus.SCHEDULED : FieldVisitStatus.PENDING,
                        equipment: equipment ?? undefined,
                        onSiteRequired: true,
                        visitAddress: visitAddress ?? undefined,
                        scheduledAt: scheduledAt ? new Date(scheduledAt) : undefined,
                        visitWindowStart: visitWindowStart ? new Date(visitWindowStart) : undefined,
                        visitWindowEnd: visitWindowEnd ? new Date(visitWindowEnd) : undefined,
                    },
                });
            }
            await tx.ticketTimeline.create({
                data: { companyId, ticketId: created.id, type: 'CREATED', actorUserId: req.user?.id, payload: { protocol, from: 'conversation' } },
            });
            return tx.ticket.findUnique({
                where: { id: created.id },
                include: { contact: true, department: true, fieldService: { include: { technician: true } } },
            });
        });

        emitToCompany(companyId, 'ticket:new', ticket);
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

        res.status(201).json(ticket);
    } catch (error) {
        console.error('Error creating ticket from conversation:', error);
        res.status(500).json({ error: 'Failed to create ticket' });
    }
});

export default router;
