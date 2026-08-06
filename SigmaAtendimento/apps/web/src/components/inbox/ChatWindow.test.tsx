// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatWindow } from './ChatWindow';

const conversation = {
    id: 'conversation-1',
    contactId: 'contact-1',
    contact: {
        phone: '5549999999999',
        name: 'Cliente teste',
        includeInServiceReports: true,
        businessId: null,
        customer: { id: 'customer-1', name: 'Empresa teste', businesses: [] },
    },
    status: 'ASSIGNED' as const,
    assignedUserId: 'user-1',
    assignedUser: { id: 'user-1', name: 'Atendente' },
    unreadCount: 0,
    messages: [],
};

function renderChatWindow(options: {
    messages?: any[];
    serviceTopics?: Array<{ id: string; name: string; active?: boolean }>;
    isLoadingServiceTopics?: boolean;
    serviceTopicsError?: string | null;
    onReloadServiceTopics?: () => Promise<void>;
} = {}) {
    const onReloadServiceTopics = options.onReloadServiceTopics ?? vi.fn().mockResolvedValue(undefined);
    render(
        <MemoryRouter>
            <ChatWindow
                currentUser={{ id: 'user-1', name: 'Atendente', role: 'ATTENDANT' } as any}
                conversation={conversation}
                messages={options.messages ?? []}
                isLoading={false}
                isSubmitting={false}
                isSyncingHistory={false}
                sendError={null}
                onTake={vi.fn()}
                onSend={vi.fn().mockResolvedValue(true)}
                onEdit={vi.fn().mockResolvedValue(true)}
                onReact={vi.fn().mockResolvedValue(true)}
                onSyncHistory={vi.fn().mockResolvedValue(undefined)}
                onTransfer={vi.fn()}
                onCloseConversation={vi.fn().mockResolvedValue(undefined)}
                onCreateTicket={vi.fn().mockResolvedValue(undefined)}
                isClosingConversation={false}
                isCreatingTicket={false}
                createTicketError={null}
                departments={[]}
                serviceTopics={options.serviceTopics ?? [{ id: '55555555-5555-4555-8555-555555555555', name: 'Sigma PDV', active: true }]}
                isLoadingServiceTopics={options.isLoadingServiceTopics ?? false}
                serviceTopicsError={options.serviceTopicsError ?? null}
                onReloadServiceTopics={onReloadServiceTopics}
                technicians={[]}
                hasMore={false}
                onLoadMore={vi.fn()}
                isRealtimeConnected
                isRefreshing={false}
                lastSyncedAt={null}
            />
        </MemoryRouter>,
    );
    return { onReloadServiceTopics };
}

describe('encerramento do atendimento no WhatsApp', () => {
    beforeEach(() => {
        Object.defineProperty(Element.prototype, 'scrollIntoView', { configurable: true, value: vi.fn() });
    });

    afterEach(() => cleanup());

    it('exibe três opções explícitas antes de finalizar', async () => {
        renderChatWindow();
        fireEvent.click(screen.getByRole('button', { name: 'Encerrar atendimento' }));

        expect(screen.getByRole('radio', { name: /Encerrar com a avaliação/ })).toBeTruthy();
        expect(screen.getByRole('radio', { name: /Encerrar por inatividade\/sem resposta/ })).toBeTruthy();
        expect(screen.getByRole('radio', { name: /Encerrar sem mandar mensagem/ })).toBeTruthy();
        expect((screen.getByRole('button', { name: 'Escolha como encerrar' }) as HTMLButtonElement).disabled).toBe(true);

        fireEvent.click(screen.getByRole('radio', { name: /Encerrar sem mandar mensagem/ }));
        expect((screen.getByRole('button', { name: 'Fechar sem mensagem' }) as HTMLButtonElement).disabled).toBe(false);
    });

    it('atualiza os sistemas ao abrir o encerramento', () => {
        const onReloadServiceTopics = vi.fn().mockResolvedValue(undefined);
        renderChatWindow({ onReloadServiceTopics });

        fireEvent.click(screen.getByRole('button', { name: 'Encerrar atendimento' }));

        expect(onReloadServiceTopics).toHaveBeenCalledTimes(1);
        expect(screen.getByRole('option', { name: 'Sigma PDV' })).toBeTruthy();
    });

    it('explica a falha de carregamento e permite tentar novamente', () => {
        const onReloadServiceTopics = vi.fn().mockResolvedValue(undefined);
        renderChatWindow({
            serviceTopics: [],
            serviceTopicsError: 'Falha de rede',
            onReloadServiceTopics,
        });

        fireEvent.click(screen.getByRole('button', { name: 'Encerrar atendimento' }));
        fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));

        expect(screen.getByRole('alert').textContent).toContain('Não foi possível carregar');
        expect(onReloadServiceTopics).toHaveBeenCalledTimes(2);
    });
});

describe('mídias no atendimento', () => {
    beforeEach(() => {
        Object.defineProperty(Element.prototype, 'scrollIntoView', { configurable: true, value: vi.fn() });
    });

    afterEach(() => cleanup());

    it('mantém o reprodutor de áudio recebido amplo e responsivo', () => {
        renderChatWindow({
            messages: [{
                id: 'audio-1',
                conversationId: 'conversation-1',
                direction: 'INBOUND',
                type: 'AUDIO',
                body: null,
                mediaUrl: 'https://example.test/audio.ogg',
                waMessageId: 'wa-audio-1',
                createdAt: new Date().toISOString(),
            }],
        });

        const audio = screen.getByLabelText('Áudio recebido');
        expect(audio.className).toContain('h-12');
        expect(audio.className).toContain('w-full');
        expect(audio.parentElement?.className).toContain('w-full');
        expect(audio.parentElement?.parentElement?.parentElement?.className).toContain('w-full');
        expect(audio.parentElement?.parentElement?.parentElement?.className).toContain('max-w-[22rem]');
    });
});
