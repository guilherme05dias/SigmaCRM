// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Conversation, Message } from '../components/inbox/types';
import Inbox from './Inbox';

const mocks = vi.hoisted(() => ({
    apiRequest: vi.fn(),
    user: {
        id: 'user-1',
        name: 'Atendente',
        email: 'atendente@sigmapdv.com',
        role: 'ADMIN',
        canViewAllConversations: false,
    },
    onConversationUpdated: null as null | ((conversation: Conversation) => void),
    onMessageNew: null as null | ((message: Message) => void),
    onReconnect: null as null | (() => void),
}));

vi.mock('../lib/api', () => ({
    apiRequest: mocks.apiRequest,
    redirectOnUnauthorized: vi.fn(() => false),
}));
vi.mock('../lib/authToken', () => ({
    clearAuthToken: vi.fn(),
    getAuthToken: vi.fn(() => 'test-token'),
}));
vi.mock('../lib/auth', () => ({
    useAuth: () => ({
        user: mocks.user,
        logout: vi.fn(),
    }),
}));
vi.mock('../lib/useInboxSocket', () => ({
    useInboxSocket: (
        _token: string | null,
        _selectedId: string | null,
        onConversationUpdated: (conversation: Conversation) => void,
        onMessageNew: (message: Message) => void,
        _onMessageUpdated: (message: Partial<Message> & { id: string }) => void,
        _onConversationNew?: (conversation: Conversation) => void,
        onReconnect?: () => void,
    ) => {
        mocks.onConversationUpdated = onConversationUpdated;
        mocks.onMessageNew = onMessageNew;
        mocks.onReconnect = onReconnect || null;
        return { isConnected: true };
    },
}));
vi.mock('../components/ui/Toast', () => ({
    useToast: () => ({ showToast: vi.fn() }),
}));
vi.mock('../components/sigma/SigmaSidebarIcon', () => ({ SigmaSidebarIcon: () => null }));
vi.mock('../components/inbox/ContactSidebar', () => ({ ContactSidebar: () => null }));
vi.mock('../components/inbox/ConversationList', () => ({
    ConversationList: ({
        conversations,
        onSelect,
        showManagementScope,
        managementScope,
        onManagementScopeChange,
    }: {
        conversations: Conversation[];
        onSelect: (id: string) => void;
        showManagementScope?: boolean;
        managementScope?: 'mine' | 'all';
        onManagementScopeChange?: (scope: 'mine' | 'all') => void;
    }) => (
        <nav aria-label="Conversas disponíveis">
            {showManagementScope && (
                <div>
                    <button type="button" aria-pressed={managementScope === 'mine'} onClick={() => onManagementScopeChange?.('mine')}>Meus atendimentos</button>
                    <button type="button" aria-pressed={managementScope === 'all'} onClick={() => onManagementScopeChange?.('all')}>Todos</button>
                </div>
            )}
            {conversations.map((conversation) => (
                <button key={conversation.id} type="button" onClick={() => onSelect(conversation.id)}>
                    Abrir {conversation.id}
                </button>
            ))}
        </nav>
    ),
}));
vi.mock('../components/inbox/ChatWindow', () => ({
    ChatWindow: ({
        conversation,
        messages,
    }: {
        conversation: Conversation | null;
        messages: Message[];
    }) => (
        <main>
            <span data-testid="selected-conversation">{conversation?.id || 'nenhuma'}</span>
            <div data-testid="visible-messages">
                {messages.map((message) => <span key={message.id}>{message.body}</span>)}
            </div>
        </main>
    ),
}));

function conversation(
    id: string,
    contactId: string,
    options: Partial<Conversation> = {},
): Conversation {
    return {
        id,
        contactId,
        contact: {
            phone: `55499999999${id.slice(-1)}`,
            name: `Cliente ${id}`,
        },
        status: 'ASSIGNED',
        assignedUser: { id: 'user-1', name: 'Atendente' },
        unreadCount: 0,
        messages: [],
        createdAt: '2026-07-28T12:00:00.000Z',
        lastMessageAt: '2026-07-28T12:00:00.000Z',
        ...options,
    };
}

function message(id: string, conversationId: string, body: string): Message {
    return {
        id,
        conversationId,
        direction: 'INBOUND',
        type: 'TEXT',
        body,
        createdAt: '2026-07-28T12:00:00.000Z',
    };
}

function deferred<T>() {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((promiseResolve) => {
        resolve = promiseResolve;
    });
    return { promise, resolve };
}

