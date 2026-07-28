// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Dashboard from './Dashboard';

const { apiRequest } = vi.hoisted(() => ({ apiRequest: vi.fn() }));

vi.mock('../lib/api', () => ({
    apiRequest,
    apiBlobRequest: vi.fn(),
    redirectOnUnauthorized: vi.fn(() => false),
}));
vi.mock('../lib/auth', () => ({ useAuth: () => ({ user: { id: 'admin', role: 'ADMIN' }, logout: vi.fn() }) }));
vi.mock('../components/sigma/SigmaSidebarIcon', () => ({ SigmaSidebarIcon: () => null }));

const dashboard = {
    range: 'operational', startDate: '', endDate: '',
    metrics: {
        queueCount: 0, activeConversations: 1, visitsToday: 1, pendingVisits: 1,
        totalConversationsOpened: 1, totalMessages: 1, totalTicketsOpened: 1, totalTicketsResolved: 0,
        conversationsByDepartment: [], ticketsByTechnician: [], csat: { average: null, count: 0 },
        recentConversations: [], recentVisits: [],
    },
};

const summary = {
    filters: { from: '2026-07-01', to: '2026-07-18', type: 'all' },
    range: { startInclusive: '2026-07-01T03:00:00.000Z', endExclusive: '2026-07-19T03:00:00.000Z', timezone: 'America/Sao_Paulo' },
    attendance: {}, tickets: {},
    technicians: [{ userId: 'tech-1', userName: 'Guilherme', attendanceCount: 7, ticketCount: 3, totalCount: 10 }],
};

describe('Dashboard', () => {
    beforeEach(() => {
        apiRequest.mockImplementation((path: string) => path === '/api/reports/dashboard'
            ? Promise.resolve(dashboard)
            : Promise.resolve(summary));
    });

    it('mostra a atividade por técnico e o acesso à exportação em Excel', async () => {
        render(<MemoryRouter><Dashboard /></MemoryRouter>);

        expect(await screen.findByRole('heading', { name: 'Atendimentos e visitas por técnico' })).toBeTruthy();
        expect(screen.getByText('Guilherme')).toBeTruthy();
        expect(screen.getByRole('button', { name: 'Exportar Excel' })).toBeTruthy();
        expect(screen.getByRole('link', { name: 'Listar clientes' }).getAttribute('href')).toContain('responsibleUserId=tech-1');
    });
});
