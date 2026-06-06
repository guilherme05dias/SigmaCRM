import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiRequest, redirectOnUnauthorized } from './api';
import { clearAuthToken, getAuthToken } from './authToken';

export interface AuthUser {
    id: string;
    name: string;
    email: string;
    role: string;
    companyId?: string | null;
    departmentId?: string | null;
    active?: boolean;
}

interface AuthContextValue {
    user: AuthUser | null;
    loading: boolean;
    logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function decodeTokenUser(token: string): AuthUser | null {
    try {
        const payload = JSON.parse(atob(token.split('.')[1] || '')) as Partial<AuthUser>;
        if (!payload.id) return null;

        return {
            id: payload.id,
            name: payload.name || 'Usuário',
            email: payload.email || '',
            role: payload.role || 'AGENT',
            companyId: payload.companyId,
            departmentId: payload.departmentId,
            active: payload.active,
        };
    } catch {
        return null;
    }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const navigate = useNavigate();
    const [user, setUser] = useState<AuthUser | null>(() => {
        const token = getAuthToken();
        return token ? decodeTokenUser(token) : null;
    });
    const [loading, setLoading] = useState(true);

    const logout = () => {
        clearAuthToken();
        setUser(null);
        navigate('/login');
    };

    useEffect(() => {
        const token = getAuthToken();
        if (!token) {
            logout();
            return;
        }

        apiRequest<AuthUser>('/api/auth/me')
            .then((currentUser) => setUser(currentUser))
            .catch((error) => {
                if (!redirectOnUnauthorized(error, navigate)) {
                    console.error(error);
                }
                clearAuthToken();
                setUser(null);
                navigate('/login');
            })
            .finally(() => setLoading(false));
    }, []);

    const value = useMemo<AuthContextValue>(() => ({ user, loading, logout }), [user, loading]);

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth deve ser usado dentro de AuthProvider');
    }
    return context;
}
