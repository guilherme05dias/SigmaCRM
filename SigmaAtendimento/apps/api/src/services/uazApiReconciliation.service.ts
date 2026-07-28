import { ConversationStatus, MessageDirection, MessageType, Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { normalizePhone, phoneAliases } from '../lib/phone';
import { emitToCompany, getIO } from '../socket';
import { getWhatsAppProvider } from '../whatsapp';
import type { IWhatsAppProvider, WhatsAppHistoryChat, WhatsAppHistoryMessage, WhatsAppUnreadChat } from '../whatsapp/IWhatsAppProvider';
import { scheduleConversationFallback } from './conversationFallback.service';
import { invalidateProviderUnreadCounts } from './providerUnread.service';
import { getDefaultDepartmentId } from './defaultDepartment.service';

const DEFAULT_INTERVAL_MS = 60_000;
const MINIMUM_INTERVAL_MS = 15_000;
const DEFAULT_LOOKBACK_MS = 48 * 60 * 60 * 1000;
const MAX_CANDIDATES_PER_RUN = 20;
const HISTORY_MESSAGE_LIMIT = 100;

let reconciliationTimer: NodeJS.Timeout | null = null;
let reconciliationRunning = false;
let reconciliationLastRunAt: Date | null = null;
let reconciliationLastSuccessAt: Date | null = null;
let reconciliationLastError: string | null = null;
let reconciliationLastSummary: UazApiReconciliationSummary | null = null;

export type UazApiReconciliationSummary = {
    inspectedChats: number;
    candidates: number;
    recoveredConversations: number;
    recoveredMessages: number;
};

export type UazApiReconciliationHealth = {
    applicable: boolean;
    enabled: boolean;
    healthy: boolean;
    running: boolean;
    lastRunAt: string | null;
    lastSuccessAt: string | null;
    lastError: string | null;
    lastSummary: UazApiReconciliationSummary | null;
};

type PersistedConversationSnapshot = {
    id: string;
    status: ConversationStatus;
    lastMessageAt: Date | null;
    createdAt: Date;
};

type NormalizedHistoryMessage = WhatsAppHistoryMessage & {
    providerMessageId: string;
    occurredAt: Date;
};

type ReconciliationResult = {
    phone: string;
    createdConversation: boolean;
    conversationId?: string;
    recoveredMessages: number;
    recoveredInbound: number;
};

export function providerTimestampToDate(value: number | null | undefined): Date | null {
    const timestamp = Number(value);
    if (!Number.isFinite(timestamp) || timestamp <= 0) return null;
    const date = new Date(timestamp > 9_999_999_999 ? timestamp : timestamp * 1000);
    return Number.isNaN(date.getTime()) ? null : date;
}

export function shouldReconcileRecentChat(input: {
    providerLastMessageAt: number | null | undefined;
    unreadCount: number;
    persistedLastMessageAt?: Date | null;
    now?: Date;
    lookbackMs?: number;
}): boolean {
    const providerLastMessageAt = providerTimestampToDate(input.providerLastMessageAt);
    if (!providerLastMessageAt) return input.unreadCount > 0;

    const now = input.now || new Date();
    const lookbackMs = input.lookbackMs || DEFAULT_LOOKBACK_MS;
    if (providerLastMessageAt.getTime() < now.getTime() - lookbackMs) return false;
    if (!input.persistedLastMessageAt) return true;
    return providerLastMessageAt > input.persistedLastMessageAt;
}

export function selectMessagesAfter(
    phone: string,
    messages: WhatsAppHistoryMessage[],
    cutoff: Date,
): NormalizedHistoryMessage[] {
    return messages
        .map((message, index) => {
            const occurredAt = providerTimestampToDate(message.timestamp);
            if (!occurredAt || occurredAt <= cutoff) return null;
            return {
                ...message,
                providerMessageId: message.waMessageId || `uazapi_reconcile_${phone}_${message.timestamp || index}_${message.direction}`,
                occurredAt,
            };
        })
        .filter((message): message is NormalizedHistoryMessage => Boolean(message))
        .sort((left, right) => left.occurredAt.getTime() - right.occurredAt.getTime());
}

function configuredIntervalMs(): number {
    const configured = Number(process.env.UAZAPI_RECONCILIATION_INTERVAL_MS || DEFAULT_INTERVAL_MS);
    return Number.isFinite(configured) ? Math.max(MINIMUM_INTERVAL_MS, configured) : DEFAULT_INTERVAL_MS;
}

function configuredLookbackMs(): number {
    const configuredHours = Number(process.env.UAZAPI_RECONCILIATION_LOOKBACK_HOURS || 48);
    return Number.isFinite(configuredHours) && configuredHours > 0
        ? configuredHours * 60 * 60 * 1000
        : DEFAULT_LOOKBACK_MS;
}

function providerContactName(value: string | null | undefined): string | null {
    const name = value?.trim();
    if (!name) return null;
    const normalized = name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    return normalized.includes('suporte sigma') || normalized.includes('sigma pdv') ? null : name;
}

function normalizedMessages(chat: WhatsAppHistoryChat, cutoff: Date): NormalizedHistoryMessage[] {
    return selectMessagesAfter(normalizePhone(chat.phone), chat.messages || [], cutoff)
        .filter((message) => message.direction === MessageDirection.INBOUND || message.direction === MessageDirection.OUTBOUND);
}

async function persistHistoryChat(companyId: string, chat: WhatsAppHistoryChat, lookbackStart: Date): Promise<ReconciliationResult> {
    const phone = normalizePhone(chat.phone);
    if (phone.length < 10) return { phone, createdConversation: false, recoveredMessages: 0, recoveredInbound: 0 };
    const defaultDepartmentId = await getDefaultDepartmentId(companyId);

    const persist = () => prisma.$transaction(async (tx) => {
        let contact = await tx.contact.findFirst({
            where: { companyId, phone: { in: phoneAliases(phone) } },
            orderBy: { createdAt: 'asc' },
        });
        if (!contact) {
            contact = await tx.contact.upsert({
                where: { companyId_phone: { companyId, phone } },
                create: {
                    companyId,
                    phone,
                    name: providerContactName(chat.name),
                    avatarUrl: chat.avatarUrl || null,
                },
                update: {
                    ...(chat.avatarUrl ? { avatarUrl: chat.avatarUrl } : {}),
                },
            });
        }

        const conversations = await tx.conversation.findMany({
            where: { companyId, contactId: contact.id },
            orderBy: { createdAt: 'desc' },
            take: 2,
        });
        const activeConversation = conversations.find((conversation) => conversation.status !== ConversationStatus.CLOSED) || null;
        const latestConversation = conversations[0] || null;
        const cutoff = activeConversation?.lastMessageAt
            || latestConversation?.lastMessageAt
            || lookbackStart;
        const candidates = normalizedMessages(chat, cutoff);
        if (!candidates.length) {
            return { phone, createdConversation: false, recoveredMessages: 0, recoveredInbound: 0 };
        }

        const existingMessages = await tx.message.findMany({
            where: {
                companyId,
                waMessageId: { in: candidates.map((message) => message.providerMessageId) },
            },
            select: { waMessageId: true },
        });
        const existingIds = new Set(existingMessages.map((message) => message.waMessageId).filter(Boolean));
        const missingMessages = candidates.filter((message) => !existingIds.has(message.providerMessageId));
        const missingInbound = missingMessages.filter((message) => message.direction === MessageDirection.INBOUND);
        if (!missingInbound.length) {
            return { phone, createdConversation: false, recoveredMessages: 0, recoveredInbound: 0 };
        }

        let conversation = activeConversation;
        let createdConversation = false;
        if (conversation) {
            // Serializa com o encerramento. Se ele terminou entre a leitura e
            // esta gravação, não anexamos mensagens recuperadas à conversa fechada.
            const claimedConversation = await tx.conversation.updateMany({
                where: { id: conversation.id, companyId, status: { not: ConversationStatus.CLOSED } },
                data: { updatedAt: new Date() },
            });
            if (claimedConversation.count !== 1) conversation = null;
        }
        if (!conversation) {
            conversation = await tx.conversation.create({
                data: {
                    companyId,
                    contactId: contact.id,
                    departmentId: defaultDepartmentId,
                    status: ConversationStatus.OPEN,
                    startedAt: missingInbound[0].occurredAt,
                    queuedAt: new Date(),
                    lastMessageAt: missingMessages[missingMessages.length - 1].occurredAt,
                },
            });
            createdConversation = true;
        }

        const createdMessages = [];
        for (const message of missingMessages) {
            if (message.direction === MessageDirection.INBOUND) {
                await tx.whatsAppInboundEvent.upsert({
                    where: {
                        provider_providerMessageId: {
                            provider: 'UAZAPI',
                            providerMessageId: message.providerMessageId,
                        },
                    },
                    create: {
                        companyId,
                        provider: 'UAZAPI',
                        providerMessageId: message.providerMessageId,
                        fromPhone: phone,
                        conversationId: conversation.id,
                        rawPayload: {
                            source: 'uazapi-reconciliation-worker',
                            providerTimestamp: message.timestamp || null,
                        } satisfies Prisma.InputJsonValue,
                        processedAt: new Date(),
                    },
                    update: {
                        companyId,
                        conversationId: conversation.id,
                        processedAt: new Date(),
                    },
                });
            }

            const createdMessage = await tx.message.create({
                data: {
                    companyId,
                    conversationId: conversation.id,
                    direction: message.direction,
                    type: message.type as MessageType,
                    body: message.body || null,
                    mediaUrl: message.mediaUrl || null,
                    waMessageId: message.providerMessageId,
                    createdAt: message.occurredAt,
                },
            });
            createdMessages.push(createdMessage);
        }

        const latestMessageAt = missingMessages[missingMessages.length - 1].occurredAt;
        const updatedConversation = await tx.conversation.update({
            where: { id: conversation.id },
            data: {
                lastMessageAt: latestMessageAt,
                unreadCount: { increment: missingInbound.length },
            },
            include: {
                contact: true,
                assignedUser: { select: { id: true, name: true, email: true } },
                department: { select: { id: true, name: true } },
                serviceTopic: { select: { id: true, name: true } },
                messages: { orderBy: { createdAt: 'desc' }, take: 1 },
            },
        });

        return {
            phone,
            createdConversation,
            conversationId: updatedConversation.id,
            recoveredMessages: createdMessages.length,
            recoveredInbound: missingInbound.length,
            updatedConversation,
            createdMessages,
        };
    });

    const notifyClients = (result: Awaited<ReturnType<typeof persist>>) => {
        if (!result.updatedConversation || !result.createdMessages) return;
        for (const message of result.createdMessages) {
            getIO().to(`conversation:${result.updatedConversation.id}`).emit('message:new', message);
        }
        emitToCompany(companyId, result.createdConversation ? 'conversation:new' : 'conversation:updated', result.updatedConversation);
        if (result.createdConversation) scheduleConversationFallback({ conversationId: result.updatedConversation.id, companyId });
        invalidateProviderUnreadCounts();
    };

    try {
        const result = await persist();
        notifyClients(result);
        return result;
    } catch (error: any) {
        if (error?.code !== 'P2002') throw error;
        const result = await persist();
        notifyClients(result);
        return result;
    }
}

export async function runUazApiReconciliation(provider: IWhatsAppProvider = getWhatsAppProvider()): Promise<UazApiReconciliationSummary> {
    const companyId = process.env.SIGMA_DEFAULT_COMPANY_ID || process.env.DEFAULT_COMPANY_ID || '';
    if (!companyId || !provider.listChatUnreadCounts) {
        return { inspectedChats: 0, candidates: 0, recoveredConversations: 0, recoveredMessages: 0 };
    }

    const now = new Date();
    const lookbackMs = configuredLookbackMs();
    const summaries = await provider.listChatUnreadCounts();
    const recentChats = summaries
        .filter((chat) => shouldReconcileRecentChat({
            providerLastMessageAt: chat.lastMessageAt,
            unreadCount: chat.unreadCount,
            now,
            lookbackMs,
        }))
        .sort((left, right) => (right.lastMessageAt || 0) - (left.lastMessageAt || 0));

    const aliases = [...new Set(recentChats.flatMap((chat) => phoneAliases(chat.phone)))];
    const contacts = aliases.length
        ? await prisma.contact.findMany({
            where: { companyId, phone: { in: aliases } },
            select: {
                phone: true,
                conversations: {
                    orderBy: { createdAt: 'desc' },
                    take: 1,
                    select: { id: true, status: true, lastMessageAt: true, createdAt: true },
                },
            },
        })
        : [];
    const conversationsByPhone = new Map<string, PersistedConversationSnapshot | null>();
    for (const contact of contacts) {
        const snapshot = contact.conversations[0] || null;
        for (const alias of phoneAliases(contact.phone)) conversationsByPhone.set(alias, snapshot);
    }

    const candidates = recentChats.filter((chat) => {
        const latest = phoneAliases(chat.phone)
            .map((alias) => conversationsByPhone.get(alias))
            .find((snapshot) => snapshot !== undefined) || null;
        return shouldReconcileRecentChat({
            providerLastMessageAt: chat.lastMessageAt,
            unreadCount: chat.unreadCount,
            persistedLastMessageAt: latest?.lastMessageAt || latest?.createdAt || null,
            now,
            lookbackMs,
        });
    }).slice(0, MAX_CANDIDATES_PER_RUN);

    const results: ReconciliationResult[] = [];
    const lookbackStart = new Date(now.getTime() - lookbackMs);
    for (const candidate of candidates) {
        try {
            const [historyChat] = await provider.syncHistory({
                phone: candidate.phone,
                chatLimit: 1,
                messageLimit: HISTORY_MESSAGE_LIMIT,
            });
            if (!historyChat) continue;
            results.push(await persistHistoryChat(companyId, historyChat, lookbackStart));
        } catch (error) {
            console.error(`[SIGMA] Falha ao reconciliar conversa ${normalizePhone(candidate.phone)}:`, error);
        }
    }

    const summary = {
        inspectedChats: summaries.length,
        candidates: candidates.length,
        recoveredConversations: results.filter((result) => result.createdConversation).length,
        recoveredMessages: results.reduce((total, result) => total + result.recoveredMessages, 0),
    };
    if (summary.recoveredMessages > 0) console.info('[SIGMA] Reconciliação UAZAPI recuperou mensagens.', summary);
    return summary;
}

export function getUazApiReconciliationHealth(now = new Date()): UazApiReconciliationHealth {
    const applicable = (process.env.WHATSAPP_PROVIDER || '').trim().toLowerCase() === 'uazapi';
    const enabled = process.env.UAZAPI_RECONCILIATION_ENABLED !== 'false';
    const staleAfterMs = configuredIntervalMs() * 3 + 10_000;
    const stale = Boolean(reconciliationLastSuccessAt
        && now.getTime() - reconciliationLastSuccessAt.getTime() > staleAfterMs);

    return {
        applicable,
        enabled,
        healthy: !applicable || !enabled || (!reconciliationLastError && !stale),
        running: reconciliationRunning,
        lastRunAt: reconciliationLastRunAt?.toISOString() || null,
        lastSuccessAt: reconciliationLastSuccessAt?.toISOString() || null,
        lastError: reconciliationLastError,
        lastSummary: reconciliationLastSummary,
    };
}

export function startUazApiReconciliationWorker(): void {
    if (reconciliationTimer || process.env.UAZAPI_RECONCILIATION_ENABLED === 'false') return;
    if ((process.env.WHATSAPP_PROVIDER || '').trim().toLowerCase() !== 'uazapi') return;

    const run = async () => {
        if (reconciliationRunning) return;
        reconciliationRunning = true;
        try {
            const summary = await runUazApiReconciliation();
            reconciliationLastRunAt = new Date();
            reconciliationLastSuccessAt = reconciliationLastRunAt;
            reconciliationLastError = null;
            reconciliationLastSummary = summary;
        } catch (error) {
            reconciliationLastRunAt = new Date();
            reconciliationLastError = error instanceof Error ? error.message : String(error);
            console.error('[SIGMA] Erro no reconciliador UAZAPI:', error);
        } finally {
            reconciliationRunning = false;
        }
    };

    setTimeout(() => void run(), 5_000);
    reconciliationTimer = setInterval(() => void run(), configuredIntervalMs());
}
