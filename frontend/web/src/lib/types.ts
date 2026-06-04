export type Role = "gerente" | "atendente" | "tecnico";

export type Technician = {
  id: number;
  name: string;
  specialty: string;
  phone: string;
  email: string;
  active: boolean;
};

export type TechnicianCreateInput = {
  name: string;
  specialty: string;
  phone: string;
  email: string;
  active: boolean;
};

export type TechnicianCreateFormValues = {
  name: string;
  specialty: string;
  phone: string;
  email: string;
  active: "true" | "false";
};

export type TechnicianCreateFormState = {
  error: string | null;
  fieldErrors?: Partial<Record<keyof TechnicianCreateFormValues, string>>;
  values: TechnicianCreateFormValues;
};

export type Client = {
  id: number;
  name: string;
  company: string;
  phone: string;
  email: string;
  city: string;
  segment: string;
  status: "Ativo" | "Em negociação" | "Inativo";
};

export type Attendance = {
  id: number;
  protocol: string;
  title: string;
  technician: string;
  client: string;
  clientPhone: string;
  status: "Novo" | "Em andamento" | "Aguardando cliente" | "Aguardando retorno" | "Concluído" | "Cancelado";
  priority: "Baixa" | "Média" | "Alta" | "Crítica";
  channel: string;
  serviceType: string;
  openedAt: string;
  dueDate?: string;
  timeSpentHours: number;
  resolution: string;
  nextAction: string;
};

export type AttendanceCreateInput = {
  title: string;
  clientId: number;
  technicianId: number;
  priority: Attendance["priority"];
  channel: string;
  serviceType: string;
  dueDate?: string;
  nextAction: string;
  status?: Attendance["status"];
  resolution?: string;
  timeSpentHours?: number;
};

export type AttendanceCreateFormValues = {
  title: string;
  clientId: string;
  technicianId: string;
  priority: Attendance["priority"];
  channel: string;
  serviceType: string;
  dueDate: string;
  nextAction: string;
  status: Attendance["status"];
  resolution: string;
  timeSpentHours: string;
};

export type AttendanceCreateFormState = {
  error: string | null;
  fieldErrors?: Partial<Record<keyof AttendanceCreateFormValues, string>>;
  values: AttendanceCreateFormValues;
};

export type AttendanceFormMode = "create" | "edit";

export type AttendanceEditRecord = {
  id: number;
  protocol: string;
  status: Attendance["status"];
  values: AttendanceCreateFormValues;
};

export type AttendanceLog = {
  id: number;
  attendanceId: number;
  action: "created" | "updated";
  fieldName?: string;
  message: string;
  actorName: string;
  actorRole: string;
  previousValue?: string;
  newValue?: string;
  createdAt: string;
};

export type ClientCreateInput = {
  name: string;
  company: string;
  phone: string;
  email: string;
  city: string;
  segment: string;
  status: Client["status"];
};

export type ClientCreateFormValues = {
  name: string;
  company: string;
  phone: string;
  email: string;
  city: string;
  segment: string;
  status: Client["status"];
};

export type ClientCreateFormState = {
  error: string | null;
  fieldErrors?: Partial<Record<keyof ClientCreateFormValues, string>>;
  values: ClientCreateFormValues;
};

export type UserAccount = {
  id: number;
  username: string;
  fullName: string;
  role: Role;
  isActive: boolean;
};

export type UserAccountFormValues = {
  username: string;
  fullName: string;
  role: Role;
  password: string;
  isActive: "true" | "false";
};

export type UserAccountFormState = {
  error: string | null;
  fieldErrors?: Partial<Record<keyof UserAccountFormValues, string>>;
  values: UserAccountFormValues;
};

export type AuthSession = {
  id: number;
  username: string;
  fullName: string;
  role: Role;
};

export type WhatsappConversation = {
  id: number;
  contactName: string;
  contactNumber: string;
  status: "aberto" | "em_andamento" | "resolvido";
  lastMessageAt: string;
  messageCount: number;
  linkedProtocol?: string;
  linkedAttendanceId?: number;
};

export type WhatsappMessage = {
  id: number;
  conversationId: number;
  contactNumber: string;
  direction: "in" | "out";
  body: string;
  timestamp: string;
  waMessageId?: string;
};
