import { Router, Request, Response as ExpressResponse, NextFunction } from 'express';
import { OutboxStatus } from '@prisma/client';
import { createHash } from 'crypto';
import { prisma } from '../lib/prisma';
import { getWhatsAppProvider } from '../whatsapp';
import { getIO, emitToCompany } from '../socket';
import { getCurrentSettings } from '../services/businessHoursService';
import { metaCloudConfig } from '../whatsapp/config/metaCloud.config';
import { authMiddleware } from '../middlewares/auth.middleware';
import { getCompanyId } from '../lib/tenant';
import { currentWhatsAppProvider, retryFailedOutbox, sendTextWithOutbox } from '../services/whatsappOutbox.service';

const router = Router();
const whatsappProvider = getWhatsAppProvider();
const muriloApiBaseUrl = (process.env.MURILO_WHATSAPP_API_BASE_URL || 'http://localhost:3000').replace(/\/$/, '');

function requireWhatsAppAdmin(req: Request, res: ExpressResponse, next: NextFunction) {
    if (!['ADMIN', 'SUPERVISOR'].includes(req.user?.role || '')) {
        return res.status(403).json({ error: 'Apenas administradores ou supervisores podem gerenciar o WhatsApp.' });
    }
    next();
}

async function getWebhookCompanyId(): Promise<string> {
    const configuredCompanyId = process.env.DEFAULT_COMPANY_ID || process.env.SIGMA_DEFAULT_COMPANY_ID;

    if (configuredCompanyId) {
        const configuredCompany = await prisma.company.findUnique({
            where: { id: configuredCompanyId },
            select: { id: true },
        });

        if (configuredCompany) {
            return configuredCompany.id;
        }
    }

    const company = await prisma.company.findFirst({
        where: { active: true },
        orderBy: { createdAt: 'asc' },
        select: { id: true },
    }) || await prisma.company.findFirst({
        orderBy: { createdAt: 'asc' },
        select: { id: true },
    });

    if (!company) {
        throw new Error('Empresa padrão não encontrada para processar o webhook do WhatsApp.');
    }

    return company.id;
}

async function clearWhatsAppOperationalData(companyId: string): Promise<void> {
    await prisma.$transaction([
        prisma.ticketTimeline.deleteMany({ where: { companyId } }),
        prisma.ticketEvaluation.deleteMany({ where: { companyId } }),
        prisma.ticketFieldService.deleteMany({ where: { companyId } }),
        prisma.message.deleteMany({ where: { companyId } }),
        prisma.ticket.deleteMany({ where: { companyId } }),
        prisma.conversation.deleteMany({ where: { companyId } }),
        prisma.whatsAppOutbox.deleteMany({ where: { companyId } }),
        prisma.whatsAppInboundEvent.deleteMany({ where: { companyId } }),
        prisma.counter.deleteMany({ where: { companyId } }),
    ]);
}

function fromWhatsAppTimestamp(timestamp?: number | null): Date | undefined {
    if (!timestamp) return undefined;
    const milliseconds = timestamp > 9999999999 ? timestamp : timestamp * 1000;
    const date = new Date(milliseconds);
    return Number.isNaN(date.getTime()) ? undefined : date;
}

async function readJson<T>(response: globalThis.Response): Promise<T | null> {
    try {
        return (await response.json()) as T;
    } catch {
        return null;
    }
}

function stableInboundMessageId(payload: unknown, phone: string, message: { type?: string; body?: string; mediaUrl?: string }) {
    const hash = createHash('sha256')
        .update(JSON.stringify({ phone, type: message.type, body: message.body, mediaUrl: message.mediaUrl, payload }))
        .digest('hex')
        .slice(0, 48);
    return `in_${hash}`;
}

router.get('/sessions', authMiddleware, requireWhatsAppAdmin, async (_req: Request, res: ExpressResponse) => {
    try {
        const sessions = await whatsappProvider.listSessions();
        res.json(sessions);
    } catch (error: any) {
        res.status(500).json({ error: error?.message ?? 'Failed to list WhatsApp sessions' });
    }
});

router.post('/sessions/:sessionId/start', authMiddleware, requireWhatsAppAdmin, async (req: Request, res: ExpressResponse) => {
    try {
        const companyId = getCompanyId(req);
        await clearWhatsAppOperationalData(companyId);
        await whatsappProvider.createSession(req.params.sessionId);
        res.status(202).json({ ok: true });
    } catch (error: any) {
        res.status(500).json({ error: error?.message ?? 'Failed to start WhatsApp session' });
    }
});

