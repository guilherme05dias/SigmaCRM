const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3334';

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
    const token = localStorage.getItem('sigma-token');

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

export function redirectOnUnauthorized(error: unknown, navigate: (path: string) => void) {
    if (error instanceof ApiError && error.status === 401) {
        localStorage.removeItem('sigma-token');
        navigate('/login');
        return true;
    }
    return false;
}
