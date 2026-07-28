// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Tasks from './Tasks';

const { apiRequest, showToast, authUser } = vi.hoisted(() => ({
    apiRequest: vi.fn(),
    showToast: vi.fn(),
    authUser: { id: 'user-1', name: 'Guilherme', role: 'ADMIN' },
}));

vi.mock('../lib/api', () => ({ apiRequest, redirectOnUnauthorized: vi.fn(() => false) }));
vi.mock('../lib/auth', () => ({
    useAuth: () => ({ user: authUser, logout: vi.fn() }),
}));
vi.mock('../components/sigma/SigmaSidebarIcon', () => ({ SigmaSidebarIcon: () => null }));
vi.mock('../components/ui/Toast', () => ({ useToast: () => ({ showToast }) }));

const task = {
    id: 'task-1',
    title: 'Retornar sobre erro no atalho',
    description: 'Confirmar se o acesso foi normalizado.',
    priority: 'HIGH',
    status: 'PENDING',
    source: 'CONVERSATION',
    dueAt: '2026-07-21T20:00:00.000Z',
    createdAt: '2026-07-21T12:00:00.000Z',
    updatedAt: '2026-07-21T12:00:00.000Z',
    assignedUser: { id: 'user-1', name: 'Guilherme', role: 'ADMIN' },
    createdBy: { id: 'user-1', name: 'Guilherme' },
    customer: { id: 'customer-1', name: 'Cliente Sigma' },
    ticket: null,
    conversation: null,
    fieldService: null,
    serviceTopic: { id: 'topic-1', name: 'Sigma PDV', active: true },
    checklistItems: [{
        id: 'item-1',
        text: 'Validar o acesso remoto',
        position: 0,
        completedAt: null,
        createdAt: '2026-07-21T12:30:00.000Z',
        updatedAt: '2026-07-21T12:30:00.000Z',
    }, {
        id: 'item-2',
        text: 'Reproduzir o problema',
        position: 1,
        completedAt: '2026-07-21T13:00:00.000Z',
        createdAt: '2026-07-21T12:35:00.000Z',
        updatedAt: '2026-07-21T13:00:00.000Z',
    }],
    activities: [],
};

