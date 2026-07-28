// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Assistant from './Assistant';

const { apiRequest, authUser } = vi.hoisted(() => ({
    apiRequest: vi.fn(),
    authUser: { id: 'user-1', role: 'ADMIN' },
}));

vi.mock('../lib/api', () => ({
    apiRequest,
    redirectOnUnauthorized: vi.fn(() => false),
}));
vi.mock('../lib/auth', () => ({
    useAuth: () => ({ user: authUser, logout: vi.fn() }),
}));
vi.mock('../components/sigma/SigmaSidebarIcon', () => ({ SigmaSidebarIcon: () => null }));

const enabledStatus = {
    enabled: true,
    model: 'llama3.2:1b',
    provider: 'ollama',
    localOnly: true,
    mode: 'internal_analysis_only',
    canSendCustomerMessages: false,
    agents: [{
        id: 'REPORT_ANALYST',
        name: 'Analista de dados e relatórios',
        shortName: 'Analista de relatórios',
        description: 'Analisa a operação e prepara prioridades para relatórios internos.',
        capabilities: ['Indicadores operacionais', 'Problemas recorrentes'],
    }, {
        id: 'UNIPLUS_SPECIALIST',
        name: 'Especialista Uniplus',
        shortName: 'Agente Uniplus',
        description: 'Auxilia nas tarefas do Uniplus Desktop/offline e Web.',
        capabilities: ['Uniplus Desktop/offline', 'Uniplus Web'],
    }, {
        id: 'SECULLUM_SPECIALIST',
        name: 'Especialista Secullum',
        shortName: 'Agente Secullum',
        description: 'Auxilia nas tarefas do Secullum Ponto 4 e Ponto Web.',
        capabilities: ['Secullum Ponto 4/offline', 'Secullum Ponto Web'],
    }, {
        id: 'GENERAL_TASKS',
        name: 'Especialista em tarefas gerais',
        shortName: 'Agente geral',
        description: 'Organiza tarefas dos outros produtos e rotinas internas.',
        capabilities: ['Demais produtos', 'Rotinas internas'],
    }, {
        id: 'FOLLOWUP_MASCOT',
        name: 'Mascote operacional',
        shortName: 'Mascote Sigma',
        description: 'Acompanha clientes aguardando resposta e tarefas não concluídas.',
        capabilities: ['Clientes sem resposta', 'Tarefas atrasadas'],
    }],
};

function mockInitialRequests() {
    apiRequest.mockImplementation((path: string) => {
        if (path === '/api/assistant/status') return Promise.resolve(enabledStatus);
        if (path === '/api/assistant/tasks') return Promise.resolve({ tasks: [] });
        if (path === '/api/assistant/analyses/latest') return Promise.resolve({ analysis: null });
        if (path === '/api/assistant/connection-test') {
            return Promise.resolve({
                connection: {
                    ok: true,
                    model: 'llama3.2:1b',
                    provider: 'ollama',
                    localOnly: true,
                    latencyMs: 125,
                    usedSyntheticData: true,
                    canSendCustomerMessages: false,
                },
            });
        }
        if (path === '/api/assistant/analyze') {
            return Promise.resolve({
                analysis: {
                    id: 'analysis-1',
                    model: 'llama3.2:1b',
                    summary: 'Análise interna.',
                    createdAt: '2026-07-21T12:00:00.000Z',
                    result: {
                        agent: enabledStatus.agents[0],
                        analysisMode: 'LOCAL_RULES',
                        summary: 'Análise interna pelas regras locais.',
                        keyRisks: [],
                        prioritizedTickets: [],
                        taskSuggestions: [],
                        conversationStats: { periodDays: 30, conversations: 3, activeContacts: 2, inboundMessages: 12, sampledConversations: 3 },
                        topCustomers: [{ contactId: 'contact-1', name: 'Empresa Exemplo', conversationCount: 2, inboundMessageCount: 8, lastContactAt: '2026-07-21T12:00:00.000Z' }],
                        mainProblems: [{ label: 'Acesso e senha', description: 'Clientes relataram dificuldade para entrar.', conversationCount: 2 }],
                    },
                    sourceTickets: [],
                },
            });
        }
        return Promise.reject(new Error(`Rota inesperada no teste: ${path}`));
    });
}

