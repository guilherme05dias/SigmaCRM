import { lazy, Suspense, useEffect, useState } from 'react';
import { Route, Routes, useNavigate } from 'react-router-dom';
import { clearAuthToken, getAuthToken } from './lib/authToken';
import { AuthProvider, useAuth } from './lib/auth';

const Login = lazy(() => import('./pages/Login'));
const Users = lazy(() => import('./pages/Users'));
const Departments = lazy(() => import('./pages/Departments'));
const ServiceTopics = lazy(() => import('./pages/ServiceTopics'));
const Customers = lazy(() => import('./pages/Customers'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Inbox = lazy(() => import('./pages/Inbox'));
const Notifications = lazy(() => import('./pages/Notifications'));
const Settings = lazy(() => import('./pages/Settings'));
const Tickets = lazy(() => import('./pages/Tickets'));
const TicketDetail = lazy(() => import('./pages/TicketDetail'));
const Visits = lazy(() => import('./pages/Visits'));
const Reports = lazy(() => import('./pages/Reports'));
const Assistant = lazy(() => import('./pages/Assistant'));
const Tasks = lazy(() => import('./pages/Tasks'));
const PrivacyPolicy = lazy(() => import('./pages/PrivacyPolicy'));
const TermsOfService = lazy(() => import('./pages/TermsOfService'));
const NotFound = lazy(() => import('./pages/NotFound'));

function isValidJwtFormat(token: string): boolean {
    const parts = token.split('.');
    return parts.length === 3 && parts.every((part) => part.length > 0);
}

function LoadingScreen() {
    return (
        <div
            role="status"
            aria-label="Carregando aplicação"
            style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '100vw',
                height: '100vh',
                background: 'var(--c-background)',
            }}
        >
            <div
                aria-hidden="true"
                style={{
                    width: 40,
                    height: 40,
                    border: '3px solid rgb(var(--c-primary) / 0.2)',
                    borderTop: '3px solid rgb(var(--c-primary))',
                    borderRadius: '50%',
                    animation: 'sigma-spin 0.8s linear infinite',
                }}
            />
            <span className="sr-only">Carregando aplicação</span>
            <style>{`@keyframes sigma-spin { to { transform: rotate(360deg); } }`}</style>
        </div>
    );
}

function AppSuspense({ children }: { children: React.ReactNode }) {
    return <Suspense fallback={<LoadingScreen />}>{children}</Suspense>;
}

function ProtectedLayout({ children }: { children: React.ReactNode }) {
    const navigate = useNavigate();
    const [authState, setAuthState] = useState<null | boolean>(null);

    useEffect(() => {
        const token = getAuthToken();

        if (!token || !isValidJwtFormat(token)) {
            clearAuthToken();
            setAuthState(false);
            navigate('/login');
            return;
        }

        setAuthState(true);
    }, [navigate]);

    if (authState === null) return <LoadingScreen />;
    if (authState === false) return null;

    return (
        <AuthProvider>
            <AppSuspense>{children}</AppSuspense>
        </AuthProvider>
    );
}

function RoleGuard({ allowedRoles, children }: { allowedRoles: string[]; children: React.ReactNode }) {
    const { user, loading } = useAuth();
    if (loading) return <LoadingScreen />;

    if (!user || !allowedRoles.includes(user.role)) {
        return (
            <div className="flex min-h-screen items-center justify-center bg-background p-6 text-foreground">
                <div className="max-w-md rounded-2xl border border-border bg-surface p-6 text-center shadow-card">
                    <h1 className="text-2xl font-bold text-foreground">Acesso restrito</h1>
                    <p className="mt-2 text-sm text-muted-foreground">
                        Você não tem permissão para acessar esta área.
                    </p>
                </div>
            </div>
        );
    }

    return <>{children}</>;
}

function App() {
    return (
        <AppSuspense>
            <Routes>
                <Route path="/login" element={<Login />} />
                <Route path="/" element={<ProtectedLayout><Dashboard /></ProtectedLayout>} />
                <Route path="/inbox" element={<ProtectedLayout><Inbox /></ProtectedLayout>} />
                <Route path="/notifications" element={<ProtectedLayout><Notifications /></ProtectedLayout>} />
                <Route path="/tickets" element={<ProtectedLayout><Tickets /></ProtectedLayout>} />
                <Route path="/tickets/:id" element={<ProtectedLayout><TicketDetail /></ProtectedLayout>} />
                <Route path="/visits" element={<ProtectedLayout><Visits /></ProtectedLayout>} />
                <Route path="/customers" element={<ProtectedLayout><Customers /></ProtectedLayout>} />
                <Route
                    path="/users"
                    element={<ProtectedLayout><RoleGuard allowedRoles={['ADMIN', 'SUPERVISOR']}><Users /></RoleGuard></ProtectedLayout>}
                />
                <Route
                    path="/departments"
                    element={<ProtectedLayout><RoleGuard allowedRoles={['ADMIN', 'SUPERVISOR']}><Departments /></RoleGuard></ProtectedLayout>}
                />
                <Route
                    path="/service-topics"
                    element={<ProtectedLayout><RoleGuard allowedRoles={['ADMIN', 'SUPERVISOR']}><ServiceTopics /></RoleGuard></ProtectedLayout>}
                />
                <Route path="/reports" element={<ProtectedLayout><Reports /></ProtectedLayout>} />
                <Route path="/assistant" element={<ProtectedLayout><Assistant /></ProtectedLayout>} />
                <Route path="/tasks" element={<ProtectedLayout><Tasks /></ProtectedLayout>} />
                <Route
                    path="/settings"
                    element={<ProtectedLayout><RoleGuard allowedRoles={['ADMIN', 'SUPERVISOR']}><Settings /></RoleGuard></ProtectedLayout>}
                />
                <Route path="/politica-de-privacidade" element={<PrivacyPolicy />} />
                <Route path="/termos-de-servico" element={<TermsOfService />} />
                <Route path="*" element={<ProtectedLayout><NotFound /></ProtectedLayout>} />
            </Routes>
        </AppSuspense>
    );
}

export default App;
