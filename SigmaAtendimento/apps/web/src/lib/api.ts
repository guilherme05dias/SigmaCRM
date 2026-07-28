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

export async function apiRequest<T>(path: string, options: ApiOptions = {}): Promise<T> {
    const { auth = true, headers, ...rest } = options;
    const token = getAuthToken();

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
        throw new ApiError(payload?.error || 'Erro ao chamar API', response.status);
    }

    return payload as T;
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
