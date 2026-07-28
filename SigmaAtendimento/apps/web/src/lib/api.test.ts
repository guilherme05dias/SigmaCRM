// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiRequest } from './api';

function jsonResponse(body: unknown, status: number) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
    });
}

describe('apiRequest', () => {
    beforeEach(() => {
        localStorage.clear();
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.unstubAllGlobals();
    });

    it('repete uma consulta GET após uma falha transitória', async () => {
        const fetchMock = vi.fn()
            .mockResolvedValueOnce(jsonResponse({ error: 'temporario' }, 503))
            .mockResolvedValueOnce(jsonResponse({ ok: true }, 200));
        vi.stubGlobal('fetch', fetchMock);

        const pendingRequest = apiRequest<{ ok: boolean }>('/api/test', { auth: false });
        await vi.runAllTimersAsync();

        await expect(pendingRequest).resolves.toEqual({ ok: true });
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('não repete uma operação POST', async () => {
        const fetchMock = vi.fn()
            .mockResolvedValueOnce(jsonResponse({ error: 'temporario' }, 503));
        vi.stubGlobal('fetch', fetchMock);

        await expect(apiRequest('/api/test', {
            auth: false,
            method: 'POST',
            body: JSON.stringify({ value: 1 }),
        })).rejects.toEqual(expect.objectContaining({ status: 503 }));

        expect(fetchMock).toHaveBeenCalledTimes(1);
    });
});
