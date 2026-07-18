import { OutboxStatus, Prisma, WhatsAppProvider } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { getWhatsAppProvider } from '../whatsapp';
import { normalizePhone } from '../lib/phone';

type TextPayload = {
  kind: 'text';
  body: string;
  replyToMessageId?: string;
};
type MediaPayload = { kind: 'media'; type: 'IMAGE' | 'AUDIO' | 'VIDEO' | 'DOCUMENT'; fileName: string; caption: string | null; replyToMessageId?: string };

export function currentWhatsAppProvider(): WhatsAppProvider {
  const provider = process.env.WHATSAPP_PROVIDER || 'mock';
  if (provider === 'meta-cloud') return WhatsAppProvider.META;
  if (provider === 'uazapi') return WhatsAppProvider.UAZAPI;
  if (provider === 'murilo-api' || provider === 'waha') return WhatsAppProvider.WAHA;
  return WhatsAppProvider.MOCK;
}

function normalizeWhatsAppRecipient(value: string): string {
  const trimmed = value.trim();
  if (trimmed.includes('@g.us')) return trimmed;
  const digits = trimmed.replace(/\D/g, '');
  if (digits.length >= 15 && !digits.startsWith('55')) return `${digits}@g.us`;
  return normalizePhone(trimmed);
}

export async function sendTextWithOutbox(params: {
  companyId?: string | null;
  conversationId?: string | null;
  messageId?: string | null;
  toPhone: string;
  body: string;
  phoneNumberId?: string | null;
  sessionId?: string;
  replyToMessageId?: string;
}) {
  const payload: TextPayload = { kind: 'text', body: params.body, replyToMessageId: params.replyToMessageId };
  const outbox = await prisma.whatsAppOutbox.create({
    data: {
      companyId: params.companyId ?? null,
      conversationId: params.conversationId ?? null,
      messageId: params.messageId ?? null,
      provider: currentWhatsAppProvider(),
      phoneNumberId: params.phoneNumberId ?? null,
      toPhone: normalizeWhatsAppRecipient(params.toPhone),
      payload: payload as unknown as Prisma.InputJsonValue,
      status: OutboxStatus.PENDING,
    },
  });

  try {
    const result = await getWhatsAppProvider().sendText({
      to: params.toPhone,
      body: params.body,
      sessionId: params.sessionId,
      replyToMessageId: params.replyToMessageId,
    });

    await prisma.whatsAppOutbox.update({
      where: { id: outbox.id },
      data: {
        status: OutboxStatus.SENT,
        attempts: { increment: 1 },
        lastError: null,
        providerMessageId: result.waMessageId,
      },
    });

    if (params.messageId) {
      await prisma.message.update({
        where: { id: params.messageId },
        data: { waMessageId: result.waMessageId },
      });
    }

    return { outboxId: outbox.id, waMessageId: result.waMessageId };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Falha ao enviar mensagem WhatsApp';
    await prisma.whatsAppOutbox.update({
      where: { id: outbox.id },
      data: {
        status: OutboxStatus.FAILED,
        attempts: { increment: 1 },
        lastError: message,
      },
    });
    throw error;
  }
}

export async function sendMediaWithOutbox(params: { companyId?: string | null; conversationId?: string | null; messageId?: string | null; toPhone: string; type: 'IMAGE' | 'AUDIO' | 'VIDEO' | 'DOCUMENT'; mediaUrl: string; fileName: string; caption?: string | null; replyToMessageId?: string }) {
  const payload: MediaPayload = { kind: 'media', type: params.type, fileName: params.fileName, caption: params.caption ?? null, replyToMessageId: params.replyToMessageId };
  const outbox = await prisma.whatsAppOutbox.create({ data: { companyId: params.companyId ?? null, conversationId: params.conversationId ?? null, messageId: params.messageId ?? null, provider: currentWhatsAppProvider(), toPhone: normalizeWhatsAppRecipient(params.toPhone), payload: payload as unknown as Prisma.InputJsonValue, status: OutboxStatus.PENDING } });
  try {
    const result = await getWhatsAppProvider().sendMedia({ to: params.toPhone, type: params.type, mediaUrl: params.mediaUrl, caption: params.caption || undefined, replyToMessageId: params.replyToMessageId });
    await prisma.whatsAppOutbox.update({ where: { id: outbox.id }, data: { status: OutboxStatus.SENT, attempts: { increment: 1 }, lastError: null, providerMessageId: result.waMessageId } });
    if (params.messageId) await prisma.message.update({ where: { id: params.messageId }, data: { waMessageId: result.waMessageId } });
    return { outboxId: outbox.id, waMessageId: result.waMessageId };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Falha ao enviar mídia WhatsApp';
    await prisma.whatsAppOutbox.update({ where: { id: outbox.id }, data: { status: OutboxStatus.FAILED, attempts: { increment: 1 }, lastError: message } });
    throw error;
  }
}

export async function retryFailedOutbox(params: { companyId?: string; limit?: number }) {
  const limit = Math.max(1, Math.min(params.limit ?? 25, 100));
  const rows = await prisma.whatsAppOutbox.findMany({
    where: {
      status: OutboxStatus.FAILED,
      ...(params.companyId ? { companyId: params.companyId } : {}),
    },
    orderBy: { updatedAt: 'asc' },
    take: limit,
  });

  let sent = 0;
  let failed = 0;

  for (const row of rows) {
    const payload = row.payload as Partial<TextPayload> | null;
    if (payload?.kind !== 'text' || !payload.body) {
      failed += 1;
      await prisma.whatsAppOutbox.update({
        where: { id: row.id },
        data: {
          attempts: { increment: 1 },
          lastError: 'Payload de outbox não suportado para retry automático.',
        },
      });
      continue;
    }

    try {
      const result = await getWhatsAppProvider().sendText({
        to: row.toPhone,
        body: payload.body,
        replyToMessageId: payload.replyToMessageId,
      });

      await prisma.whatsAppOutbox.update({
        where: { id: row.id },
        data: {
          status: OutboxStatus.SENT,
          attempts: { increment: 1 },
          lastError: null,
          providerMessageId: result.waMessageId,
        },
      });

      if (row.messageId) {
        await prisma.message.update({
          where: { id: row.messageId },
          data: { waMessageId: result.waMessageId },
        });
      }

      sent += 1;
    } catch (error) {
      failed += 1;
      await prisma.whatsAppOutbox.update({
        where: { id: row.id },
        data: {
          attempts: { increment: 1 },
          lastError: error instanceof Error ? error.message : 'Falha no retry do WhatsApp',
        },
      });
    }
  }

  return { scanned: rows.length, sent, failed };
}
