import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { authMiddleware } from '../middlewares/auth.middleware';
import { requireAdminOrSupervisor } from '../middlewares/authorization.middleware';
import { getCompanyId } from '../lib/tenant';
import { DEFAULT_CLOSING_WITH_RATING_MESSAGE, DEFAULT_INACTIVITY_CLOSING_MESSAGE } from '../services/conversationClosure.service';

const router = Router();
router.use(authMiddleware);

const defaultBusinessHours = [
    { day: 'Segunda-feira', startTime: '08:00', endTime: '18:00', status: 'OPEN' },
    { day: 'Terca-feira', startTime: '08:00', endTime: '18:00', status: 'OPEN' },
    { day: 'Quarta-feira', startTime: '08:00', endTime: '18:00', status: 'OPEN' },
    { day: 'Quinta-feira', startTime: '08:00', endTime: '18:00', status: 'OPEN' },
    { day: 'Sexta-feira', startTime: '08:00', endTime: '18:00', status: 'OPEN' },
    { day: 'Sabado', startTime: '09:00', endTime: '13:00', status: 'SPECIAL' },
    { day: 'Domingo', startTime: '', endTime: '', status: 'CLOSED' },
];

const defaultMessages = {
    welcomeMessage: 'Ola! Seja bem-vindo a Sigma Atendimento. Em instantes um de nossos consultores ira falar com voce.',
    awayMessage: 'No momento estamos fora do nosso horario de atendimento. Deixe sua mensagem e retornaremos assim que possivel. Nosso horario e das 08:00 as 18:00.',
    closingMessage: DEFAULT_CLOSING_WITH_RATING_MESSAGE,
    inactivityClosingMessage: DEFAULT_INACTIVITY_CLOSING_MESSAGE,
};

router.get('/', async (req, res) => {
    try {
        const companyId = getCompanyId(req);
        const settings = await prisma.settings.upsert({
            where: { companyId },
            update: {},
            create: {
                companyId,
                businessHours: defaultBusinessHours,
                ...defaultMessages,
            },
        });
        const company = await prisma.company.findUnique({
            where: { id: companyId },
            select: {
                defaultTechnicianId: true,
                defaultTechnician: { select: { id: true, name: true, email: true, role: true } },
                defaultDepartmentId: true,
                defaultDepartment: { select: { id: true, name: true } },
            },
        });

        res.json({
            ...settings,
            defaultTechnicianId: company?.defaultTechnicianId ?? null,
            defaultTechnician: company?.defaultTechnician ?? null,
            defaultDepartmentId: company?.defaultDepartmentId ?? null,
            defaultDepartment: company?.defaultDepartment ?? null,
        });
    } catch (error) {
        res.status(500).json({ error: 'Erro ao buscar configuracoes' });
    }
});

router.put('/', requireAdminOrSupervisor, async (req, res) => {
    try {
        const companyId = getCompanyId(req);
        const { businessHours, welcomeMessage, awayMessage, closingMessage, inactivityClosingMessage, defaultTechnicianId, defaultDepartmentId, externalServiceGroupId, externalServiceGroupName } = req.body ?? {};

        if (defaultTechnicianId !== undefined && defaultTechnicianId !== null && defaultTechnicianId !== '') {
            const technician = await prisma.user.findFirst({
                where: { id: defaultTechnicianId, companyId, active: true, role: { in: ['TECHNICIAN', 'ADMIN'] } },
                select: { id: true },
            });
            if (!technician) {
                return res.status(400).json({ error: 'Tecnico padrao invalido ou inativo' });
            }
        }

        if (defaultDepartmentId !== undefined && defaultDepartmentId !== null && defaultDepartmentId !== '') {
            const department = await prisma.department.findFirst({
                where: { id: defaultDepartmentId, companyId, active: true },
                select: { id: true },
            });
            if (!department) {
                return res.status(400).json({ error: 'Setor padrao invalido ou inativo' });
            }
        }

        const settings = await prisma.settings.upsert({
            where: { companyId },
            create: {
                companyId,
                businessHours: businessHours ?? defaultBusinessHours,
                welcomeMessage: welcomeMessage ?? defaultMessages.welcomeMessage,
                awayMessage: awayMessage ?? defaultMessages.awayMessage,
                closingMessage: closingMessage ?? defaultMessages.closingMessage,
                inactivityClosingMessage: inactivityClosingMessage ?? defaultMessages.inactivityClosingMessage,
                externalServiceGroupId: externalServiceGroupId || null,
                externalServiceGroupName: externalServiceGroupName || null,
            },
            update: {
                ...(businessHours !== undefined ? { businessHours } : {}),
                ...(welcomeMessage !== undefined ? { welcomeMessage } : {}),
                ...(awayMessage !== undefined ? { awayMessage } : {}),
                ...(closingMessage !== undefined ? { closingMessage } : {}),
                ...(inactivityClosingMessage !== undefined ? { inactivityClosingMessage } : {}),
                ...(externalServiceGroupId !== undefined ? { externalServiceGroupId: externalServiceGroupId || null } : {}),
                ...(externalServiceGroupName !== undefined ? { externalServiceGroupName: externalServiceGroupName || null } : {}),
            },
        });
        const shouldUpdateCompany = defaultTechnicianId !== undefined || defaultDepartmentId !== undefined;
        const company = shouldUpdateCompany
            ? await prisma.company.update({
                where: { id: companyId },
                data: {
                    ...(defaultTechnicianId !== undefined ? { defaultTechnicianId: defaultTechnicianId || null } : {}),
                    ...(defaultDepartmentId !== undefined ? { defaultDepartmentId: defaultDepartmentId || null } : {}),
                },
                select: {
                    defaultTechnicianId: true,
                    defaultTechnician: { select: { id: true, name: true, email: true, role: true } },
                    defaultDepartmentId: true,
                    defaultDepartment: { select: { id: true, name: true } },
                },
            })
            : await prisma.company.findUnique({
                where: { id: companyId },
                select: {
                    defaultTechnicianId: true,
                    defaultTechnician: { select: { id: true, name: true, email: true, role: true } },
                    defaultDepartmentId: true,
                    defaultDepartment: { select: { id: true, name: true } },
                },
            });

        res.json({
            ...settings,
            defaultTechnicianId: company?.defaultTechnicianId ?? null,
            defaultTechnician: company?.defaultTechnician ?? null,
            defaultDepartmentId: company?.defaultDepartmentId ?? null,
            defaultDepartment: company?.defaultDepartment ?? null,
        });
    } catch (error) {
        res.status(400).json({ error: 'Erro ao salvar configuracoes' });
    }
});

export default router;
