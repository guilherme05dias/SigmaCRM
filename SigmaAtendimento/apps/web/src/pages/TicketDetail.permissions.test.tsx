// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../components/ui/Toast';
import TicketDetail from './TicketDetail';

const { apiRequest } = vi.hoisted(() => ({ apiRequest: vi.fn() }));

vi.mock('../lib/api', () => ({
    apiRequest,
    redirectOnUnauthorized: vi.fn(() => false),
}));
vi.mock('../lib/auth', () => ({
    useAuth: () => ({
        user: {
            id: '11111111-1111-4111-8111-111111111111',
            name: 'Lucas',
            email: 'lucas@sigmapdv.com',
            role: 'TECHNICIAN',
        },
        logout: vi.fn(),
    }),
}));
vi.mock('../components/sigma/SigmaSidebarIcon', () => ({ SigmaSidebarIcon: () => null }));

const ticket = {
    id: 'ticket-1',
    protocol: 'SIG-001',
    title: 'Atendimento externo',
    description: 'Verificar equipamento',
    priority: 'MEDIUM',
    status: 'QUEUED',
    notesInternal: '',
    contact: {
        id: 'contact-1',
        name: 'Cliente Teste',
        phone: '5549999999999',
        business: null,
    },
    customer: null,
    assignedUser: null,
    department: { name: 'Técnico em Campo' },
    fieldService: {
        id: 'field-1',
        serviceType: 'PRESENCIAL',
        status: 'SCHEDULED',
        technicianId: '11111111-1111-4111-8111-111111111111',
        technician: {
            id: '11111111-1111-4111-8111-111111111111',
            name: 'Lucas',
        },
        scheduleChanges: [],
    },
    evaluation: null,
    timeline: [],
    createdAt: '2026-07-28T12:00:00.000Z',
    updatedAt: '2026-07-28T12:00:00.000Z',
};

describe('edição do chamado pelo técnico atribuído', () => {
    beforeEach(() => {
        apiRequest.mockImplementation((path: string) => {
            if (path === '/api/tickets/ticket-1') return Promise.resolve(ticket);
            if (path === '/api/users') {
                return Promise.resolve([
                    {
                        id: '11111111-1111-4111-8111-111111111111',
                        name: 'Lucas',
                        role: 'TECHNICIAN',
                        active: true,
                    },
                ]);
            }
            return Promise.reject(new Error(`Rota inesperada: ${path}`));
        });
    });

    it('libera status e observações, mantendo prioridade e atribuição bloqueadas', async () => {
        render(
            <MemoryRouter initialEntries={['/tickets/ticket-1']}>
                <ToastProvider>
                    <Routes>
                        <Route path="/tickets/:id" element={<TicketDetail />} />
                    </Routes>
                </ToastProvider>
            </MemoryRouter>,
        );

        expect(await screen.findByRole('heading', { name: 'Atualizar chamado' })).toBeTruthy();
        expect(screen.getByLabelText('Status')).not.toBeDisabled();
        expect(screen.getByLabelText('Observações internas')).not.toBeDisabled();
        expect(screen.getByLabelText('Status do chamado')).not.toBeDisabled();
        expect(screen.queryByLabelText('Prioridade')).toBeNull();
        expect(screen.queryByLabelText('Técnico')).toBeNull();
        expect(screen.getByRole('button', { name: 'Salvar chamado' })).not.toBeDisabled();
    });
});
