import type { Prisma } from '@prisma/client';
import type {
    AttendanceReportRow,
    ReportBreakdown,
    ReportFilters,
    ReportsSummaryResponse,
    TicketReportRow,
} from '@sigma/shared';
import { prisma } from '../lib/prisma';
import { average, decodeCursor, encodeCursor, REPORT_TIMEZONE } from '../lib/reportFilters';
import { formatContactDisplayName } from '../lib/contactDisplayName';

type Context = {
    companyId: string;
    userId?: string;
    seesAll: boolean;
    filters: ReportFilters;
    startInclusive: Date;
    endExclusive: Date;
};

const dateRange = (context: Context) => ({ gte: context.startInclusive, lt: context.endExclusive });

function conversationScope(context: Context): Prisma.ConversationWhereInput {
    return {
        companyId: context.companyId,
        contact: { is: { includeInServiceReports: true } },
        ...(!context.seesAll && context.userId
            ? { assignedUserId: context.userId }
            : context.filters.responsibleUserId ? { assignedUserId: context.filters.responsibleUserId } : {}),
        ...(context.filters.departmentId ? { departmentId: context.filters.departmentId } : {}),
        ...(context.filters.attendanceStatus ? { status: context.filters.attendanceStatus } : {}),
    };
}

function ticketScope(context: Context): Prisma.TicketWhereInput {
    const ownership: Prisma.TicketWhereInput = !context.seesAll && context.userId
        ? {
            OR: [
                { assignedUserId: context.userId },
                { fieldService: { is: { technicianId: context.userId } } },
                { conversation: { is: { assignedUserId: context.userId } } },
            ],
        }
        : {};

    const responsible: Prisma.TicketWhereInput = context.filters.responsibleUserId
        ? {
            OR: [
                { assignedUserId: context.filters.responsibleUserId },
                { fieldService: { is: { technicianId: context.filters.responsibleUserId } } },
            ],
        }
        : {};

    return {
        AND: [
            { companyId: context.companyId, contact: { is: { includeInServiceReports: true } } },
            ownership,
            responsible,
            context.filters.departmentId ? { departmentId: context.filters.departmentId } : {},
            context.filters.ticketStatus ? { status: context.filters.ticketStatus as any } : {},
            context.filters.origin === 'WHATSAPP' ? { conversationId: { not: null } } : {},
            context.filters.origin === 'MANUAL' ? { conversationId: null } : {},
        ],
    };
}

function ticketPeriod(context: Context): Prisma.TicketWhereInput {
    return {
        OR: [
            { fieldService: { is: { scheduledAt: dateRange(context) } } },
            { fieldService: { is: { scheduledAt: null } }, createdAt: dateRange(context) },
        ],
    };
}

function toBreakdown(values: Array<{ id: string | null; label: string | null }>): ReportBreakdown[] {
    const counts = new Map<string, ReportBreakdown>();
    for (const value of values) {
        const key = value.id ?? '__none__';
        const current = counts.get(key);
        if (current) current.count += 1;
        else counts.set(key, { id: value.id, label: value.label || 'Não definido', count: 1 });
    }
    return [...counts.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'pt-BR'));
}

function secondsBetween(start?: Date | null, end?: Date | null) {
    if (!start || !end || end < start) return null;
    return Math.round((end.getTime() - start.getTime()) / 1000);
}

