import type { Conversation } from './types';

interface ContactSidebarProps {
    conversation: Conversation | null;
}

function statusLabel(status: Conversation['status']) {
    if (status === 'OPEN') return 'Na fila';
    if (status === 'ASSIGNED') return 'Em atendimento';
    return 'Fechada';
}

export function ContactSidebar({ conversation }: ContactSidebarProps) {
    if (!conversation) {
        return (
            <aside className="hidden w-80 shrink-0 border-l border-border bg-surface p-5 xl:block">
                <p className="text-sm text-muted-foreground">Nenhum contato selecionado.</p>
            </aside>
        );
    }

    const contactName = conversation.contact?.name || (conversation.contact as any)?.nome || 'Contato';

    return (
        <aside className="hidden w-80 shrink-0 overflow-y-auto border-l border-border bg-surface p-5 xl:block">
            <div className="flex flex-col items-center border-b border-border pb-6 text-center">
                <div className="flex size-16 items-center justify-center rounded-full bg-primary/10 text-2xl font-bold text-primary">
                    {contactName.charAt(0).toUpperCase()}
                </div>
                <h2 className="mt-4 font-bold text-foreground">{contactName}</h2>
                <p className="mt-1 text-sm text-muted-foreground">{conversation.contact?.phone}</p>
            </div>

            <div className="space-y-4 py-6">
                <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Status</p>
                    <p className="mt-1 text-sm font-semibold text-foreground">{statusLabel(conversation.status)}</p>
                </div>
                <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Departamento</p>
                    <p className="mt-1 text-sm text-muted-foreground">{conversation.department?.name || '-'}</p>
                </div>
                <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Responsável</p>
                    <p className="mt-1 text-sm text-muted-foreground">{(conversation.assignedUser as any)?.name || conversation.assignedUser?.nome || '-'}</p>
                </div>
                <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Última mensagem</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                        {conversation.lastMessageAt ? new Date(conversation.lastMessageAt as any).toLocaleString() : '-'}
                    </p>
                </div>
            </div>
        </aside>
    );
}
