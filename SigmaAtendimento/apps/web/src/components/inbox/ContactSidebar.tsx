import { useState, useEffect, useMemo } from 'react';
import type { Conversation } from './types';
import { EmptyState } from '../ui/EmptyState';
import { apiRequest } from '../../lib/api';
import { ContactAvatar } from './ContactAvatar';
import { contactDisplayName } from './contactDisplayName';

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
    avatarUrl?: string | null;
    isWhatsAppGroup: boolean;
    welcomeMessageEnabled: boolean;
    includeInServiceReports: boolean;
    customerId: string | null;
    businessId: string | null;
    business: {
        id: string;
        name: string;
        cnpj: string;
    } | null;
    customer: {
        id: string;
        name: string;
        segment: string | null;
        systems: string | null;
        city: string | null;
        notes: string | null;
        businesses: Array<{
            id: string;
            name: string;
            cnpj: string;
        }>;
    } | null;
}

interface ServiceTopicOption {
    id: string;
    name: string;
    active: boolean;
}

const systemNameKey = (value: string) => value.trim().toLocaleLowerCase('pt-BR');

function parseSystemNames(value: string) {
    const names = value
        .split(/[,;\n]/)
        .map((name) => name.trim())
        .filter(Boolean);

    return names.filter((name, index) => (
        names.findIndex((candidate) => systemNameKey(candidate) === systemNameKey(name)) === index
    ));
}

function serializeSystemNames(names: string[]) {
    return names.join(', ');
}

function formatCnpj(value: string) {
    const digits = value.replace(/\D/g, '').slice(0, 14);
    return digits
        .replace(/^(\d{2})(\d)/, '$1.$2')
        .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
        .replace(/\.(\d{3})(\d)/, '.$1/$2')
        .replace(/(\d{4})(\d)/, '$1-$2');
}

function statusLabel(status: Conversation['status']) {
    if (status === 'OPEN') return 'Na fila';
    if (status === 'ASSIGNED') return 'Em atendimento';
    return 'Fechada';
}

