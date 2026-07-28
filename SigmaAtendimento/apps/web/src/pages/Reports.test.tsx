// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import Reports from './Reports';

const { apiRequest } = vi.hoisted(() => ({ apiRequest: vi.fn() }));

vi.mock('../lib/api', () => ({
    apiRequest,
    apiBlobRequest: vi.fn(),
    redirectOnUnauthorized: vi.fn(() => false),
}));
vi.mock('../lib/auth', () => ({ useAuth: () => ({ user: { id: 'admin', role: 'ADMIN' }, logout: vi.fn() }) }));
vi.mock('../components/sigma/SigmaSidebarIcon', () => ({ SigmaSidebarIcon: () => null }));

const summary = {
    filters: { from: '2026-07-01', to: '2026-07-18', type: 'all' },
    range: { startInclusive: '2026-07-01T03:00:00.000Z', endExclusive: '2026-07-19T03:00:00.000Z', timezone: 'America/Sao_Paulo' },
    attendance: {
        initiated: 2, closed: 1, currentlyOpen: 1, remotelyResolved: 1, convertedToTicket: 1, conversionRate: 50,
        messagesInbound: 3, messagesOutbound: 4, averageWaitSeconds: { value: 60, sampleSize: 2 },
        averageHandleSeconds: { value: 600, sampleSize: 1 }, csat: { value: 9, sampleSize: 1 },
        byAttendant: [], byDepartment: [], byTopic: [], csatByAttendant: [],
    },
    tickets: {
        created: 1, scheduled: 1, inProgress: 0, completed: 0, canceled: 0, whatsappOrigin: 1, manualOrigin: 0,
        averageExecutionSeconds: { value: null, sampleSize: 0 }, withoutTechnician: 0, withoutSchedule: 0,
        byTechnician: [], byStatus: [], byDepartment: [],
    },
    technicians: [{ userId: 'tech-1', userName: 'Técnico Teste', attendanceCount: 1, ticketCount: 1, totalCount: 2 }],
};

function LocationProbe() {
    return <output data-testid="location">{useLocation().search}</output>;
}

describe('filtros da página de relatórios', () => {
    it('mantém Todos na mesma página e sincroniza Atendimentos com a URL', async () => {
        apiRequest.mockImplementation((path: string) => {
            if (path === '/api/departments' || path === '/api/users') return Promise.resolve([]);
            if (path.startsWith('/api/reports/summary')) return Promise.resolve(summary);
            return Promise.resolve({ records: [], nextCursor: null });
        });

        render(
            <MemoryRouter initialEntries={['/reports?from=2026-07-01&to=2026-07-18&type=all']}>
                <Routes><Route path="/reports" element={<><Reports /><LocationProbe /></>} /></Routes>
            </MemoryRouter>,
        );

        expect(await screen.findByRole('heading', { name: 'Atendimentos' })).toBeTruthy();
        expect(screen.getByRole('heading', { name: 'Chamados' })).toBeTruthy();
        expect(screen.getByRole('heading', { name: 'Resumo por técnico' })).toBeTruthy();
        expect(screen.getByRole('button', { name: 'Exportar Excel' })).toBeTruthy();
        expect(screen.getByText('Técnico Teste')).toBeTruthy();
        fireEvent.click(screen.getByRole('button', { name: 'Atendimentos' }));
        await waitFor(() => expect(screen.getByTestId('location').textContent).toContain('type=attendance'));
    });
});
