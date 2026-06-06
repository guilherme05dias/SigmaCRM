import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { LoginSchema } from '@sigma/shared';
import { Icon } from '../components/ui/Icon';
import { apiRequest } from '../lib/api';
import { setAuthToken } from '../lib/authToken';

export default function Login() {
    const navigate = useNavigate();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [remember, setRemember] = useState(true);
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setNotice('');
        try {
            LoginSchema.parse({ email, password });

            const data = await apiRequest<{ token: string }>('/api/auth/login', {
                method: 'POST',
                auth: false,
                body: JSON.stringify({ email, password }),
            });
            setAuthToken(data.token, remember);
            navigate('/');
        } catch (err: any) {
            setNotice('');
            setError(err.message || 'Erro ao fazer login');
        }
    };

    const showAccessNotice = (message: string) => {
        setError('');
        setNotice(message);
    };

    return (
        <div className="bg-surface-alt min-h-screen flex items-center justify-center p-4">
            <div className="w-full max-w-md bg-surface border border-border p-10 rounded-3xl shadow-lifted relative z-10">
                <div className="flex flex-col items-center mb-8">
                    <div className="w-16 h-16 bg-primary rounded-2xl flex items-center justify-center mb-5 shadow-primary-glow">
                        <Icon name="hub" className="size-9 text-white" />
                    </div>
                    <h1 className="font-display text-[28px] font-normal text-foreground tracking-wide">
                        Sigma <span className="text-primary font-medium">Atendimento</span>
                    </h1>
                    <p className="text-muted-foreground mt-2 text-[15px] tracking-wide">Acesse sua conta para continuar</p>
                </div>

                {error && (
                    <div className="bg-danger-soft border border-danger/20 text-danger-fg p-3 rounded-xl mb-6 text-sm font-sans flex items-center gap-2">
                        <Icon name="error" className="size-5" />
                        {error}
                    </div>
                )}
                {notice && (
                    <div className="bg-primary/10 border border-primary/20 text-primary p-3 rounded-xl mb-6 text-sm font-sans flex items-center gap-2">
                        <Icon name="info" className="size-5" />
                        {notice}
                    </div>
                )}

                <form onSubmit={handleLogin} className="space-y-4">
                    <div className="space-y-1.5">
                        <label className="block text-sm font-medium text-foreground tracking-wide">E-mail</label>
                        <div className="relative">
                            <Icon name="mail" className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground size-[18px]" />
                            <input
                                type="email"
                                value={email}
                                onChange={e => setEmail(e.target.value)}
                                className="w-full pl-11 pr-4 py-3 bg-surface border border-border rounded-xl text-[15px] text-foreground tracking-wide focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none transition-all placeholder:text-muted-foreground/70"
                                placeholder="seu@email.com"
                                required
                            />
                        </div>
                    </div>

                    <div className="space-y-1.5">
                        <div className="flex justify-between items-center">
                            <label className="text-sm font-medium text-foreground tracking-wide">Senha</label>
                            <button
                                type="button"
                                onClick={() => showAccessNotice('Recuperação de senha ainda é feita pelo administrador do sistema. Solicite a redefinição para um usuário ADMIN.')}
                                className="text-xs font-medium text-primary hover:underline transition-all tracking-wide"
                            >
                                Esqueci minha senha
                            </button>
                        </div>
                        <div className="relative">
                            <Icon name="lock" className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground size-[18px]" />
                            <input
                                type={showPassword ? 'text' : 'password'}
                                value={password}
                                onChange={e => setPassword(e.target.value)}
                                className="w-full pl-11 pr-12 py-3 bg-surface border border-border rounded-xl text-[15px] text-foreground tracking-wide focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none transition-all placeholder:text-muted-foreground/70"
                                placeholder="••••••••"
                                required
                            />
                            <button
                                type="button"
                                onClick={() => setShowPassword((current) => !current)}
                                className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-primary transition-colors cursor-pointer"
                                title={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                            >
                                <Icon name="visibility" className="size-[18px]" />
                            </button>
                        </div>
                    </div>

                    <div className="flex items-center gap-2 pb-1">
                        <input
                            type="checkbox"
                            id="remember"
                            checked={remember}
                            onChange={(event) => setRemember(event.target.checked)}
                            className="w-4 h-4 rounded border-border text-primary focus:ring-primary/30 accent-primary"
                        />
                        <label htmlFor="remember" className="text-sm text-muted-foreground cursor-pointer tracking-wide">
                            Lembrar de mim
                        </label>
                    </div>

                    <button
                        type="submit"
                        className="w-full bg-primary hover:bg-primary-700 text-white font-medium text-[15px] tracking-wide py-3.5 rounded-xl shadow-primary-glow transition-colors mt-2 flex items-center justify-center gap-2 cursor-pointer active:scale-[0.98]"
                    >
                        Entrar
                        <Icon name="login" className="size-[18px]" />
                    </button>
                </form>

                <div className="mt-8 pt-6 border-t border-border text-center">
                    <p className="text-muted-foreground text-sm tracking-wide">
                        Não possui uma conta?{' '}
                        <button
                            type="button"
                            onClick={() => showAccessNotice('Solicite acesso a um administrador. O cadastro de novos usuários é feito em Usuários > Novo usuário.')}
                            className="text-primary font-medium hover:underline"
                        >
                            Solicite acesso
                        </button>
                    </p>
                </div>
            </div>

            <div className="fixed bottom-6 text-muted-foreground text-xs flex items-center gap-4">
                <span>© 2024 Sigma Sistemas</span>
                <span className="w-1 h-1 bg-border rounded-full"></span>
                <Link to="/politica-de-privacidade" className="hover:text-primary transition-colors">Privacidade</Link>
                <span className="w-1 h-1 bg-border rounded-full"></span>
                <Link to="/termos-de-servico" className="hover:text-primary transition-colors">Termos de Serviço</Link>
            </div>
        </div>
    );
}