router.post('/sessions/:sessionId/disconnect', authMiddleware, requireWhatsAppAdmin, async (req: Request, res: ExpressResponse) => {
    try {
        await whatsappProvider.disconnectSession(req.params.sessionId);
        res.status(200).json({ ok: true, status: 'DISCONNECTED' });
    } catch (error: any) {
        res.status(500).json({ error: error?.message ?? 'Failed to disconnect WhatsApp session' });
    }
});

router.post('/sessions/:sessionId/sync-history', authMiddleware, requireWhatsAppAdmin, async (req: Request, res: ExpressResponse) => {
    try {
        const companyId = getCompanyId(req);
        const chatLimit = Math.max(1, Math.min(Number(req.body?.chatLimit || req.query.chatLimit || 100), 500));
        const messageLimit = Math.max(1, Math.min(Number(req.body?.messageLimit || req.query.messageLimit || 50), 200));
        const chats = await whatsappProvider.syncHistory({
            sessionId: req.params.sessionId,
            chatLimit,
            messageLimit,
        });

        let importedContacts = 0;
        let importedConversations = 0;
        let importedMessages = 0;

        for (const chat of chats) {
            const phone = String(chat.phone || '').replace(/\D/g, '');
            if (phone.length < 10) continue;

            let contact = await prisma.contact.findFirst({ where: { companyId, phone } });
            if (!contact) {
                contact = await prisma.contact.create({
                    data: {
                        companyId,
                        phone,
                        name: chat.name || null,
                    },
                });
                importedContacts += 1;
            } else if (contact.companyId !== companyId || (chat.name && contact.name !== chat.name)) {
                contact = await prisma.contact.update({
                    where: { id: contact.id },
                    data: {
                        companyId,
                        ...(chat.name && contact.name !== chat.name ? { name: chat.name } : {}),
                    },
                });
            }

            const sortedMessages = [...chat.messages].sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
            const firstMessageAt = fromWhatsAppTimestamp(sortedMessages[0]?.timestamp);
            const lastMessageAt = fromWhatsAppTimestamp(chat.lastMessageAt) || fromWhatsAppTimestamp(sortedMessages[sortedMessages.length - 1]?.timestamp) || new Date();
            const shouldEnterQueue = Boolean(chat.unreadCount && chat.unreadCount > 0);

            let conversation = await prisma.conversation.findFirst({
                where: {
                    companyId,
                    contactId: contact.id,
                },
                orderBy: { updatedAt: 'desc' },
            });

            if (!conversation) {
                conversation = await prisma.conversation.create({
                    data: {
                        companyId,
                        contactId: contact.id,
                        status: shouldEnterQueue ? 'OPEN' : 'CLOSED',
                        startedAt: firstMessageAt || lastMessageAt,
                        closedAt: shouldEnterQueue ? null : lastMessageAt,
                        lastMessageAt,
                    },
                });
                importedConversations += 1;
            } else {
                conversation = await prisma.conversation.update({
                    where: { id: conversation.id },
                    data: {
                        status: shouldEnterQueue && conversation.status === 'CLOSED' ? 'OPEN' : conversation.status,
                        closedAt: shouldEnterQueue ? null : conversation.closedAt,
                        lastMessageAt,
                    },
                });
            }

            const messageIds = sortedMessages
                .map((message, index) => message.waMessageId || `history_${phone}_${message.timestamp || index}_${message.direction}`)
                .filter(Boolean);
            const existingMessages = messageIds.length
                ? await prisma.message.findMany({
                    where: {
                        companyId,
                        conversationId: conversation.id,
                        waMessageId: { in: messageIds },
                    },
                    select: { waMessageId: true },
                })
                : [];
            const existingMessageIds = new Set(existingMessages.map((message) => message.waMessageId).filter(Boolean));

            for (const [index, message] of sortedMessages.entries()) {
                const waMessageId = message.waMessageId || `history_${phone}_${message.timestamp || index}_${message.direction}`;
                if (existingMessageIds.has(waMessageId)) continue;
                const messageCreatedAt = fromWhatsAppTimestamp(message.timestamp);

                if (message.direction === 'OUTBOUND' && message.body && messageCreatedAt) {
                    const closeFrom = new Date(messageCreatedAt.getTime() - 5 * 60 * 1000);
                    const closeTo = new Date(messageCreatedAt.getTime() + 5 * 60 * 1000);
                    const localOutbound = await prisma.message.findFirst({
                        where: {
                            companyId,
                            conversationId: conversation.id,
                            direction: 'OUTBOUND',
                            body: message.body,
                            waMessageId: { startsWith: 'murilo_' },
                            createdAt: { gte: closeFrom, lte: closeTo },
                        },
                        orderBy: { createdAt: 'desc' },
                    });

                    if (localOutbound) {
                        await prisma.message.update({
                            where: { id: localOutbound.id },
                            data: { waMessageId },
                        });
                        existingMessageIds.add(waMessageId);
                        continue;
                    }
                }

                await prisma.message.create({
                    data: {
                        companyId,
                        conversationId: conversation.id,
                        direction: message.direction,
                        type: message.type,
                        body: message.body || null,
                        mediaUrl: message.mediaUrl || null,
                        waMessageId,
                        createdAt: messageCreatedAt || undefined,
                    },
                });
                importedMessages += 1;
            }

            const updatedConversation = await prisma.conversation.findUnique({
                where: { id: conversation.id },
                include: {
                    contact: true,
                    assignedUser: { select: { id: true, name: true, email: true } },
                    department: { select: { id: true, name: true } },
                    messages: {
                        orderBy: { createdAt: 'desc' },
                        take: 1,
                    },
                },
            });

            if (updatedConversation) {
                emitToCompany(updatedConversation.companyId, 'conversation:updated', updatedConversation);
                if (shouldEnterQueue) {
                    emitToCompany(updatedConversation.companyId, 'conversation:new', updatedConversation);
                }
            }
        }

        res.json({
            ok: true,
            scannedChats: chats.length,
            importedContacts,
            importedConversations,
            importedMessages,
        });
    } catch (error: any) {
        console.error('Error syncing WhatsApp history:', error);
        res.status(500).json({ error: error?.message || 'Erro ao sincronizar histórico do WhatsApp' });
    }
});

