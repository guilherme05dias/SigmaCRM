import { useState, useEffect } from 'react';
import type { Conversation } from './types';
import { EmptyState } from '../ui/EmptyState';
import { apiRequest } from '../../lib/api';

interface ContactSidebarProps {
    conversation: Conversation | null;
}

interface FullContact {
    id: string;
    name: string | null;
    phone: string;
    email: string | null;
    role: string | null;
    notes: string | null;
    customerId: string | null;
    customer: {
        id: string;
        name: string;
        segment: string | null;
        systems: string | null;
        city: string | null;
        notes: string | null;
    } | null;
}

function statusLabel(status: Conversation['status']) {
    if (status === 'OPEN') return 'Na fila';
    if (status === 'ASSIGNED') return 'Em atendimento';
    return 'Fechada';
}

function CollapseBtn({ onClick }: { onClick: () => void }) {
    return (
        <button onClick={onClick} title="Minimizar painel"
            className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
            <svg xmlns="http://www.w3.org/2000/svg" className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 18l6-6-6-6" />
            </svg>
        </button>
    );
}

export function ContactSidebar({ conversation }: ContactSidebarProps) {
    const [collapsed, setCollapsed] = useState(false);
    const [contact, setContact] = useState<FullContact | null>(null);
    const [editing, setEditing] = useState(false);
    const [saving, setSaving] = useState(false);

    // Form state
    const [form, setForm] = useState({
        name: '', email: '', role: '', notes: '',
        empresa: '', sistemas: '', cidade: '', segmento: '',
    });

    useEffect(() => {
        if (!conversation?.contactId) { setContact(null); return; }
        apiRequest<FullContact>(`/api/contacts/${conversation.contactId}`)
            .then(setContact)
            .catch(() => setContact(null));
    }, [conversation?.contactId]);

    useEffect(() => {
        if (!contact) return;
        setForm({
            name: contact.name ?? '',
            email: contact.email ?? '',
            role: contact.role ?? '',
            notes: contact.notes ?? '',
            empresa: contact.customer?.name ?? '',
            sistemas: contact.customer?.systems ?? '',
            cidade: contact.customer?.city ?? '',
            segmento: contact.customer?.segment ?? '',
        });
    }, [contact]);

    async function handleSave() {
        if (!contact) return;
        setSaving(true);
        try {
            // Atualiza o contato
            await apiRequest(`/api/contacts/${contact.id}`, {
                method: 'PATCH',
                body: JSON.stringify({
                    name: form.name || null,
                    email: form.email || null,
                    role: form.role || null,
                    notes: form.notes || null,
                }),
            });

            // Cria ou atualiza a empresa (customer)
            if (form.empresa.trim()) {
                if (contact.customerId) {
                    await apiRequest(`/api/customers/${contact.customerId}`, {
                        method: 'PATCH',
                        body: JSON.stringify({
                            name: form.empresa,
                            systems: form.sistemas || null,
                            city: form.cidade || null,
                            segment: form.segmento || null,
                        }),
                    });
                } else {
                    const newCustomer = await apiRequest<{ id: string }>('/api/customers', {
                        method: 'POST',
                        body: JSON.stringify({
                            name: form.empresa,
                            systems: form.sistemas || null,
                            city: form.cidade || null,
                            segment: form.segmento || null,
                        }),
                    });
                    await apiRequest(`/api/contacts/${contact.id}`, {
                        method: 'PATCH',
                        body: JSON.stringify({ customerId: newCustomer.id }),
                    });
                }
            }

            // Recarrega o contato
            const updated = await apiRequest<FullContact>(`/api/contacts/${contact.id}`);
            setContact(updated);
            setEditing(false);
        } catch (err) {
            console.error('Erro ao salvar:', err);
        } finally {
            setSaving(false);
        }
    }

    /* ── Barra colapsada ── */
    if (collapsed) {
        return (
            <aside className="hidden xl:flex flex-col items-center border-l border-border bg-surface py-3 w-10 shrink-0">
                <button onClick={() => setCollapsed(false)} title="Expandir painel"
                    className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
                    <svg xmlns="http://www.w3.org/2000/svg" className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M15 18l-6-6 6-6" />
                    </svg>
                </button>
            </aside>
        );
    }

    /* ── Sem conversa ── */
    if (!conversation) {
        return (
            <aside className="hidden w-72 shrink-0 border-l border-border bg-surface p-4 xl:flex xl:flex-col">
                <div className="flex justify-end mb-2"><CollapseBtn onClick={() => setCollapsed(true)} /></div>
                <EmptyState icon="forum" title="Nenhum contato selecionado" description="Selecione uma conversa para ver os dados do contato." />
            </aside>
        );
    }

    const contactName = contact?.name || conversation.contact?.name || (conversation.contact as any)?.nome || 'Contato';

    return (
        <aside className="hidden w-72 shrink-0 overflow-y-auto border-l border-border bg-surface xl:flex xl:flex-col">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Informações</span>
                <div className="flex items-center gap-1">
                    {!editing && (
                        <button onClick={() => setEditing(true)} title="Editar cadastro"
                            className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
                            <svg xmlns="http://www.w3.org/2000/svg" className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                            </svg>
                        </button>
                    )}
                    <CollapseBtn onClick={() => setCollapsed(true)} />
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-5">
                {/* Avatar + status da conversa */}
                <div className="flex flex-col items-center text-center pb-4 border-b border-border">
                    <div className="flex size-14 items-center justify-center rounded-full bg-primary/10 text-xl font-bold text-primary">
                        {contactName.charAt(0).toUpperCase()}
                    </div>
                    <p className="mt-3 font-semibold text-foreground text-sm">{contactName}</p>
                    <p className="text-xs text-muted-foreground">{conversation.contact?.phone}</p>
                    <span className={`mt-2 inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                        conversation.status === 'OPEN' ? 'bg-blue-500/10 text-blue-500' :
                        conversation.status === 'ASSIGNED' ? 'bg-green-500/10 text-green-500' :
                        'bg-muted text-muted-foreground'}`}>
                        {statusLabel(conversation.status)}
                    </span>
                </div>

                {editing ? (
                    /* ── Formulário de edição ── */
                    <div className="space-y-3">
                        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Contato</p>
                        {[
                            { label: 'Nome', key: 'name', placeholder: 'Nome do contato' },
                            { label: 'E-mail', key: 'email', placeholder: 'email@exemplo.com' },
                            { label: 'Cargo', key: 'role', placeholder: 'Ex: Gerente, Dono...' },
                        ].map(({ label, key, placeholder }) => (
                            <div key={key}>
                                <label className="text-[11px] text-muted-foreground">{label}</label>
                                <input
                                    className="mt-0.5 w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                                    placeholder={placeholder}
                                    value={(form as any)[key]}
                                    onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                                />
                            </div>
                        ))}

                        <p className="pt-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Empresa</p>
                        {[
                            { label: 'Nome da empresa', key: 'empresa', placeholder: 'Ex: Padaria Pão Quente' },
                            { label: 'Sistemas utilizados', key: 'sistemas', placeholder: 'Ex: SigmaPDV v2, SigmaEstoque' },
                            { label: 'Segmento', key: 'segmento', placeholder: 'Ex: Varejo, Restaurante...' },
                            { label: 'Cidade', key: 'cidade', placeholder: 'Ex: São Paulo - SP' },
                        ].map(({ label, key, placeholder }) => (
                            <div key={key}>
                                <label className="text-[11px] text-muted-foreground">{label}</label>
                                <input
                                    className="mt-0.5 w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                                    placeholder={placeholder}
                                    value={(form as any)[key]}
                                    onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                                />
                            </div>
                        ))}

                        <div className="flex gap-2 pt-1">
                            <button onClick={handleSave} disabled={saving}
                                className="flex-1 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-white hover:bg-primary/90 disabled:opacity-50 transition-colors">
                                {saving ? 'Salvando...' : 'Salvar'}
                            </button>
                            <button onClick={() => setEditing(false)} disabled={saving}
                                className="flex-1 rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted transition-colors">
                                Cancelar
                            </button>
                        </div>
                    </div>
                ) : (
                    /* ── Modo visualização ── */
                    <div className="space-y-4">
                        {/* Dados do contato */}
                        <Section title="Contato">
                            <Field label="E-mail" value={contact?.email} />
                            <Field label="Cargo" value={contact?.role} />
                        </Section>

                        {/* Empresa */}
                        <Section title="Empresa">
                            {contact?.customer ? (
                                <>
                                    <Field label="Nome" value={contact.customer.name} highlight />
                                    <Field label="Sistemas" value={contact.customer.systems} />
                                    <Field label="Segmento" value={contact.customer.segment} />
                                    <Field label="Cidade" value={contact.customer.city} />
                                </>
                            ) : (
                                <p className="text-xs text-muted-foreground italic">Não cadastrado — clique em editar para adicionar.</p>
                            )}
                        </Section>

                        {/* Atendimento */}
                        <Section title="Atendimento">
                            <Field label="Responsável" value={(conversation.assignedUser as any)?.name || conversation.assignedUser?.nome} />
                            <Field label="Departamento" value={conversation.department?.name} />
                            <Field label="Última mensagem" value={conversation.lastMessageAt ? new Date(conversation.lastMessageAt as any).toLocaleString('pt-BR') : undefined} />
                        </Section>
                    </div>
                )}
            </div>
        </aside>
    );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</p>
            <div className="space-y-2">{children}</div>
        </div>
    );
}

function Field({ label, value, highlight }: { label: string; value?: string | null; highlight?: boolean }) {
    return (
        <div>
            <p className="text-[11px] text-muted-foreground">{label}</p>
            <p className={`text-sm ${highlight ? 'font-semibold text-foreground' : 'text-foreground/80'}`}>
                {value || <span className="text-muted-foreground italic text-xs">—</span>}
            </p>
        </div>
    );
}
