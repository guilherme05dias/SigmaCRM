import { Router, Request, Response as ExpressResponse } from 'express';
import { prisma } from '../lib/prisma';
import { getWhatsAppProvider } from '../whatsapp';
import { getIO } from '../socket';
import { getCurrentSettings, isWithinBusinessHours } from '../services/businessHoursService';
import { metaCloudConfig } from '../whatsapp/config/metaCloud.config';

const router = Router();
const whatsappProvider = getWhatsAppProvider();
const muriloApiBaseUrl = (process.env.MURILO_WHATSAPP_API_BASE_URL || 'http://localhost:3000').replace(/\/$/, '');

async function readJson<T>(response: globalThis.Response): Promise<T | null> {
    try {
        return (await response.json()) as T;
    } catch {
        return null;
    }
}

router.get('/sessions', async (_req: Request, res: ExpressResponse) => {
    try {
        const sessions = await whatsappProvider.listSessions();
        res.json(sessions);
    } catch (error: any) {
        res.status(500).json({ error: error?.message ?? 'Failed to list WhatsApp sessions' });
    }
});

router.post('/sessions/:sessionId/start', async (req: Request, res: ExpressResponse) => {
    try {
        await whatsappProvider.createSession(req.params.sessionId);
        res.status(202).json({ ok: true });
    } catch (error: any) {
        res.status(500).json({ error: error?.message ?? 'Failed to start WhatsApp session' });
    }
});

router.get('/sessions/:sessionId/qrcode', async (req: Request, res: ExpressResponse) => {
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

router.get('/sessions/:sessionId/qrcode-image', async (req: Request, res: ExpressResponse) => {
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

router.get('/sessions/:sessionId/qrcode-page', async (req: Request, res: ExpressResponse) => {
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
router.post(['/webhook', '/webhooks/meta', '/debug/mock-whatsapp/incoming'], async (req: Request, res: ExpressResponse) => {
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

        // Find or create Contact
        let contact = await prisma.contact.findUnique({
            where: { phone },
        });

        if (!contact) {
            contact = await prisma.contact.create({
                data: { phone, name },
            });
        } else if (name && contact.name !== name) {
            contact = await prisma.contact.update({
                where: { id: contact.id },
                data: { name },
            });
        }

        // Find or create Conversation
        let conversation = await prisma.conversation.findFirst({
            where: {
                contactId: contact.id,
                status: { in: ['OPEN', 'ASSIGNED'] },
            },
            orderBy: { createdAt: 'desc' },
        });

        let isNewConversation = false;
        if (!conversation) {
            conversation = await prisma.conversation.create({
                data: {
                    contactId: contact.id,
                    status: 'OPEN',
                },
            });
            isNewConversation = true;
        }

        // Process Messages
        for (const msg of parsed.messages) {
            if (msg.direction === 'INBOUND') {
                const message = await prisma.message.create({
                    data: {
                        conversationId: conversation.id,
                        direction: 'INBOUND',
                        type: msg.type,
                        body: msg.body,
                        mediaUrl: msg.mediaUrl,
                        waMessageId: msg.waMessageId,
                    },
                });

                getIO().to(`conversation:${conversation.id}`).emit('message:new', message);
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

        getIO().emit('conversation:updated', updatedConversation);

        // Auto Messages Logic for New Conversations
        if (isNewConversation) {
            try {
                const settings = await getCurrentSettings();
                const isOpen = isWithinBusinessHours(new Date(), settings);

                const autoMessageText = isOpen ? settings.welcomeMessage : settings.awayMessage;

                if (autoMessageText) {
                    // Save system message
                    const systemMsg = await prisma.message.create({
                        data: {
                            conversationId: conversation.id,
                            direction: 'SYSTEM',
                            type: 'TEXT',
                            body: autoMessageText,
                        }
                    });

                    // Emit to frontend (so the agent sees the system message)
                    getIO().to(`conversation:${conversation.id}`).emit('message:new', systemMsg);

                    // Send via WhatsApp
                    await whatsappProvider.sendText({
                        to: phone,
                        body: autoMessageText
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
});

export default router;