router.get('/sessions/:sessionId/qrcode', authMiddleware, requireWhatsAppAdmin, async (req: Request, res: ExpressResponse) => {
    try {
        if ((process.env.WHATSAPP_PROVIDER || 'mock') !== 'murilo-api') {
            return res.status(400).json({ error: 'QR Code só está disponível com WHATSAPP_PROVIDER=murilo-api' });
        }

        const response = await fetch(`${muriloApiBaseUrl}/get-qrcode/${encodeURIComponent(req.params.sessionId)}`);
        const payload = await readJson<{ qrCode?: string; message?: string }>(response);

        if (!response.ok) {
            return res.status(response.status).json({ error: payload?.message || 'QR Code não disponível' });
        }

        res.json({ qrCode: payload?.qrCode });
    } catch (error: any) {
        res.status(500).json({ error: error?.message ?? 'Failed to fetch WhatsApp QR Code' });
    }
});

router.get('/sessions/:sessionId/qrcode-image', authMiddleware, requireWhatsAppAdmin, async (req: Request, res: ExpressResponse) => {
    try {
        if ((process.env.WHATSAPP_PROVIDER || 'mock') !== 'murilo-api') {
            return res.status(400).json({ error: 'QR Code só está disponível com WHATSAPP_PROVIDER=murilo-api' });
        }

        const response = await fetch(`${muriloApiBaseUrl}/get-qrcode-image/${encodeURIComponent(req.params.sessionId)}`);
        const payload = await readJson<{ qrCode?: string; qrCodeDataUrl?: string; message?: string }>(response);

        if (!response.ok) {
            return res.status(response.status).json({ error: payload?.message || 'QR Code não disponível' });
        }

        res.json({ qrCode: payload?.qrCode, qrCodeDataUrl: payload?.qrCodeDataUrl });
    } catch (error: any) {
        res.status(500).json({ error: error?.message ?? 'Failed to fetch WhatsApp QR Code image' });
    }
});

