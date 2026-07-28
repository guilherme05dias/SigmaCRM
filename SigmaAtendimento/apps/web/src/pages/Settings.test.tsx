// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Settings from './Settings';

const { apiRequest, showToast } = vi.hoisted(() => ({ apiRequest: vi.fn(), showToast: vi.fn() }));

vi.mock('../lib/api', () => ({ apiRequest, redirectOnUnauthorized: vi.fn(() => false) }));
vi.mock('../lib/auth', () => ({
    useAuth: () => ({ user: { id: 'user-1', name: 'Administrador', role: 'ADMIN' }, logout: vi.fn() }),
}));
vi.mock('../components/sigma/SigmaTopbar', () => ({ SigmaTopbar: () => null }));
vi.mock('../components/ui/Toast', () => ({ useToast: () => ({ showToast }) }));

const settings = {
    businessHours: [],
    welcomeMessage: 'Olá!',
    awayMessage: 'Estamos ausentes.',
    closingMessage: 'Atendimento encerrado.\n\nQual nota você dá?',
    inactivityClosingMessage: 'Encerrado por inatividade.',
};

describe('mensagens automáticas das configurações', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        apiRequest.mockImplementation((path: string, options?: RequestInit) => {
            if (path === '/api/settings' && options?.method === 'PUT') return Promise.resolve(JSON.parse(String(options.body)));
            if (path === '/api/settings') return Promise.resolve(settings);
            if (path === '/api/whatsapp/sessions') return Promise.resolve([]);
            if (path === '/api/whatsapp/outbox?limit=25') return Promise.resolve({ summary: { pending: 0, failed: 0, sent: 0, total: 0 }, items: [] });
            return Promise.reject(new Error(`Rota inesperada: ${path}`));
        });
    });

    afterEach(() => cleanup());

    it('permite editar e salvar as mensagens dos três modos de encerramento', async () => {
        render(<MemoryRouter><Settings /></MemoryRouter>);

        expect((await screen.findByLabelText('Mensagem de encerramento com avaliação') as HTMLTextAreaElement).value).toBe('Atendimento encerrado.\n\nQual nota você dá?');
        expect((screen.getByLabelText('Encerramento por inatividade') as HTMLTextAreaElement).value).toBe('Encerrado por inatividade.');
        expect(screen.queryByLabelText('Pergunta de avaliação')).toBeNull();

        fireEvent.change(screen.getByLabelText('Encerramento por inatividade'), { target: { value: 'Novo texto de inatividade.' } });
        fireEvent.click(screen.getByRole('button', { name: 'Salvar Mensagens' }));

        await waitFor(() => expect(apiRequest).toHaveBeenCalledWith('/api/settings', expect.objectContaining({
            method: 'PUT',
            body: expect.stringContaining('Novo texto de inatividade.'),
        })));
    });
});
