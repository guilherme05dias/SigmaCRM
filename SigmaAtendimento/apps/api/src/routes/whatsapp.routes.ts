import { Router, Request, Response as ExpressResponse, NextFunction } from 'express';
import { OutboxStatus } from '@prisma/client';
import { createHash, timingSafeEqual } from 'crypto';
import { prisma } from '../lib/prisma';
import { getWhatsAppProvider } from '../whatsapp';
import { getIO, emitToCompany } from '../socket';
import { getCurrentSettings, isWithinBusinessHours, wasAutomaticMessageSentToday } from '../services/businessHoursService';
import { metaCloudConfig } from '../whatsapp/config/metaCloud.config';
import { authMiddleware } from '../middlewares/auth.middleware';
import { getCompanyId } from '../lib/tenant';
import { env } from '../config/env';
import { requireAdminOrSupervisor } from '../middlewares/authorization.middleware';
import { currentWhatsAppProvider, retryFailedOutbox, sendTextWithOutbox } from '../services/whatsappOutbox.service';
import { verifyMetaSignature } from '../whatsapp/security/verifyMetaSignature';
import { rateLimit } from '../middlewares/rateLimit.middleware';
import { scheduleConversationFallback } from '../services/conversationFallback.service';
import { invalidateProviderUnreadCounts } from '../services/providerUnread.service';
import { normalizePhone, phoneAliases } from '../lib/phone';

const router = Router();
const whatsappProvider = getWhatsAppProvider();
const muriloApiBaseUrl = env.muriloApiBaseUrl;

type ParsedWebhook = Awaited<ReturnType<typeof whatsappProvider.parseIncoming>>;
type ParsedWebhookMessage = ParsedWebhook['messages'][number];

function isMessageMutation(message: ParsedWebhookMessage) {
    return message.event === 'DELETE' || message.event === 'EDIT' || message.event === 'REACTION';
}

function providerContactName(value?: string | null): string | null {
    if (!value?.trim()) return null;
    const normalized = value.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    if (normalized.includes('suporte sigma') || normalized.includes('sigma pdv')) return null;
    return value.trim();
}

function providerMessageId(value: string): string {
    return value.includes(':') ? value.split(':').at(-1) || value : value;
}

function extractSatisfactionRating(body: string | null | undefined): number | null {
    const match = /^\s*(10|[1-9])\s*$/.exec(body || '');
    return match ? Number(match[1]) : null;
}

function inboundProviderMessageId(rawPayload: any, phone: string, message: ParsedWebhookMessage): string {
    return message.waMessageId || stableInboundMessageId(rawPayload, phone, message);
}

function secretMatches(received: unknown, expected: string): boolean {
    if (!expected || typeof received !== 'string') return false;
    const receivedBuffer = Buffer.from(received);
    const expectedBuffer = Buffer.from(expected);
    return receivedBuffer.length === expectedBuffer.length && timingSafeEqual(receivedBuffer, expectedBuffer);
}

function internalOrAdminAuth(req: Request, res: ExpressResponse, next: NextFunction) {
    if (env.internalToken && req.headers['x-internal-token'] === env.internalToken) {
        (req as any).isInternalServiceCall = true;
        return next();
    }
    authMiddleware(req, res, () => requireAdminOrSupervisor(req, res, next));
}

// Cache em memória — evita query ao banco a cada webhook recebido
let _cachedWebhookCompanyId: string | null = null;

