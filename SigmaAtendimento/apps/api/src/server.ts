import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
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
import { createServer } from 'http';
import { initSocket } from './socket';
import { ensureRuntimeSchema } from './lib/ensureSchema';

dotenv.config();

const app = express();

const allowedOrigins = (process.env.CORS_ORIGIN || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

app.use(cors({
    origin: (origin, callback) => {
        if (!origin || allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
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
            '/api/whatsapp/sessions',
        ],
    });
});

app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date() });
});

const PORT = process.env.PORT || 3333;

const httpServer = createServer(app);
initSocket(httpServer);

ensureRuntimeSchema()
    .catch((error) => {
        console.error('Failed to ensure runtime schema:', error);
    })
    .finally(() => {
        httpServer.listen(PORT, () => {
            console.log(`Server API is running on http://localhost:${PORT}`);
        });
    });
