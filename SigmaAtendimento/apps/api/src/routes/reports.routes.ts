import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { authMiddleware } from '../middlewares/auth.middleware';
import { canViewAll } from '../middlewares/authorization.middleware';
import { getCompanyId } from '../lib/tenant';
import { formatContactDisplayName } from '../lib/contactDisplayName';

const router = Router();
// Marco inicial fixo da nova operação, no horário de São Paulo (UTC-03:00).
const REPORT_START_AT = new Date('2026-07-14T08:00:00-03:00');

router.use(authMiddleware);

router.get('/records', async (req: Request, res: Response) => {
    try {
        const companyId = getCompanyId(req);
        const userId = req.user?.id;
        const seesAll = canViewAll(req.user?.role);
        const take = Math.max(1, Math.min(Number(req.query.take || 100), 500));
        const records = await prisma.conversationReport.findMany({
            where: {
                companyId,
                closedAt: { gte: REPORT_START_AT },
                ...(seesAll || !userId
                    ? {}
                    : { conversation: { is: { assignedUserId: userId } } }),
            },
            orderBy: { closedAt: 'desc' },
            take,
            select: {
                id: true,
                customerName: true,
                businessName: true,
                businessCnpj: true,
                systemName: true,
                summary: true,
                rating: true,
                observation: true,
                closedAt: true,
            },
        });

        res.json({ records });
    } catch (error) {
        console.error('Error listing conversation reports:', error);
        res.status(500).json({ error: 'Erro ao listar registros de atendimento' });
    }
});

