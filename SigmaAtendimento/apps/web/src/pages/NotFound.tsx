import { Link } from 'react-router-dom';
import { EmptyState } from '../components/ui/EmptyState';

export default function NotFound() {
    return (
        <main className="flex min-h-screen items-center justify-center bg-background p-6 text-foreground">
            <div className="w-full max-w-xl">
                <EmptyState
                    icon="info"
                    title="Página não encontrada"
                    description="O endereço informado não existe no Sigma Atendimento."
                />
                <div className="mt-6 text-center">
                    <Link to="/" className="text-sm font-semibold text-primary hover:text-primary-700">
                        Voltar para o Dashboard
                    </Link>
                </div>
            </div>
        </main>
    );
}
