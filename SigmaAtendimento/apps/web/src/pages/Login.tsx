import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { LoginSchema } from '@sigma/shared';
import { Icon } from '../components/ui/Icon';

export default function Login() {
    const navigate = useNavigate();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            LoginSchema.parse({ email, password });

            const res = await fetch('http://localhost:3334/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password })
            });

            if (!res.ok) {
                let errMsg = 'Credenciais inválidas';
                try {
                    const errorData = await res.json();
                    if (errorData.error) errMsg = errorData.error;
                } catch(e) {}
                throw new Error(errMsg);
            }

            const data = await res.json();
            localStorage.setItem('sigma-token', data.token);
            navigate('/');
        } catch (err: any) {
            setError(err.message || 'Erro ao fazer login');
        }
    };

    return (
        <div className="bg-background min-h-screen flex items-center justify-center p-4">
            <div className="w-full max-w-md bg-surface border border-border p-8 rounded-2xl shadow-lifted relative z-10">
                <div className="flex flex-col items-center mb-8">
                    <div className="w-20 h-20 bg-primary rounded-2xl flex items-center justify-center mb-4 shadow-primary-glow">
                        <Icon name="hub" className="size-12 text-white" />
                    </div>
                    <h1 className="font-display text-3xl font-bold text-foreground tracking-tight">
                        Sigma <span className="text-primary">Atendimento</span>
                    </h1>
                    <p className="text-muted-foreground mt-2 text-sm">Acesse sua conta para continuar</p>
                </div>

                {error && (
                    <div className="bg-danger-soft border border-danger/20 text-danger-fg p-3 rounded-xl mb-6 text-sm font-sans flex items-center gap-2">
                        <Icon name="error" className="size-5" />
                        {error}
                    </div>
                )}

                <form onSubmit={handleLogin} className="space-y-5">
                    <div className="space-y-2">
                        <label className="block text-sm font-medium text-foreground ml-1">E-mail</label>
                        <div className="relative">
                            <Icon name="mail" className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground size-5" />
                            <input
                                type="email"
                                value={email}
                                onChange={e => setEmail(e.target.value)}
                                className="w-full pl-12 pr-4 py-3.5 bg-surface border border-border rounded-xl text-foreground focus:ring-2 focus:ring-primary/40 focus:border-primary outline-none transition-all placeholder:text-muted-foreground"
                                placeholder="seu@email.com"
                                required
                            />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <div className="flex justify-between items-center px-1">
                            <label className="text-sm font-medium text-foreground">Senha</label>
                            <a href="#" className="text-xs font-semibold text-primary hover:underline transition-all">
                                Esqueci minha senha
                            </a>
                        </div>
                        <div className="relative">
                            <Icon name="lock" className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground size-5" />
                            <input
                                type="password"
                                value={password}
                                onChange={e => setPassword(e.target.value)}
                                className="w-full pl-12 pr-12 py-3.5 bg-surface border border-border rounded-xl text-foreground focus:ring-2 focus:ring-primary/40 focus:border-primary outline-none transition-all placeholder:text-muted-foreground"
                                placeholder="••••••••"
                                required
                            />
                            <button type="button" className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-primary transition-colors cursor-pointer">
                                <Icon name="visibility" className="size-5" />
                            </button>
                        </div>
                    </div>

                    <div className="flex items-center space-x-2 px-1 pb-2">
                        <input
                            type="checkbox"
                            id="remember"
                            className="w-4 h-4 rounded border-border text-primary focus:ring-primary/40"
                        />
                        <label htmlFor="remember" className="text-sm text-muted-foreground cursor-pointer">
                            Lembrar de mim
                        </label>
                    </div>

                    <button
                        type="submit"
                        className="w-full bg-primary hover:bg-primary-700 text-white font-bold py-4 rounded-pill shadow-primary-glow transition-all active:scale-[0.98] mt-4 flex items-center justify-center gap-2 cursor-pointer"
                    >
                        <span>Entrar</span>
                        <Icon name="login" className="size-5" />
                    </button>
                </form>

                <div className="mt-8 pt-6 border-t border-border text-center">
                    <p className="text-muted-foreground text-sm">
                        Não possui uma conta?{' '}
                        <a href="#" className="text-primary font-bold hover:underline">
                            Solicite acesso
                        </a>
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