export async function buildReportsSummary(context: Context): Promise<ReportsSummaryResponse> {
    const conversationWhere: Prisma.ConversationWhereInput = {
        ...conversationScope(context),
        createdAt: dateRange(context),
    };
    const ticketWhere: Prisma.TicketWhereInput = {
        AND: [ticketScope(context), ticketPeriod(context)],
    };

    const [conversations, tickets, messages, completedCount] = await Promise.all([
        prisma.conversation.findMany({
            where: conversationWhere,
            select: {
                id: true,
                status: true,
                queuedAt: true,
                assignedAt: true,
                startedAt: true,
                closedAt: true,
                totalHandleTimeSeconds: true,
                rating: true,
                assignedUserId: true,
                assignedUser: { select: { name: true } },
                departmentId: true,
                department: { select: { name: true } },
                serviceTopicId: true,
                serviceTopic: { select: { name: true } },
                tickets: { select: { id: true }, take: 1 },
            },
        }),
        prisma.ticket.findMany({
            where: ticketWhere,
            select: {
                id: true,
                conversationId: true,
                status: true,
                departmentId: true,
                department: { select: { name: true } },
                fieldService: {
                    select: {
                        status: true,
                        technicianId: true,
                        technician: { select: { name: true } },
                        scheduledAt: true,
                        startedAt: true,
                        finishedAt: true,
                    },
                },
            },
        }),
        prisma.message.groupBy({
            by: ['direction'],
            where: {
                companyId: context.companyId,
                createdAt: dateRange(context),
                conversation: { is: conversationScope({ ...context, filters: { ...context.filters, attendanceStatus: undefined } }) },
            },
            _count: { _all: true },
        }),
        prisma.ticketFieldService.count({
            where: {
                companyId: context.companyId,
                status: 'COMPLETED',
                finishedAt: dateRange(context),
                ticket: { is: ticketScope(context) },
            },
        }),
    ]);

    const waitValues = conversations
        .map((item) => secondsBetween(item.queuedAt, item.assignedAt))
        .filter((value): value is number => value !== null);
    const handleValues = conversations
        .map((item) => item.totalHandleTimeSeconds ?? secondsBetween(item.startedAt, item.closedAt))
        .filter((value): value is number => value !== null && value >= 0);
    const ratings = conversations.map((item) => item.rating).filter((value): value is number => value !== null);
    const converted = conversations.filter((item) => item.tickets.length > 0).length;
    const closed = conversations.filter((item) => item.status === 'CLOSED').length;

    const ratingsByUser = new Map<string, { id: string; label: string; values: number[] }>();
    for (const item of context.filters.type === 'ticket' ? [] : conversations) {
        if (!item.assignedUserId || item.rating === null) continue;
        const current = ratingsByUser.get(item.assignedUserId) ?? {
            id: item.assignedUserId,
            label: item.assignedUser?.name ?? 'Atendente não encontrado',
            values: [],
        };
        current.values.push(item.rating);
        ratingsByUser.set(item.assignedUserId, current);
    }

    const inbound = messages.find((item) => item.direction === 'INBOUND')?._count._all ?? 0;
    const outbound = messages.find((item) => item.direction === 'OUTBOUND')?._count._all ?? 0;
    const executionValues = tickets
        .map((item) => secondsBetween(item.fieldService?.startedAt, item.fieldService?.finishedAt))
        .filter((value): value is number => value !== null);

    const technicianTotals = new Map<string, { userId: string; userName: string; attendanceCount: number; ticketCount: number }>();
    for (const item of context.filters.type === 'ticket' ? [] : conversations) {
        if (!item.assignedUserId || !item.assignedUser) continue;
        const current = technicianTotals.get(item.assignedUserId) ?? {
            userId: item.assignedUserId,
            userName: item.assignedUser.name,
            attendanceCount: 0,
            ticketCount: 0,
        };
        current.attendanceCount += 1;
        technicianTotals.set(item.assignedUserId, current);
    }
    for (const item of context.filters.type === 'attendance' ? [] : tickets) {
        const technicianId = item.fieldService?.technicianId;
        if (!technicianId) continue;
        const current = technicianTotals.get(technicianId) ?? {
            userId: technicianId,
            userName: item.fieldService?.technician?.name ?? 'Técnico não encontrado',
            attendanceCount: 0,
            ticketCount: 0,
        };
        current.ticketCount += 1;
        technicianTotals.set(technicianId, current);
    }

    return {
        filters: context.filters,
        range: {
            startInclusive: context.startInclusive.toISOString(),
            endExclusive: context.endExclusive.toISOString(),
            timezone: REPORT_TIMEZONE,
        },
        attendance: {
            initiated: conversations.length,
            closed,
            currentlyOpen: conversations.filter((item) => item.status !== 'CLOSED').length,
            remotelyResolved: conversations.filter((item) => item.status === 'CLOSED' && item.tickets.length === 0).length,
            convertedToTicket: converted,
            conversionRate: conversations.length ? (converted / conversations.length) * 100 : 0,
            messagesInbound: inbound,
            messagesOutbound: outbound,
            averageWaitSeconds: average(waitValues),
            averageHandleSeconds: average(handleValues),
            csat: average(ratings),
            byAttendant: toBreakdown(conversations.map((item) => ({ id: item.assignedUserId, label: item.assignedUser?.name ?? null }))),
            byDepartment: toBreakdown(conversations.map((item) => ({ id: item.departmentId, label: item.department?.name ?? null }))),
            byTopic: toBreakdown(conversations.map((item) => ({ id: item.serviceTopicId, label: item.serviceTopic?.name ?? null }))),
            csatByAttendant: [...ratingsByUser.values()]
                .map((item) => ({ id: item.id, label: item.label, count: item.values.length, average: average(item.values).value ?? 0 }))
                .sort((a, b) => b.average - a.average || b.count - a.count),
        },
        tickets: {
            created: tickets.length,
            scheduled: tickets.filter((item) => item.fieldService?.status === 'SCHEDULED').length,
            inProgress: tickets.filter((item) => item.fieldService?.status === 'IN_PROGRESS').length,
            completed: completedCount,
            canceled: tickets.filter((item) => item.fieldService?.status === 'CANCELED' || item.status === 'CANCELED').length,
            whatsappOrigin: tickets.filter((item) => item.conversationId !== null).length,
            manualOrigin: tickets.filter((item) => item.conversationId === null).length,
            averageExecutionSeconds: average(executionValues),
            withoutTechnician: tickets.filter((item) => !item.fieldService?.technicianId).length,
            withoutSchedule: tickets.filter((item) => !item.fieldService?.scheduledAt).length,
            byTechnician: toBreakdown(tickets.map((item) => ({ id: item.fieldService?.technicianId ?? null, label: item.fieldService?.technician?.name ?? null }))),
            byStatus: toBreakdown(tickets.map((item) => ({ id: item.fieldService?.status ?? item.status, label: item.fieldService?.status ?? item.status }))),
            byDepartment: toBreakdown(tickets.map((item) => ({ id: item.departmentId, label: item.department?.name ?? null }))),
        },
        technicians: [...technicianTotals.values()]
            .map((item) => ({ ...item, totalCount: item.attendanceCount + item.ticketCount }))
            .sort((a, b) => b.totalCount - a.totalCount || a.userName.localeCompare(b.userName, 'pt-BR')),
    };
}

