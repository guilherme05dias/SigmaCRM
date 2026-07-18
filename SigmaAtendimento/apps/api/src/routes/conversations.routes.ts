import { Router, Request, Response } from 'express';
import { ConversationStatus, MessageDirection, MessageType } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { getWhatsAppProvider } from '../whatsapp';
import { getIO, emitToCompany } from '../socket';
import { authMiddleware } from '../middlewares/auth.middleware';
import { canViewAll } from '../middlewares/authorization.middleware';
import { companyScope, getCompanyId } from '../lib/tenant';
import { rateLimit } from '../middlewares/rateLimit.middleware';
import { notifyConversationTransferred } from '../services/notification.service';
import { cancelConversationFallback } from '../services/conversationFallback.service';
import { sendMediaWithOutbox, sendTextWithOutbox } from '../services/whatsappOutbox.service';
import { getProviderUnreadCounts, setCachedProviderUnreadCount } from '../services/providerUnread.service';
import { normalizePhone, phoneAliases } from '../lib/phone';

const router = Router();
const MESSAGE_EDIT_WINDOW_MS = 15 * 60 * 1000;
const whatsappProvider = getWhatsAppProvider();

router.use(authMiddleware);

function conversationScope(req: Request) {
    const requestedScope = req.query.scope === 'mine' ? 'mine' : 'all';
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

type SignatureUser = {
    name?: string | null;
    messageSignature?: string | null;
    department?: { name?: string | null } | null;
};

function formatMessageSignature(user?: SignatureUser | null) {
    const name = user?.name?.trim();
    const configuredSignature = user?.messageSignature?.trim();
    if (configuredSignature?.includes('|')) return configuredSignature;
    const area = configuredSignature || user?.department?.name?.trim();
    return [name, area].filter(Boolean).join(' | ');
}

function canOperateConversation(req: Request, conversation: { assignedUserId?: string | null }) {
    if (canViewAll(req.user?.role)) return true;
    return Boolean(req.user?.id && conversation.assignedUserId === req.user.id);
}

router.get('/', async (req: Request, res: Response) => {
    try {
        const [conversations, providerUnreadCounts] = await Promise.all([
            prisma.conversation.findMany({
                where: { ...companyScope(req), ...conversationScope(req) },
                orderBy: [{ lastMessageAt: 'desc' }, { id: 'desc' }],
                include: {
                    contact: {
                        include: {
                            business: true,
                            customer: {
                                include: { businesses: { orderBy: { name: 'asc' } } },
                            },
                        },
                    },
                    assignedUser: { select: { id: true, name: true, email: true } },
                    department: { select: { id: true, name: true } },
                    serviceTopic: { select: { id: true, name: true } },
                    messages: {
                        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
                        take: 1, // Get the last message for preview
                        select: {
                            id: true,
                            direction: true,
                            type: true,
                            body: true,
                            createdAt: true,
                            waMessageId: true,
                            editedAt: true,
                            deletedAt: true,
                            deletedByCustomer: true,
                        },
                    },
                },
            }),
            getProviderUnreadCounts(whatsappProvider),
        ]);

        res.json(conversations.map((conversation) => {
            const phone = normalizePhone(conversation.contact.phone);
            return {
                ...conversation,
                unreadCount: providerUnreadCounts?.has(phone)
                    ? providerUnreadCounts.get(phone)
                    : conversation.unreadCount,
            };
        }));
    } catch (error) {
        res.status(500).json({ error: 'Erro ao buscar conversas' });
    }
});

router.post('/start', async (req: Request, res: Response) => {
    try {
        const { phone, name, departmentId } = req.body ?? {};
        const companyId = getCompanyId(req);
        const userId = req.user?.id;
        const normalizedInput = normalizePhone(String(phone || ''));

        if (!normalizedInput) {
            return res.status(400).json({ error: 'Informe o número do cliente.' });
        }

        const checkedContact = await whatsappProvider.checkContact(normalizedInput);

        if (!checkedContact.exists) {
            return res.status(404).json({
                error: 'Este número não possui WhatsApp.',
                phone: checkedContact.phone || normalizedInput,
                hasWhatsApp: false,
            });
        }

        const checkedPhone = normalizePhone(checkedContact.phone || normalizedInput);
        const resolvedName = checkedContact.name || name || null;
        const acceptedPhoneVariants = [...new Set([
            ...phoneAliases(normalizedInput),
            ...phoneAliases(checkedContact.phone || normalizedInput),
        ])];

        let contact = await prisma.contact.findFirst({
            where: { companyId, phone: { in: acceptedPhoneVariants } },
            orderBy: [
                { customerId: 'asc' },
                { createdAt: 'asc' },
            ],
        });

        if (departmentId) {
            const department = await prisma.department.findFirst({ where: { id: departmentId, companyId }, select: { id: true } });
            if (!department) return res.status(404).json({ error: 'Departamento não encontrado nesta empresa.' });
        }

        if (contact) {
            contact = await prisma.contact.update({
                where: { id: contact.id },
                data: {
                    companyId,
                    phone: checkedPhone,
                    ...(resolvedName && !contact.name ? { name: resolvedName } : {}),
                },
            });
        } else {
            contact = await prisma.contact.create({
                data: {
                    companyId,
                    phone: checkedPhone,
                    name: resolvedName,
                },
            });
        }

        const existingConversation = await prisma.conversation.findFirst({
            where: {
                companyId,
                contactId: contact.id,
                status: { in: ['OPEN', 'ASSIGNED'] },
            },
            orderBy: [{ lastMessageAt: 'desc' }, { id: 'desc' }],
            include: {
                contact: {
                    include: { business: true, customer: { include: { businesses: { orderBy: { name: 'asc' } } } } },
                },
                assignedUser: { select: { id: true, name: true, email: true } },
                department: { select: { id: true, name: true } },
                serviceTopic: { select: { id: true, name: true } },
                messages: {
                    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
                    take: 1,
                    select: {
                        id: true,
                        direction: true,
                        type: true,
                        body: true,
                        createdAt: true,
                        waMessageId: true,
                    },
                },
            },
        });

        if (existingConversation) {
            if (!canViewAll(req.user?.role) && existingConversation.assignedUserId && existingConversation.assignedUserId !== userId) {
                return res.status(409).json({ error: 'Este contato já está em atendimento com outro atendente.' });
            }

            if (!existingConversation.assignedUserId && userId) {
                const claimed = await prisma.conversation.update({
                    where: { id: existingConversation.id },
                    data: { assignedUserId: userId, status: ConversationStatus.ASSIGNED, assignedAt: new Date() },
                    include: {
                        contact: {
                            include: { business: true, customer: { include: { businesses: { orderBy: { name: 'asc' } } } } },
                        },
                        assignedUser: { select: { id: true, name: true, email: true } },
                        department: { select: { id: true, name: true } },
                        serviceTopic: { select: { id: true, name: true } },
                        messages: { orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 1, select: { id: true, direction: true, type: true, body: true, createdAt: true, waMessageId: true } },
                    },
                });
                emitToCompany(companyId, 'conversation:updated', claimed);
                return res.json({ conversation: claimed, created: false, hasWhatsApp: true });
            }

            return res.json({ conversation: existingConversation, created: false, hasWhatsApp: true });
        }

        let conversation;
        try {
            conversation = await prisma.conversation.create({
                data: {
                    companyId,
                    contactId: contact.id,
                    departmentId: departmentId || undefined,
                    assignedUserId: userId || undefined,
                    status: ConversationStatus.ASSIGNED,
                    assignedAt: new Date(),
                    startedAt: new Date(),
                    lastMessageAt: new Date(),
                },
                include: {
                    contact: {
                        include: {
                            business: true,
                            customer: {
                                include: { businesses: { orderBy: { name: 'asc' } } },
                            },
                        },
                    },
                    assignedUser: { select: { id: true, name: true, email: true } },
                    department: { select: { id: true, name: true } },
                    serviceTopic: { select: { id: true, name: true } },
                    messages: {
                        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
                        take: 1,
                        select: {
                            id: true,
                            direction: true,
                            type: true,
                            body: true,
                            createdAt: true,
                            waMessageId: true,
                        },
                    },
                },
            });
        } catch (error: any) {
            if (error?.code !== 'P2002') throw error;
            const concurrentConversation = await prisma.conversation.findFirst({
                where: { companyId, contactId: contact.id, status: { in: ['OPEN', 'ASSIGNED'] } },
                orderBy: [{ lastMessageAt: 'desc' }, { id: 'desc' }],
                include: {
                    contact: {
                        include: { business: true, customer: { include: { businesses: { orderBy: { name: 'asc' } } } } },
                    },
                    assignedUser: { select: { id: true, name: true, email: true } },
                    department: { select: { id: true, name: true } },
                    serviceTopic: { select: { id: true, name: true } },
                    messages: { orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 1 },
                },
            });
            if (!concurrentConversation) throw error;
            return res.json({ conversation: concurrentConversation, created: false, hasWhatsApp: true });
        }

        emitToCompany(companyId, 'conversation:new', conversation);
        emitToCompany(companyId, 'conversation:updated', conversation);
        res.status(201).json({ conversation, created: true, hasWhatsApp: true });
    } catch (error: any) {
        res.status(500).json({ error: error?.message || 'Erro ao iniciar conversa' });
    }
});

router.get('/:id/messages', async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const take = Math.max(1, Math.min(Number(req.query.take || 50), 100));
        const cursor = typeof req.query.cursor === 'string' ? req.query.cursor : undefined;
        const conversation = await prisma.conversation.findFirst({
            where: { id, ...companyScope(req), ...conversationScope(req) },
            select: { id: true },
        });

        if (!conversation) {
            return res.status(404).json({ error: 'Conversation not found' });
        }

        const messages = await prisma.message.findMany({
            where: { conversationId: id, ...companyScope(req) },
            orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
            take: take + 1,
            ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
            include: {
                user: {
                    select: {
                        id: true,
                        name: true,
                        role: true,
                        specialty: true,
                        department: { select: { name: true } },
                    },
                },
                replyToMessage: {
                    select: {
                        id: true,
                        direction: true,
                        type: true,
                        body: true,
                        mediaUrl: true,
                        waMessageId: true,
                        editedAt: true,
                        deletedAt: true,
                        deletedByCustomer: true,
                        createdAt: true,
                        user: {
                            select: {
                                id: true,
                                name: true,
                                role: true,
                                specialty: true,
                                department: { select: { name: true } },
                            },
                        },
                    },
                },
            },
        });
        const hasMore = messages.length > take;
        if (hasMore) messages.pop();

        const chronological = messages.reverse();
        res.json({
            data: chronological,
            meta: {
                hasMore,
                nextCursor: hasMore ? chronological[0]?.id ?? null : null,
            },
        });
    } catch (error) {
        res.status(500).json({ error: 'Erro ao buscar mensagens' });
    }
});

