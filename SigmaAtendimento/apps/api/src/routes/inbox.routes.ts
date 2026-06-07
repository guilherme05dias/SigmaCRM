import { Router } from 'express';
import { ConversationStatus, MessageDirection, MessageType, TicketPriority, TicketStatus, ServiceType } from '@prisma/client';
import { getIO, emitToCompany } from '../socket';
import { authMiddleware } from '../middlewares/auth.middleware';
import { getCompanyId } from '../lib/tenant';
import { generateProtocol } from '../services/protocol.service';
import { prisma } from '../lib/prisma';
import { sendTextWithOutbox } from '../services/whatsappOutbox.service';
import { z } from 'zod';

const router = Router();

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
    visitWindowStart: z.string().datetime().optional().nullable(),
    visitWindowEnd: z.string().datetime().optional().nullable(),
    technicianId: z.string().uuid().optional().nullable(),
    notesInternal: z.string().optional().nullable(),
});

router.use(authMiddleware);

// List conversations (with optional filters)
router.get('/conversations', async (req, res) => {
    try {
        const { status, assignedUserId, departmentId } = req.query;
        const companyId = getCompanyId(req);

        const where: any = { companyId };
        if (status) where.status = status;
        if (assignedUserId) {
            where.assignedUserId = assignedUserId === 'unassigned' ? null : assignedUserId;
        }
        if (departmentId) where.departmentId = departmentId;

        const conversations = await prisma.conversation.findMany({
            where,
            orderBy: { updatedAt: 'desc' },
            include: {
                contact: true,
                assignedUser: { select: { id: true, name: true, email: true } },
                department: true,
                messages: {
                    orderBy: { createdAt: 'desc' },
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
            where: { id: req.params.id, companyId },
            select: { id: true },
        });
        if (!conversation) return res.status(404).json({ error: 'Conversation not found' });

        const messages = await prisma.message.findMany({
            take: take + 1, // fetch one more to check if there is a next page
            where: { conversationId: req.params.id, companyId },
            ...(cursor && { skip: 1, cursor: { id: cursor } }),
            orderBy: { createdAt: 'desc' }, // Order descending to get the latest messages
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
            select: { id: true },
        });
        if (!currentConversation) {
            return res.status(404).json({ error: 'Conversation not found' });
        }
        if (userId) {
            const user = await prisma.user.findFirst({ where: { id: userId, companyId }, select: { id: true } });
            if (!user) return res.status(404).json({ error: 'Usuário não encontrado nesta empresa' });
        }
        if (departmentId) {
            const department = await prisma.department.findFirst({ where: { id: departmentId, companyId }, select: { id: true } });
            if (!department) return res.status(404).json({ error: 'Departamento não encontrado nesta empresa' });
        }
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
        
        const companyId = getCompanyId(req);
        const currentConversation = await prisma.conversation.findFirst({
            where: { id: conversationId, companyId },
            include: { contact: true },
        });
        if (!currentConversation) {
            return res.status(404).json({ error: 'Conversation not found' });
        }

        const closedAt = new Date();
        let totalHandleTimeSeconds = null;
        if (currentConversation.startedAt) {
            totalHandleTimeSeconds = Math.floor((closedAt.getTime() - currentConversation.startedAt.getTime()) / 1000);
        }

        const conversation = await prisma.conversation.update({
            where: { id: conversationId },
            data: { 
                status: ConversationStatus.CLOSED,
                closedAt,
                totalHandleTimeSeconds
             },
            include: { contact: true, assignedUser: true, department: true }
        });

        emitToCompany(conversation.companyId, 'conversation:updated', conversation);

        // Fetch settings for closing message
        const settings = await prisma.settings.findUnique({ where: { companyId } });
        if (settings && settings.closingMessage) {
            const systemMsg = await prisma.message.create({
                data: {
                    companyId,
                    conversationId,
                    direction: MessageDirection.SYSTEM,
                    type: MessageType.TEXT,
                    body: settings.closingMessage
                }
            });
            getIO().to(`conversation:${conversationId}`).emit('message:new', systemMsg);

            try {
                await sendTextWithOutbox({
                    companyId,
                    conversationId,
                    messageId: systemMsg.id,
                    toPhone: conversation.contact.phone,
                    body: settings.closingMessage,
                });
            } catch (err) {
                console.error('Error sending closing message via provider:', err);
            }
        }
        res.json(conversation);
    } catch (error) {
        console.error('Error closing conversation:', error);
        res.status(500).json({ error: 'Failed to close conversation' });
    }
});

// Send new message
router.post('/conversations/:id/messages', async (req, res) => {
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
            visitAddress, visitWindowStart, visitWindowEnd,
            technicianId, notesInternal
        } = parsed.data;

        const conversation = await prisma.conversation.findFirst({
            where: { id: conversationId, companyId }
        });

        if (!conversation || conversation.companyId !== companyId) {
            return res.status(404).json({ error: 'Conversation not found' });
        }

        const hasFieldService = !!(technicianId || visitAddress || visitWindowStart || visitWindowEnd || equipment || serviceType);
        if (customerId) {
            const customer = await prisma.customer.findFirst({ where: { id: customerId, companyId }, select: { id: true } });
            if (!customer) return res.status(404).json({ error: 'Cliente não encontrado nesta empresa' });
        }
        if (technicianId) {
            const technician = await prisma.user.findFirst({ where: { id: technicianId, companyId }, select: { id: true } });
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
                    status: TicketStatus.NEW,
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
                        equipment: equipment ?? undefined,
                        onSiteRequired: true,
                        visitAddress: visitAddress ?? undefined,
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

        res.status(201).json(ticket);
    } catch (error) {
        console.error('Error creating ticket from conversation:', error);
        res.status(500).json({ error: 'Failed to create ticket' });
    }
});

export default router;
