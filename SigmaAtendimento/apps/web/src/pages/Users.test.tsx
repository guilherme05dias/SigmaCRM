// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Users from './Users';

const { apiRequest, showToast } = vi.hoisted(() => ({ apiRequest: vi.fn(), showToast: vi.fn() }));

vi.mock('../lib/api', () => ({ apiRequest, redirectOnUnauthorized: vi.fn(() => false) }));
vi.mock('../lib/auth', () => ({
    useAuth: () => ({ user: { id: 'admin-1', name: 'Administrador', role: 'ADMIN' }, logout: vi.fn() }),
}));
vi.mock('../components/sigma/SigmaTopbar', () => ({ SigmaTopbar: () => null }));
vi.mock('../components/ui/Toast', () => ({ useToast: () => ({ showToast }) }));

const carlos = {
    id: '57665dbb-cc99-4ef4-8f73-27289210367f',
    name: 'Carlos',
    email: 'carlos@sigmapdv.com',
    role: 'ATTENDANT',
    specialty: 'Consultor Técnico',
    messageSignature: null,
    departmentId: null,
    department: null,
    active: true,
};

describe('gestão de usuários', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        apiRequest.mockImplementation((path: string, options?: RequestInit) => {
            if (path === '/api/users' && !options) return Promise.resolve([carlos]);
            if (path === '/api/departments') return Promise.resolve([]);
            if (path === `/api/users/${carlos.id}` && options?.method === 'PUT') {
                return Promise.resolve({ ...carlos, ...JSON.parse(String(options.body)) });
            }
            return Promise.reject(new Error(`Rota inesperada: ${path}`));
        });
    });

    afterEach(() => cleanup());

    it('@spec:AC-013 exibe e salva o cargo separado do papel de acesso', async () => {
        render(<MemoryRouter><Users /></MemoryRouter>);

        expect(await screen.findByText('Consultor Técnico')).toBeTruthy();
        expect(screen.getByText('ATTENDANT')).toBeTruthy();

        fireEvent.click(screen.getByRole('button', { name: 'Editar usuário Carlos' }));
        expect((screen.getByLabelText('Cargo') as HTMLInputElement).value).toBe('Consultor Técnico');

        fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

        await waitFor(() => expect(apiRequest).toHaveBeenCalledWith(
            `/api/users/${carlos.id}`,
            expect.objectContaining({
                method: 'PUT',
                body: expect.stringContaining('"specialty":"Consultor Técnico"'),
            }),
        ));
    });
});
