import { ConversationStatus } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { emitToCompany } from '../socket';
import { notifyConversationFallbackAssigned, notifyConversationQueued } from './notification.service';
import { isDefaultSupportDepartmentName } from './defaultDepartment.service';

const FALLBACK_DELAY_MS = 2 * 60 * 1000;
const fallbackTimers = new Map<string, NodeJS.Timeout>();
let fallbackWorker: NodeJS.Timeout | null = null;

export function cancelConversationFallback(conversationId: string) {
    const timer = fallbackTimers.get(conversationId);
    if (!timer) return;

    clearTimeout(timer);
    fallbackTimers.delete(conversationId);
}

export function scheduleConversationFallback(input: {
    conversationId: string;
    companyId: string;
}) {
    cancelConversationFallback(input.conversationId);

    const timer = setTimeout(async () => {
        fallbackTimers.delete(input.conversationId);
        await assignFallback(input);
    }, FALLBACK_DELAY_MS);

    fallbackTimers.set(input.conversationId, timer);
}

export function startConversationFallbackWorker() {
    if (fallbackWorker) return;
    const run = () => Promise.all([processPendingQueueNotifications(), processPendingFallbacks()]).catch((error) => {
        console.error('[SIGMA] Erro no verificador de fila de atendimento:', error);
    });
    run();
    fallbackWorker = setInterval(run, 5_000);
}

async function processPendingQueueNotifications() {
    const pending = await prisma.conversation.findMany({
        where: { status: ConversationStatus.OPEN, assignedUserId: null, isTransferred: false, queueNotifiedAt: null },
        select: { id: true, companyId: true, contact: { select: { name: true, phone: true } } },
        take: 100,
    });
    await Promise.all(pending.map(async (conversation) => {
        if (!conversation.companyId) return;
        const claimed = await prisma.conversation.updateMany({
            where: { id: conversation.id, companyId: conversation.companyId, status: ConversationStatus.OPEN, assignedUserId: null, isTransferred: false, queueNotifiedAt: null },
            data: { queueNotifiedAt: new Date() },
        });
        if (!claimed.count) return;
        await notifyConversationQueued({ companyId: conversation.companyId, conversationId: conversation.id, contactName: conversation.contact?.name, contactPhone: conversation.contact?.phone });
    }));
}

async function processPendingFallbacks() {
    const threshold = new Date(Date.now() - FALLBACK_DELAY_MS);
    const pending = await prisma.conversation.findMany({
        where: {
            status: ConversationStatus.OPEN,
            assignedUserId: null,
            isTransferred: false,
            fallbackAssignedAt: null,
            createdAt: { lte: threshold },
        },
        select: { id: true, companyId: true, department: { select: { name: true } } },
        take: 100,
    });
    await Promise.all(pending
        .filter((conversation) => Boolean(conversation.companyId)
            && (!conversation.department || isDefaultSupportDepartmentName(conversation.department.name)))
        .map((conversation) => assignFallback({ conversationId: conversation.id, companyId: conversation.companyId! })));
}

async function assignFallback(input: { conversationId: string; companyId: string }) {
    try {
        const conversation = await prisma.conversation.findFirst({
            where: { id: input.conversationId, companyId: input.companyId },
            include: {
                contact: true,
                assignedUser: { select: { id: true, name: true, email: true } },
                department: { select: { id: true, name: true } },
                serviceTopic: { select: { id: true, name: true } },
                messages: { orderBy: { createdAt: 'desc' }, take: 1, select: { id: true, direction: true, type: true, body: true, createdAt: true, waMessageId: true } },
            },
        });
        if (!conversation || conversation.status !== ConversationStatus.OPEN || conversation.assignedUserId || conversation.isTransferred) return;
        if (conversation.departmentId && !isDefaultSupportDepartmentName(conversation.department?.name)) return;

        const company = await prisma.company.findFirst({
            where: { id: input.companyId, active: true },
            select: { defaultTechnicianId: true, defaultTechnician: { select: { id: true, active: true, role: true } } },
        });
        const canBeDefaultTechnician = company?.defaultTechnician
            && ['TECHNICIAN', 'ADMIN'].includes(company.defaultTechnician.role);
        if (!company?.defaultTechnicianId || !company.defaultTechnician?.active || !canBeDefaultTechnician) return;

        const claimed = await prisma.conversation.updateMany({
            where: { id: conversation.id, companyId: input.companyId, status: ConversationStatus.OPEN, assignedUserId: null, isTransferred: false, fallbackAssignedAt: null },
            data: { assignedUserId: company.defaultTechnicianId, status: ConversationStatus.ASSIGNED, assignedAt: conversation.assignedAt ?? new Date(), fallbackAssignedAt: new Date() },
        });
        if (!claimed.count) return;

        const updated = await prisma.conversation.findUniqueOrThrow({
            where: { id: conversation.id },
            include: {
                contact: true,
                assignedUser: { select: { id: true, name: true, email: true } },
                department: { select: { id: true, name: true } },
                serviceTopic: { select: { id: true, name: true } },
                messages: { orderBy: { createdAt: 'desc' }, take: 1, select: { id: true, direction: true, type: true, body: true, createdAt: true, waMessageId: true } },
            },
        });
        await notifyConversationFallbackAssigned({ companyId: input.companyId, userId: company.defaultTechnicianId, conversationId: updated.id, contactName: updated.contact?.name, contactPhone: updated.contact?.phone });
        emitToCompany(input.companyId, 'conversation:updated', updated);
    } catch (error) {
        console.error('[SIGMA] Erro ao executar fallback automático da conversa:', error);
    }
}