describe('estabilidade da conversa aberta durante atualizações', () => {
    afterEach(() => {
        cleanup();
        vi.useRealTimers();
    });

    beforeEach(() => {
        vi.clearAllMocks();
        Object.assign(mocks.user, {
            id: 'user-1',
            name: 'Atendente',
            email: 'atendente@sigmapdv.com',
            role: 'ADMIN',
            canViewAllConversations: false,
        });
        mocks.onConversationUpdated = null;
        mocks.onMessageNew = null;
        mocks.onReconnect = null;
    });

    it('@spec:AC-010 mostra Meus atendimentos e Todos para técnico com acesso global', async () => {
        Object.assign(mocks.user, {
            id: 'carlos-id',
            name: 'Carlos Técnico',
            email: 'carlos@dragonbyte.com',
            role: 'TECHNICIAN',
            canViewAllConversations: true,
        });
        mocks.apiRequest.mockImplementation((path: string) => {
            if (path === '/api/conversations?scope=all' || path === '/api/conversations?scope=mine') return Promise.resolve([]);
            if (path === '/api/departments' || path === '/api/service-topics' || path === '/api/users') return Promise.resolve([]);
            return Promise.reject(new Error(`Rota inesperada: ${path}`));
        });

        render(<MemoryRouter><Inbox /></MemoryRouter>);

        expect(await screen.findByRole('button', { name: 'Meus atendimentos' })).toBeVisible();
        expect(screen.getByRole('button', { name: 'Todos' })).toBeVisible();
        expect(mocks.apiRequest).toHaveBeenCalledWith('/api/conversations?scope=all');

        fireEvent.click(screen.getByRole('button', { name: 'Meus atendimentos' }));
        await waitFor(() => expect(mocks.apiRequest).toHaveBeenCalledWith('/api/conversations?scope=mine'));
    });

    it('ignora mensagens atrasadas de uma conversa que já não está selecionada', async () => {
        const conversationA = conversation('conversation-a', 'contact-a');
        const conversationB = conversation('conversation-b', 'contact-b');
        const messagesA = deferred<{ data: Message[] }>();
        const messagesB = deferred<{ data: Message[] }>();

        mocks.apiRequest.mockImplementation((path: string) => {
            if (path === '/api/conversations?scope=all') return Promise.resolve([conversationA, conversationB]);
            if (path === '/api/departments' || path === '/api/service-topics' || path === '/api/users') {
                return Promise.resolve([]);
            }
            if (path.startsWith('/api/conversations/conversation-a/messages')) return messagesA.promise;
            if (path.startsWith('/api/conversations/conversation-b/messages')) return messagesB.promise;
            if (path.endsWith('/read')) return Promise.resolve({ ok: true });
            return Promise.reject(new Error(`Rota inesperada: ${path}`));
        });

        render(<MemoryRouter><Inbox /></MemoryRouter>);

        fireEvent.click(await screen.findByRole('button', { name: 'Abrir conversation-a' }));
        await waitFor(() => {
            expect(mocks.apiRequest).toHaveBeenCalledWith(
                expect.stringContaining('/api/conversations/conversation-a/messages'),
            );
        });

        fireEvent.click(screen.getByRole('button', { name: 'Abrir conversation-b' }));
        await waitFor(() => {
            expect(mocks.apiRequest).toHaveBeenCalledWith(
                expect.stringContaining('/api/conversations/conversation-b/messages'),
            );
        });

        await act(async () => {
            messagesB.resolve({ data: [message('message-b', 'conversation-b', 'Mensagem correta da conversa B')] });
            await messagesB.promise;
        });
        expect(screen.getByTestId('visible-messages')).toHaveTextContent('Mensagem correta da conversa B');

        await act(async () => {
            messagesA.resolve({ data: [message('message-a', 'conversation-a', 'Mensagem atrasada da conversa A')] });
            await messagesA.promise;
        });

        expect(screen.getByTestId('selected-conversation')).toHaveTextContent('conversation-b');
        expect(screen.getByTestId('visible-messages')).toHaveTextContent('Mensagem correta da conversa B');
        expect(screen.getByTestId('visible-messages')).not.toHaveTextContent('Mensagem atrasada da conversa A');
    });

    it('mantém a conversa escolhida quando outra conversa passa a ser a preferida da lista', async () => {
        const selected = conversation('conversation-a', 'same-contact', {
            lastMessageAt: '2026-07-28T13:00:00.000Z',
            messages: [message('preview-a', 'conversation-a', 'Prévia A')],
        });
        const duplicate = conversation('conversation-b', 'same-contact', {
            status: 'OPEN',
            assignedUser: null,
            lastMessageAt: '2026-07-28T12:00:00.000Z',
        });

        mocks.apiRequest.mockImplementation((path: string) => {
            if (path === '/api/conversations?scope=all') return Promise.resolve([selected, duplicate]);
            if (path === '/api/departments' || path === '/api/service-topics' || path === '/api/users') {
                return Promise.resolve([]);
            }
            if (path.startsWith('/api/conversations/conversation-a/messages')) return Promise.resolve({ data: [] });
            if (path.endsWith('/read')) return Promise.resolve({ ok: true });
            return Promise.reject(new Error(`Rota inesperada: ${path}`));
        });

        render(<MemoryRouter><Inbox /></MemoryRouter>);
        fireEvent.click(await screen.findByRole('button', { name: 'Abrir conversation-a' }));
        expect(await screen.findByTestId('selected-conversation')).toHaveTextContent('conversation-a');

        await act(async () => {
            mocks.onConversationUpdated?.({
                ...duplicate,
                status: 'ASSIGNED',
                assignedUser: { id: 'user-1', name: 'Atendente' },
                lastMessageAt: '2026-07-28T14:00:00.000Z',
                messages: [message('preview-b', 'conversation-b', 'Prévia B')],
            });
        });

        expect(screen.getByTestId('selected-conversation')).toHaveTextContent('conversation-a');
    });

    it('preserva mensagem recebida em tempo real quando a atualização silenciosa retorna dados antigos', async () => {
        const selected = conversation('conversation-a', 'contact-a');
        const staleRefresh = deferred<{ data: Message[] }>();
        let messageRequests = 0;

        mocks.apiRequest.mockImplementation((path: string) => {
            if (path === '/api/conversations?scope=all') return Promise.resolve([selected]);
            if (path === '/api/departments' || path === '/api/service-topics' || path === '/api/users') {
                return Promise.resolve([]);
            }
            if (path.startsWith('/api/conversations/conversation-a/messages')) {
                messageRequests += 1;
                if (messageRequests === 1) {
                    return Promise.resolve({
                        data: [message('message-old', 'conversation-a', 'Mensagem anterior')],
                    });
                }
                return staleRefresh.promise;
            }
            if (path.endsWith('/read')) return Promise.resolve({ ok: true });
            return Promise.reject(new Error(`Rota inesperada: ${path}`));
        });

        render(<MemoryRouter><Inbox /></MemoryRouter>);
        fireEvent.click(await screen.findByRole('button', { name: 'Abrir conversation-a' }));
        expect(await screen.findByText('Mensagem anterior')).toBeTruthy();

        await act(async () => {
            mocks.onReconnect?.();
        });
        await waitFor(() => expect(messageRequests).toBe(2));

        await act(async () => {
            mocks.onMessageNew?.(message('message-new', 'conversation-a', 'Mensagem recebida agora'));
        });
        expect(screen.getByTestId('visible-messages')).toHaveTextContent('Mensagem recebida agora');

        await act(async () => {
            staleRefresh.resolve({
                data: [message('message-old', 'conversation-a', 'Mensagem anterior')],
            });
            await staleRefresh.promise;
        });

        expect(screen.getByTestId('visible-messages')).toHaveTextContent('Mensagem anterior');
        expect(screen.getByTestId('visible-messages')).toHaveTextContent('Mensagem recebida agora');
    });

    it('não inicia atualizações silenciosas sobrepostas enquanto a lista ainda está carregando', async () => {
        vi.useFakeTimers();
        const conversationsRequest = deferred<Conversation[]>();

        mocks.apiRequest.mockImplementation((path: string) => {
            if (path === '/api/conversations?scope=all') return conversationsRequest.promise;
            if (path === '/api/departments' || path === '/api/service-topics' || path === '/api/users') {
                return Promise.resolve([]);
            }
            return Promise.reject(new Error(`Rota inesperada: ${path}`));
        });

        render(<MemoryRouter><Inbox /></MemoryRouter>);
        await act(async () => {
            await Promise.resolve();
        });

        expect(mocks.apiRequest.mock.calls.filter(([path]) => path === '/api/conversations?scope=all')).toHaveLength(1);

        await act(async () => {
            await vi.advanceTimersByTimeAsync(7_500);
        });

        expect(mocks.apiRequest.mock.calls.filter(([path]) => path === '/api/conversations?scope=all')).toHaveLength(1);

        await act(async () => {
            conversationsRequest.resolve([]);
            await conversationsRequest.promise;
        });

        await act(async () => {
            await vi.advanceTimersByTimeAsync(2_500);
        });

        expect(mocks.apiRequest.mock.calls.filter(([path]) => path === '/api/conversations?scope=all')).toHaveLength(2);
    });

    it('não inicia atualizações silenciosas sobrepostas das mensagens abertas', async () => {
        vi.useFakeTimers();
        const selected = conversation('conversation-a', 'contact-a');
        const messagesRequest = deferred<{ data: Message[] }>();
        let messageRequests = 0;

        mocks.apiRequest.mockImplementation((path: string) => {
            if (path === '/api/conversations?scope=all') return Promise.resolve([selected]);
            if (path === '/api/departments' || path === '/api/service-topics' || path === '/api/users') {
                return Promise.resolve([]);
            }
            if (path.startsWith('/api/conversations/conversation-a/messages')) {
                messageRequests += 1;
                return messagesRequest.promise;
            }
            if (path.endsWith('/read')) return Promise.resolve({ ok: true });
            return Promise.reject(new Error(`Rota inesperada: ${path}`));
        });

        render(<MemoryRouter><Inbox /></MemoryRouter>);
        await act(async () => {
            await Promise.resolve();
        });

        fireEvent.click(screen.getByRole('button', { name: 'Abrir conversation-a' }));
        await act(async () => {
            await Promise.resolve();
        });
        expect(messageRequests).toBe(1);

        await act(async () => {
            await vi.advanceTimersByTimeAsync(7_500);
        });
        expect(messageRequests).toBe(1);

        await act(async () => {
            messagesRequest.resolve({ data: [] });
            await messagesRequest.promise;
        });

        await act(async () => {
            await vi.advanceTimersByTimeAsync(2_500);
        });
        expect(messageRequests).toBe(2);
    });
});