export async function listAttendanceRecords(context: Context, take: number, cursorValue?: string) {
    const cursor = decodeCursor(cursorValue);
    const where: Prisma.ConversationWhereInput = {
        ...conversationScope(context),
        createdAt: dateRange(context),
        ...(cursor ? {
            OR: [
                { createdAt: { lt: cursor.date } },
                { createdAt: cursor.date, id: { lt: cursor.id } },
            ],
        } : {}),
    };
    const records = await prisma.conversation.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: take + 1,
        select: {
            id: true,
            status: true,
            createdAt: true,
            closedAt: true,
            startedAt: true,
            totalHandleTimeSeconds: true,
            rating: true,
            closeNotes: true,
            closeSummary: true,
            otherTopicDescription: true,
            report: { select: { observation: true } },
            contact: { select: { name: true, phone: true, business: { select: { name: true } }, customer: { select: { name: true } } } },
            assignedUser: { select: { name: true } },
            department: { select: { name: true } },
            serviceTopic: { select: { name: true } },
        },
    });
    const hasMore = records.length > take;
    const page = records.slice(0, take);
    const rows: AttendanceReportRow[] = page.map((item) => ({
        id: item.id,
        contactName: formatContactDisplayName({ personName: item.contact.name, phone: item.contact.phone, companyName: item.contact.business?.name ?? item.contact.customer?.name }),
        companyName: item.contact.business?.name ?? item.contact.customer?.name ?? null,
        attendantName: item.assignedUser?.name ?? null,
        departmentName: item.department?.name ?? null,
        topicName: item.serviceTopic?.name ?? null,
        systemProduct: item.serviceTopic?.name ?? item.otherTopicDescription ?? null,
        observation: item.report?.observation ?? item.closeNotes ?? item.closeSummary ?? null,
        status: item.status,
        createdAt: item.createdAt.toISOString(),
        closedAt: item.closedAt?.toISOString() ?? null,
        durationSeconds: item.totalHandleTimeSeconds ?? secondsBetween(item.startedAt, item.closedAt),
        rating: item.rating,
    }));
    const last = page.at(-1);
    return { records: rows, nextCursor: hasMore && last ? encodeCursor(last.createdAt, last.id) : null };
}

