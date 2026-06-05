import { z } from "zod";

export const RoleEnum = z.enum(["ADMIN", "SUPERVISOR", "AGENT"]);
export type Role = z.infer<typeof RoleEnum>;

// User
export const UserSchema = z.object({
    id: z.string().uuid(),
    company_id: z.string().uuid().optional(),
    nome: z.string().min(2),
    email: z.string().email(),
    password: z.string().min(6).optional(), // Usado na criação
    role: RoleEnum,
    department_id: z.string().uuid().nullable().optional(),
    ativo: z.boolean(),
    created_at: z.date().optional(),
    updated_at: z.date().optional(),
});
export type User = z.infer<typeof UserSchema>;

export const CreateUserSchema = UserSchema.omit({ id: true, created_at: true, updated_at: true, company_id: true });
export type CreateUserDTO = z.infer<typeof CreateUserSchema>;

// Department
export const DepartmentSchema = z.object({
    id: z.string().uuid(),
    company_id: z.string().uuid().optional(),
    nome: z.string().min(2),
    descricao: z.string().optional().nullable(),
    ativo: z.boolean(),
    created_at: z.date().optional(),
    updated_at: z.date().optional(),
});
export type Department = z.infer<typeof DepartmentSchema>;

export const CreateDepartmentSchema = DepartmentSchema.omit({ id: true, created_at: true, updated_at: true, company_id: true });
export type CreateDepartmentDTO = z.infer<typeof CreateDepartmentSchema>;

// Login Auth
export const LoginSchema = z.object({
    email: z.string().email(),
    password: z.string().min(6),
});
export type LoginDTO = z.infer<typeof LoginSchema>;

// Socket.io Shared Types
export interface ConversationSummary {
    id: string;
    contact: { id: string; nome: string; phone: string };
    lastMessageAt: Date | string | null;
    status: string;
    assignedUser?: { id: string; nome: string; email?: string } | null;
    department?: { id: string; nome: string } | null;
    messages?: Array<{ id: string; body: string; createdAt: Date | string }>;
}

export interface MessageDTO {
    id: string;
    conversationId: string;
    direction: 'INBOUND' | 'OUTBOUND' | 'SYSTEM';
    type: 'TEXT' | 'IMAGE' | 'AUDIO' | 'DOCUMENT';
    body: string;
    mediaUrl?: string | null;
    createdAt: Date | string;
    status: string;
}