router.get('/:id/messages/:messageId/media', async (req: Request, res: Response) => {
    try {
        const { id, messageId } = req.params;
        const companyId = getCompanyId(req);
        const conversation = await prisma.conversation.findFirst({
            where: { id, companyId, ...conversationScope(req) },
            select: { id: true },
        });
        if (!conversation) return res.status(404).json({ error: 'Conversa não encontrada.' });

        const message = await prisma.message.findFirst({
            where: { id: messageId, conversationId: id, companyId },
            select: { type: true, waMessageId: true },
        });
        if (!message) return res.status(404).json({ error: 'Mensagem não encontrada.' });
        if (message.type === MessageType.TEXT || !message.waMessageId) {
            return res.status(409).json({ error: 'Esta mensagem não possui mídia disponível.' });
        }
        if (!whatsappProvider.downloadMedia) {
            return res.status(501).json({ error: 'O provedor atual não suporta download de mídia.' });
        }

        const media = await whatsappProvider.downloadMedia({ messageId: message.waMessageId });
        res.setHeader('Content-Type', media.contentType);
        res.setHeader('Content-Length', media.data.length);
        res.setHeader('Cache-Control', 'private, max-age=300');
        res.send(media.data);
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Não foi possível baixar a mídia.';
        res.status(502).json({ error: message });
    }
});