describe('Painel de tarefas', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        apiRequest.mockImplementation((path: string, options?: RequestInit) => {
            if (path.startsWith('/api/assistant/tasks?')) return Promise.resolve({ tasks: [task] });
            if (path === '/api/assistant/tasks/task-1') return Promise.resolve({ task });
            if (path === '/api/assistant/tasks/task-1/plan' && options?.method === 'POST') return Promise.resolve({
                plan: {
                    understanding: 'O acesso precisa ser reproduzido para identificar a causa.',
                    steps: ['Confirmar a mensagem de erro', 'Reproduzir o acesso', 'Validar a correção'],
                    analysisMode: 'LOCAL_MODEL',
                    agent: {
                        id: 'UNIPLUS_SPECIALIST',
                        name: 'Especialista Uniplus',
                        shortName: 'Agente Uniplus',
                        description: 'Auxilia nas tarefas do Uniplus Desktop/offline e Web.',
                        capabilities: ['Uniplus Desktop/offline', 'Uniplus Web'],
                    },
                    references: [{
                        id: 'UNIPLUS-DESKTOP-YODA',
                        title: 'Servidor Yoda — Uniplus Desktop',
                        summary: 'Verifique o serviço e o gerenciador de tarefas do Yoda.',
                        system: 'UNIPLUS',
                        edition: 'DESKTOP',
                        sourceType: 'OFFICIAL_DOC',
                        sourceLabel: 'Documentação oficial',
                        url: 'https://unisoftsistemas.com.br/servidor-yoda/',
                    }],
                },
            });
            if (path === '/api/assistant/tasks/task-1/checklist/bulk' && options?.method === 'POST') return Promise.resolve({ items: [] });
            if (path === '/api/assistant/tasks/task-1/checklist' && options?.method === 'POST') return Promise.resolve({ item: task.checklistItems[0] });
            if (path === '/api/assistant/tasks/task-1/checklist/item-1' && options?.method === 'PATCH') return Promise.resolve({ item: { ...task.checklistItems[0], completedAt: new Date().toISOString() } });
            if (path === '/api/users') return Promise.resolve([{ id: 'user-1', name: 'Guilherme', role: 'ADMIN', active: true }]);
            if (path === '/api/customers') return Promise.resolve([{ id: 'customer-1', name: 'Cliente Sigma' }]);
            if (path === '/api/service-topics?includeInactive=true') return Promise.resolve([{ id: 'topic-1', name: 'Sigma PDV', active: true }]);
            if (path.startsWith('/api/contacts?')) {
                if (path.includes('query=')) return Promise.resolve([]);
                return Promise.resolve([{
                    id: 'contact-1',
                    name: 'João',
                    phone: '5549999999999',
                    business: { id: 'business-1', name: 'Empresa Sigma' },
                    customer: { id: 'customer-1', name: 'Cliente Sigma', businesses: [] },
                }]);
            }
            return Promise.reject(new Error(`Rota inesperada: ${path}`));
        });
    });

    afterEach(() => cleanup());

    it('mostra a lista operacional com contexto do CRM e permite alternar para a equipe', async () => {
        render(<MemoryRouter><Tasks /></MemoryRouter>);

        expect(await screen.findByText('Retornar sobre erro no atalho')).toBeTruthy();
        const progress = screen.getByRole('progressbar', { name: 'Progresso de Retornar sobre erro no atalho' });
        expect(progress.getAttribute('aria-valuenow')).toBe('50');
        expect(progress.getAttribute('aria-valuetext')).toBe('1 de 2 etapas concluídas');
        expect(screen.getAllByText('Conversa').length).toBeGreaterThan(0);
        expect(screen.getByRole('button', { name: 'Lista' })).toBeTruthy();

        fireEvent.click(screen.getByRole('button', { name: 'Equipe' }));
        await waitFor(() => expect(apiRequest).toHaveBeenCalledWith('/api/assistant/tasks?scope=team'));
    });

    it('abre o formulário manual pelo botão global', async () => {
        render(<MemoryRouter><Tasks /></MemoryRouter>);
        await screen.findByText('Retornar sobre erro no atalho');
        fireEvent.click(screen.getByRole('button', { name: 'Nova tarefa' }));
        expect(screen.getByRole('heading', { name: 'Nova tarefa' })).toBeTruthy();
        expect(screen.getByLabelText('Título')).toBeTruthy();
        expect(screen.getByLabelText('Sistema / produto')).toBeTruthy();
        expect(screen.getAllByRole('option', { name: 'Sigma PDV' }).length).toBeGreaterThan(0);
        fireEvent.focus(screen.getByLabelText('Contato / cliente'));
        expect(await screen.findByText('João | Empresa Sigma')).toBeTruthy();
    });

    it('oferece cadastro rápido quando o número não existe no CRM', async () => {
        render(<MemoryRouter><Tasks /></MemoryRouter>);
        await screen.findByText('Retornar sobre erro no atalho');
        fireEvent.click(screen.getByRole('button', { name: 'Nova tarefa' }));

        fireEvent.change(screen.getByLabelText('Contato / cliente'), { target: { value: '554998169328' } });
        fireEvent.click(await screen.findByRole('button', { name: /Cadastrar 554998169328/ }));

        expect(screen.getByRole('heading', { name: 'Cadastrar contato pelo número' })).toBeTruthy();
        expect(screen.getByLabelText('Nome do contato')).toBeTruthy();
    });

    it('permite organizar a tarefa em tópicos e marcar o que já foi feito', async () => {
        render(<MemoryRouter><Tasks /></MemoryRouter>);
        fireEvent.click(await screen.findByText('Retornar sobre erro no atalho'));

        expect(await screen.findByRole('heading', { name: 'Etapas' })).toBeTruthy();
        expect(screen.getByText('Validar o acesso remoto')).toBeTruthy();
        fireEvent.click(screen.getByRole('button', { name: 'Concluir Validar o acesso remoto' }));

        await waitFor(() => expect(apiRequest).toHaveBeenCalledWith(
            '/api/assistant/tasks/task-1/checklist/item-1',
            expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ completed: true }) }),
        ));

        fireEvent.change(screen.getByPlaceholderText('Adicionar tópico ou etapa'), { target: { value: 'Retornar ao cliente' } });
        fireEvent.click(screen.getByRole('button', { name: 'Adicionar etapa' }));

        await waitFor(() => expect(apiRequest).toHaveBeenCalledWith(
            '/api/assistant/tasks/task-1/checklist',
            expect.objectContaining({ method: 'POST', body: JSON.stringify({ text: 'Retornar ao cliente' }) }),
        ));
    });

    it('usa o agente para entender o problema e adicionar um plano revisado', async () => {
        render(<MemoryRouter><Tasks /></MemoryRouter>);
        fireEvent.click(await screen.findByText('Retornar sobre erro no atalho'));
        expect(await screen.findByRole('heading', { name: 'Etapas' })).toBeTruthy();

        fireEvent.click(screen.getByRole('button', { name: 'Sugerir etapas' }));
        const context = screen.getByLabelText(/Contexto adicional/);
        fireEvent.change(context, { target: { value: 'O erro começou depois da atualização.' } });
        fireEvent.click(screen.getByRole('button', { name: 'Entender e criar plano' }));

        expect(await screen.findByText('O acesso precisa ser reproduzido para identificar a causa.')).toBeTruthy();
        expect(screen.getByText('Agente Uniplus')).toBeTruthy();
        expect(screen.getByText('Confirmar a mensagem de erro')).toBeTruthy();
        expect(screen.getByText('Servidor Yoda — Uniplus Desktop')).toBeTruthy();
        expect(screen.getByText('Documentação oficial · Desktop/offline')).toBeTruthy();
        fireEvent.click(screen.getByRole('button', { name: 'Adicionar 3 etapas' }));

        await waitFor(() => expect(apiRequest).toHaveBeenCalledWith(
            '/api/assistant/tasks/task-1/checklist/bulk',
            expect.objectContaining({
                method: 'POST',
                body: JSON.stringify({ items: ['Confirmar a mensagem de erro', 'Reproduzir o acesso', 'Validar a correção'] }),
            }),
        ));
    });
});
