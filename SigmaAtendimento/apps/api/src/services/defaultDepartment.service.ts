import { prisma } from '../lib/prisma';

export const DEFAULT_SUPPORT_DEPARTMENT_NAME = 'Suporte Técnico';

export function isDefaultSupportDepartmentName(name?: string | null) {
    return String(name || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim()
        .toLocaleLowerCase('pt-BR') === 'suporte tecnico';
}

/**
 * Resolve the company default. The name fallback keeps ingestion safe while a
 * deployment is between the application release and the database migration.
 */
export async function getDefaultDepartmentId(companyId: string) {
    const company = await prisma.company.findUnique({
        where: { id: companyId },
        select: { defaultDepartmentId: true },
    });

    if (company?.defaultDepartmentId) return company.defaultDepartmentId;

    const departments = await prisma.department.findMany({
        where: { companyId, active: true },
        select: { id: true, name: true },
        orderBy: { createdAt: 'asc' },
    });

    return departments.find((department) => isDefaultSupportDepartmentName(department.name))?.id ?? null;
}