router.post('/:id/take', async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const userId = req.user?.id;
        const companyId = getCompanyId(req);

        // Check if conversation is available to take
        const currentConversation = await prisma.conversation.findFirst({
            where: { id, companyId },
            include: { contact: { select: { name: true, phone: true } } },
        });

        if (!currentConversation) {
            return res.status(404).json({ error: 'Conversation not found' });
        }

        if (currentConversation.status !== 'OPEN') {
            return res.status(409).json({ error: 'Conversa já foi assumida por outro agente ou está encerrada' });
        }

        const conversation = await prisma.conversation.update({
            where: { id },
            data: {
                assignedUserId: userId,
                status: 'ASSIGNED',
            },
            include: {
                contact: true,
                assignedUser: { select: { id: true, name: true, email: true } },
                department: { select: { id: true, name: true } },
                serviceTopic: { select: { id: true, name: true } },
                messages: {
                    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
                    take: 1,
                    select: {
                        id: true,
                        direction: true,
                        type: true,
                        body: true,
                        createdAt: true,
                        waMessageId: true,
                    },
                },
            }
        });
        cancelConversationFallback(conversation.id);

        emitToCompany(companyId, 'conversation:updated', conversation);

        res.json(conversation);
    } catch (error) {
        res.status(500).json({ error: 'Erro ao assumir conversa' });
    }
});

