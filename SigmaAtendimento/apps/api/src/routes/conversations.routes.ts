import { Router, Request, Response } from 'express';
import { MessageDirection, MessageType } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { getWhatsAppProvider } from '../whatsapp';
import { getIO } from '../socket';
import { authMiddleware } from '../middlewares/auth.middleware';
import { companyScope, getCompanyId } from '../lib/tenant';

const router = Router();
const whatsappProvider = getWhatsAppProvider();

router.use(authMiddleware);

router.get('/', async (req: Request, res: Response) => {
    try {
        const conversations = await prisma.conversation.findMany({
            where: { ...companyScope(req) },
            orderBy: { lastMessageAt: 'desc' },
            include: {
                contact: true,
                assignedUser: { select: { id: true, name: true, email: true } },
                department: { select: { id: true, name: true } },
                messages: {
                    orderBy: { createdAt: 'desc' },
                    take: 1, // Get the last message for preview
                },
            },
        });
        res.json(conversations);
    } catch (error) {
        res.status(500).json({ error: 'Erro ao buscar conversas' });
    }
});

router.get('/:id/messages', async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const conversation = await prisma.conversation.findFirst({
            where: { id, ...companyScope(req) },
            select: { id: true },
        });

        if (!conversation) {
            return res.status(404).json({ error: 'Conversation not found' });
        }

        const messages = await prisma.message.findMany({
            where: { conversationId: id, ...companyScope(req) },
            orderBy: { createdAt: 'asc' },
        });
        res.json({ data: messages, meta: { hasMore: false } });
    } catch (error) {
        res.status(500).json({ error: 'Erro ao buscar mensagens' });
    }
});

router.post('/:id/take', async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const userId = req.user?.id;
        const companyId = getCompanyId(req);

        // Check if conversation is available to take
        const currentConversation = await prisma.conversation.findFirst({
            where: { id, companyId }
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
                messages: {
                    orderBy: { createdAt: 'desc' },
                    take: 1,
                },
            }
        });

        getIO().emit('conversation:updated', conversation);

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

        const updateData: any = {};

        if (departmentId !== undefined) {
            updateData.departmentId = departmentId;
        }

        if (assignedUserId !== undefined) {
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
                messages: {
                    orderBy: { createdAt: 'desc' },
                    take: 1,
                },
            }
        });

        getIO().emit('conversation:updated', conversation);

        res.json(conversation);
    } catch (error) {
        res.status(500).json({ error: 'Erro ao transferir conversa' });
    }
});

router.post('/:id/messages', async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { body } = req.body;
        const companyId = getCompanyId(req);

        if (!body) {
            return res.status(400).json({ error: 'Missing message body' });
        }

        const conversation = await prisma.conversation.findFirst({
            where: { id, companyId },
            include: { contact: true },
        });

        if (!conversation) {
            return res.status(404).json({ error: 'Conversation not found' });
        }

        // Send via provider
        const result = await whatsappProvider.sendText({
            to: conversation.contact.phone,
            body,
        });

        // Save to DB
        const message = await prisma.message.create({
            data: {
                companyId,
                conversationId: id,
                direction: MessageDirection.OUTBOUND,
                type: MessageType.TEXT,
                body,
                waMessageId: result.waMessageId,
                userId: req.user?.id,
            },
        });

        // Update conversation
        const updatedConversation = await prisma.conversation.update({
            where: { id },
            data: { lastMessageAt: new Date() },
            include: {
                contact: true,
                assignedUser: { select: { id: true, name: true, email: true } },
                department: { select: { id: true, name: true } },
                messages: {
                    orderBy: { createdAt: 'desc' },
                    take: 1,
                },
            }
        });

        getIO().to(`conversation:${id}`).emit('message:new', message);
        getIO().emit('conversation:updated', updatedConversation);

        res.status(201).json(message);
    } catch (error) {
        console.error('Error sending message:', error);
        res.status(500).json({ error: 'Erro ao enviar mensagem' });
    }
});

export default router;
