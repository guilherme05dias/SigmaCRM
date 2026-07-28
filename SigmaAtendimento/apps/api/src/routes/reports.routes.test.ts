import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { buildReportsSummary } = vi.hoisted(() => ({ buildReportsSummary: vi.fn() }));

vi.mock('../services/reports.service', () => ({
    buildReportsSummary,
    listAttendanceRecords: vi.fn().mockResolvedValue({ records: [], nextCursor: null }),
    listTicketRecords: vi.fn().mockResolvedValue({ records: [], nextCursor: null }),
}));

vi.mock('../middlewares/auth.middleware', () => ({
    authMiddleware: (req: any, _res: any, next: any) => {
        req.user = { id: '11111111-1111-4111-8111-111111111111', companyId: '22222222-2222-4222-8222-222222222222', role: 'ATTENDANT' };
        next();
    },
}));

vi.mock('../lib/prisma', () => ({ prisma: {} }));

import reportsRouter from './reports.routes';

const app = express();
app.use('/api/reports', reportsRouter);

describe('rotas de relatórios', () => {
    beforeEach(() => {
        buildReportsSummary.mockReset().mockResolvedValue({ ok: true });
    });

    it('mantém empresa e usuário autenticado no escopo analítico', async () => {
        const response = await request(app).get('/api/reports/summary?from=2026-07-01&to=2026-07-18&type=attendance');
        expect(response.status).toBe(200);
        expect(buildReportsSummary).toHaveBeenCalledWith(expect.objectContaining({
            companyId: '22222222-2222-4222-8222-222222222222',
            userId: '11111111-1111-4111-8111-111111111111',
            seesAll: false,
            filters: expect.objectContaining({ type: 'attendance' }),
        }));
    });

    it('rejeita tipo inválido nos detalhes', async () => {
        const response = await request(app).get('/api/reports/records?from=2026-07-01&to=2026-07-18&type=all');
        expect(response.status).toBe(400);
        expect(response.body.error).toContain('type=attendance');
    });

    it('rejeita consulta de responsável malformada', async () => {
        const response = await request(app).get('/api/reports/summary?responsibleUserId=outro-usuario');
        expect(response.status).toBe(400);
        expect(buildReportsSummary).not.toHaveBeenCalled();
    });

    it('impede atendente de consultar dados de outro responsável', async () => {
        const response = await request(app).get('/api/reports/summary?responsibleUserId=33333333-3333-4333-8333-333333333333');
        expect(response.status).toBe(403);
        expect(response.body.error).toContain('outro responsável');
        expect(buildReportsSummary).not.toHaveBeenCalled();
    });
});