router.post('/:id/transfer', async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { departmentId, assignedUserId } = req.body;
        const companyId = getCompanyId(req);

        const currentConversation = await prisma.conversation.findFirst({
            where: { id, companyId }
        });

        if (!currentConversation) {
            return res.status(404).json({ error: 'Conversation not found' });
        }
        if (currentConversation.status === 'CLOSED') {
            return res.status(409).json({ error: 'Conversa encerrada nÃ£o pode ser transferida' });
        }
        if (!canOperateConversation(req, currentConversation)) {
            return res.status(403).json({ error: 'VocÃª nÃ£o tem permissÃ£o para transferir esta conversa' });
        }

        const previousAssignedUserId = currentConversation.assignedUserId ?? null;
        const updateData: any = {};

        if (departmentId !== undefined) {
            if (departmentId !== null) {
                const department = await prisma.department.findFirst({ where: { id: departmentId, companyId }, select: { id: true } });
                if (!department) return res.status(404).json({ error: 'Departamento não encontrado nesta empresa' });
            }
            updateData.departmentId = departmentId;
        }

        if (assignedUserId !== undefined) {
            if (assignedUserId !== null) {
                const user = await prisma.user.findFirst({ where: { id: assignedUserId, companyId }, select: { id: true } });
                if (!user) return res.status(404).json({ error: 'Usuário não encontrado nesta empresa' });
            }
            updateData.assignedUserId = assignedUserId;
            // Se estou atribuindo diretamente a alguém, já está IN_PROGRESS. Se estou jogando pra fila nula, pode voltar a NEW
            if (assignedUserId === null && currentConversation.status === 'ASSIGNED') {
                updateData.status = 'OPEN';
            } else if (assignedUserId !== null && currentConversation.status === 'OPEN') {
                updateData.status = 'ASSIGNED';
            }
        }

        const conversation = await prisma.conversation.update({
            where: { id },
            data: updateData,
            include: {
                contact: true,
                assignedUser: { select: { id: true, name: true, email: true } },
                department: { select: { id: true, name: true } },
                serviceTopic: { select: { id: true, name: true } },
                messages: {
                    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
                    take: 1,
                    select: {
                        id: true,
                        direction: true,
                        type: true,
                        body: true,
                        createdAt: true,
                        waMessageId: true,
                    },
                },
            }
        });
        if (conversation.assignedUserId || conversation.departmentId || conversation.status !== 'OPEN') {
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

        emitToCompany(companyId, 'conversation:updated', conversation);

        res.json(conversation);
    } catch (error) {
        res.status(500).json({ error: 'Erro ao transferir conversa' });
    }
});

