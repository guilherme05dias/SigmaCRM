import { z } from "zod";

export const RoleEnum = z.enum(["ADMIN", "SUPERVISOR", "ATTENDANT", "TECHNICIAN"]);
export type Role = z.infer<typeof RoleEnum>;

// User
export const UserSchema = z.object({
    id: z.string().uuid(),
    company_id: z.string().uuid().optional(),
    nome: z.string().min(2),
    email: z.string().email(),
    password: z.string().min(6).optional(), // Usado na criação
    role: RoleEnum,
    messageSignature: z.string().optional().nullable(),
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

// Service topics / systems
export const ServiceTopicSchema = z.object({
    id: z.string().uuid(),
    companyId: z.string().uuid(),
    name: z.string().min(2),
    description: z.string().optional().nullable(),
    active: z.boolean(),
    createdAt: z.date().optional(),
    updatedAt: z.date().optional(),
});
export type ServiceTopic = z.infer<typeof ServiceTopicSchema>;

export const CreateServiceTopicSchema = ServiceTopicSchema.omit({ id: true, createdAt: true, updatedAt: true, companyId: true });
export type CreateServiceTopicDTO = z.infer<typeof CreateServiceTopicSchema>;

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

// Reports
export type ReportType = 'all' | 'attendance' | 'ticket';
export type ReportOrigin = 'WHATSAPP' | 'MANUAL';

export interface ReportFilters {
    from: string;
    to: string;
    type: ReportType;
    departmentId?: string;
    responsibleUserId?: string;
    attendanceStatus?: 'OPEN' | 'ASSIGNED' | 'CLOSED';
    ticketStatus?: string;
    origin?: ReportOrigin;
}

export interface AverageMetric {
    value: number | null;
    sampleSize: number;
}

export interface ReportBreakdown {
    id: string | null;
    label: string;
    count: number;
}

export interface AttendanceReportSummary {
    initiated: number;
    closed: number;
    currentlyOpen: number;
    remotelyResolved: number;
    convertedToTicket: number;
    conversionRate: number;
    messagesInbound: number;
    messagesOutbound: number;
    averageWaitSeconds: AverageMetric;
    averageHandleSeconds: AverageMetric;
    csat: AverageMetric;
    byAttendant: ReportBreakdown[];
    byDepartment: ReportBreakdown[];
    byTopic: ReportBreakdown[];
    csatByAttendant: Array<ReportBreakdown & { average: number }>;
}

export interface TicketReportSummary {
    created: number;
    scheduled: number;
    inProgress: number;
    completed: number;
    canceled: number;
    whatsappOrigin: number;
    manualOrigin: number;
    averageExecutionSeconds: AverageMetric;
    withoutTechnician: number;
    withoutSchedule: number;
    byTechnician: ReportBreakdown[];
    byStatus: ReportBreakdown[];
    byDepartment: ReportBreakdown[];
}

export interface ReportsSummaryResponse {
    filters: ReportFilters;
    range: { startInclusive: string; endExclusive: string; timezone: 'America/Sao_Paulo' };
    attendance: AttendanceReportSummary;
    tickets: TicketReportSummary;
    technicians: TechnicianReportSummary[];
}

export interface TechnicianReportSummary {
    userId: string;
    userName: string;
    attendanceCount: number;
    ticketCount: number;
    totalCount: number;
}

export interface AttendanceReportRow {
    id: string;
    contactName: string;
    companyName: string | null;
    attendantName: string | null;
    departmentName: string | null;
    topicName: string | null;
    systemProduct: string | null;
    observation: string | null;
    status: string;
    createdAt: string;
    closedAt: string | null;
    durationSeconds: number | null;
    rating: number | null;
}

export interface TicketReportRow {
    id: string;
    protocol: string | null;
    customerName: string;
    origin: ReportOrigin;
    technicianName: string | null;
    departmentName: string | null;
    systemProduct: string | null;
    observation: string | null;
    scheduledAt: string | null;
    reportDate: string;
    status: string;
    durationSeconds: number | null;
}

export interface CursorPage<T> {
    records: T[];
    nextCursor: string | null;
}
