import type { IWhatsAppProvider } from '../whatsapp/IWhatsAppProvider';
import { normalizePhone } from '../lib/phone';

const CACHE_TTL_MS = 5_000;

let cachedCounts: Map<string, number> | null = null;
let cacheExpiresAt = 0;
let pendingRefresh: Promise<Map<string, number> | null> | null = null;

type ProviderUnreadOptions = {
    maxWaitMs?: number;
};

function waitForRefresh(
    refresh: Promise<Map<string, number> | null>,
    maxWaitMs?: number,
): Promise<Map<string, number> | null> {
    if (maxWaitMs === undefined) return refresh;

    const waitMs = Math.max(0, maxWaitMs);
    return new Promise((resolve) => {
        let settled = false;
        const timeoutId = setTimeout(() => {
            settled = true;
            resolve(cachedCounts);
        }, waitMs);

        void refresh.then((counts) => {
            if (settled) return;
            clearTimeout(timeoutId);
            resolve(counts);
        });
    });
}

export async function getProviderUnreadCounts(
    provider: IWhatsAppProvider,
    options: ProviderUnreadOptions = {},
): Promise<Map<string, number> | null> {
    if (!provider.listChatUnreadCounts) return null;
    if (cachedCounts && Date.now() < cacheExpiresAt) return cachedCounts;
    if (pendingRefresh) return waitForRefresh(pendingRefresh, options.maxWaitMs);

    pendingRefresh = provider.listChatUnreadCounts()
        .then((chats) => {
            const counts = new Map<string, number>();
            for (const chat of chats) {
                const phone = normalizePhone(chat.phone);
                if (phone.length >= 10) counts.set(phone, Math.max(0, Number(chat.unreadCount) || 0));
            }
            cachedCounts = counts;
            cacheExpiresAt = Date.now() + CACHE_TTL_MS;
            return counts;
        })
        .catch((error) => {
            console.warn('[SIGMA] Não foi possível sincronizar não lidas da UAZAPI:', error);
            cacheExpiresAt = Date.now() + CACHE_TTL_MS;
            return cachedCounts;
        })
        .finally(() => {
            pendingRefresh = null;
        });

    return waitForRefresh(pendingRefresh, options.maxWaitMs);
}

export function invalidateProviderUnreadCounts() {
    cacheExpiresAt = 0;
}

export function setCachedProviderUnreadCount(phone: string, unreadCount: number) {
    if (!cachedCounts) return;
    const normalizedPhone = normalizePhone(phone);
    if (normalizedPhone.length >= 10) {
        cachedCounts.set(normalizedPhone, Math.max(0, Number(unreadCount) || 0));
    }
}
