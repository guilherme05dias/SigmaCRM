import { OutboxStatus, Prisma, WhatsAppProvider } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { getWhatsAppProvider } from '../whatsapp';

type TextPayload = {
  kind: 'text';
  body: string;
};

function normalizePhone(value: string) {
  return value.replace(/\D/g, '');
}

export function currentWhatsAppProvider(): WhatsAppProvider {
  const provider = process.env.WHATSAPP_PROVIDER || 'mock';
  if (provider === 'meta-cloud') return WhatsAppProvider.META;
  if (provider === 'murilo-api' || provider === 'waha') return WhatsAppProvider.WAHA;
  return WhatsAppProvider.MOCK;
}

export async function sendTextWithOutbox(params: {
  companyId?: string | null;
  conversationId?: string | null;
  messageId?: string | null;
  toPhone: string;
  body: string;
  phoneNumberId?: string | null;
  sessionId?: string;
}) {
  const payload: TextPayload = { kind: 'text', body: params.body };
  const outbox = await prisma.whatsAppOutbox.create({
    data: {
      companyId: params.companyId ?? null,
      conversationId: params.conversationId ?? null,
      messageId: params.messageId ?? null,
      provider: currentWhatsAppProvider(),
      phoneNumberId: params.phoneNumberId ?? null,
      toPhone: normalizePhone(params.toPhone),
      payload: payload as unknown as Prisma.InputJsonValue,
      status: OutboxStatus.PENDING,
    },
  });

  try {
    const result = await getWhatsAppProvider().sendText({
      to: params.toPhone,
      body: params.body,
      sessionId: params.sessionId,
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
