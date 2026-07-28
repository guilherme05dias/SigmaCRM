import { afterEach, describe, expect, it, vi } from 'vitest';

describe('getProviderUnreadCounts', () => {
    afterEach(() => {
        vi.useRealTimers();
        vi.resetModules();
    });

    it('retorna o cache disponível sem bloquear a listagem enquanto o provedor está lento', async () => {
        vi.useFakeTimers();
        const { getProviderUnreadCounts } = await import('./providerUnread.service');
        let resolveChats!: (value: Array<{ phone: string; unreadCount: number }>) => void;
        const providerRefresh = new Promise<Array<{ phone: string; unreadCount: number }>>((resolve) => {
            resolveChats = resolve;
        });
        const provider = {
            listChatUnreadCounts: vi.fn(() => providerRefresh),
        };

        const resultPromise = getProviderUnreadCounts(provider as never, { maxWaitMs: 50 });
        await vi.advanceTimersByTimeAsync(50);

        await expect(resultPromise).resolves.toBeNull();
        expect(provider.listChatUnreadCounts).toHaveBeenCalledTimes(1);

        resolveChats([{ phone: '5549999999999', unreadCount: 3 }]);
        await providerRefresh;
        await Promise.resolve();

        const cached = await getProviderUnreadCounts(provider as never, { maxWaitMs: 50 });
        expect(cached?.get('5549999999999')).toBe(3);
        expect(provider.listChatUnreadCounts).toHaveBeenCalledTimes(1);
    });
});