export async function listTicketRecords(context: Context, take: number, cursorValue?: string) {
    const cursor = decodeCursor(cursorValue);
    const where: Prisma.TicketWhereInput = {
        AND: [ticketScope(context), ticketPeriod(context)],
        ...(cursor ? {
            OR: [
                { fieldService: { is: { scheduledAt: { lt: cursor.date } } } },
                { fieldService: { is: { scheduledAt: cursor.date } }, id: { lt: cursor.id } },
                { fieldService: { is: { scheduledAt: null } }, createdAt: { lt: cursor.date } },
                { fieldService: { is: { scheduledAt: null } }, createdAt: cursor.date, id: { lt: cursor.id } },
            ],
        } : {}),
    };
    const records = await prisma.ticket.findMany({
        where,
        orderBy: [{ fieldService: { scheduledAt: 'desc' } }, { createdAt: 'desc' }, { id: 'desc' }],
        take: take + 1,
        select: {
            id: true,
            protocol: true,
            status: true,
            conversationId: true,
            createdAt: true,
            category: true,
            description: true,
            notesInternal: true,
            otherTopicDescription: true,
            contact: { select: { name: true, phone: true, business: { select: { name: true } }, customer: { select: { name: true } } } },
            customer: { select: { name: true } },
            department: { select: { name: true } },
            serviceTopic: { select: { name: true } },
            fieldService: { select: { scheduledAt: true, startedAt: true, finishedAt: true, resolution: true, result: true, serviceDescription: true, technician: { select: { name: true } } } },
        },
    });
    const normalized = records
        .map((item) => ({ item, reportDate: item.fieldService?.scheduledAt ?? item.createdAt }))
        .sort((a, b) => b.reportDate.getTime() - a.reportDate.getTime() || b.item.id.localeCompare(a.item.id));
    const hasMore = normalized.length > take;
    const page = normalized.slice(0, take);
    const rows: TicketReportRow[] = page.map(({ item, reportDate }) => ({
        id: item.id,
        protocol: item.protocol,
        customerName: item.customer?.name ?? item.contact.business?.name ?? item.contact.customer?.name ?? item.contact.name ?? item.contact.phone,
        origin: item.conversationId ? 'WHATSAPP' : 'MANUAL',
        technicianName: item.fieldService?.technician?.name ?? null,
        departmentName: item.department?.name ?? null,
        systemProduct: item.serviceTopic?.name ?? item.otherTopicDescription ?? item.category ?? null,
        observation: item.fieldService?.resolution ?? item.fieldService?.result ?? item.fieldService?.serviceDescription ?? item.notesInternal ?? item.description ?? null,
        scheduledAt: item.fieldService?.scheduledAt?.toISOString() ?? null,
        reportDate: reportDate.toISOString(),
        status: item.status,
        durationSeconds: secondsBetween(item.fieldService?.startedAt, item.fieldService?.finishedAt),
    }));
    const last = page.at(-1);
    return { records: rows, nextCursor: hasMore && last ? encodeCursor(last.reportDate, last.item.id) : null };
}

export type ReportContext = Context;
