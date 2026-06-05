import { Request } from 'express';

/**
 * Helpers de multi-tenant (ADR-02).
 * O companyId vem do JWT (ver auth.middleware + auth.routes). Toda query de negócio
 * deve ser escopada por empresa.
 */

export function getCompanyId(req: Request): string {
  const companyId = req.user?.companyId;
  if (!companyId) {
    const err: any = new Error('Empresa não identificada no token');
    err.status = 401;
    throw err;
  }
  return companyId;
}

/** Atalho para usar dentro de `where`: { ...companyScope(req) } */
export function companyScope(req: Request): { companyId: string } {
  return { companyId: getCompanyId(req) };
}
