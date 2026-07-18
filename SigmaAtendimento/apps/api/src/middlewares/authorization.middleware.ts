import { Request, Response, NextFunction } from 'express';

export const Roles = {
    Admin: 'ADMIN',
    Supervisor: 'SUPERVISOR',
    Attendant: 'ATTENDANT',
    Technician: 'TECHNICIAN',
} as const;

export type Role = typeof Roles[keyof typeof Roles];

export function canViewAll(role?: string | null) {
    return role === Roles.Admin || role === Roles.Supervisor;
}

export function requireRoles(...allowedRoles: Role[]) {
    return (req: Request, res: Response, next: NextFunction) => {
        const role = req.user?.role as Role | undefined;

        if (!role || !allowedRoles.includes(role)) {
            return res.status(403).json({
                error: 'Você não tem permissão para executar esta ação.',
            });
        }

        return next();
    };
}

export const requireAdmin = requireRoles(Roles.Admin);
export const requireAdminOrSupervisor = requireRoles(Roles.Admin, Roles.Supervisor);