router.post('/:id/read', async (req: Request, res: Response) => {
    try {
        if (req.header('x-sigma-read-source') !== 'conversation-open') {
            return res.status(400).json({ error: 'A conversa só pode ser marcada como lida quando for aberta pelo atendente.' });
        }
        const companyId = getCompanyId(req);
        const conversation = await prisma.conversation.findFirst({
            where: { id: req.params.id, companyId, ...conversationScope(req) },
            include: { contact: { select: { phone: true } } },
        });
        if (!conversation) return res.status(404).json({ error: 'Conversa não encontrada.' });
        if (conversation.unreadCount > 0) {
            console.info('[SIGMA] Conversa marcada como lida pelo atendente', {
                conversationId: conversation.id,
                unreadCount: conversation.unreadCount,
                userId: req.user?.id,
            });
        }
        const updatedConversation = await prisma.conversation.update({
            where: { id: conversation.id },
            data: { unreadCount: 0 },
            include: {
                contact: true,
                assignedUser: { select: { id: true, name: true, email: true } },
                department: { select: { id: true, name: true } },
                serviceTopic: { select: { id: true, name: true } },
                messages: {
                    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
                    take: 1,
                    select: {
                        id: true,
                        direction: true,
                        type: true,
                        body: true,
                        createdAt: true,
                        waMessageId: true,
                    },
                },
            },
        });

        if (whatsappProvider.markChatRead) {
            try {
                await whatsappProvider.markChatRead({ phone: conversation.contact.phone, read: true });
                setCachedProviderUnreadCount(conversation.contact.phone, 0);
            } catch (error) {
                console.warn('[SIGMA] Falha ao sincronizar leitura com o WhatsApp:', error);
            }
        }

        emitToCompany(companyId, 'conversation:updated', updatedConversation);
        return res.json(updatedConversation);
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Não foi possível marcar a conversa como lida.';
        return res.status(502).json({ error: message });
    }
});

router.post('/:id/messages/:messageId/react', async (req: Request, res: Response) => {
    try {
        const companyId = getCompanyId(req);
        const emoji = typeof req.body?.emoji === 'string' ? req.body.emoji.trim() : '';
        if (!emoji || emoji.length > 16) return res.status(400).json({ error: 'Reação inválida.' });

        const conversation = await prisma.conversation.findFirst({
            where: { id: req.params.id, companyId, ...conversationScope(req) },
            include: { contact: { select: { phone: true } } },
        });
        if (!conversation) return res.status(404).json({ error: 'Conversa não encontrada.' });
        if (!canOperateConversation(req, conversation)) return res.status(403).json({ error: 'Você precisa assumir esta conversa antes de reagir.' });

        const message = await prisma.message.findFirst({
            where: { id: req.params.messageId, conversationId: conversation.id, companyId },
            select: { waMessageId: true },
        });
        if (!message?.waMessageId) return res.status(409).json({ error: 'A mensagem ainda não possui identificação no WhatsApp.' });
        if (!whatsappProvider.reactToMessage) return res.status(501).json({ error: 'O provedor atual não suporta reações.' });

        await whatsappProvider.reactToMessage({ phone: conversation.contact.phone, messageId: message.waMessageId, emoji });
        return res.json({ ok: true });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Não foi possível enviar a reação.';
        return res.status(502).json({ error: message });
    }
});

