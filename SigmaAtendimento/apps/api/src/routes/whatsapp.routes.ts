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
import { verifyMetaSignature } from '../whatsapp/security/verifyMetaSignature';
import { rateLimit } from '../middlewares/rateLimit.middleware';

const router = Router();
const whatsappProvider = getWhatsAppProvider();
const muriloApiBaseUrl = (process.env.MURILO_WHATSAPP_API_BASE_URL || 'http://localhost:3000').replace(/\/$/, '');

function requireWhatsAppAdmin(req: Request, res: ExpressResponse, next: NextFunction) {
    if (!['ADMIN', 'SUPERVISOR'].includes(req.user?.role || '')) {
        return res.status(403).json({ error: 'Apenas administradores ou supervisores podem gerenciar o WhatsApp.' });
    }
    next();
}

function internalOrAdminAuth(req: Request, res: ExpressResponse, next: NextFunction) {
    const internalToken = process.env.SIGMA_INTERNAL_TOKEN;
    if (internalToken && req.headers['x-internal-token'] === internalToken) {
        (req as any).isInternalServiceCall = true;
        return next();
    }
    authMiddleware(req, res, () => requireWhatsAppAdmin(req, res, next));
}

// Cache em memória — evita query ao banco a cada webhook recebido
let _cachedWebhookCompanyId: string | null = null;

