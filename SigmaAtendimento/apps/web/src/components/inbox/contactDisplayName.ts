type DisplayableContact = {
    name?: string | null;
    nome?: string | null;
    phone?: string | null;
    business?: { name?: string | null } | null;
    customer?: {
        name?: string | null;
        businesses?: Array<{ name?: string | null }>;
    } | null;
};

function clean(value?: string | null) {
    return value?.trim() || '';
}

export function contactDisplayName(contact?: DisplayableContact | null, explicitCompanyName?: string | null) {
    const personName = clean(contact?.name) || clean(contact?.nome) || clean(contact?.phone) || 'Contato';
    const linkedBusinesses = contact?.customer?.businesses ?? [];
    const companyName = clean(explicitCompanyName)
        || clean(contact?.business?.name)
        || (linkedBusinesses.length === 1 ? clean(linkedBusinesses[0]?.name) : '')
        || clean(contact?.customer?.name);

    if (!companyName || personName.toLocaleLowerCase('pt-BR') === companyName.toLocaleLowerCase('pt-BR')) {
        return personName;
    }

    const suffix = `| ${companyName}`.toLocaleLowerCase('pt-BR');
    if (personName.toLocaleLowerCase('pt-BR').endsWith(suffix)) return personName;

    return `${personName} | ${companyName}`;
}
