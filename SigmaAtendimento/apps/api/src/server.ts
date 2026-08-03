import express from 'express';
import cors from 'cors';
import path from 'node:path';
import authRoutes from './routes/auth.routes';
import usersRoutes from './routes/users.routes';
import departmentsRoutes from './routes/departments.routes';
import whatsappRoutes from './routes/whatsapp.routes';
import conversationsRoutes from './routes/conversations.routes';
import contactsRoutes from './routes/contacts.routes';
import customersRoutes from './routes/customers.routes';
import ticketsRoutes from './routes/tickets.routes';
import inboxRoutes from './routes/inbox.routes';
import reportsRoutes from './routes/reports.routes';
import settingsRoutes from './routes/settings.routes';
import serviceTopicsRoutes from './routes/serviceTopics.routes';
import notificationsRoutes from './routes/notifications.routes';
import assistantRoutes from './routes/assistant.routes';
import { createServer } from 'http';
import { initSocket } from './socket';
import { env, isOriginAllowed } from './config/env';
import { startConversationFallbackWorker } from './services/conversationFallback.service';
import { checkUazApiWebhookDatabaseHealth, logUazApiWebhookDatabaseHealth } from './services/uazApiWebhookHealth.service';
import { getUazApiReconciliationHealth, startUazApiReconciliationWorker } from './services/uazApiReconciliation.service';
import { startAssistantReminderWorker } from './services/assistantReminder.service';

const app = express();

app.use(cors({
    origin: (origin, callback) => {
        if (isOriginAllowed(origin)) {
            return callback(null, true);
        }
        return callback(new Error(`Origem não permitida pelo CORS: ${origin}`));
    },
    credentials: true,
}));
app.use(express.json({
    limit: '20mb',
    verify: (req: any, _res, buf) => { req.rawBody = buf; },
}));

app.use('/api/auth', authRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/departments', departmentsRoutes);
app.use('/api/whatsapp', whatsappRoutes);
app.use('/api/conversations', conversationsRoutes);
app.use('/api/contacts', contactsRoutes);
app.use('/api/customers', customersRoutes);
app.use('/api/tickets', ticketsRoutes);
app.use('/api/inbox', inboxRoutes);
app.use('/api/reports', reportsRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/service-topics', serviceTopicsRoutes);
app.use('/api/notifications', notificationsRoutes);
app.use('/api/assistant', assistantRoutes);

app.get('/', (_req, res) => {
    res.json({
        name: 'Sigma Atendimento API',
        status: 'online',
        health: '/health',
        frontend: 'http://localhost:5173',
        endpoints: [
            '/api/auth/login',
            '/api/customers',
            '/api/contacts',
            '/api/tickets',
            '/api/inbox',
            '/api/reports/summary',
            '/api/settings',
            '/api/service-topics',
            '/api/notifications',
            '/api/whatsapp/sessions',
        ],
    });
});

app.get('/health', async (_req, res) => {
    const webhookDatabase = await checkUazApiWebhookDatabaseHealth();
    const reconciliation = getUazApiReconciliationHealth();
    const healthy = webhookDatabase.healthy && reconciliation.healthy;
    // Render usa esta rota como liveness check. Falhas nas integrações de
    // WhatsApp devem aparecer como estado degradado, mas não podem derrubar a
    // API inteira (incluindo login e leitura de conversas já persistidas).
    res.status(200).json({
        status: healthy ? 'ok' : 'degraded',
        timestamp: new Date(),
        checks: {
            uazApiWebhookDatabase: webhookDatabase,
            uazApiReconciliation: reconciliation,
        },
    });
});

app.get('/sigma-local-ca.crt', (_req, res) => {
    res.download(
        path.resolve(process.cwd(), '.local-certs', 'sigma-local-ca.crt'),
        'sigma-local-ca.crt',
    );
});

const httpServer = createServer(app);
initSocket(httpServer);
startConversationFallbackWorker();
startUazApiReconciliationWorker();
startAssistantReminderWorker();
void logUazApiWebhookDatabaseHealth();

httpServer.listen(env.port, () => {
    console.log(`Server API is running on http://localhost:${env.port}`);
});
