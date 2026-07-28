import { Router, Request, Response } from 'express';
import { ZodError } from 'zod';
import { prisma } from '../lib/prisma';
import { authMiddleware } from '../middlewares/auth.middleware';
import { canViewAll } from '../middlewares/authorization.middleware';
import { getCompanyId } from '../lib/tenant';
import { formatContactDisplayName } from '../lib/contactDisplayName';
import { parseReportFilters, todayRange } from '../lib/reportFilters';
import { localReportDate as localDate, reportDuration as duration, serializeCsv } from '../lib/reportCsv';
import { createReportWorkbook } from '../lib/reportExcel';
import {
    buildReportsSummary,
    listAttendanceRecords,
    listTicketRecords,
    type ReportContext,
} from '../services/reports.service';

const router = Router();
router.use(authMiddleware);

function contextFromRequest(req: Request): ReportContext {
    const parsed = parseReportFilters(req.query as Record<string, unknown>);
    const seesAll = canViewAll(req.user?.role);
    if (!seesAll && parsed.filters.responsibleUserId && parsed.filters.responsibleUserId !== req.user?.id) {
        throw Object.assign(new Error('Você não tem permissão para consultar dados de outro responsável.'), { status: 403 });
    }
    return {
        companyId: getCompanyId(req),
        userId: req.user?.id,
        seesAll,
        ...parsed,
    };
}

function sendReportError(res: Response, error: unknown, fallback: string) {
    if (error instanceof Error && 'status' in error && typeof (error as any).status === 'number') {
        return res.status((error as any).status).json({ error: error.message });
    }
    if (error instanceof ZodError) {
        return res.status(400).json({ error: error.issues[0]?.message || 'Filtros inválidos.' });
    }
    if (error instanceof Error && /Data inválida|data inicial|Cursor inválido/.test(error.message)) {
        return res.status(400).json({ error: error.message });
    }
    console.error(fallback, error);
    return res.status(500).json({ error: fallback });
}

router.get('/dashboard', async (req: Request, res: Response) => {
    try {
        const companyId = getCompanyId(req);
        const userId = req.user?.id;
        const seesAll = canViewAll(req.user?.role);
        const conversationOwnership = seesAll || !userId ? {} : { assignedUserId: userId };
        const fieldOwnership = seesAll || !userId ? {} : {
            OR: [
                { technicianId: userId },
                { ticket: { is: { assignedUserId: userId } } },
                { ticket: { is: { conversation: { is: { assignedUserId: userId } } } } },
            ],
        };
        const reportableContact = { includeInServiceReports: true };
        const today = todayRange();
        const [queueCount, activeConversations, visitsToday, pendingVisits, recentConversations, recentVisits] = await Promise.all([
            prisma.conversation.count({ where: { companyId, status: 'OPEN', contact: { is: reportableContact }, ...conversationOwnership } }),
            prisma.conversation.count({ where: { companyId, status: 'ASSIGNED', contact: { is: reportableContact }, ...conversationOwnership } }),
            prisma.ticketFieldService.count({
                where: {
                    companyId,
                    ...fieldOwnership,
                    ticket: { is: { contact: { is: reportableContact } } },
                    OR: [
                        { scheduledAt: { gte: today.startInclusive, lt: today.endExclusive } },
                        { visitWindowStart: { gte: today.startInclusive, lt: today.endExclusive } },
                    ],
                },
            }),
            prisma.ticketFieldService.count({
                where: {
                    companyId,
                    ...fieldOwnership,
                    ticket: { is: { contact: { is: reportableContact } } },
                    status: { in: ['PENDING', 'SCHEDULED', 'IN_PROGRESS'] },
                },
            }),
            prisma.conversation.findMany({
                where: { companyId, contact: { is: reportableContact }, ...conversationOwnership },
                orderBy: [{ lastMessageAt: 'desc' }, { createdAt: 'desc' }],
                take: 5,
                include: {
                    contact: { include: { customer: { select: { name: true } }, business: { select: { name: true } } } },
                    assignedUser: { select: { id: true, name: true } },
                    department: true,
                    serviceTopic: true,
                },
            }),
            prisma.ticketFieldService.findMany({
                where: { companyId, ...fieldOwnership, ticket: { is: { contact: { is: reportableContact } } } },
                orderBy: [{ scheduledAt: 'desc' }, { createdAt: 'desc' }],
                take: 5,
                include: {
                    technician: { select: { id: true, name: true } },
                    ticket: { include: { contact: true, customer: true } },
                },
            }),
        ]);

        res.json({
            range: 'operational',
            startDate: today.startInclusive,
            endDate: today.endExclusive,
            metrics: {
                queueCount,
                activeConversations,
                visitsToday,
                pendingVisits,
                totalConversationsOpened: queueCount + activeConversations,
                totalMessages: 0,
                totalTicketsOpened: pendingVisits,
                totalTicketsResolved: 0,
                conversationsByDepartment: [],
                ticketsByTechnician: [],
                csat: { average: null, count: 0 },
                recentConversations: recentConversations.map((conversation) => ({
                    id: conversation.id,
                    status: conversation.status,
                    contactName: formatContactDisplayName({
                        personName: conversation.contact.name,
                        phone: conversation.contact.phone,
                        companyName: conversation.contact.business?.name ?? conversation.contact.customer?.name,
                    }),
                    contactPhone: conversation.contact.phone,
                    assignedUserName: conversation.assignedUser?.name ?? null,
                    departmentName: conversation.department?.name ?? null,
                    serviceTopicName: conversation.serviceTopic?.name ?? null,
                    lastMessageAt: conversation.lastMessageAt,
                    createdAt: conversation.createdAt,
                })),
                recentVisits: recentVisits.map((fieldService) => ({
                    id: fieldService.id,
                    ticketId: fieldService.ticketId,
                    protocol: fieldService.ticket.protocol,
                    title: fieldService.ticket.title,
                    status: fieldService.status,
                    ticketStatus: fieldService.ticket.status,
                    priority: fieldService.ticket.priority,
                    scheduledAt: fieldService.scheduledAt,
                    visitWindowStart: fieldService.visitWindowStart,
                    technicianName: fieldService.technician?.name ?? null,
                    customerName: fieldService.ticket.customer?.name ?? fieldService.ticket.contact.name ?? null,
                    contactPhone: fieldService.ticket.contact.phone,
                })),
            },
        });
    } catch (error) {
        sendReportError(res, error, 'Erro ao gerar o dashboard operacional.');
    }
});

