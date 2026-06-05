import { Routes, Route, useNavigate } from 'react-router-dom';
import Login from './pages/Login';
import Users from './pages/Users';
import Departments from './pages/Departments';
import Customers from './pages/Customers';
import Dashboard from './pages/Dashboard';
import Inbox from './pages/Inbox';
import Settings from './pages/Settings';
import Tickets from './pages/Tickets';
import Reports from './pages/Reports';
import PrivacyPolicy from './pages/PrivacyPolicy';
import TermsOfService from './pages/TermsOfService';
import { useEffect, useState } from 'react';

/** Valida se string é um JWT bem formado (3 partes base64 separadas por ponto) */
function isValidJwtFormat(token: string): boolean {
    const parts = token.split('.');
    return parts.length === 3 && parts.every(p => p.length > 0);
}

/** Tela de loading no tema claro trust-blue */
function LoadingScreen() {
    return (
        <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '100vw',
            height: '100vh',
            background: '#F8FAFC',
        }}>
            <div style={{
                width: 40,
                height: 40,
                border: '3px solid rgba(37,99,235,0.2)',
                borderTop: '3px solid #2563EB',
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
        const token = localStorage.getItem('sigma-token');

        if (!token || !isValidJwtFormat(token)) {
            // Token ausente ou malformado — limpa e redireciona
            localStorage.removeItem('sigma-token');
            setAuthState(false);
            navigate('/login');
            return;
        }

        // Token parece válido — deixa a API rejeitar se necessário
        setAuthState(true);
    }, [navigate]);

    if (authState === null) return <LoadingScreen />;
    if (authState === false) return null;

    return <>{children}</>;
}

function App() {
    return (
        <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/" element={<ProtectedLayout><Dashboard /></ProtectedLayout>} />
            <Route path="/inbox" element={<ProtectedLayout><Inbox /></ProtectedLayout>} />
            <Route path="/tickets" element={<ProtectedLayout><Tickets /></ProtectedLayout>} />
            <Route path="/customers" element={<ProtectedLayout><Customers /></ProtectedLayout>} />
            <Route path="/users" element={<ProtectedLayout><Users /></ProtectedLayout>} />
            <Route path="/departments" element={<ProtectedLayout><Departments /></ProtectedLayout>} />
            <Route path="/reports" element={<ProtectedLayout><Reports /></ProtectedLayout>} />
            <Route path="/settings" element={<ProtectedLayout><Settings /></ProtectedLayout>} />
            <Route path="/politica-de-privacidade" element={<PrivacyPolicy />} />
            <Route path="/termos-de-servico" element={<TermsOfService />} />
        </Routes>
    );
}

export default App;