router.get('/sessions/:sessionId/qrcode-page', authMiddleware, requireWhatsAppAdmin, async (req: Request, res: ExpressResponse) => {
    try {
        if ((process.env.WHATSAPP_PROVIDER || 'mock') !== 'murilo-api') {
            return res.status(400).send('QR Code só está disponível com WHATSAPP_PROVIDER=murilo-api');
        }

        const response = await fetch(`${muriloApiBaseUrl}/get-qrcode-image/${encodeURIComponent(req.params.sessionId)}`);
        const payload = await readJson<{ qrCodeDataUrl?: string; message?: string }>(response);

        if (!response.ok || !payload?.qrCodeDataUrl) {
            return res.status(response.status).send(payload?.message || 'QR Code não disponível. Inicie a sessão e tente novamente.');
        }

        res.type('html').send(`<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Conectar WhatsApp - Sigma</title>
  <style>
    body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #101622; color: #e5edf5; font-family: Inter, Arial, sans-serif; }
    main { width: min(440px, calc(100vw - 32px)); background: #1E272E; border: 1px solid rgba(255,255,255,.08); border-radius: 12px; padding: 28px; text-align: center; }
    h1 { margin: 0 0 8px; font-size: 24px; }
    p { margin: 0 0 20px; color: #94a3b8; }
    img { width: 320px; max-width: 100%; background: #fff; border-radius: 8px; padding: 12px; }
    code { display: inline-block; margin-top: 18px; color: #00E5E5; }
  </style>
</head>
<body>
  <main>
    <h1>Conectar WhatsApp</h1>
    <p>Abra o WhatsApp no celular e escaneie o QR Code da sessão <strong>${req.params.sessionId}</strong>.</p>
    <img src="${payload.qrCodeDataUrl}" alt="QR Code do WhatsApp" />
    <code>GET /api/whatsapp/sessions/${req.params.sessionId}/qrcode-page</code>
  </main>
</body>
</html>`);
    } catch (error: any) {
        res.status(500).send(error?.message ?? 'Failed to render WhatsApp QR Code');
    }
});

router.get('/outbox', authMiddleware, requireWhatsAppAdmin, async (req: Request, res: ExpressResponse) => {
    try {
        const companyId = getCompanyId(req);
        const limit = Math.max(1, Math.min(Number(req.query.limit || 25), 100));
        const allowedStatuses = new Set(Object.values(OutboxStatus));
        const requestedStatuses = String(req.query.status || '')
            .split(',')
            .map((status) => status.trim().toUpperCase())
            .filter((status): status is OutboxStatus => allowedStatuses.has(status as OutboxStatus));
        const statusFilter = requestedStatuses.length
            ? requestedStatuses
            : [OutboxStatus.FAILED, OutboxStatus.PENDING];

        const [summaryRows, rows] = await Promise.all([
            prisma.whatsAppOutbox.groupBy({
                by: ['status'],
                where: { companyId },
                _count: { _all: true },
            }),
            prisma.whatsAppOutbox.findMany({
                where: {
                    companyId,
                    status: { in: statusFilter },
                },
                orderBy: { updatedAt: 'desc' },
                take: limit,
                select: {
                    id: true,
                    provider: true,
                    toPhone: true,
                    payload: true,
                    status: true,
                    attempts: true,
                    lastError: true,
                    createdAt: true,
                    updatedAt: true,
                },
            }),
        ]);

        const summary = {
            pending: 0,
            failed: 0,
            sent: 0,
            total: 0,
        };

        for (const row of summaryRows) {
            const count = row._count._all;
            summary.total += count;
            if (row.status === OutboxStatus.PENDING) summary.pending = count;
            if (row.status === OutboxStatus.FAILED) summary.failed = count;
            if (row.status === OutboxStatus.SENT) summary.sent = count;
        }

        res.json({
            summary,
            items: rows.map((row) => {
                const payload = row.payload as { body?: string } | null;
                return {
                    id: row.id,
                    provider: row.provider,
                    toPhone: row.toPhone,
                    bodyPreview: payload?.body || null,
                    status: row.status,
                    attempts: row.attempts,
                    lastError: row.lastError,
                    createdAt: row.createdAt,
                    updatedAt: row.updatedAt,
                };
            }),
        });
    } catch (error: any) {
        res.status(error?.status ?? 500).json({ error: error?.message ?? 'Erro ao listar outbox do WhatsApp' });
    }
});

router.post('/outbox/retry', authMiddleware, requireWhatsAppAdmin, async (req: Request, res: ExpressResponse) => {
    try {
        const companyId = getCompanyId(req);
        const limit = Math.max(1, Math.min(Number(req.body?.limit || 25), 100));
        const result = await retryFailedOutbox({ companyId, limit });
        res.json({ ok: true, ...result });
    } catch (error: any) {
        res.status(error?.status ?? 500).json({ error: error?.message ?? 'Erro ao reprocessar outbox do WhatsApp' });
    }
});

// WhatsApp Webhook Verification (GET)
router.get(['/webhook', '/webhooks/meta'], (req: Request, res: ExpressResponse) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode && token) {
        if (mode === 'subscribe' && token === metaCloudConfig.verifyToken) {
            console.log('WEBHOOK_VERIFIED');
            return res.status(200).send(challenge);
        } else {
            return res.status(403).json({ error: 'Verification failed' });
        }
    }
    return res.status(400).json({ error: 'Missing hub parameters' });
});

