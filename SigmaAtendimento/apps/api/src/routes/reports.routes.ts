import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { authMiddleware } from '../middlewares/auth.middleware';
import { getCompanyId } from '../lib/tenant';
import { z } from 'zod';

const router = Router();

const ReportQuerySchema = z.object({
    range: z.enum(['1d', '7d', '15d', '30d', '60d', '90d']).default('7d')
});

router.use(authMiddleware);

router.get('/summary', async (req: Request, res: Response) => {
    try {
        const query = ReportQuerySchema.safeParse(req.query);
        if (!query.success) {
            return res.status(400).json({ error: 'Parâmetro range inválido' });
        }
        const range = query.data.range;

        let days = 7;

        switch (range) {
            case '1d': days = 1; break;
            case '7d': days = 7; break;
            case '15d': days = 15; break;
            case '30d': days = 30; break;
            case '60d': days = 60; break;
            case '90d': days = 90; break;
            default: days = 7;
        }

        const endDate = new Date();
        const startDate = new Date();
        if (days === 1) {
            startDate.setHours(0, 0, 0, 0); // Start of today
        } else {
            startDate.setDate(endDate.getDate() - days);
        }

        const dateFilter = {
            gte: startDate,
            lte: endDate
        };

        const companyId = getCompanyId(req);
        const where = { createdAt: dateFilter, companyId };

        const [
            totalConversationsOpened,
            totalMessages,
            totalTicketsOpened,
            totalTicketsResolved,
            conversationsWithDept,
            fieldServicesWithTech,
            csatAgg,
        ] = await Promise.all([
            prisma.conversation.count({ where }),
            prisma.message.count({ where }),
            prisma.ticket.count({ where }),
            prisma.ticket.count({ where: { status: 'RESOLVED', closedAt: dateFilter, companyId } }),
            prisma.conversation.groupBy({
                by: ['departmentId'],
                where: { ...where, departmentId: { not: null } },
                _count: { _all: true }
            }),
            prisma.ticketFieldService.groupBy({
                by: ['technicianId'],
                where: { createdAt: dateFilter, companyId, technicianId: { not: null } },
                _count: { _all: true }
            }),
            prisma.ticketEvaluation.aggregate({
                where: { createdAt: dateFilter, companyId },
                _avg: { rating: true },
                _count: { _all: true },
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

        res.json({
            range,
            startDate,
            endDate,
            metrics: {
                totalConversationsOpened,
                totalMessages,
                totalTicketsOpened,
                totalTicketsResolved,
                conversationsByDepartment,
                ticketsByTechnician,
                csat: { average: csatAgg._avg.rating, count: csatAgg._count._all }
            }
        });

    } catch (error) {
        console.error('Error generating report:', error);
        res.status(500).json({ error: 'Erro ao gerar relatório' });
    }
});

export default router;