async function getWebhookCompanyId(): Promise<string> {
    if (_cachedWebhookCompanyId) return _cachedWebhookCompanyId;

    const configuredCompanyId = process.env.DEFAULT_COMPANY_ID || process.env.SIGMA_DEFAULT_COMPANY_ID;

    if (configuredCompanyId) {
        const configuredCompany = await prisma.company.findUnique({
            where: { id: configuredCompanyId },
            select: { id: true },
        });
        if (configuredCompany) {
            _cachedWebhookCompanyId = configuredCompany.id;
            return _cachedWebhookCompanyId;
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

    _cachedWebhookCompanyId = company.id;
    return _cachedWebhookCompanyId;
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

function stableInboundMessageId(
    payload: unknown,
    phone: string,
    message: { type?: string; body?: string; mediaUrl?: string }
) {
    // Não inclui base64 no hash — usa apenas referência do tipo
    const mediaRef = message.mediaUrl?.startsWith('data:')
        ? `base64:${message.type}`
        : message.mediaUrl;

    const hash = createHash('sha256')
        .update(JSON.stringify({ phone, type: message.type, body: message.body, mediaRef }))
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

router.post('/sessions/:sessionId/sync-history', internalOrAdminAuth, async (req: Request, res: ExpressResponse) => {
    try {
        const companyId = (req as any).isInternalServiceCall
            ? await getWebhookCompanyId()
            : getCompanyId(req);
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
        const provider = process.env.WHATSAPP_PROVIDER || 'mock';
        if (provider !== 'murilo-api' && provider !== 'evolution') {
            return res.status(400).json({ error: 'QR Code só está disponível com WHATSAPP_PROVIDER=murilo-api ou evolution' });
        }

        if (provider === 'evolution') {
            const evolutionUrl = (process.env.EVOLUTION_API_URL || 'http://localhost:8080').replace(/\/$/, '');
            const apiKey = process.env.EVOLUTION_API_KEY || '';
            const instanceName = process.env.EVOLUTION_INSTANCE_NAME || 'sigma-principal';
            const targetSession = req.params.sessionId === 'default' ? instanceName : req.params.sessionId;
            const response = await fetch(`${evolutionUrl}/instance/connect/${encodeURIComponent(targetSession)}`, {
                headers: { apikey: apiKey }
            });
            const payload = await readJson<{ base64?: string; error?: string }>(response);
            if (!response.ok) {
                return res.status(response.status).json({ error: payload?.error || 'QR Code não disponível' });
            }
            return res.json({ qrCode: payload?.base64 });
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
        const provider = process.env.WHATSAPP_PROVIDER || 'mock';
        if (provider !== 'murilo-api' && provider !== 'evolution') {
            return res.status(400).json({ error: 'QR Code só está disponível com WHATSAPP_PROVIDER=murilo-api ou evolution' });
        }

        if (provider === 'evolution') {
            const evolutionUrl = (process.env.EVOLUTION_API_URL || 'http://localhost:8080').replace(/\/$/, '');
            const apiKey = process.env.EVOLUTION_API_KEY || '';
            const instanceName = process.env.EVOLUTION_INSTANCE_NAME || 'sigma-principal';
            const targetSession = req.params.sessionId === 'default' ? instanceName : req.params.sessionId;
            const response = await fetch(`${evolutionUrl}/instance/connect/${encodeURIComponent(targetSession)}`, {
                headers: { apikey: apiKey }
            });
            const payload = await readJson<{ base64?: string; error?: string }>(response);
            if (!response.ok) {
                return res.status(response.status).json({ error: payload?.error || 'QR Code não disponível' });
            }
            return res.json({ qrCodeDataUrl: payload?.base64 });
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
        const provider = process.env.WHATSAPP_PROVIDER || 'mock';
        if (provider !== 'murilo-api' && provider !== 'evolution') {
            return res.status(400).send('QR Code só está disponível com WHATSAPP_PROVIDER=murilo-api ou evolution');
        }

        let qrCodeDataUrl: string | undefined;
        let errorMessage: string | undefined;

        if (provider === 'evolution') {
            const evolutionUrl = (process.env.EVOLUTION_API_URL || 'http://localhost:8080').replace(/\/$/, '');
            const apiKey = process.env.EVOLUTION_API_KEY || '';
            const instanceName = process.env.EVOLUTION_INSTANCE_NAME || 'sigma-principal';
            const targetSession = req.params.sessionId === 'default' ? instanceName : req.params.sessionId;
            const response = await fetch(`${evolutionUrl}/instance/connect/${encodeURIComponent(targetSession)}`, {
                headers: { apikey: apiKey }
            });
            const payload = await readJson<{ base64?: string; error?: string }>(response);
            qrCodeDataUrl = payload?.base64;
            errorMessage = payload?.error || (!response.ok ? 'QR Code não disponível na Evolution' : undefined);
        } else {
            const response = await fetch(`${muriloApiBaseUrl}/get-qrcode-image/${encodeURIComponent(req.params.sessionId)}`);
            const payload = await readJson<{ qrCodeDataUrl?: string; message?: string }>(response);
            qrCodeDataUrl = payload?.qrCodeDataUrl;
            errorMessage = payload?.message || (!response.ok ? 'QR Code não disponível no murilo-api' : undefined);
        }

        if (!qrCodeDataUrl) {
            return res.status(400).send(errorMessage || 'QR Code não disponível. Inicie a sessão e tente novamente.');
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
    <img src="${qrCodeDataUrl}" alt="QR Code do WhatsApp" />
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

// Processa payload do webhook em background (sem bloquear resposta HTTP)
async function processWebhookPayload(parsed: Awaited<ReturnType<typeof whatsappProvider.parseIncoming>>, rawPayload: any) {
    const phone = parsed.contact.phone;
    const name = parsed.contact.name || undefined;
    const companyId = await getWebhookCompanyId(); // cached após 1ª chamada

    // Find or create Contact
    let contact = await prisma.contact.findFirst({ where: { companyId, phone } });
    if (!contact) {
        contact = await prisma.contact.create({ data: { companyId, phone, name } });
    } else if (name && contact.name !== name) {
        contact = await prisma.contact.update({ where: { id: contact.id }, data: { name } });
    }

    // Find or create Conversation — reabre fechadas em vez de criar duplicatas
    let conversation = await prisma.conversation.findFirst({
        where: { companyId, contactId: contact.id },
        orderBy: { createdAt: 'desc' },
    });

    let isNewConversation = false;
    let hasInbound = false;
    if (!conversation) {
        conversation = await prisma.conversation.create({
            data: { companyId, contactId: contact.id, status: 'OPEN', startedAt: new Date() },
        });
        isNewConversation = true;
    } else if (conversation.status === 'CLOSED') {
        conversation = await prisma.conversation.update({
            where: { id: conversation.id },
            data: { status: 'OPEN', closedAt: null, startedAt: new Date() },
        });
        isNewConversation = true;
    }

    for (const msg of parsed.messages) {
        if (msg.direction === 'OUTBOUND') {
            if (!msg.waMessageId) continue;
            const existing = await prisma.message.findFirst({
                where: { companyId, conversationId: conversation.id, waMessageId: msg.waMessageId },
            });
            if (existing) continue;
            const message = await prisma.message.create({
                data: { companyId, conversationId: conversation.id, direction: 'OUTBOUND', type: msg.type, body: msg.body, mediaUrl: msg.mediaUrl, waMessageId: msg.waMessageId },
            });
            getIO().to(`conversation:${conversation.id}`).emit('message:new', message);
            continue;
        }

        // INBOUND — deduplicação via whatsAppInboundEvent
        let inboundEvent;
        try {
            inboundEvent = await prisma.whatsAppInboundEvent.create({
                data: {
                    companyId,
                    provider: currentWhatsAppProvider(),
                    providerMessageId: msg.waMessageId || stableInboundMessageId(rawPayload, phone, msg),
                    fromPhone: phone,
                    rawPayload,
                },
            });
        } catch (error: any) {
            if (error?.code === 'P2002') continue; // mensagem duplicada
            throw error;
        }

        const message = await prisma.message.create({
            data: { companyId, conversationId: conversation.id, direction: 'INBOUND', type: msg.type, body: msg.body, mediaUrl: msg.mediaUrl, waMessageId: msg.waMessageId },
        });

        hasInbound = true;

        // Emite socket imediatamente — frontend vê a mensagem antes das writes restantes
        getIO().to(`conversation:${conversation.id}`).emit('message:new', message);

        // Marca inboundEvent como processado em background (não bloqueia o socket emit)
        prisma.whatsAppInboundEvent.update({ where: { id: inboundEvent.id }, data: { processedAt: new Date() } }).catch(() => {});
    }

    // Atualiza lastMessageAt e emite update de conversa (leve, sem includes)
    await prisma.conversation.update({ where: { id: conversation.id }, data: { lastMessageAt: new Date() } });
    emitToCompany(companyId, 'conversation:updated', { id: conversation.id, lastMessageAt: new Date(), contactId: contact.id });

    if (isNewConversation) {
        emitToCompany(companyId, 'conversation:new', { id: conversation.id, contactId: contact.id, contact, status: 'OPEN' });

        // Mensagem de boas-vindas — só se o cliente enviou (INBOUND) e não é grupo
        try {
            const settings = await getCurrentSettings(companyId);
            if (settings.welcomeMessage && hasInbound) {
                const systemMsg = await prisma.message.create({
                    data: { companyId, conversationId: conversation.id, direction: 'SYSTEM', type: 'TEXT', body: settings.welcomeMessage },
                });
                getIO().to(`conversation:${conversation.id}`).emit('message:new', systemMsg);
                getWhatsAppProvider().sendText({ to: phone, body: settings.welcomeMessage }).catch((err) => {
                    console.error('[SIGMA] Falha ao enviar mensagem de boas-vindas:', err);
                });
            }
        } catch (err) {
            console.error('[SIGMA] Falha na mensagem automática:', err);
        }
    }
}

// Main Webhook endpoint for Meta Cloud API messages and events
async function processIncomingWebhook(req: Request, res: ExpressResponse) {
    // Só valida em provider real (meta-cloud e evolution). Mock/debug continuam livres.
    if ((process.env.WHATSAPP_PROVIDER || 'mock') === 'meta-cloud') {
        const rawBody = (req as any).rawBody as Buffer | undefined;
        const signature = req.headers['x-hub-signature-256'] as string | undefined;
        if (!rawBody || !verifyMetaSignature(rawBody, signature)) {
            console.warn('[SIGMA] Webhook rejeitado: assinatura inválida.');
            return res.status(401).json({ error: 'Invalid signature' });
        }
    } else if ((process.env.WHATSAPP_PROVIDER || 'mock') === 'evolution') {
        const evolutionToken = process.env.EVOLUTION_WEBHOOK_TOKEN;
        const queryToken = req.query.token as string | undefined;
        if (evolutionToken && queryToken !== evolutionToken) {
            console.warn('[SIGMA] Webhook rejeitado: token da Evolution inválido.');
            return res.status(401).json({ error: 'Invalid token' });
        }
    }

    try {
        const payload = req.body;

        // Responde 200 imediatamente — Evolution não precisa aguardar o processamento
        res.status(200).json({ ok: true });

        // Todo o processamento em background — não bloqueia a resposta
        setImmediate(async () => {
            try {
                const parsed = await whatsappProvider.parseIncoming(payload);

                if (process.env.EVOLUTION_DEBUG_WEBHOOK === 'true' && parsed.messages.length > 0) {
                    console.log('[SIGMA Webhook] parsed messages:', parsed.messages.map(m => ({
                        type: m.type,
                        hasMedia: !!m.mediaUrl,
                        mediaLen: m.mediaUrl?.length ?? 0,
                        body: m.body?.slice(0, 50),
                    })));
                }

                if (parsed.messages.length === 0) return;

                await processWebhookPayload(parsed, payload);
            } catch (err) {
                console.error('[SIGMA] Erro ao processar webhook em background:', err);
            }
        });
    } catch (error) {
        console.error('Error processing WhatsApp webhook:', error);
        res.status(500).json({ error: 'Internal server error while processing webhook' });
    }
}

router.post(['/webhook', '/webhooks/meta'], rateLimit(60_000, 300, () => 'webhook-global'), processIncomingWebhook);
router.post('/debug/mock-whatsapp/incoming', authMiddleware, requireWhatsAppAdmin, processIncomingWebhook);

// ─── Meta Cloud media proxy ───────────────────────────────────────────────────
// Media URLs returned by Meta require an Authorization header and expire in 5 min.
// Clients request /api/whatsapp/media/:mediaId; we fetch a fresh URL on demand.
router.get('/media/:mediaId', authMiddleware, async (req: Request, res: ExpressResponse) => {
    if ((process.env.WHATSAPP_PROVIDER || 'mock') !== 'meta-cloud') {
        return res.status(400).json({ error: 'Media proxy only available for WHATSAPP_PROVIDER=meta-cloud' });
    }

    const { MetaCloudWhatsAppProvider } = await import('../whatsapp/providers/MetaCloudWhatsAppProvider');
    const provider = whatsappProvider as InstanceType<typeof MetaCloudWhatsAppProvider>;

    if (typeof provider.resolveMediaUrl !== 'function') {
        return res.status(501).json({ error: 'Provider não suporta proxy de mídia.' });
    }

    const media = await provider.resolveMediaUrl(req.params.mediaId);
    if (!media) {
        return res.status(404).json({ error: 'Mídia não encontrada ou expirada.' });
    }

    try {
        const upstream = await fetch(media.url, {
            headers: { Authorization: `Bearer ${process.env.META_WHATSAPP_ACCESS_TOKEN || ''}` },
            signal: AbortSignal.timeout(15000),
        });

        if (!upstream.ok) {
            return res.status(upstream.status).json({ error: 'Erro ao baixar mídia da Meta.' });
        }

        res.setHeader('Content-Type', media.mimeType || upstream.headers.get('content-type') || 'application/octet-stream');
        res.setHeader('Cache-Control', 'private, max-age=300');

        const buffer = Buffer.from(await upstream.arrayBuffer());
        res.send(buffer);
    } catch (error: any) {
        res.status(500).json({ error: error?.message || 'Erro ao baixar mídia.' });
    }
});

export default router;