async function getWebhookCompanyId(): Promise<string> {
    if (_cachedWebhookCompanyId) return _cachedWebhookCompanyId;

    const configuredCompanyId = env.defaultCompanyId;

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

router.get('/sessions', authMiddleware, requireAdminOrSupervisor, async (_req: Request, res: ExpressResponse) => {
    try {
        const sessions = await whatsappProvider.listSessions();
        res.json(sessions.map((session) => ({ ...session, provider: process.env.WHATSAPP_PROVIDER || 'mock' })));
    } catch (error: any) {
        res.status(500).json({ error: error?.message ?? 'Failed to list WhatsApp sessions' });
    }
});

router.get('/groups', authMiddleware, requireAdminOrSupervisor, async (req: Request, res: ExpressResponse) => {
    try {
        getCompanyId(req);
        if (!whatsappProvider.listGroups) {
            return res.status(501).json({ error: 'O provider WhatsApp atual nÃ£o suporta listagem de grupos.' });
        }
        const limit = Math.max(1, Math.min(Number(req.query.limit || 500), 500));
        const groups = await whatsappProvider.listGroups({ limit });
        res.json(groups);
    } catch (error: any) {
        res.status(500).json({ error: error?.message ?? 'Erro ao listar grupos do WhatsApp' });
    }
});

router.post('/sessions/:sessionId/start', authMiddleware, requireAdminOrSupervisor, async (req: Request, res: ExpressResponse) => {
    try {
        getCompanyId(req);
        await whatsappProvider.createSession(req.params.sessionId);
        res.status(202).json({ ok: true });
    } catch (error: any) {
        res.status(500).json({ error: error?.message ?? 'Failed to start WhatsApp session' });
    }
});

router.post('/sessions/:sessionId/disconnect', authMiddleware, requireAdminOrSupervisor, async (req: Request, res: ExpressResponse) => {
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
        const chatLimit = Math.max(1, Math.min(Number(req.body?.chatLimit || req.query.chatLimit || 500), 500));
        const messageLimit = Math.max(1, Math.min(Number(req.body?.messageLimit || req.query.messageLimit || 1000), 1000));
        const chats = await whatsappProvider.syncHistory({
            sessionId: req.params.sessionId,
            chatLimit,
            messageLimit,
            phone: typeof req.body?.phone === 'string' ? req.body.phone : undefined,
        });

        let importedContacts = 0;
        let importedConversations = 0;
        let importedMessages = 0;
        let historyRequests = 0;
        const requestOlder = req.body?.requestOlder === true;

        for (const chat of chats) {
            const phone = normalizePhone(chat.phone);
            if (phone.length < 10) continue;
            const chatName = providerContactName(chat.name);

            let contact = await prisma.contact.findFirst({
                where: { companyId, phone: { in: phoneAliases(chat.phone) } },
                orderBy: { createdAt: 'asc' },
            });
            if (!contact) {
                contact = await prisma.contact.create({
                    data: {
                        companyId,
                        phone,
                        name: chatName,
                        avatarUrl: chat.avatarUrl || null,
                    },
                });
                importedContacts += 1;
            } else if (
                contact.companyId !== companyId ||
                contact.phone !== phone ||
                (chat.avatarUrl && contact.avatarUrl !== chat.avatarUrl)
            ) {
                contact = await prisma.contact.update({
                    where: { id: contact.id },
                    data: {
                        companyId,
                        phone,
                        ...(chat.avatarUrl && contact.avatarUrl !== chat.avatarUrl ? { avatarUrl: chat.avatarUrl } : {}),
                    },
                });
            }

            const sortedMessages = [...chat.messages].sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
            const firstMessageAt = fromWhatsAppTimestamp(sortedMessages[0]?.timestamp);
            const lastMessageAt = fromWhatsAppTimestamp(chat.lastMessageAt) || fromWhatsAppTimestamp(sortedMessages[sortedMessages.length - 1]?.timestamp) || new Date();
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
                        // A sincronização traz o acervo do WhatsApp. Mensagens não
                        // lidas no aparelho não significam um atendimento ativo no CRM.
                        status: 'CLOSED',
                        startedAt: firstMessageAt || lastMessageAt,
                        closedAt: lastMessageAt,
                        lastMessageAt,
                    },
                });
                importedConversations += 1;
            } else {
                const effectiveLastMessageAt = conversation.lastMessageAt && conversation.lastMessageAt > lastMessageAt
                    ? conversation.lastMessageAt
                    : lastMessageAt;
                conversation = await prisma.conversation.update({
                    where: { id: conversation.id },
                    data: {
                        // Nunca reabre uma conversa durante a importação. Se já
                        // existe atendimento ativo, ele é preservado como está.
                        lastMessageAt: effectiveLastMessageAt,
                    },
                });
            }

            // Conversas históricas já encerradas entram apenas como referência
            // operacional; o conteúdo não volta a ser persistido após a retenção.
            if (conversation.status === 'CLOSED') continue;

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
                        replyToMessageId: message.replyToProviderMessageId
                            ? (await prisma.message.findFirst({
                                where: {
                                    companyId,
                                    conversationId: conversation.id,
                                    waMessageId: providerMessageId(message.replyToProviderMessageId),
                                },
                                select: { id: true },
                            }))?.id
                            : null,
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
            }

            if (requestOlder && whatsappProvider.requestHistorySync) {
                await whatsappProvider.requestHistorySync({
                    phone,
                    messageId: sortedMessages[0]?.waMessageId || undefined,
                    count: 100,
                });
                historyRequests += 1;
            }
        }

        res.json({
            ok: true,
            scannedChats: chats.length,
            importedContacts,
            importedConversations,
            importedMessages,
            historyRequests,
        });
    } catch (error: any) {
        console.error('Error syncing WhatsApp history:', error);
        res.status(500).json({ error: error?.message || 'Erro ao sincronizar histórico do WhatsApp' });
    }
});

