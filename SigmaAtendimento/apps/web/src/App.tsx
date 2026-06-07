import { Routes, Route, useNavigate } from 'react-router-dom';
import Login from './pages/Login';
import Users from './pages/Users';
import Departments from './pages/Departments';
import Customers from './pages/Customers';
import Dashboard from './pages/Dashboard';
import Inbox from './pages/Inbox';
import Settings from './pages/Settings';
import Tickets from './pages/Tickets';
import TicketDetail from './pages/TicketDetail';
import Reports from './pages/Reports';
import PrivacyPolicy from './pages/PrivacyPolicy';
import TermsOfService from './pages/TermsOfService';
import NotFound from './pages/NotFound';
import { useEffect, useState } from 'react';
import { clearAuthToken, getAuthToken } from './lib/authToken';
import { AuthProvider } from './lib/auth';

/** Valida se string é um JWT bem formado (3 partes base64 separadas por ponto) */
function isValidJwtFormat(token: string): boolean {
    const parts = token.split('.');
    return parts.length === 3 && parts.every(p => p.length > 0);
}

/** Tela de loading — usa CSS vars para funcionar em light e dark */
function LoadingScreen() {
    return (
        <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '100vw',
            height: '100vh',
            background: 'var(--c-background)',
        }}>
            <div style={{
                width: 40,
                height: 40,
                border: '3px solid rgb(var(--c-primary) / 0.2)',
                borderTop: '3px solid rgb(var(--c-primary))',
                borderRadius: '50%',
                animation: 'sigma-spin 0.8s linear infinite',
            }} />
            <style>{`@keyframes sigma-spin { to { transform: rotate(360deg); } }`}</style>
        </div>
    );
}

function ProtectedLayout({ children }: { children: React.ReactNode }) {
    const navigate = useNavigate();
    // null = ainda verificando, false = não autenticado, true = autenticado
    const [authState, setAuthState] = useState<null | boolean>(null);

    useEffect(() => {
        const token = getAuthToken();

        if (!token || !isValidJwtFormat(token)) {
            // Token ausente ou malformado — limpa e redireciona
            clearAuthToken();
            setAuthState(false);
            navigate('/login');
            return;
        }

        // Token parece válido — deixa a API rejeitar se necessário
        setAuthState(true);
    }, [navigate]);

    if (authState === null) return <LoadingScreen />;
    if (authState === false) return null;

    return <AuthProvider>{children}</AuthProvider>;
}

function App() {
    return (
        <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/" element={<ProtectedLayout><Dashboard /></ProtectedLayout>} />
            <Route path="/inbox" element={<ProtectedLayout><Inbox /></ProtectedLayout>} />
            <Route path="/tickets" element={<ProtectedLayout><Tickets /></ProtectedLayout>} />
            <Route path="/tickets/:id" element={<ProtectedLayout><TicketDetail /></ProtectedLayout>} />
            <Route path="/customers" element={<ProtectedLayout><Customers /></ProtectedLayout>} />
            <Route path="/users" element={<ProtectedLayout><Users /></ProtectedLayout>} />
            <Route path="/departments" element={<ProtectedLayout><Departments /></ProtectedLayout>} />
            <Route path="/reports" element={<ProtectedLayout><Reports /></ProtectedLayout>} />
            <Route path="/settings" element={<ProtectedLayout><Settings /></ProtectedLayout>} />
            <Route path="/politica-de-privacidade" element={<PrivacyPolicy />} />
            <Route path="/termos-de-servico" element={<TermsOfService />} />
            <Route path="*" element={<ProtectedLayout><NotFound /></ProtectedLayout>} />
        </Routes>
    );
}

export default App;
