type ContactDisplayNameInput = {
    personName?: string | null;
    phone?: string | null;
    companyName?: string | null;
};

export function formatContactDisplayName({ personName, phone, companyName }: ContactDisplayNameInput) {
    const person = personName?.trim() || phone?.trim() || 'Contato';
    const company = companyName?.trim() || '';

    if (!company || person.toLocaleLowerCase('pt-BR') === company.toLocaleLowerCase('pt-BR')) return person;
    if (person.toLocaleLowerCase('pt-BR').endsWith(`| ${company}`.toLocaleLowerCase('pt-BR'))) return person;

    return `${person} | ${company}`;
}
