import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { authMiddleware } from '../middlewares/auth.middleware';
import { getCompanyId } from '../lib/tenant';

const router = Router();
router.use(authMiddleware);

const defaultBusinessHours = [
    { day: 'Segunda-feira', startTime: '08:00', endTime: '18:00', status: 'OPEN' },
    { day: 'Terça-feira', startTime: '08:00', endTime: '18:00', status: 'OPEN' },
    { day: 'Quarta-feira', startTime: '08:00', endTime: '18:00', status: 'OPEN' },
    { day: 'Quinta-feira', startTime: '08:00', endTime: '18:00', status: 'OPEN' },
    { day: 'Sexta-feira', startTime: '08:00', endTime: '18:00', status: 'OPEN' },
    { day: 'Sábado', startTime: '09:00', endTime: '13:00', status: 'SPECIAL' },
    { day: 'Domingo', startTime: '', endTime: '', status: 'CLOSED' },
];

const defaultMessages = {
    welcomeMessage: 'Olá! Seja bem-vindo à Sigma Atendimento. Em instantes um de nossos consultores irá falar com você.',
    awayMessage: 'No momento estamos fora do nosso horário de atendimento. Deixe sua mensagem e retornaremos assim que possível. Nosso horário é das 08:00 às 18:00.',
    closingMessage: 'Atendimento encerrado. Se precisar de algo, envie uma nova mensagem.',
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

        res.json(settings);
    } catch (error) {
        res.status(500).json({ error: 'Erro ao buscar configurações' });
    }
});

router.put('/', async (req, res) => {
    try {
        const companyId = getCompanyId(req);
        const { businessHours, welcomeMessage, awayMessage, closingMessage } = req.body ?? {};

        const settings = await prisma.settings.upsert({
            where: { companyId },
            create: {
                companyId,
                businessHours: businessHours ?? defaultBusinessHours,
                welcomeMessage: welcomeMessage ?? defaultMessages.welcomeMessage,
                awayMessage: awayMessage ?? defaultMessages.awayMessage,
                closingMessage: closingMessage ?? defaultMessages.closingMessage,
            },
            update: {
                ...(businessHours !== undefined ? { businessHours } : {}),
                ...(welcomeMessage !== undefined ? { welcomeMessage } : {}),
                ...(awayMessage !== undefined ? { awayMessage } : {}),
                ...(closingMessage !== undefined ? { closingMessage } : {}),
            },
        });

        res.json(settings);
    } catch (error) {
        res.status(400).json({ error: 'Erro ao salvar configurações' });
    }
});

export default router;