router.get('/sessions/:sessionId/qrcode', authMiddleware, requireAdminOrSupervisor, async (req: Request, res: ExpressResponse) => {
    try {
        const provider = process.env.WHATSAPP_PROVIDER || 'mock';
        if (provider !== 'murilo-api' && provider !== 'evolution' && provider !== 'uazapi') {
            return res.status(400).json({ error: 'QR Code não está disponível para o provedor atual' });
        }

        if (provider === 'uazapi') {
            const qrCode = await whatsappProvider.getQrCode?.();
            if (!qrCode) return res.status(409).json({ error: 'QR Code ainda não disponível. Aguarde alguns segundos e tente novamente.' });
            return res.json({ qrCode });
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

router.get('/sessions/:sessionId/qrcode-image', authMiddleware, requireAdminOrSupervisor, async (req: Request, res: ExpressResponse) => {
    try {
        const provider = process.env.WHATSAPP_PROVIDER || 'mock';
        if (provider !== 'murilo-api' && provider !== 'evolution' && provider !== 'uazapi') {
            return res.status(400).json({ error: 'QR Code não está disponível para o provedor atual' });
        }


        if (provider === 'uazapi') {
            const qrCodeDataUrl = await whatsappProvider.getQrCode?.();
            if (!qrCodeDataUrl) return res.status(409).json({ error: 'QR Code ainda não disponível. Aguarde alguns segundos e tente novamente.' });
            return res.json({ qrCode: qrCodeDataUrl, qrCodeDataUrl });
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

router.get('/sessions/:sessionId/qrcode-page', authMiddleware, requireAdminOrSupervisor, async (req: Request, res: ExpressResponse) => {
    try {
        const provider = process.env.WHATSAPP_PROVIDER || 'mock';
        if (provider !== 'murilo-api' && provider !== 'evolution' && provider !== 'uazapi') {
            return res.status(400).send('QR Code não está disponível para o provedor atual');
        }

        let qrCodeDataUrl: string | undefined;
        let errorMessage: string | undefined;

        if (provider === 'uazapi') {
            qrCodeDataUrl = await whatsappProvider.getQrCode?.() || undefined;
            errorMessage = qrCodeDataUrl ? undefined : 'QR Code ainda não disponível na UAZAPI';
        } else if (provider === 'evolution') {
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
    body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #000000; color: #fafafa; font-family: Inter, Arial, sans-serif; }
    main { width: min(440px, calc(100vw - 32px)); background: #111116; border: 1px solid #32303a; border-radius: 12px; padding: 28px; text-align: center; }
    h1 { margin: 0 0 8px; font-size: 24px; }
    p { margin: 0 0 20px; color: #b0abb8; }
    img { width: 320px; max-width: 100%; background: #fff; border-radius: 8px; padding: 12px; }
    code { display: inline-block; margin-top: 18px; color: #c4b5fd; }
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

router.get('/outbox', authMiddleware, requireAdminOrSupervisor, async (req: Request, res: ExpressResponse) => {
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

router.post('/outbox/retry', authMiddleware, requireAdminOrSupervisor, async (req: Request, res: ExpressResponse) => {
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
async function processWebhookPayload(parsed: ParsedWebhook, rawPayload: any) {
    const phone = normalizePhone(parsed.contact.phone);
    if (phone.length < 10) return;
    const hasInboundCustomerMessage = parsed.messages.some((message) => message.direction === 'INBOUND' && !isMessageMutation(message));
    const name = hasInboundCustomerMessage ? providerContactName(parsed.contact.name) || undefined : undefined;
    const isWhatsAppGroup = parsed.contact.isGroup === true;
    const companyId = await getWebhookCompanyId(); // cached após 1ª chamada
    const eventType = String(rawPayload?.event || rawPayload?.EventType || rawPayload?.eventType || '').toLowerCase();
    const isHistoryEvent = eventType.includes('history');
    let containsOnlyMessageMutations = parsed.messages.length > 0
        && parsed.messages.every(isMessageMutation);

    // Find or create Contact
    let contact = await prisma.contact.findFirst({
        where: { companyId, phone: { in: phoneAliases(parsed.contact.phone) } },
        orderBy: { createdAt: 'asc' },
    });
    if (!contact) {
        if (containsOnlyMessageMutations) return;
        try {
            contact = await prisma.contact.create({ data: { companyId, phone, name, isWhatsAppGroup } });
        } catch (error: any) {
            if (error?.code !== 'P2002') throw error;
            contact = await prisma.contact.findFirst({ where: { companyId, phone } });
            if (!contact) throw error;
        }
    } else if (contact.phone !== phone || (isWhatsAppGroup && !contact.isWhatsAppGroup)) {
        contact = await prisma.contact.update({
            where: { id: contact.id },
            data: {
                ...(contact.phone !== phone ? { phone } : {}),
                ...(isWhatsAppGroup && !contact.isWhatsAppGroup ? { isWhatsAppGroup: true } : {}),
            },
        });
    }

    // Deduplica antes de procurar/criar a conversa. Isso impede que uma segunda
    // entrega do mesmo webhook crie um atendimento vazio. A nota da pesquisa
    // tambem e reservada aqui, antes de qualquer abertura de atendimento.
    const messages: ParsedWebhookMessage[] = [];
    for (const message of parsed.messages) {
        if (message.direction !== 'INBOUND' || isMessageMutation(message)) {
            messages.push(message);
            continue;
        }

        const deduplicationId = inboundProviderMessageId(rawPayload, phone, message);
        const alreadyProcessed = await prisma.whatsAppInboundEvent.findFirst({
            where: {
                provider: currentWhatsAppProvider(),
                providerMessageId: deduplicationId,
            },
            select: { id: true },
        });
        if (alreadyProcessed) continue;

        const rating = message.type === 'TEXT' ? extractSatisfactionRating(message.body) : null;
        if (rating !== null) {
            const pendingRating = await prisma.conversation.findFirst({
                where: {
                    companyId,
                    contactId: contact.id,
                    status: 'CLOSED',
                    ratingRequestedAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
                    ratedAt: null,
                },
                orderBy: { closedAt: 'desc' },
                select: { id: true },
            });

            if (pendingRating) {
                try {
                    const recordedRating = await prisma.$transaction(async (tx) => {
                        const inboundEvent = await tx.whatsAppInboundEvent.create({
                            data: {
                                companyId,
                                provider: currentWhatsAppProvider(),
                                providerMessageId: deduplicationId,
                                fromPhone: phone,
                                conversationId: pendingRating.id,
                                rawPayload: { kind: 'satisfaction_rating' },
                            },
                        });
                        const occurredAt = fromWhatsAppTimestamp(message.timestamp) || new Date();
                        const updated = await tx.conversation.updateMany({
                            where: { id: pendingRating.id, companyId, status: 'CLOSED', ratedAt: null },
                            data: { rating, ratedAt: occurredAt, lastMessageAt: occurredAt },
                        });
                        if (updated.count !== 1) {
                            await tx.whatsAppInboundEvent.update({
                                where: { id: inboundEvent.id },
                                data: { processedAt: new Date() },
                            });
                            return null;
                        }
                        await tx.conversationReport.updateMany({
                            where: { companyId, conversationId: pendingRating.id },
                            data: { rating, ratedAt: occurredAt },
                        });
                        await tx.whatsAppInboundEvent.update({
                            where: { id: inboundEvent.id },
                            data: { processedAt: new Date() },
                        });
                        return { conversationId: pendingRating.id, rating, ratedAt: occurredAt };
                    });

                    if (recordedRating) {
                        emitToCompany(companyId, 'conversation:updated', {
                            id: recordedRating.conversationId,
                            rating: recordedRating.rating,
                            ratedAt: recordedRating.ratedAt,
                        });
                    }
                } catch (error: any) {
                    // Outro consumidor reservou o mesmo evento primeiro.
                    if (error?.code !== 'P2002') throw error;
                }
                continue;
            }
        }

        messages.push(message);
    }

    if (messages.length === 0) return;
    containsOnlyMessageMutations = messages.every(isMessageMutation);
    const providerTimestamps = messages.map((message) => message.timestamp || 0).filter(Boolean);
    const firstProviderAt = fromWhatsAppTimestamp(providerTimestamps.length ? Math.min(...providerTimestamps) : 0);
    const lastProviderAt = fromWhatsAppTimestamp(providerTimestamps.length ? Math.max(...providerTimestamps) : 0);

    // Find or create Conversation.
    // Regra do produto: se o contato voltar depois de um atendimento encerrado,
    // cria sempre um novo atendimento em vez de reabrir o anterior.
    let conversation = await prisma.conversation.findFirst({
        where: {
            companyId,
            contactId: contact.id,
            ...(isHistoryEvent || containsOnlyMessageMutations ? {} : { status: { not: 'CLOSED' as const } }),
        },
        orderBy: { createdAt: 'desc' },
    });

    let isNewConversation = false;
    let hasInbound = false;
    let createdMessageCount = 0;
    if (!conversation) {
        if (containsOnlyMessageMutations) return;
        try {
            conversation = await prisma.conversation.create({
                data: {
                    companyId,
                    contactId: contact.id,
                    status: isHistoryEvent ? 'CLOSED' : 'OPEN',
                    startedAt: firstProviderAt || new Date(),
                    closedAt: isHistoryEvent ? (lastProviderAt || new Date()) : null,
                },
            });
            isNewConversation = true;
        } catch (error: any) {
            if (error?.code !== 'P2002' || isHistoryEvent) throw error;
            conversation = await prisma.conversation.findFirst({
                where: { companyId, contactId: contact.id, status: { not: 'CLOSED' } },
                orderBy: { createdAt: 'desc' },
            });
            if (!conversation) throw error;
        }
    }

    for (const msg of messages) {
        // Reações pertencem a uma mensagem existente. Enquanto não houver uma
        // representação própria para elas, apenas as ignoramos: nunca devem
        // virar texto, aumentar não lidas ou iniciar um novo atendimento.
        if (msg.event === 'REACTION') continue;

        if ((msg.event === 'DELETE' || msg.event === 'EDIT') && msg.waMessageId) {
            const shortProviderMessageId = providerMessageId(msg.waMessageId);
            const existing = await prisma.message.findFirst({
                where: {
                    companyId,
                    OR: [
                        { waMessageId: msg.waMessageId },
                        { waMessageId: shortProviderMessageId },
                        { waMessageId: { endsWith: `:${shortProviderMessageId}` } },
                    ],
                },
            });

            if (existing) {
                const message = await prisma.message.update({
                    where: { id: existing.id },
                    data: msg.event === 'DELETE'
                        ? {
                            deletedAt: new Date(),
                            deletedByCustomer: existing.direction === 'INBOUND',
                        }
                        : {
                            ...(msg.body ? { body: msg.body } : {}),
                            editedAt: new Date(),
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
                        replyToMessage: true,
                    },
                });
                getIO().to(`conversation:${existing.conversationId}`).emit('message:updated', message);
            }
            continue;
        }

        const replyToMessage = msg.replyToProviderMessageId
            ? await prisma.message.findFirst({
                where: {
                    companyId,
                    conversationId: conversation.id,
                    waMessageId: providerMessageId(msg.replyToProviderMessageId),
                },
                select: { id: true },
            })
            : null;

        if (msg.direction === 'OUTBOUND') {
            if (!msg.waMessageId) continue;
            const existing = await prisma.message.findFirst({
                where: { companyId, conversationId: conversation.id, waMessageId: msg.waMessageId },
            });
            if (existing) continue;
            const message = await prisma.message.create({
                data: { companyId, conversationId: conversation.id, direction: 'OUTBOUND', type: msg.type, body: msg.body, mediaUrl: msg.mediaUrl, waMessageId: msg.waMessageId, replyToMessageId: replyToMessage?.id, createdAt: fromWhatsAppTimestamp(msg.timestamp) },
                include: { replyToMessage: true },
            });
            createdMessageCount += 1;
            getIO().to(`conversation:${conversation.id}`).emit('message:new', message);
            continue;
        }

        // INBOUND — reserva do evento, mensagem e contagem precisam ser atômicas.
        // Se qualquer etapa falhar, nenhuma delas fica parcialmente gravada.
        let inboundResult;
        try {
            inboundResult = await prisma.$transaction(async (tx) => {
                const inboundEvent = await tx.whatsAppInboundEvent.create({
                    data: {
                        companyId,
                        provider: currentWhatsAppProvider(),
                        providerMessageId: msg.waMessageId || stableInboundMessageId(rawPayload, phone, msg),
                        fromPhone: phone,
                        conversationId: conversation.id,
                        rawPayload,
                    },
                });
                const message = await tx.message.create({
                    data: { companyId, conversationId: conversation.id, direction: 'INBOUND', type: msg.type, body: msg.body, mediaUrl: msg.mediaUrl, waMessageId: msg.waMessageId, replyToMessageId: replyToMessage?.id, createdAt: fromWhatsAppTimestamp(msg.timestamp) },
                    include: { replyToMessage: true },
                });
                let unreadCount: number | null = null;
                if (!isHistoryEvent) {
                    const unreadConversation = await tx.conversation.update({
                        where: { id: conversation.id },
                        data: { unreadCount: { increment: 1 } },
                        select: { unreadCount: true },
                    });
                    unreadCount = unreadConversation.unreadCount;
                }
                return { inboundEvent, message, unreadCount };
            });
        } catch (error: any) {
            if (error?.code === 'P2002') continue; // mensagem duplicada
            throw error;
        }
        const { inboundEvent, message, unreadCount } = inboundResult;
        createdMessageCount += 1;

        if (unreadCount !== null) {
            invalidateProviderUnreadCounts();
            console.info('[SIGMA] Nova mensagem pendente contabilizada', {
                conversationId: conversation.id,
                unreadCount,
            });
        }

        hasInbound = true;

        // Emite socket imediatamente — frontend vê a mensagem antes das writes restantes
        getIO().to(`conversation:${conversation.id}`).emit('message:new', message);

        // Marca inboundEvent como processado em background (não bloqueia o socket emit)
        prisma.whatsAppInboundEvent.update({ where: { id: inboundEvent.id }, data: { processedAt: new Date() } }).catch(() => {});
    }

    // Confirmações de entrega, edições e exclusões atualizam mensagens existentes,
    // mas não devem reordenar a conversa nem criar contagem de não lidas.
    if (createdMessageCount === 0) return;

    // Atualiza lastMessageAt e emite a conversa completa para a lista do atendente
    // refletir a nova mensagem sem depender de polling.
    const latestProviderTimestamp = Math.max(0, ...messages.map((message) => message.timestamp || 0));
    const providerLastMessageAt = fromWhatsAppTimestamp(latestProviderTimestamp) || new Date();
    const lastMessageAt = conversation.lastMessageAt && conversation.lastMessageAt > providerLastMessageAt
        ? conversation.lastMessageAt
        : providerLastMessageAt;
    const updatedConversation = await prisma.conversation.update({
        where: { id: conversation.id },
        data: { lastMessageAt },
        include: {
            contact: true,
            assignedUser: { select: { id: true, name: true, email: true } },
            department: { select: { id: true, name: true } },
            serviceTopic: { select: { id: true, name: true } },
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
    emitToCompany(companyId, 'conversation:updated', updatedConversation);

    if (isNewConversation && !isHistoryEvent) {
        emitToCompany(companyId, 'conversation:new', { id: conversation.id, contactId: contact.id, contact, status: 'OPEN' });
        scheduleConversationFallback({ conversationId: conversation.id, companyId });
    }

    if (!isHistoryEvent && hasInbound) {
        // Mensagem de boas-vindas — só se o cliente enviou (INBOUND) e não é grupo
        try {
            const settings = await getCurrentSettings(companyId);
            const now = new Date();
            const withinBusinessHours = isWithinBusinessHours(now, settings);
            const automaticBody = (withinBusinessHours ? settings.welcomeMessage : settings.awayMessage)?.trim();
            const previousMarker = withinBusinessHours ? conversation.lastWelcomeSentAt : conversation.lastAwaySentAt;

            // Grupos nunca recebem respostas automaticas. Em contatos individuais,
            // a preferencia desativa somente a saudacao de boas-vindas.
            if (contact.isWhatsAppGroup || (withinBusinessHours && !contact.welcomeMessageEnabled)) return;
            if (!automaticBody || wasAutomaticMessageSentToday(previousMarker, now)) return;

            // Uma conversa já assumida por um atendente não deve receber saudação automática.
            // A mensagem de ausência continua independente, pois informa o horário de atendimento.
            if (withinBusinessHours) {
                const attendantMessage = await prisma.message.findFirst({
                    where: {
                        companyId,
                        conversationId: conversation.id,
                        direction: 'OUTBOUND',
                    },
                    select: { id: true },
                });
                if (attendantMessage) return;
            }

            const claim = withinBusinessHours
                ? await prisma.conversation.updateMany({
                    where: { id: conversation.id, companyId, lastWelcomeSentAt: previousMarker },
                    data: { lastWelcomeSentAt: now },
                })
                : await prisma.conversation.updateMany({
                    where: { id: conversation.id, companyId, lastAwaySentAt: previousMarker },
                    data: { lastAwaySentAt: now },
                });
            if (claim.count !== 1) return;

            let systemMessageId: string | null = null;
            try {
                const systemMessage = await prisma.message.create({
                    data: { companyId, conversationId: conversation.id, direction: 'SYSTEM', type: 'TEXT', body: automaticBody },
                });
                systemMessageId = systemMessage.id;
                const sent = await sendTextWithOutbox({
                    companyId,
                    conversationId: conversation.id,
                    messageId: systemMessage.id,
                    toPhone: phone,
                    body: automaticBody,
                });
                const persistedMessage = await prisma.message.update({
                    where: { id: systemMessage.id },
                    data: { waMessageId: sent.waMessageId },
                });
                getIO().to(`conversation:${conversation.id}`).emit('message:new', persistedMessage);
            } catch (sendError) {
                if (systemMessageId) {
                    await prisma.message.delete({ where: { id: systemMessageId } }).catch(() => {});
                }
                if (withinBusinessHours) {
                    await prisma.conversation.updateMany({
                        where: { id: conversation.id, companyId, lastWelcomeSentAt: now },
                        data: { lastWelcomeSentAt: previousMarker },
                    });
                } else {
                    await prisma.conversation.updateMany({
                        where: { id: conversation.id, companyId, lastAwaySentAt: now },
                        data: { lastAwaySentAt: previousMarker },
                    });
                }
                throw sendError;
            }
        } catch (err) {
            console.error('[SIGMA] Falha na mensagem automática:', err);
        }
    }
}

function authenticatePublicWebhook(req: Request, res: ExpressResponse, next: NextFunction) {
    const provider = process.env.WHATSAPP_PROVIDER?.trim().toLowerCase();
    if (!provider || provider === 'mock') {
        return res.status(503).json({ error: 'Public webhook is not configured' });
    }

    if (provider === 'meta-cloud') {
        const rawBody = (req as any).rawBody as Buffer | undefined;
        const signature = req.headers['x-hub-signature-256'] as string | undefined;
        if (!rawBody || !verifyMetaSignature(rawBody, signature)) {
            console.warn('[SIGMA] Webhook rejeitado: assinatura inválida.');
            return res.status(401).json({ error: 'Invalid signature' });
        }
    } else if (provider === 'evolution') {
        const evolutionToken = process.env.EVOLUTION_WEBHOOK_TOKEN || '';
        const queryToken = req.query.token as string | undefined;
        const headerToken = req.headers['x-webhook-token'];
        if (!secretMatches(queryToken ?? headerToken, evolutionToken)) {
            console.warn('[SIGMA] Webhook rejeitado: token da Evolution inválido.');
            return res.status(401).json({ error: 'Invalid token' });
        }
    } else if (provider === 'uazapi') {
        const receivedToken =
            req.headers['x-webhook-token'] ||
            req.headers['x-signature'] ||
            req.query.token;
        if (!secretMatches(receivedToken, env.uazapiWebhookSecret)) {
            console.warn('[SIGMA] Webhook rejeitado: token da UAZAPI invalido.');
            return res.status(401).json({ error: 'Invalid token' });
        }
    } else if (provider === 'murilo-api') {
        if (!secretMatches(req.headers['x-internal-token'], env.internalToken)) {
            return res.status(401).json({ error: 'Invalid token' });
        }
    } else {
        return res.status(503).json({ error: 'Unsupported webhook provider' });
    }

    return next();
}

// Main Webhook endpoint for messages and events. Authentication is performed
// by authenticatePublicWebhook on public routes; the authenticated mock route
// deliberately bypasses it for local diagnostics.
async function processIncomingWebhook(req: Request, res: ExpressResponse) {
    try {
        const payload = req.body;

        // Responde 200 imediatamente — Evolution não precisa aguardar o processamento
        res.status(200).json({ ok: true });

        // Todo o processamento em background — não bloqueia a resposta
        setImmediate(async () => {
            try {
                const parsed = await whatsappProvider.parseIncoming(payload);

                const batches = parsed.batches?.length ? parsed.batches : [{ contact: parsed.contact, messages: parsed.messages }];
                const allMessages = batches.flatMap((batch) => batch.messages);

                if (process.env.EVOLUTION_DEBUG_WEBHOOK === 'true' && allMessages.length > 0) {
                    console.log('[SIGMA Webhook] parsed messages:', allMessages.map(m => ({
                        type: m.type,
                        hasMedia: !!m.mediaUrl,
                        mediaLen: m.mediaUrl?.length ?? 0,
                        body: m.body?.slice(0, 50),
                    })));
                }

                if (allMessages.length === 0) return;

                for (const batch of batches) {
                    if (batch.messages.length) await processWebhookPayload(batch, payload);
                }
            } catch (err) {
                console.error('[SIGMA] Erro ao processar webhook em background:', err);
            }
        });
    } catch (error) {
        console.error('Error processing WhatsApp webhook:', error);
        res.status(500).json({ error: 'Internal server error while processing webhook' });
    }
}

router.post(['/webhook', '/webhooks/meta'], rateLimit(60_000, 300, () => 'webhook-global'), authenticatePublicWebhook, processIncomingWebhook);
router.post('/debug/mock-whatsapp/incoming', authMiddleware, requireAdminOrSupervisor, processIncomingWebhook);

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
