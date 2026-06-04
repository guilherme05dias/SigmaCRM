import type { Role } from "./types";

export type Permission =
  | "route:dashboard"
  | "route:attendances"
  | "route:clients"
  | "route:technicians"
  | "route:users"
  | "route:whatsapp"
  | "route:summary"
  | "attendance:create"
  | "attendance:update"
  | "client:create"
  | "technician:create"
  | "user:manage";

const rolePermissions: Record<Role, Permission[]> = {
  gerente: [
    "route:dashboard",
    "route:attendances",
    "route:clients",
    "route:technicians",
    "route:users",
    "route:whatsapp",
    "route:summary",
    "attendance:create",
    "attendance:update",
    "client:create",
    "technician:create",
    "user:manage"
  ],
  atendente: [
    "route:dashboard",
    "route:attendances",
    "route:clients",
    "route:whatsapp",
    "route:summary",
    "attendance:create",
    "attendance:update",
    "client:create"
  ],
  tecnico: [
    "route:dashboard",
    "route:attendances",
    "route:summary",
    "attendance:update"
  ]
};

export function hasPermission(role: Role, permission: Permission) {
  return rolePermissions[role].includes(permission);
}

export function getRolePermissions(role: Role) {
  return rolePermissions[role];
}
