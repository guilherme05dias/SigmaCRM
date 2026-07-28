import { clearAuthToken, getAuthToken } from './authToken';

const API_BASE_URL = import.meta.env.VITE_API_URL || '';

export class ApiError extends Error {
    constructor(message: string, public status: number) {
        super(message);
    }
}

type ApiOptions = RequestInit & {
    auth?: boolean;
};

const GET_RETRY_DELAYS_MS = [1_000, 3_000, 8_000];
const RETRYABLE_GET_STATUSES = new Set([500, 502, 503, 504]);

function wait(delayMs: number) {
    return new Promise<void>((resolve) => window.setTimeout(resolve, delayMs));
}

function canRetryGet(method: string, status?: number) {
    return method === 'GET' && (status === undefined || RETRYABLE_GET_STATUSES.has(status));
}

export async function apiRequest<T>(path: string, options: ApiOptions = {}): Promise<T> {
    const { auth = true, headers, ...rest } = options;
    const token = getAuthToken();
    const method = (rest.method || 'GET').toUpperCase();

    for (let attempt = 0; ; attempt += 1) {
        try {
            const response = await fetch(`${API_BASE_URL}${path}`, {
                ...rest,
                headers: {
                    'Content-Type': 'application/json',
                    ...(auth && token ? { Authorization: `Bearer ${token}` } : {}),
                    ...headers,
                },
            });

            if (response.status === 204) {
                return undefined as T;
            }

            const payload = await response.json().catch(() => null);
            if (!response.ok) {
                if (attempt < GET_RETRY_DELAYS_MS.length && canRetryGet(method, response.status)) {
                    await wait(GET_RETRY_DELAYS_MS[attempt]);
                    continue;
                }
                throw new ApiError(payload?.error || 'Erro ao chamar API', response.status);
            }

            return payload as T;
        } catch (error) {
            if (error instanceof ApiError) throw error;
            if (rest.signal?.aborted || (error instanceof DOMException && error.name === 'AbortError')) throw error;
            if (attempt >= GET_RETRY_DELAYS_MS.length || !canRetryGet(method)) throw error;
            await wait(GET_RETRY_DELAYS_MS[attempt]);
        }
    }
}

export async function apiBlobRequest(path: string): Promise<Blob> {
    const token = getAuthToken();
    const response = await fetch(`${API_BASE_URL}${path}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new ApiError(payload?.error || 'Não foi possível baixar o arquivo.', response.status);
    }
    return response.blob();
}

export function redirectOnUnauthorized(error: unknown, navigate: (path: string) => void) {
    if (error instanceof ApiError && error.status === 401) {
        clearAuthToken();
        navigate('/login');
        return true;
    }
    return false;
}