function CollapseBtn({ onClick }: { onClick: () => void }) {
    return (
        <button
            onClick={onClick}
            title="Minimizar informações do contato"
            aria-label="Minimizar informações do contato"
            className="inline-flex h-8 items-center gap-1.5 rounded-full border border-border bg-muted/35 px-2.5 text-[11px] font-semibold text-muted-foreground transition-colors hover:border-primary/40 hover:bg-primary/10 hover:text-foreground"
        >
            <span>Minimizar</span>
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
    const [serviceTopics, setServiceTopics] = useState<ServiceTopicOption[]>([]);
    const [loadingServiceTopics, setLoadingServiceTopics] = useState(false);
    const [serviceTopicsLoaded, setServiceTopicsLoaded] = useState(false);
    const [serviceTopicsError, setServiceTopicsError] = useState<string | null>(null);
    const [addingBusiness, setAddingBusiness] = useState(false);
    const [saveError, setSaveError] = useState<string | null>(null);

    // Form state
    const [form, setForm] = useState({
        name: '', email: '', role: '', notes: '',
        empresa: '', sistemas: '', cidade: '', segmento: '',
        businessId: '', newBusinessName: '', newBusinessCnpj: '',
        welcomeMessageEnabled: true,
        includeInServiceReports: true,
    });

    useEffect(() => {
        if (!conversation?.contactId) { setContact(null); return; }
        apiRequest<FullContact>(`/api/contacts/${conversation.contactId}`)
            .then(setContact)
            .catch(() => setContact(null));
    }, [conversation?.contactId]);

    useEffect(() => {
        if (!editing || serviceTopicsLoaded || loadingServiceTopics) return;

        setLoadingServiceTopics(true);
        setServiceTopicsError(null);
        apiRequest<ServiceTopicOption[]>('/api/service-topics')
            .then((topics) => setServiceTopics(topics.filter((topic) => topic.active)))
            .catch((error) => {
                const message = error instanceof Error ? error.message : 'Não foi possível carregar os sistemas/produtos.';
                setServiceTopicsError(message);
            })
            .finally(() => {
                setLoadingServiceTopics(false);
                setServiceTopicsLoaded(true);
            });
    }, [editing, loadingServiceTopics, serviceTopicsLoaded]);

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
            businessId: contact.businessId ?? '',
            newBusinessName: '',
            newBusinessCnpj: '',
            welcomeMessageEnabled: contact.welcomeMessageEnabled,
            includeInServiceReports: contact.includeInServiceReports,
        });
        setAddingBusiness(false);
        setSaveError(null);
    }, [contact]);

    const selectedSystemNames = useMemo(() => parseSystemNames(form.sistemas), [form.sistemas]);
    const serviceTopicKeys = useMemo(
        () => new Set(serviceTopics.map((topic) => systemNameKey(topic.name))),
        [serviceTopics],
    );
    const legacySystemNames = useMemo(
        () => selectedSystemNames.filter((name) => !serviceTopicKeys.has(systemNameKey(name))),
        [selectedSystemNames, serviceTopicKeys],
    );

    function toggleSystem(systemName: string, checked: boolean) {
        setForm((current) => {
            const currentNames = parseSystemNames(current.sistemas);
            const targetKey = systemNameKey(systemName);
            const withoutTarget = currentNames.filter((name) => systemNameKey(name) !== targetKey);
            return {
                ...current,
                sistemas: serializeSystemNames(checked ? [...withoutTarget, systemName] : withoutTarget),
            };
        });
    }

    async function handleSave() {
        if (!contact) return;
        setSaving(true);
        setSaveError(null);
        try {
            let resolvedCustomerId = contact.customerId;

            // Cria ou atualiza o cliente que agrupa suas empresas/CNPJs.
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
                    resolvedCustomerId = newCustomer.id;
                }
            }

            let resolvedBusinessId = form.businessId || null;
            if (addingBusiness) {
                if (!resolvedCustomerId) {
                    throw new Error('Informe o nome do cliente antes de cadastrar o CNPJ.');
                }
                if (!form.newBusinessName.trim() || form.newBusinessCnpj.replace(/\D/g, '').length !== 14) {
                    throw new Error('Informe o nome da empresa e um CNPJ com 14 d\u00edgitos.');
                }

                const newBusiness = await apiRequest<{ id: string }>(`/api/customers/${resolvedCustomerId}/businesses`, {
                    method: 'POST',
                    body: JSON.stringify({
                        name: form.newBusinessName.trim(),
                        cnpj: form.newBusinessCnpj.replace(/\D/g, ''),
                    }),
                });
                resolvedBusinessId = newBusiness.id;
            }

            // Salva os dados do contato e o tenant escolhido na mesma atualizacao.
            await apiRequest(`/api/contacts/${contact.id}`, {
                method: 'PATCH',
                body: JSON.stringify({
                    name: form.name || null,
                    email: form.email || null,
                    role: form.role || null,
                    notes: form.notes || null,
                    customerId: resolvedCustomerId,
                    businessId: resolvedBusinessId,
                    welcomeMessageEnabled: form.welcomeMessageEnabled,
                    includeInServiceReports: form.includeInServiceReports,
                }),
            });

            // Recarrega o contato
            const updated = await apiRequest<FullContact>(`/api/contacts/${contact.id}`);
            setContact(updated);
            setEditing(false);
        } catch (err) {
            console.error('Erro ao salvar:', err);
            setSaveError(err instanceof Error ? err.message : 'N\u00e3o foi poss\u00edvel salvar o contato.');
        } finally {
            setSaving(false);
        }
    }

    /* ── Barra colapsada ── */
    const contactName = contactDisplayName(contact || conversation?.contact);
    const contactPhone = conversation?.contact?.phone;

    if (collapsed) {
        return (
            <aside className="hidden w-14 shrink-0 flex-col items-center gap-3 border-l border-border bg-surface py-3 xl:flex">
                <button
                    onClick={() => setCollapsed(false)}
                    title="Expandir informações do contato"
                    aria-label="Expandir informações do contato"
                    className="flex size-9 items-center justify-center rounded-full border border-border bg-muted/35 text-muted-foreground transition-colors hover:border-primary/40 hover:bg-primary/10 hover:text-foreground"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M15 18l-6-6 6-6" />
                    </svg>
                </button>
                {conversation && (
                    <div
                        title={`${contactName}${contactPhone ? ` • ${contactPhone}` : ''}`}
                        className="flex size-9 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary"
                    >
                        <ContactAvatar
                            contactId={conversation.contactId}
                            avatarUrl={contact?.avatarUrl || conversation.contact?.avatarUrl}
                            name={contactName}
                            className="size-9 rounded-full text-sm"
                        />
                    </div>
                )}
                <span className="[writing-mode:vertical-rl] rotate-180 text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                    Contato
                </span>
            </aside>
        );
    }

    /* ── Sem conversa ── */
    if (!conversation) {
        return (
            <aside className="hidden w-72 shrink-0 border-l border-border bg-surface p-4 xl:flex xl:flex-col">
                <div className="mb-2 flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Informações</span>
                    <CollapseBtn onClick={() => setCollapsed(true)} />
                </div>
                <EmptyState icon="forum" title="Nenhum contato selecionado" description="Selecione uma conversa para ver os dados do contato." />
            </aside>
        );
    }

    return (
        <aside className="hidden w-72 shrink-0 overflow-y-auto border-l border-border bg-surface xl:flex xl:flex-col">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Informações</span>
                <div className="flex items-center gap-1">
                    {!editing && (
                        <button type="button" onClick={() => setEditing(true)} title="Editar cadastro"
                            className="flex size-11 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
                            <span className="sr-only">Editar cadastro</span>
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
                    <ContactAvatar
                        contactId={conversation.contactId}
                        avatarUrl={contact?.avatarUrl || conversation.contact?.avatarUrl}
                        name={contactName}
                        className="size-14 rounded-full text-xl"
                    />
                    <p className="mt-3 font-semibold text-foreground text-sm">{contactName}</p>
                    <p className="text-xs text-muted-foreground">{contactPhone}</p>
                    <span className={`mt-2 inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                        conversation.status === 'OPEN' ? 'bg-primary/10 text-primary' :
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
                                <label htmlFor={`contact-${key}`} className="text-xs font-medium text-muted-foreground">{label}</label>
                                <input
                                    id={`contact-${key}`}
                                    className="mt-0.5 w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                                    placeholder={placeholder}
                                    value={(form as any)[key]}
                                    onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                                />
                            </div>
                        ))}

                        <p className="pt-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Automacao e relatorios</p>
                        <PreferenceToggle
                            label="Mensagem de boas-vindas"
                            description={contact?.isWhatsAppGroup ? 'Desativada automaticamente para grupos.' : 'Enviar a saudacao automatica durante o horario de atendimento.'}
                            checked={!contact?.isWhatsAppGroup && form.welcomeMessageEnabled}
                            disabled={contact?.isWhatsAppGroup === true}
                            onChange={(checked) => setForm((current) => ({ ...current, welcomeMessageEnabled: checked }))}
                        />
                        <PreferenceToggle
                            label="Incluir nos relatorios"
                            description="Contabilizar conversas, mensagens, chamados e avaliacoes deste contato."
                            checked={form.includeInServiceReports}
                            onChange={(checked) => setForm((current) => ({ ...current, includeInServiceReports: checked }))}
                        />

                        <p className="pt-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Empresa</p>
                        {[
                            { label: 'Nome da empresa', key: 'empresa', placeholder: 'Ex: Padaria Pão Quente' },
                            { label: 'Segmento', key: 'segmento', placeholder: 'Ex: Varejo, Restaurante...' },
                            { label: 'Cidade', key: 'cidade', placeholder: 'Ex: São Paulo - SP' },
                        ].map(({ label, key, placeholder }) => (
                            <div key={key}>
                                <label htmlFor={`company-${key}`} className="text-xs font-medium text-muted-foreground">{label}</label>
                                <input
                                    id={`company-${key}`}
                                    className="mt-0.5 w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                                    placeholder={placeholder}
                                    value={(form as any)[key]}
                                    onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                                />
                            </div>
                        ))}

                        <div>
                            <label htmlFor="contact-business" className="text-xs font-medium text-muted-foreground">
                                Empresa/CNPJ vinculado
                            </label>
                            <select
                                id="contact-business"
                                value={addingBusiness ? '__new__' : form.businessId}
                                onChange={(event) => {
                                    if (event.target.value === '__new__') {
                                        setAddingBusiness(true);
                                        setForm((current) => ({
                                            ...current,
                                            newBusinessName: current.newBusinessName || current.empresa,
                                        }));
                                        return;
                                    }
                                    setAddingBusiness(false);
                                    setForm((current) => ({ ...current, businessId: event.target.value }));
                                }}
                                className="mt-0.5 min-h-10 w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                            >
                                <option value="">Sem CNPJ vinculado</option>
                                {(contact?.customer?.businesses ?? []).map((business) => (
                                    <option key={business.id} value={business.id}>
                                        {business.name} - {formatCnpj(business.cnpj)}
                                    </option>
                                ))}
                                <option value="__new__">+ Cadastrar nova empresa/CNPJ</option>
                            </select>
                            <p className="mt-1 text-[11px] leading-4 text-muted-foreground">
                                O CNPJ identifica o tenant do cliente nos sistemas oferecidos.
                            </p>
                        </div>

                        {addingBusiness && (
                            <div className="space-y-2 rounded-lg bg-surface-alt p-3">
                                <div>
                                    <label htmlFor="new-business-name" className="text-xs font-medium text-muted-foreground">
                                        Nome da empresa
                                    </label>
                                    <input
                                        id="new-business-name"
                                        value={form.newBusinessName}
                                        onChange={(event) => setForm((current) => ({ ...current, newBusinessName: event.target.value }))}
                                        placeholder="Ex: Filial Centro"
                                        className="mt-0.5 w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                                    />
                                </div>
                                <div>
                                    <label htmlFor="new-business-cnpj" className="text-xs font-medium text-muted-foreground">
                                        CNPJ (tenant)
                                    </label>
                                    <input
                                        id="new-business-cnpj"
                                        inputMode="numeric"
                                        value={form.newBusinessCnpj}
                                        onChange={(event) => setForm((current) => ({ ...current, newBusinessCnpj: formatCnpj(event.target.value) }))}
                                        placeholder="00.000.000/0000-00"
                                        className="mt-0.5 w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                                    />
                                </div>
                            </div>
                        )}

                        <div>
                            <p id="contact-systems-label" className="text-xs font-medium text-muted-foreground">
                                Sistemas/produtos utilizados
                            </p>
                            <div
                                role="group"
                                aria-labelledby="contact-systems-label"
                                className="mt-1 max-h-48 space-y-1 overflow-y-auto rounded-lg border border-border bg-background p-2"
                            >
                                {loadingServiceTopics && (
                                    <p className="px-1 py-2 text-xs text-muted-foreground">Carregando opções...</p>
                                )}
                                {!loadingServiceTopics && serviceTopicsError && (
                                    <div className="rounded-md bg-danger-soft px-2 py-2 text-xs text-danger-fg">
                                        <p>{serviceTopicsError}</p>
                                        <button
                                            type="button"
                                            onClick={() => setServiceTopicsLoaded(false)}
                                            className="mt-1 min-h-8 font-semibold underline underline-offset-2"
                                        >
                                            Tentar novamente
                                        </button>
                                    </div>
                                )}
                                {!loadingServiceTopics && !serviceTopicsError && serviceTopics.length === 0 && legacySystemNames.length === 0 && (
                                    <p className="px-1 py-2 text-xs text-muted-foreground">
                                        Nenhum sistema/produto ativo foi cadastrado.
                                    </p>
                                )}
                                {serviceTopics.map((topic) => {
                                    const checked = selectedSystemNames.some((name) => systemNameKey(name) === systemNameKey(topic.name));
                                    return (
                                        <label
                                            key={topic.id}
                                            className="flex min-h-10 cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm text-foreground transition-colors hover:bg-muted"
                                        >
                                            <input
                                                type="checkbox"
                                                checked={checked}
                                                onChange={(event) => toggleSystem(topic.name, event.target.checked)}
                                                className="size-4 shrink-0 accent-primary"
                                            />
                                            <span className="min-w-0 break-words">{topic.name}</span>
                                        </label>
                                    );
                                })}
                                {legacySystemNames.map((systemName) => (
                                    <label
                                        key={`legacy-${systemNameKey(systemName)}`}
                                        className="flex min-h-10 cursor-pointer items-start gap-2 rounded-md px-2 py-1.5 text-sm text-foreground transition-colors hover:bg-muted"
                                    >
                                        <input
                                            type="checkbox"
                                            checked
                                            onChange={(event) => toggleSystem(systemName, event.target.checked)}
                                            className="mt-0.5 size-4 shrink-0 accent-primary"
                                        />
                                        <span className="min-w-0">
                                            <span className="block break-words">{systemName}</span>
                                            <span className="block text-[11px] text-muted-foreground">Vínculo anterior</span>
                                        </span>
                                    </label>
                                ))}
                            </div>
                            <p className="mt-1 text-[11px] text-muted-foreground">
                                {selectedSystemNames.length > 0
                                    ? `${selectedSystemNames.length} selecionado${selectedSystemNames.length === 1 ? '' : 's'}`
                                    : 'Selecione um ou mais itens cadastrados.'}
                            </p>
                        </div>

                        {saveError && (
                            <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-xs text-danger-fg">
                                {saveError}
                            </p>
                        )}

                        <div className="flex gap-2 pt-1">
                            <button type="button" onClick={handleSave} disabled={saving}
                                className="flex min-h-11 flex-1 items-center justify-center rounded-lg bg-primary-solid px-3 py-2 text-sm font-semibold text-primary-solid-fg transition-colors hover:bg-primary-solid-hover disabled:opacity-50">
                                {saving ? 'Salvando...' : 'Salvar'}
                            </button>
                            <button type="button" onClick={() => setEditing(false)} disabled={saving}
                                className="min-h-11 flex-1 rounded-lg border border-border px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted">
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
                                    <Field label="Cliente" value={contact.customer.name} />
                                    <Field label="Empresa vinculada" value={contact.business?.name} highlight />
                                    <Field label="CNPJ / tenant" value={contact.business ? formatCnpj(contact.business.cnpj) : null} />
                                    {!contact.business && (
                                        <p className="rounded-md bg-warning-soft px-2.5 py-2 text-xs text-warning-fg">
                                            CNPJ ainda n&atilde;o vinculado. Clique em editar para selecionar o tenant.
                                        </p>
                                    )}
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

                        <Section title="Automacao e relatorios">
                            <PreferenceStatus
                                label="Boas-vindas"
                                enabled={!contact?.isWhatsAppGroup && contact?.welcomeMessageEnabled !== false}
                                disabledLabel={contact?.isWhatsAppGroup ? 'Desativada para grupo' : 'Desativada'}
                            />
                            <PreferenceStatus
                                label="Relatorios"
                                enabled={contact?.includeInServiceReports !== false}
                                disabledLabel="Nao contabilizar"
                            />
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

function PreferenceToggle({
    label,
    description,
    checked,
    disabled = false,
    onChange,
}: {
    label: string;
    description: string;
    checked: boolean;
    disabled?: boolean;
    onChange: (checked: boolean) => void;
}) {
    return (
        <label className={`flex items-start justify-between gap-3 rounded-lg bg-surface-alt p-3 ${disabled ? 'opacity-70' : 'cursor-pointer'}`}>
            <span className="min-w-0">
                <span className="block text-xs font-semibold text-foreground">{label}</span>
                <span className="mt-0.5 block text-[11px] leading-4 text-muted-foreground">{description}</span>
            </span>
            <input
                type="checkbox"
                className="mt-0.5 size-4 shrink-0 accent-primary-solid"
                checked={checked}
                disabled={disabled}
                onChange={(event) => onChange(event.target.checked)}
            />
        </label>
    );
}

function PreferenceStatus({ label, enabled, disabledLabel }: { label: string; enabled: boolean; disabledLabel: string }) {
    return (
        <div className="flex items-center justify-between gap-3">
            <span className="text-[11px] text-muted-foreground">{label}</span>
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${enabled ? 'bg-success-soft text-success-fg' : 'bg-surface-alt text-muted-foreground'}`}>
                {enabled ? 'Ativo' : disabledLabel}
            </span>
        </div>
    );
}
