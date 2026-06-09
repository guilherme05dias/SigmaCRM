import { Router, Request, Response } from 'express';
import { MessageDirection, MessageType } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { getWhatsAppProvider } from '../whatsapp';
import { getIO, emitToCompany } from '../socket';
import { authMiddleware } from '../middlewares/auth.middleware';
import { companyScope, getCompanyId } from '../lib/tenant';
import { rateLimit } from '../middlewares/rateLimit.middleware';

const router = Router();
const whatsappProvider = getWhatsAppProvider();

router.use(authMiddleware);

function normalizePhone(value: string) {
    return value.replace(/\D/g, '');
}

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
        res.json(conversations);
    } catch (error) {
        res.status(500).json({ error: 'Erro ao buscar conversas' });
    }
});

router.post('/start', async (req: Request, res: Response) => {
    try {
        const { phone, name, departmentId } = req.body ?? {};
        const companyId = getCompanyId(req);
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

        let contact = await prisma.contact.findFirst({
            where: { companyId, phone: checkedPhone },
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
            orderBy: { updatedAt: 'desc' },
            include: {
                contact: true,
                assignedUser: { select: { id: true, name: true, email: true } },
                department: { select: { id: true, name: true } },
                messages: {
                    orderBy: { createdAt: 'desc' },
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
            return res.json({ conversation: existingConversation, created: false, hasWhatsApp: true });
        }

        const conversation = await prisma.conversation.create({
            data: {
                companyId,
                contactId: contact.id,
                departmentId: departmentId || undefined,
                status: 'OPEN',
                startedAt: new Date(),
            },
            include: {
                contact: true,
                assignedUser: { select: { id: true, name: true, email: true } },
                department: { select: { id: true, name: true } },
                messages: {
                    orderBy: { createdAt: 'desc' },
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
            where: { id, ...companyScope(req) },
            select: { id: true },
        });

        if (!conversation) {
            return res.status(404).json({ error: 'Conversation not found' });
        }

        const messages = await prisma.message.findMany({
            where: { conversationId: id, ...companyScope(req) },
            orderBy: { createdAt: 'desc' },
            take: take + 1,
            ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
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
                messages: {
                    orderBy: { createdAt: 'desc' },
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

        emitToCompany(companyId, 'conversation:updated', conversation);

        res.json(conversation);
    } catch (error) {
        res.status(500).json({ error: 'Erro ao transferir conversa' });
    }
});

router.post('/:id/messages', rateLimit(60_000, 60), async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { body } = req.body;
        const companyId = getCompanyId(req);
        const userId = req.user?.id;

        if (!body) {
            return res.status(400).json({ error: 'Missing message body' });
        }

        // Leituras em paralelo — economiza ~150ms vs sequencial
        const [conversation, senderSignatures] = await Promise.all([
            prisma.conversation.findFirst({ where: { id, companyId }, include: { contact: true } }),
            userId
                ? prisma.$queryRawUnsafe<Array<{ messageSignature: string | null }>>(
                    'SELECT message_signature as "messageSignature" FROM "User" WHERE id = $1 AND company_id = $2 LIMIT 1',
                    userId,
                    companyId
                )
                : Promise.resolve([] as Array<{ messageSignature: string | null }>),
        ]);

        if (!conversation) {
            return res.status(404).json({ error: 'Conversation not found' });
        }

        const signature = senderSignatures[0]?.messageSignature?.trim();
        const messageBody = signature ? `*${signature}:*\n${body}` : body;

        // Persiste mensagem + atualiza conversa em paralelo
        const [message] = await Promise.all([
            prisma.message.create({
                data: {
                    companyId,
                    conversationId: id,
                    direction: MessageDirection.OUTBOUND,
                    type: MessageType.TEXT,
                    body: messageBody,
                    userId,
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
                const result = await getWhatsAppProvider().sendText({
                    to: conversation.contact.phone,
                    body: messageBody,
                });
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