router.get('/summary', async (req: Request, res: Response) => {
    try {
        const endDate = new Date();
        const startDate = new Date(REPORT_START_AT);

        const dateFilter = {
            gte: startDate,
            lte: endDate
        };

        const companyId = getCompanyId(req);
        const seesAll = canViewAll(req.user?.role);
        const userId = req.user?.id;
        const ticketOwnership = seesAll || !userId
            ? {}
            : {
                OR: [
                    { assignedUserId: userId },
                    { fieldService: { is: { technicianId: userId } } },
                    { conversation: { is: { assignedUserId: userId } } },
                ],
            };
        const fieldServiceOwnership = seesAll || !userId
            ? {}
            : {
                OR: [
                    { technicianId: userId },
                    { ticket: { is: { assignedUserId: userId } } },
                    { ticket: { is: { conversation: { is: { assignedUserId: userId } } } } },
                ],
            };
        const conversationOwnership = seesAll || !userId ? {} : { assignedUserId: userId };
        const reportableContact = { includeInServiceReports: true };
        const reportableConversation = { contact: { is: reportableContact }, ...conversationOwnership };
        const reportableTicket = { contact: { is: reportableContact }, ...ticketOwnership };
        const reportableFieldService = {
            ticket: { is: { contact: { is: reportableContact } } },
            ...fieldServiceOwnership,
        };
        const where = { createdAt: dateFilter, companyId, ...reportableConversation };
        const messageWhere = seesAll || !userId
            ? { createdAt: dateFilter, companyId, conversation: { is: { contact: { is: reportableContact } } } }
            : { createdAt: dateFilter, companyId, conversation: { is: reportableConversation } };
        const ticketWhere = { createdAt: dateFilter, companyId, ...reportableTicket };
        const fieldServiceWhere = { createdAt: dateFilter, companyId, ...reportableFieldService };
        const ratingWhere = {
            companyId,
            ratedAt: dateFilter,
            rating: { not: null },
            contact: { is: reportableContact },
            ...conversationOwnership,
        };
        const fieldServiceTodayWhere = {
            companyId,
            AND: [
                reportableFieldService,
                {
                    OR: [
                        { scheduledAt: dateFilter },
                        { visitWindowStart: dateFilter },
                    ],
                },
            ],
        };

        const [
            queueCount,
            activeConversations,
            visitsToday,
            pendingVisits,
            totalConversationsOpened,
            totalMessages,
            totalTicketsOpened,
            totalTicketsResolved,
            conversationsWithDept,
            fieldServicesWithTech,
            csatAgg,
            ratingsByAttendant,
            recentConversations,
            recentVisits,
        ] = await Promise.all([
            prisma.conversation.count({ where: { ...where, status: 'OPEN' } }),
            prisma.conversation.count({ where: { ...where, status: 'ASSIGNED' } }),
            prisma.ticketFieldService.count({
                where: fieldServiceTodayWhere,
            }),
            prisma.ticketFieldService.count({ where: { ...fieldServiceWhere, status: { in: ['PENDING', 'SCHEDULED', 'IN_PROGRESS'] } } }),
            prisma.conversation.count({ where }),
            prisma.message.count({ where: messageWhere }),
            prisma.ticket.count({ where: ticketWhere }),
            prisma.ticket.count({ where: { status: 'RESOLVED', closedAt: dateFilter, companyId, ...reportableTicket } }),
            prisma.conversation.groupBy({
                by: ['departmentId'],
                where: { ...where, departmentId: { not: null } },
                _count: { _all: true }
            }),
            prisma.ticketFieldService.groupBy({
                by: ['technicianId'],
                where: { ...fieldServiceWhere, technicianId: { not: null } },
                _count: { _all: true }
            }),
            prisma.conversation.aggregate({
                where: ratingWhere,
                _avg: { rating: true },
                _count: { rating: true },
            }),
            prisma.conversation.groupBy({
                by: ['assignedUserId'],
                where: { ...ratingWhere, assignedUserId: { not: null } },
                _avg: { rating: true },
                _count: { rating: true },
            }),
            prisma.conversation.findMany({
                where,
                orderBy: [{ lastMessageAt: 'desc' }, { createdAt: 'desc' }],
                take: 5,
                include: {
                    contact: { include: { customer: { select: { name: true } } } },
                    assignedUser: { select: { id: true, name: true } },
                    department: true,
                    serviceTopic: true,
                },
            }),
            prisma.ticketFieldService.findMany({
                where: fieldServiceWhere,
                orderBy: [{ scheduledAt: 'desc' }, { createdAt: 'desc' }],
                take: 5,
                include: {
                    technician: { select: { id: true, name: true } },
                    ticket: {
                        include: {
                            contact: true,
                            customer: true,
                        },
                    },
                },
            }),
        ]);

        const deptIds = conversationsWithDept.map(c => c.departmentId).filter(Boolean) as string[];
        const departments = await prisma.department.findMany({
            where: { id: { in: deptIds } }
        });

        const techIds = fieldServicesWithTech.map(t => t.technicianId).filter(Boolean) as string[];
        const technicians = await prisma.user.findMany({
            where: { id: { in: techIds } }
        });

        const ratedAttendantIds = ratingsByAttendant.map(item => item.assignedUserId).filter(Boolean) as string[];
        const ratedAttendants = await prisma.user.findMany({
            where: { id: { in: ratedAttendantIds }, companyId },
            select: { id: true, name: true },
        });

        const conversationsByDepartment = conversationsWithDept.map(c => {
            const dept = departments.find(d => d.id === c.departmentId);
            return {
                department: dept ? dept.name : 'Desconhecido',
                count: c._count._all
            };
        });

        const ticketsByTechnician = fieldServicesWithTech.map(t => {
            const tech = technicians.find(user => user.id === t.technicianId);
            return {
                technician: tech ? tech.name : 'Sem Técnico',
                count: t._count._all
            };
        });

        const attendantRatings = ratingsByAttendant
            .map((item) => {
                const attendant = ratedAttendants.find(user => user.id === item.assignedUserId);
                return {
                    userId: item.assignedUserId as string,
                    userName: attendant?.name ?? 'Atendente não encontrado',
                    average: item._avg.rating ?? 0,
                    count: item._count.rating,
                };
            })
            .sort((a, b) => b.average - a.average || b.count - a.count || a.userName.localeCompare(b.userName));

        res.json({
            range: 'from-2026-07-14T08:00:00-03:00',
            startDate,
            endDate,
            metrics: {
                queueCount,
                activeConversations,
                visitsToday,
                pendingVisits,
                totalConversationsOpened,
                totalMessages,
                totalTicketsOpened,
                totalTicketsResolved,
                conversationsByDepartment,
                ticketsByTechnician,
                csat: { average: csatAgg._avg.rating, count: csatAgg._count.rating },
                attendantRatings,
                recentConversations: recentConversations.map((conversation) => ({
                    id: conversation.id,
                    status: conversation.status,
                    contactName: formatContactDisplayName({
                        personName: conversation.contact.name,
                        phone: conversation.contact.phone,
                        companyName: conversation.contact.customer?.name,
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
                }))
            }
        });

    } catch (error) {
        console.error('Error generating report:', error);
        res.status(500).json({ error: 'Erro ao gerar relatório' });
    }
});

export default router;