describe('Assistente operacional', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        authUser.role = 'ADMIN';
        mockInitialRequests();
    });

    afterEach(() => cleanup());

    it('explica a minimização dos dados e testa a conexão somente pela rota sintética', async () => {
        render(<MemoryRouter><Assistant /></MemoryRouter>);

        const testButton = await screen.findByRole('button', { name: 'Testar conexão' });
        expect(screen.getByText(/O assistente não envia respostas para clientes\./)).toBeTruthy();
        expect(screen.getByText('Quais dados são processados na análise local?')).toBeTruthy();
        expect(screen.getByRole('heading', { name: 'Equipe de agentes' })).toBeTruthy();
        expect(screen.getByText('Especialista Uniplus')).toBeTruthy();
        expect(screen.getByText('Especialista Secullum')).toBeTruthy();
        expect(screen.getByText('Especialista em tarefas gerais')).toBeTruthy();
        expect(screen.getByText('Mascote operacional')).toBeTruthy();
        expect(screen.getByText('5 agentes locais')).toBeTruthy();
        expect(screen.getByText(/Nomes de clientes, telefones, e-mails, documentos/)).toBeTruthy();

        fireEvent.click(testButton);

        expect(await screen.findByText('Conexão verificada com dados fictícios · llama3.2:1b · 125 ms')).toBeTruthy();
        expect(apiRequest).toHaveBeenCalledWith('/api/assistant/connection-test', { method: 'POST' });
        expect(apiRequest).not.toHaveBeenCalledWith('/api/assistant/analyze', expect.anything());
    });

    it('não oferece teste nem análise de IA ao atendente', async () => {
        authUser.role = 'ATTENDANT';
        render(<MemoryRouter><Assistant /></MemoryRouter>);

        expect(await screen.findByText('Análise restrita à supervisão')).toBeTruthy();
        expect(screen.queryByRole('button', { name: 'Testar conexão' })).toBeNull();
        expect(apiRequest).not.toHaveBeenCalledWith('/api/assistant/analyses/latest');
        await waitFor(() => expect(apiRequest).toHaveBeenCalledWith('/api/assistant/status'));
    });

    it('exige autorização informada antes de iniciar uma análise real', async () => {
        render(<MemoryRouter><Assistant /></MemoryRouter>);

        const analyzeButtons = await screen.findAllByRole('button', { name: 'Analisar operação' });
        expect(analyzeButtons.length).toBeGreaterThan(0);
        fireEvent.click(analyzeButtons[0]);

        expect(screen.getByRole('heading', { name: 'Confirmar análise interna' })).toBeTruthy();
        expect(screen.getByText(/O ranking de clientes é calculado pelo próprio Sigma/)).toBeTruthy();
        expect(apiRequest).not.toHaveBeenCalledWith('/api/assistant/analyze', expect.anything());

        const confirmButton = screen.getByRole('button', { name: 'Confirmar e analisar' });
        expect((confirmButton as HTMLButtonElement).disabled).toBe(true);
        fireEvent.click(screen.getByRole('checkbox', { name: 'Li e autorizo o processamento local desses dados minimizados nesta análise.' }));
        expect((confirmButton as HTMLButtonElement).disabled).toBe(false);
        fireEvent.click(confirmButton);

        await waitFor(() => expect(apiRequest).toHaveBeenCalledWith('/api/assistant/analyze', {
            method: 'POST',
            body: JSON.stringify({ periodDays: 30, limit: 15, confirmMinimizedDataProcessing: true }),
        }));
        expect(await screen.findByText('Analista de relatórios')).toBeTruthy();
        expect(screen.getByText('Empresa Exemplo')).toBeTruthy();
        expect(screen.getByText('Acesso e senha')).toBeTruthy();
    });
});