router.patch('/:id/messages/:messageId', rateLimit(60_000, 30), async (req: Request, res: Response) => {
    try {
        const companyId = getCompanyId(req);
        const plainBody = typeof req.body?.body === 'string' ? req.body.body.trim() : '';
        if (!plainBody) return res.status(400).json({ error: 'Informe o novo texto da mensagem.' });
        if (plainBody.length > 4096) return res.status(400).json({ error: 'A mensagem excede o limite de 4.096 caracteres.' });

        const conversation = await prisma.conversation.findFirst({
            where: { id: req.params.id, companyId, ...conversationScope(req) },
            include: { contact: { select: { phone: true } } },
        });
        if (!conversation) return res.status(404).json({ error: 'Conversa não encontrada.' });
        if (!canOperateConversation(req, conversation)) {
            return res.status(403).json({ error: 'Você precisa assumir esta conversa antes de editar.' });
        }

        const message = await prisma.message.findFirst({
            where: { id: req.params.messageId, conversationId: conversation.id, companyId },
            include: {
                user: {
                    select: {
                        name: true,
                        messageSignature: true,
                        department: { select: { name: true } },
                    },
                },
            },
        });
        if (!message) return res.status(404).json({ error: 'Mensagem não encontrada.' });
        if (message.direction !== MessageDirection.OUTBOUND || message.type !== MessageType.TEXT) {
            return res.status(409).json({ error: 'Somente mensagens de texto enviadas pela equipe podem ser editadas.' });
        }
        if (Date.now() - message.createdAt.getTime() > MESSAGE_EDIT_WINDOW_MS) {
            return res.status(409).json({ error: 'O prazo de 15 minutos para editar esta mensagem terminou.' });
        }
        if (message.deletedAt) return res.status(409).json({ error: 'Uma mensagem excluída não pode ser editada.' });
        if (!message.waMessageId) return res.status(409).json({ error: 'A mensagem ainda não possui identificação no WhatsApp.' });
        if (!whatsappProvider.editMessage) return res.status(501).json({ error: 'O provedor atual não suporta edição de mensagens.' });

        const existingSignature = message.body?.match(/^\*([^*\r\n]{1,160}):\*\r?\n/)?.[1]?.trim();
        const signature = formatMessageSignature(message.user) || existingSignature;
        const messageBody = signature ? `*${signature}:*\n${plainBody}` : plainBody;
        const result = await whatsappProvider.editMessage({
            phone: conversation.contact.phone,
            messageId: message.waMessageId,
            body: messageBody,
        });

        const updatedMessage = await prisma.message.update({
            where: { id: message.id },
            data: {
                body: messageBody,
                editedAt: new Date(),
                ...(result.waMessageId ? { waMessageId: result.waMessageId } : {}),
            },
            include: {
                user: {
                    select: {
                        id: true,
                        name: true,
                        role: true,
                        specialty: true,
                        department: { select: { name: true } },
                    },
                },
                replyToMessage: {
                    include: {
                        user: {
                            select: {
                                id: true,
                                name: true,
                                role: true,
                                specialty: true,
                                department: { select: { name: true } },
                            },
                        },
                    },
                },
            },
        });

        getIO().to(`conversation:${conversation.id}`).emit('message:updated', updatedMessage);
        const latestMessage = await prisma.message.findFirst({
            where: { conversationId: conversation.id, companyId },
            orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
            select: { id: true },
        });
        if (latestMessage?.id === updatedMessage.id) {
            emitToCompany(companyId, 'conversation:updated', { id: conversation.id, messages: [updatedMessage] });
        }
        return res.json(updatedMessage);
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Não foi possível editar a mensagem.';
        console.error('[conversations] Falha ao editar mensagem', {
            conversationId: req.params.id,
            messageId: req.params.messageId,
            error: message,
        });
        return res.status(502).json({ error: message });
    }
});