router.get('/summary', async (req: Request, res: Response) => {
    try {
        res.json(await buildReportsSummary(contextFromRequest(req)));
    } catch (error) {
        sendReportError(res, error, 'Erro ao gerar relatório.');
    }
});

router.get('/records', async (req: Request, res: Response) => {
    try {
        const context = contextFromRequest(req);
        const type = req.query.type;
        if (type !== 'attendance' && type !== 'ticket') {
            return res.status(400).json({ error: 'Informe type=attendance ou type=ticket.' });
        }
        const take = Math.max(1, Math.min(Number(req.query.take || 25), 100));
        const cursor = typeof req.query.cursor === 'string' ? req.query.cursor : undefined;
        res.json(type === 'attendance'
            ? await listAttendanceRecords(context, take, cursor)
            : await listTicketRecords(context, take, cursor));
    } catch (error) {
        sendReportError(res, error, 'Erro ao listar registros do relatório.');
    }
});

router.get('/export.csv', async (req: Request, res: Response) => {
    try {
        const context = contextFromRequest(req);
        const type = context.filters.type;
        const [attendance, tickets] = await Promise.all([
            type !== 'ticket' ? listAttendanceRecords(context, 5000) : Promise.resolve({ records: [] }),
            type !== 'attendance' ? listTicketRecords(context, 5000) : Promise.resolve({ records: [] }),
        ]);
        let rows: unknown[][];
        if (type === 'attendance') {
            rows = [
                ['Cliente / Contato', 'Empresa', 'Técnico / Atendente', 'Data', 'Sistema / Produto', 'Observação', 'Departamento', 'Status', 'Encerramento', 'Duração', 'Avaliação'],
                ...attendance.records.map((item) => [item.contactName, item.companyName, item.attendantName, localDate(item.createdAt), item.systemProduct, item.observation, item.departmentName, item.status, localDate(item.closedAt), duration(item.durationSeconds), item.rating]),
            ];
        } else if (type === 'ticket') {
            rows = [
                ['Protocolo', 'Cliente', 'Origem', 'Técnico', 'Data', 'Sistema / Produto', 'Observação', 'Departamento', 'Status', 'Duração'],
                ...tickets.records.map((item) => [item.protocol, item.customerName, item.origin === 'WHATSAPP' ? 'WhatsApp' : 'Manual', item.technicianName, localDate(item.reportDate), item.systemProduct, item.observation, item.departmentName, item.status, duration(item.durationSeconds)]),
            ];
        } else {
            rows = [
                ['Tipo', 'Identificador', 'Cliente / Contato', 'Empresa / Origem', 'Responsável', 'Data', 'Sistema / Produto', 'Observação', 'Departamento', 'Status', 'Duração', 'Avaliação'],
                ...attendance.records.map((item) => ['Atendimento', item.id, item.contactName, item.companyName, item.attendantName, localDate(item.createdAt), item.systemProduct, item.observation, item.departmentName, item.status, duration(item.durationSeconds), item.rating]),
                ...tickets.records.map((item) => ['Chamado', item.protocol ?? item.id, item.customerName, item.origin === 'WHATSAPP' ? 'WhatsApp' : 'Manual', item.technicianName, localDate(item.reportDate), item.systemProduct, item.observation, item.departmentName, item.status, duration(item.durationSeconds), '']),
            ];
        }
        const csv = serializeCsv(rows);
        const filename = `relatorio-${type}-${context.filters.from}-a-${context.filters.to}.csv`;
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.send(csv);
    } catch (error) {
        sendReportError(res, error, 'Erro ao exportar relatório.');
    }
});

router.get('/export.xlsx', async (req: Request, res: Response) => {
    try {
        const context = contextFromRequest(req);
        const type = context.filters.type;
        const [summary, attendance, tickets] = await Promise.all([
            buildReportsSummary(context),
            type !== 'ticket' ? listAttendanceRecords(context, 5000) : Promise.resolve({ records: [] }),
            type !== 'attendance' ? listTicketRecords(context, 5000) : Promise.resolve({ records: [] }),
        ]);
        const workbook = await createReportWorkbook({
            summary,
            attendances: attendance.records,
            tickets: tickets.records,
            type,
        });
        const filename = `relatorio-tecnico-${type}-${context.filters.from}-a-${context.filters.to}.xlsx`;
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.send(workbook);
    } catch (error) {
        sendReportError(res, error, 'Erro ao exportar relatório em Excel.');
    }
});

export default router;
