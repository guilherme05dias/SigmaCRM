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
        <div className="flex min-h-dvh flex-col bg-surface-alt p-4">
            <div className="relative z-10 my-auto w-full max-w-md self-center rounded-2xl border border-border bg-surface p-6 shadow-card sm:p-10">
                <div className="flex flex-col items-center mb-8">
                    <div className="mb-5 flex size-16 items-center justify-center rounded-2xl border-2 border-primary-solid bg-transparent text-primary shadow-none">
                        <Icon name="hub" className="size-9 text-primary" />
                    </div>
                    <h1 className="font-display text-[28px] font-normal text-foreground tracking-wide">
                        Sigma <span className="text-primary font-medium">Atendimento</span>
                    </h1>
                    <p className="text-muted-foreground mt-2 text-[15px] tracking-wide">Acesse sua conta para continuar</p>
                </div>

                {error && (
                    <div role="alert" className="bg-danger-soft border border-danger/20 text-danger-fg p-3 rounded-xl mb-6 text-sm font-sans flex items-center gap-2">
                        <Icon name="error" className="size-5" />
                        {error}
                    </div>
                )}
                {notice && (
                    <div role="status" className="bg-primary/10 border border-primary/20 text-primary p-3 rounded-xl mb-6 text-sm font-sans flex items-center gap-2">
                        <Icon name="info" className="size-5" />
                        {notice}
                    </div>
                )}

                <form onSubmit={handleLogin} className="space-y-4">
                    <div className="space-y-1.5">
                        <label htmlFor="login-email" className="block text-sm font-medium text-foreground tracking-wide">E-mail</label>
                        <div className="relative">
                            <Icon name="mail" className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground size-[18px]" />
                            <input
                                id="login-email"
                                type="email"
                                value={email}
                                onChange={e => setEmail(e.target.value)}
                                className="w-full rounded-xl border border-border bg-surface py-3 pl-11 pr-4 text-[15px] tracking-wide text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/30"
                                placeholder="seu@email.com"
                                required
                            />
                        </div>
                    </div>

                    <div className="space-y-1.5">
                        <div className="flex justify-between items-center">
                            <label htmlFor="login-password" className="text-sm font-medium text-foreground tracking-wide">Senha</label>
                            <button
                                type="button"
                                onClick={() => showAccessNotice('Recuperação de senha ainda é feita pelo administrador do sistema. Solicite a redefinição para um usuário ADMIN.')}
                                className="inline-flex min-h-11 items-center text-sm font-medium text-primary transition-colors hover:underline tracking-wide"
                            >
                                Esqueci minha senha
                            </button>
                        </div>
                        <div className="relative">
                            <Icon name="lock" className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground size-[18px]" />
                            <input
                                id="login-password"
                                type={showPassword ? 'text' : 'password'}
                                value={password}
                                onChange={e => setPassword(e.target.value)}
                                className="w-full rounded-xl border border-border bg-surface py-3 pl-11 pr-12 text-[15px] tracking-wide text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/30"
                                placeholder="••••••••"
                                required
                            />
                            <button
                                type="button"
                                onClick={() => setShowPassword((current) => !current)}
                                className="absolute right-1 top-1/2 flex size-11 -translate-y-1/2 cursor-pointer items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-surface-alt hover:text-primary"
                                title={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                                aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
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
                        className="mt-2 flex min-h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-primary-solid px-5 py-3 font-medium text-primary-solid-fg shadow-none transition-colors hover:bg-primary-solid-hover active:scale-[0.98]"
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
                            className="inline-flex min-h-11 items-center font-medium text-primary hover:underline"
                        >
                            Solicite acesso
                        </button>
                    </p>
                </div>
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-center text-xs text-muted-foreground sm:gap-x-4">
                <span>© 2024 Sigma Sistemas</span>
                <span className="size-1 rounded-full bg-border" aria-hidden="true" />
                <Link to="/politica-de-privacidade" className="inline-flex min-h-11 items-center transition-colors hover:text-primary">Privacidade</Link>
                <span className="size-1 rounded-full bg-border" aria-hidden="true" />
                <Link to="/termos-de-servico" className="inline-flex min-h-11 items-center transition-colors hover:text-primary">Termos de Serviço</Link>
            </div>
        </div>
    );
}