// Main Webhook endpoint for Meta Cloud API messages and events
async function processIncomingWebhook(req: Request, res: ExpressResponse) {
    try {
        const payload = req.body;
        console.log('Received WhatsApp Webhook:', JSON.stringify(payload, null, 2));

        const parsed = await whatsappProvider.parseIncoming(payload);

        // If it isn't an incoming message, we still return 200 OK
        if (parsed.messages.length === 0) {
            return res.status(200).json({ ok: true });
        }

        const phone = parsed.contact.phone;
        const name = parsed.contact.name || undefined;
        const companyId = await getWebhookCompanyId();

        // Find or create Contact
        let contact = await prisma.contact.findFirst({
            where: { companyId, phone },
        });

        if (!contact) {
            contact = await prisma.contact.create({
                data: { companyId, phone, name },
            });
        } else if ((name && contact.name !== name) || contact.companyId !== companyId) {
            contact = await prisma.contact.update({
                where: { id: contact.id },
                data: {
                    companyId,
                    ...(name && contact.name !== name ? { name } : {}),
                },
            });
        }

        // Find or create Conversation
        let conversation = await prisma.conversation.findFirst({
            where: {
                companyId,
                contactId: contact.id,
                status: { in: ['OPEN', 'ASSIGNED'] },
            },
            orderBy: { createdAt: 'desc' },
        });

        let isNewConversation = false;
        if (!conversation) {
            conversation = await prisma.conversation.create({
                data: {
                    companyId,
                    contactId: contact.id,
                    status: 'OPEN',
                    startedAt: new Date(),
                },
            });
            isNewConversation = true;
        }

        // Process Messages
        for (const msg of parsed.messages) {
            if (msg.direction === 'INBOUND') {
                let inboundEvent;
                try {
                    inboundEvent = await prisma.whatsAppInboundEvent.create({
                        data: {
                            companyId,
                            provider: currentWhatsAppProvider(),
                            providerMessageId: msg.waMessageId || stableInboundMessageId(payload, phone, msg),
                            fromPhone: phone,
                            rawPayload: payload,
                        },
                    });
                } catch (error: any) {
                    if (error?.code === 'P2002') {
                        continue;
                    }
                    throw error;
                }

                const message = await prisma.message.create({
                    data: {
                        companyId,
                        conversationId: conversation.id,
                        direction: 'INBOUND',
                        type: msg.type,
                        body: msg.body,
                        mediaUrl: msg.mediaUrl,
                        waMessageId: msg.waMessageId,
                    },
                });

                getIO().to(`conversation:${conversation.id}`).emit('message:new', message);
                await prisma.whatsAppInboundEvent.update({
                    where: { id: inboundEvent.id },
                    data: { processedAt: new Date() },
                });
            }
        }

        // Update conversation lastMessageAt
        const updatedConversation = await prisma.conversation.update({
            where: { id: conversation.id },
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

        emitToCompany(companyId, 'conversation:updated', updatedConversation);
        if (isNewConversation) {
            emitToCompany(companyId, 'conversation:new', updatedConversation);
        }

        // Auto Messages Logic for New Conversations
        if (isNewConversation) {
            try {
                const settings = await getCurrentSettings(companyId);
                const autoMessageText = settings.welcomeMessage;

                if (autoMessageText) {
                    // Save system message
                    const systemMsg = await prisma.message.create({
                        data: {
                            companyId,
                            conversationId: conversation.id,
                            direction: 'SYSTEM',
                            type: 'TEXT',
                            body: autoMessageText,
                        }
                    });

                    // Emit to frontend (so the agent sees the system message)
                    getIO().to(`conversation:${conversation.id}`).emit('message:new', systemMsg);

                    await sendTextWithOutbox({
                        companyId,
                        conversationId: conversation.id,
                        messageId: systemMsg.id,
                        toPhone: phone,
                        body: autoMessageText,
                    });
                }
            } catch (err) {
                console.error("Failed to send auto message:", err);
                // We don't throw to avoid breaking the webhook flow
            }
        }

        res.status(200).json({ ok: true });
    } catch (error) {
        console.error('Error processing WhatsApp webhook:', error);
        res.status(500).json({ error: 'Internal server error while processing webhook' });
    }
}

router.post(['/webhook', '/webhooks/meta'], processIncomingWebhook);
router.post('/debug/mock-whatsapp/incoming', authMiddleware, requireWhatsAppAdmin, processIncomingWebhook);

export default router;