router.post('/:id/messages', rateLimit(60_000, 60), async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { body, mediaDataUrl: suppliedMediaDataUrl, mediaType: suppliedMediaType, mediaUrl, type, fileName, replyToMessageId } = req.body;
        const mediaDataUrl = suppliedMediaDataUrl ?? mediaUrl;
        const mediaType = suppliedMediaType ?? type;
        const companyId = getCompanyId(req);
        const userId = req.user?.id;

        const hasMedia = typeof mediaDataUrl === 'string' && mediaDataUrl.startsWith('data:');
        const mediaTypes = ['IMAGE', 'AUDIO', 'VIDEO', 'DOCUMENT'] as const;
        const normalizedMediaType = mediaTypes.includes(mediaType) ? mediaType as typeof mediaTypes[number] : null;
        if (!String(body || '').trim() && !hasMedia) return res.status(400).json({ error: 'Informe uma mensagem ou anexo.' });
        if (hasMedia && !normalizedMediaType) return res.status(400).json({ error: 'Tipo de anexo inválido.' });
        if (hasMedia && mediaDataUrl.length > 16 * 1024 * 1024) return res.status(413).json({ error: 'O anexo excede o limite de 12 MB.' });

        // Leituras em paralelo — economiza ~150ms vs sequencial
        const [conversation, sender] = await Promise.all([
            prisma.conversation.findFirst({ where: { id, companyId }, include: { contact: true } }),
            userId
                ? prisma.user.findFirst({
                    where: { id: userId, companyId },
                    select: {
                        name: true,
                        messageSignature: true,
                        department: { select: { name: true } },
                    },
                })
                : Promise.resolve(null),
        ]);

        if (!conversation) {
            return res.status(404).json({ error: 'Conversation not found' });
        }
        if (conversation.status === 'CLOSED') {
            return res.status(409).json({ error: 'Conversa encerrada nÃ£o pode receber novas mensagens' });
        }
        if (!canOperateConversation(req, conversation)) {
            return res.status(403).json({ error: 'VocÃª precisa assumir esta conversa antes de responder' });
        }

        const quotedMessage = typeof replyToMessageId === 'string' && replyToMessageId
            ? await prisma.message.findFirst({
                where: { id: replyToMessageId, conversationId: id, companyId },
                select: { id: true, waMessageId: true },
            })
            : null;
        if (replyToMessageId && !quotedMessage?.waMessageId) {
            return res.status(409).json({ error: 'A mensagem selecionada ainda não pode ser respondida no WhatsApp.' });
        }

        const signature = formatMessageSignature(sender);
        const plainBody = String(body || '').trim();
        const messageBody = signature && plainBody ? `*${signature}:*\n${plainBody}` : plainBody;
        const persistedBody = hasMedia ? (messageBody || `Anexo: ${String(fileName || 'arquivo')}`) : messageBody;

        // Persiste mensagem + atualiza conversa em paralelo
        const [message] = await Promise.all([
            prisma.message.create({
                data: {
                    companyId,
                    conversationId: id,
                    direction: MessageDirection.OUTBOUND,
                    type: hasMedia ? MessageType[normalizedMediaType!] : MessageType.TEXT,
                    body: persistedBody,
                    userId,
                    replyToMessageId: quotedMessage?.id,
                },
                include: {
                    user: {
                        select: {
                            id: true,
                            name: true,
                            role: true,
                            specialty: true,
                            department: { select: { name: true } },
                        },
                    },
                    replyToMessage: {
                        select: {
                            id: true,
                            direction: true,
                            type: true,
                            body: true,
                            mediaUrl: true,
                            waMessageId: true,
                            editedAt: true,
                            deletedAt: true,
                            deletedByCustomer: true,
                            createdAt: true,
                            user: {
                                select: {
                                    id: true,
                                    name: true,
                                    role: true,
                                    specialty: true,
                                    department: { select: { name: true } },
                                },
                            },
                        },
                    },
                },
            }),
            prisma.conversation.update({ where: { id }, data: { lastMessageAt: new Date() } }),
        ]);

        // Responde e emite socket imediatamente — mensagem aparece na tela sem esperar a Evolution
        getIO().to(`conversation:${id}`).emit('message:new', message);
        emitToCompany(companyId, 'conversation:updated', { id, lastMessageAt: new Date() });
        res.status(201).json(message);

        // Envio via WhatsApp em background — não bloqueia a resposta ao cliente
        setImmediate(async () => {
            try {
                const result = hasMedia
                    ? await sendMediaWithOutbox({ companyId, conversationId: id, messageId: message.id, toPhone: conversation.contact.phone, type: normalizedMediaType!, mediaUrl: mediaDataUrl, fileName: String(fileName || 'arquivo'), caption: messageBody, replyToMessageId: quotedMessage?.waMessageId || undefined })
                    : await sendTextWithOutbox({ companyId, conversationId: id, messageId: message.id, toPhone: conversation.contact.phone, body: messageBody, replyToMessageId: quotedMessage?.waMessageId || undefined });
                await prisma.message.update({
                    where: { id: message.id },
                    data: { waMessageId: result.waMessageId },
                });
                getIO().to(`conversation:${id}`).emit('message:updated', {
                    id: message.id,
                    waMessageId: result.waMessageId,
                });
            } catch (err) {
                console.error('[SIGMA] Falha ao enviar via WhatsApp:', err);
            }
        });
    } catch (error) {
        console.error('Error sending message:', error);
        const message = error instanceof Error ? error.message : 'Erro ao enviar mensagem';
        res.status(503).json({ error: message });
    }
});

export default router;
