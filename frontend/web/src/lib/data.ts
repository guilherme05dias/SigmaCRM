import { pbkdf2Sync, randomBytes } from "node:crypto";
import { createSupabaseAdminClient, createSupabaseClient } from "./supabase";
import { getCurrentUser } from "./auth";
import {
  attendances as demoAttendances,
  clients as demoClients,
  technicians as demoTechnicians,
  users as demoUsers,
  whatsappConversations as demoWhatsappConversations
} from "./demo-data";
import type {
  Attendance,
  AttendanceCreateInput,
  AttendanceEditRecord,
  AttendanceLog,
  Client,
  ClientCreateInput,
  Technician,
  TechnicianCreateInput,
  UserAccount,
  UserAccountFormValues,
  WhatsappConversation,
  WhatsappMessage
} from "./types";

type AttendanceRow = {
  id: number;
  protocol: string;
  title: string;
  status: Attendance["status"];
  priority: Attendance["priority"];
  channel: string;
  service_type: string;
  opened_at: string;
  due_date: string | null;
  time_spent_hours: number | null;
  resolution: string | null;
  next_action: string | null;
  technicians: { name: string } | { name: string }[] | null;
  clients: { name: string; phone: string } | { name: string; phone: string }[] | null;
};

type AttendanceEditRow = {
  id: number;
  protocol: string;
  title: string;
  status: Attendance["status"];
  priority: Attendance["priority"];
  channel: string;
  service_type: string;
  due_date: string | null;
  next_action: string | null;
  resolution: string | null;
  time_spent_hours: number | null;
  client_id: number | null;
  technician_id: number | null;
};

type AttendanceDetailRow = AttendanceRow & {
  client_id: number | null;
  technician_id: number | null;
};

type WhatsappConversationRow = {
  id: number;
  contact_name: string;
  contact_number: string;
  status: WhatsappConversation["status"];
  last_message_at: string;
  message_count: number | null;
  linked_attendance_id?: number | null;
  attendances: { protocol: string } | { protocol: string }[] | null;
};

type WhatsappMessageRow = {
  id: number;
  conversation_id: number;
  contact_number: string;
  direction: WhatsappMessage["direction"];
  body: string;
  timestamp: string;
  wa_message_id: string | null;
};

type ClientRow = {
  id: number;
  name: string | null;
  company: string | null;
  phone: string | null;
  email: string | null;
  city: string | null;
  segment: string | null;
  status: Client["status"] | null;
};

type TechnicianRow = {
  id: number;
  name: string | null;
  specialty: string | null;
  phone: string | null;
  email: string | null;
  active: boolean | null;
};

type AttendanceLogRow = {
  id: number;
  attendance_id: number;
  action: "created" | "updated";
  field_name: string | null;
  message: string;
  actor_name: string;
  actor_role: string;
  previous_value: string | null;
  new_value: string | null;
  created_at: string;
};

type UserRow = {
  id: number;
  username: string | null;
  full_name: string | null;
  role: UserAccount["role"] | null;
  is_active: boolean | null;
};

function hasRows<T>(rows: T[] | null | undefined): rows is T[] {
  return Array.isArray(rows) && rows.length > 0;
}

function firstRelation<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function formatProtocolDatePart(date: Date): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0")
  ].join("");
}

function buildAttendanceProtocol(date: Date): string {
  const timePart = [
    String(date.getHours()).padStart(2, "0"),
    String(date.getMinutes()).padStart(2, "0"),
    String(date.getSeconds()).padStart(2, "0")
  ].join("");

  return `ATD${formatProtocolDatePart(date)}-${timePart}`;
}

function hashPassword(password: string) {
  const iterations = 120000;
  const salt = randomBytes(16);
  const hash = pbkdf2Sync(password, salt, iterations, 32, "sha256");
  return `pbkdf2_sha256$${iterations}$${salt.toString("hex")}$${hash.toString("hex")}`;
}

function getAttendanceWriteErrorMessage(
  error: { code?: string; message?: string; details?: string | null; hint?: string | null },
  operation: "INSERT" | "UPDATE"
) {
  const detailParts = [error.message, error.details, error.hint].filter(Boolean);
  const detail = detailParts.length > 0 ? ` Detalhes: ${detailParts.join(" ")}` : "";
  const actionLabel = operation === "INSERT" ? "gravar" : "atualizar";

  if (error.code === "42501" || /row-level security|permission denied|not allowed/i.test(error.message ?? "")) {
    return `Nao foi possivel ${actionLabel} o atendimento no Supabase. A role usada pela chave publica precisa de permissao de ${operation} na tabela attendances e a policy RLS precisa liberar a operacao.${detail}`;
  }

  return `Nao foi possivel ${actionLabel} o atendimento no Supabase.${detail}`;
}

function getAttendanceReadErrorMessage(error: { code?: string; message?: string; details?: string | null; hint?: string | null }) {
  const detailParts = [error.message, error.details, error.hint].filter(Boolean);
  const detail = detailParts.length > 0 ? ` Detalhes: ${detailParts.join(" ")}` : "";

  if (error.code === "42501" || /row-level security|permission denied|not allowed/i.test(error.message ?? "")) {
    return `Nao foi possivel carregar o atendimento no Supabase. A role usada pela chave publica precisa de permissao de SELECT na tabela attendances e a policy RLS precisa liberar a leitura.${detail}`;
  }

  return `Nao foi possivel carregar o atendimento no Supabase.${detail}`;
}

function getClientWriteErrorMessage(error: { code?: string; message?: string; details?: string | null; hint?: string | null }) {
  const detailParts = [error.message, error.details, error.hint].filter(Boolean);
  const detail = detailParts.length > 0 ? ` Detalhes: ${detailParts.join(" ")}` : "";

  if (error.code === "42501" || /row-level security|permission denied|not allowed/i.test(error.message ?? "")) {
    return `Nao foi possivel gravar o cliente no Supabase. A role usada pela chave publica precisa de permissao de INSERT na tabela clients e a policy RLS precisa liberar a operacao.${detail}`;
  }

  return `Nao foi possivel gravar o cliente no Supabase.${detail}`;
}

function getTechnicianWriteErrorMessage(error: { code?: string; message?: string; details?: string | null; hint?: string | null }) {
  const detailParts = [error.message, error.details, error.hint].filter(Boolean);
  const detail = detailParts.length > 0 ? ` Detalhes: ${detailParts.join(" ")}` : "";

  if (error.code === "42501" || /row-level security|permission denied|not allowed/i.test(error.message ?? "")) {
    return `Nao foi possivel gravar o tecnico no Supabase. A role usada pela chave publica precisa de permissao de INSERT na tabela technicians e a policy RLS precisa liberar a operacao.${detail}`;
  }

  return `Nao foi possivel gravar o tecnico no Supabase.${detail}`;
}

async function withTimeout<T>(promise: PromiseLike<T>, milliseconds = 3500): Promise<T | null> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<null>((resolve) => {
    timeoutId = setTimeout(() => resolve(null), milliseconds);
  });

  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

export async function getTechnicians(): Promise<Technician[]> {
  const supabase = createSupabaseClient();
  if (!supabase) return demoTechnicians;

  const response = await withTimeout(
    supabase
      .from("technicians")
      .select("id,name,specialty,phone,email,active")
      .order("name", { ascending: true })
  );

  if (!response) return demoTechnicians;
  const { data, error } = response;

  if (error || !hasRows(data)) return demoTechnicians;

  return data.map((row) => ({
    id: Number(row.id),
    name: row.name ?? "",
    specialty: row.specialty ?? "",
    phone: row.phone ?? "",
    email: row.email ?? "",
    active: Boolean(row.active)
  }));
}

function mapTechnician(row: TechnicianRow): Technician {
  return {
    id: Number(row.id),
    name: row.name ?? "",
    specialty: row.specialty ?? "",
    phone: row.phone ?? "",
    email: row.email ?? "",
    active: Boolean(row.active)
  };
}

export async function getTechnicianById(
  technicianId: number
): Promise<{ ok: true; technician: Technician } | { ok: false; message: string }> {
  const supabase = createSupabaseClient();

  if (!supabase) {
    const technician = demoTechnicians.find((item) => item.id === technicianId);
    return technician ? { ok: true, technician } : { ok: false, message: "Tecnico nao encontrado." };
  }

  const response = await withTimeout(
    supabase
      .from("technicians")
      .select("id,name,specialty,phone,email,active")
      .eq("id", technicianId)
      .maybeSingle()
  );

  if (!response) {
    return {
      ok: false,
      message: "A leitura do tecnico expirou ao falar com o Supabase. Tente novamente."
    };
  }

  if (response.error) {
    return {
      ok: false,
      message: `Nao foi possivel carregar o tecnico no Supabase. Detalhes: ${response.error.message}`
    };
  }

  if (!response.data) {
    return {
      ok: false,
      message: "Tecnico nao encontrado ou indisponivel para a role atual."
    };
  }

  return {
    ok: true,
    technician: mapTechnician(response.data as unknown as TechnicianRow)
  };
}

export async function getClients(): Promise<Client[]> {
  const supabase = createSupabaseClient();
  if (!supabase) return demoClients;

  const response = await withTimeout(
    supabase
      .from("clients")
      .select("id,name,company,phone,email,city,segment,status")
      .order("name", { ascending: true })
  );

  if (!response) return demoClients;
  const { data, error } = response;

  if (error || !hasRows(data)) return demoClients;

  return data.map((row) => ({
    id: Number(row.id),
    name: row.name ?? "",
    company: row.company ?? "",
    phone: row.phone ?? "",
    email: row.email ?? "",
    city: row.city ?? "",
    segment: row.segment ?? "",
    status: (row.status ?? "Ativo") as Client["status"]
  }));
}

function mapClient(row: ClientRow): Client {
  return {
    id: Number(row.id),
    name: row.name ?? "",
    company: row.company ?? "",
    phone: row.phone ?? "",
    email: row.email ?? "",
    city: row.city ?? "",
    segment: row.segment ?? "",
    status: (row.status ?? "Ativo") as Client["status"]
  };
}

function mapAttendanceRow(row: AttendanceRow): Attendance {
  const technician = firstRelation(row.technicians);
  const client = firstRelation(row.clients);

  return {
    id: Number(row.id),
    protocol: row.protocol,
    title: row.title,
    technician: technician?.name ?? "",
    client: client?.name ?? "",
    clientPhone: client?.phone ?? "",
    status: row.status,
    priority: row.priority,
    channel: row.channel,
    serviceType: row.service_type,
    openedAt: row.opened_at,
    dueDate: row.due_date ?? undefined,
    timeSpentHours: Number(row.time_spent_hours ?? 0),
    resolution: row.resolution ?? "",
    nextAction: row.next_action ?? ""
  };
}

export async function getClientById(
  clientId: number
): Promise<{ ok: true; client: Client } | { ok: false; message: string }> {
  const supabase = createSupabaseClient();

  if (!supabase) {
    const client = demoClients.find((item) => item.id === clientId);
    return client ? { ok: true, client } : { ok: false, message: "Cliente nao encontrado." };
  }

  const response = await withTimeout(
    supabase
      .from("clients")
      .select("id,name,company,phone,email,city,segment,status")
      .eq("id", clientId)
      .maybeSingle()
  );

  if (!response) {
    return {
      ok: false,
      message: "A leitura do cliente expirou ao falar com o Supabase. Tente novamente."
    };
  }

  if (response.error) {
    return {
      ok: false,
      message: `Nao foi possivel carregar o cliente no Supabase. Detalhes: ${response.error.message}`
    };
  }

  if (!response.data) {
    return {
      ok: false,
      message: "Cliente nao encontrado ou indisponivel para a role atual."
    };
  }

  return {
    ok: true,
    client: mapClient(response.data as unknown as ClientRow)
  };
}

export async function getAttendances(): Promise<Attendance[]> {
  const supabase = createSupabaseClient();
  if (!supabase) return demoAttendances;

  const response = await withTimeout(
    supabase
      .from("attendances")
      .select(`
        id,
        protocol,
        title,
        status,
        priority,
        channel,
        service_type,
        opened_at,
        due_date,
        time_spent_hours,
        resolution,
        next_action,
        technicians(name),
        clients(name, phone)
      `)
      .order("opened_at", { ascending: false })
  );

  if (!response) return demoAttendances;
  const { data, error } = response;

  if (error || !hasRows(data)) return demoAttendances;

  return (data as unknown as AttendanceRow[]).map(mapAttendanceRow);
}

export async function getAttendancesByClientId(clientId: number): Promise<Attendance[]> {
  const supabase = createSupabaseClient();

  if (!supabase) {
    const client = demoClients.find((item) => item.id === clientId);
    if (!client) return [];
    return demoAttendances.filter((item) => item.client === client.name);
  }

  const response = await withTimeout(
    supabase
      .from("attendances")
      .select(`
        id,
        protocol,
        title,
        status,
        priority,
        channel,
        service_type,
        opened_at,
        due_date,
        time_spent_hours,
        resolution,
        next_action,
        technicians(name),
        clients(name, phone)
      `)
      .eq("client_id", clientId)
      .order("opened_at", { ascending: false })
  );

  if (!response) return [];
  const { data, error } = response;

  if (error || !hasRows(data)) return [];

  return (data as unknown as AttendanceRow[]).map(mapAttendanceRow);
}

export async function getAttendanceById(
  attendanceId: number
): Promise<{ ok: true; attendance: Attendance & { clientId?: number; technicianId?: number } } | { ok: false; message: string }> {
  const supabase = createSupabaseClient();

  if (!supabase) {
    const attendance = demoAttendances.find((item) => item.id === attendanceId);

    if (!attendance) {
      return {
        ok: false,
        message: "Atendimento nao encontrado."
      };
    }

    const client = demoClients.find((item) => item.name === attendance.client);
    const technician = demoTechnicians.find((item) => item.name === attendance.technician);

    return {
      ok: true,
      attendance: {
        ...attendance,
        clientId: client?.id,
        technicianId: technician?.id
      }
    };
  }

  const response = await withTimeout(
    supabase
      .from("attendances")
      .select(`
        id,
        protocol,
        title,
        status,
        priority,
        channel,
        service_type,
        opened_at,
        due_date,
        time_spent_hours,
        resolution,
        next_action,
        client_id,
        technician_id,
        technicians(name),
        clients(name, phone)
      `)
      .eq("id", attendanceId)
      .maybeSingle()
  );

  if (!response) {
    return {
      ok: false,
      message: "A leitura do atendimento expirou ao falar com o Supabase. Tente novamente."
    };
  }

  if (response.error) {
    return {
      ok: false,
      message: getAttendanceReadErrorMessage(response.error)
    };
  }

  if (!response.data) {
    return {
      ok: false,
      message: "Atendimento nao encontrado ou indisponivel para a role atual."
    };
  }

  const row = response.data as unknown as AttendanceDetailRow;
  const technician = firstRelation(row.technicians);
  const client = firstRelation(row.clients);

  return {
    ok: true,
    attendance: {
      id: Number(row.id),
      protocol: row.protocol,
      title: row.title,
      technician: technician?.name ?? "",
      client: client?.name ?? "",
      clientPhone: client?.phone ?? "",
      status: row.status,
      priority: row.priority,
      channel: row.channel,
      serviceType: row.service_type,
      openedAt: row.opened_at,
      dueDate: row.due_date ?? undefined,
      timeSpentHours: Number(row.time_spent_hours ?? 0),
      resolution: row.resolution ?? "",
      nextAction: row.next_action ?? "",
      clientId: row.client_id ?? undefined,
      technicianId: row.technician_id ?? undefined
    }
  };
}

function buildAttendanceEditRecordFromDemo(attendanceId: number): AttendanceEditRecord | null {
  const attendance = demoAttendances.find((item) => item.id === attendanceId);
  if (!attendance) return null;

  const client = demoClients.find((item) => item.name === attendance.client);
  const technician = demoTechnicians.find((item) => item.name === attendance.technician);

  return {
    id: attendance.id,
    protocol: attendance.protocol,
    status: attendance.status,
    values: {
      title: attendance.title,
      clientId: client ? String(client.id) : "",
      technicianId: technician ? String(technician.id) : "",
      priority: attendance.priority,
      channel: attendance.channel,
      serviceType: attendance.serviceType,
      dueDate: attendance.dueDate ?? "",
      nextAction: attendance.nextAction,
      status: attendance.status,
      resolution: attendance.resolution,
      timeSpentHours: String(attendance.timeSpentHours)
    }
  };
}

export async function getAttendanceForEdit(
  attendanceId: number
): Promise<{ ok: true; record: AttendanceEditRecord } | { ok: false; message: string }> {
  const supabase = createSupabaseClient();
  if (!supabase) {
    const record = buildAttendanceEditRecordFromDemo(attendanceId);

    if (!record) {
      return {
        ok: false,
        message: "Atendimento nao encontrado."
      };
    }

    return { ok: true, record };
  }

  const response = await withTimeout(
    supabase
      .from("attendances")
      .select("id,protocol,title,status,priority,channel,service_type,due_date,next_action,resolution,time_spent_hours,client_id,technician_id")
      .eq("id", attendanceId)
      .maybeSingle()
  );

  if (!response) {
    return {
      ok: false,
      message: "A leitura do atendimento expirou ao falar com o Supabase. Tente novamente."
    };
  }

  if (response.error) {
    return {
      ok: false,
      message: getAttendanceReadErrorMessage(response.error)
    };
  }

  if (!response.data) {
    return {
      ok: false,
      message: "Atendimento nao encontrado ou indisponivel para a role atual."
    };
  }

  const row = response.data as unknown as AttendanceEditRow;

  return {
    ok: true,
    record: {
      id: Number(row.id),
      protocol: row.protocol,
      status: row.status,
      values: {
        title: row.title ?? "",
        clientId: row.client_id ? String(row.client_id) : "",
        technicianId: row.technician_id ? String(row.technician_id) : "",
        priority: row.priority,
        channel: row.channel ?? "",
        serviceType: row.service_type ?? "",
        dueDate: row.due_date ?? "",
        nextAction: row.next_action ?? "",
        status: row.status,
        resolution: row.resolution ?? "",
        timeSpentHours: String(row.time_spent_hours ?? 0)
      }
    }
  };
}

export async function getAttendanceLogs(attendanceId: number): Promise<AttendanceLog[]> {
  const supabase = createSupabaseClient();
  if (!supabase) return [];

  const response = await withTimeout(
    supabase
      .from("attendance_logs")
      .select("id,attendance_id,action,field_name,message,actor_name,actor_role,previous_value,new_value,created_at")
      .eq("attendance_id", attendanceId)
      .order("created_at", { ascending: false })
  );

  if (!response) return [];
  const { data, error } = response;

  if (error || !hasRows(data)) return [];

  return (data as unknown as AttendanceLogRow[]).map((row) => ({
    id: Number(row.id),
    attendanceId: Number(row.attendance_id),
    action: row.action,
    fieldName: row.field_name ?? undefined,
    message: row.message,
    actorName: row.actor_name ?? "Sistema",
    actorRole: row.actor_role ?? "sistema",
    previousValue: row.previous_value ?? undefined,
    newValue: row.new_value ?? undefined,
    createdAt: row.created_at
  }));
}

export async function createAttendance(input: AttendanceCreateInput): Promise<{ ok: true; id: number } | { ok: false; message: string }> {
  const actor = await getCurrentUser();
  const supabase = createSupabaseClient(actor);
  if (!supabase) {
    return {
      ok: false,
      message: "Supabase nao configurado. Defina NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY para gravar atendimentos."
    };
  }

  const openedAt = new Date();
  const timestamp = openedAt.toISOString();
  const response = await withTimeout(
    supabase
      .from("attendances")
      .insert({
        protocol: buildAttendanceProtocol(openedAt),
        title: input.title,
        status: "Novo",
        priority: input.priority,
        channel: input.channel,
        service_type: input.serviceType,
        opened_at: timestamp,
        due_date: input.dueDate?.trim() ? input.dueDate : null,
        time_spent_hours: 0,
        resolution: "",
        next_action: input.nextAction.trim(),
        client_id: input.clientId,
        technician_id: input.technicianId,
        created_at: timestamp,
        updated_at: timestamp
      })
      .select("id")
      .single()
  );

  if (!response) {
    return {
      ok: false,
      message: "A gravacao do atendimento expirou ao falar com o Supabase. Tente novamente."
    };
  }

  if (response.error) {
    return {
      ok: false,
      message: getAttendanceWriteErrorMessage(response.error, "INSERT")
    };
  }

  if (!response.data) {
    return {
      ok: false,
      message: "Atendimento gravado sem retorno de ID. Verifique permissao de SELECT na policy RLS."
    };
  }

  return { ok: true, id: Number(response.data.id) };
}

export async function updateAttendance(
  attendanceId: number,
  input: AttendanceCreateInput
): Promise<{ ok: true } | { ok: false; message: string }> {
  const actor = await getCurrentUser();
  const supabase = createSupabaseClient(actor);
  if (!supabase) {
    return {
      ok: false,
      message: "Supabase nao configurado. Defina NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY para editar atendimentos."
    };
  }

  const response = await withTimeout(
    supabase
      .from("attendances")
      .update({
        title: input.title,
        priority: input.priority,
        channel: input.channel,
        service_type: input.serviceType,
        due_date: input.dueDate?.trim() ? input.dueDate : null,
        next_action: input.nextAction.trim(),
        status: input.status ?? "Novo",
        resolution: input.resolution?.trim() ?? "",
        time_spent_hours: Number(input.timeSpentHours ?? 0),
        client_id: input.clientId,
        technician_id: input.technicianId,
        updated_at: new Date().toISOString()
      })
      .eq("id", attendanceId)
      .select("id")
      .maybeSingle()
  );

  if (!response) {
    return {
      ok: false,
      message: "A atualizacao do atendimento expirou ao falar com o Supabase. Tente novamente."
    };
  }

  if (response.error) {
    return {
      ok: false,
      message: getAttendanceWriteErrorMessage(response.error, "UPDATE")
    };
  }

  if (!response.data) {
    return {
      ok: false,
      message: "Nao foi possivel atualizar o atendimento. Confirme se o registro existe e se a policy RLS libera UPDATE e SELECT para a role atual."
    };
  }

  return { ok: true };
}

export async function updateAttendanceStatus(
  attendanceId: number,
  status: Attendance["status"]
): Promise<{ ok: true } | { ok: false; message: string }> {
  const actor = await getCurrentUser();
  const supabase = createSupabaseClient(actor);

  if (!supabase) {
    return {
      ok: false,
      message: "Supabase nao configurado. Defina NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY para atualizar atendimentos."
    };
  }

  const response = await withTimeout(
    supabase
      .from("attendances")
      .update({
        status,
        updated_at: new Date().toISOString()
      })
      .eq("id", attendanceId)
      .select("id")
      .maybeSingle()
  );

  if (!response) {
    return {
      ok: false,
      message: "A atualizacao do status expirou ao falar com o Supabase. Tente novamente."
    };
  }

  if (response.error) {
    return {
      ok: false,
      message: getAttendanceWriteErrorMessage(response.error, "UPDATE")
    };
  }

  if (!response.data) {
    return {
      ok: false,
      message: "Nao foi possivel atualizar o status. Confirme se o registro existe e se a policy RLS libera UPDATE e SELECT para a role atual."
    };
  }

  return { ok: true };
}

export async function createClientRecord(input: ClientCreateInput): Promise<{ ok: true } | { ok: false; message: string }> {
  const supabase = createSupabaseClient();
  if (!supabase) {
    return {
      ok: false,
      message: "Supabase nao configurado. Defina NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY para gravar clientes."
    };
  }

  const timestamp = new Date().toISOString();
  const response = await withTimeout(
    supabase.from("clients").insert({
      name: input.name,
      company: input.company,
      phone: input.phone,
      email: input.email,
      city: input.city,
      segment: input.segment,
      status: input.status,
      created_at: timestamp
    })
  );

  if (!response) {
    return {
      ok: false,
      message: "A gravacao do cliente expirou ao falar com o Supabase. Tente novamente."
    };
  }

  if (response.error) {
    return {
      ok: false,
      message: getClientWriteErrorMessage(response.error)
    };
  }

  return { ok: true };
}

export async function updateClientRecord(
  clientId: number,
  input: ClientCreateInput
): Promise<{ ok: true } | { ok: false; message: string }> {
  const supabase = createSupabaseAdminClient();
  if (!supabase) {
    return {
      ok: false,
      message: "SUPABASE_SERVICE_ROLE_KEY nao configurada no servidor. Nao foi possivel editar clientes."
    };
  }

  const response = await withTimeout(
    supabase
      .from("clients")
      .update({
        name: input.name,
        company: input.company,
        phone: input.phone,
        email: input.email,
        city: input.city,
        segment: input.segment,
        status: input.status,
        updated_at: new Date().toISOString()
      })
      .eq("id", clientId)
      .select("id")
      .maybeSingle()
  );

  if (!response) {
    return {
      ok: false,
      message: "A atualizacao do cliente expirou ao falar com o Supabase. Tente novamente."
    };
  }

  if (response.error) {
    return {
      ok: false,
      message: getClientWriteErrorMessage(response.error)
    };
  }

  if (!response.data) {
    return {
      ok: false,
      message: "Nao foi possivel atualizar o cliente. Confirme se o registro existe e se a policy RLS libera UPDATE e SELECT."
    };
  }

  return { ok: true };
}

export async function createTechnicianRecord(input: TechnicianCreateInput): Promise<{ ok: true } | { ok: false; message: string }> {
  const supabase = createSupabaseClient();
  if (!supabase) {
    return {
      ok: false,
      message: "Supabase nao configurado. Defina NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY para gravar tecnicos."
    };
  }

  const timestamp = new Date().toISOString();
  const response = await withTimeout(
    supabase.from("technicians").insert({
      name: input.name,
      specialty: input.specialty,
      phone: input.phone,
      email: input.email,
      active: input.active,
      created_at: timestamp
    })
  );

  if (!response) {
    return {
      ok: false,
      message: "A gravacao do tecnico expirou ao falar com o Supabase. Tente novamente."
    };
  }

  if (response.error) {
    return {
      ok: false,
      message: getTechnicianWriteErrorMessage(response.error)
    };
  }

  return { ok: true };
}

export async function updateTechnicianRecord(
  technicianId: number,
  input: TechnicianCreateInput
): Promise<{ ok: true } | { ok: false; message: string }> {
  const supabase = createSupabaseAdminClient();
  if (!supabase) {
    return {
      ok: false,
      message: "SUPABASE_SERVICE_ROLE_KEY nao configurada no servidor. Nao foi possivel editar tecnicos."
    };
  }

  const response = await withTimeout(
    supabase
      .from("technicians")
      .update({
        name: input.name,
        specialty: input.specialty,
        phone: input.phone,
        email: input.email,
        active: input.active,
        updated_at: new Date().toISOString()
      })
      .eq("id", technicianId)
      .select("id")
      .maybeSingle()
  );

  if (!response) {
    return {
      ok: false,
      message: "A atualizacao do tecnico expirou ao falar com o Supabase. Tente novamente."
    };
  }

  if (response.error) {
    return {
      ok: false,
      message: getTechnicianWriteErrorMessage(response.error)
    };
  }

  if (!response.data) {
    return {
      ok: false,
      message: "Nao foi possivel atualizar o tecnico. Confirme se o registro existe."
    };
  }

  return { ok: true };
}

export async function getUsers(): Promise<UserAccount[]> {
  const supabase = createSupabaseClient();
  if (!supabase) return demoUsers;

  const response = await withTimeout(
    supabase
      .from("users")
      .select("id,username,full_name,role,is_active")
      .order("username", { ascending: true })
  );

  if (!response) return demoUsers;
  const { data, error } = response;

  if (error || !hasRows(data)) return demoUsers;

  return (data as unknown as UserRow[]).map((row) => ({
    id: Number(row.id),
    username: row.username ?? "",
    fullName: row.full_name ?? "",
    role: row.role as UserAccount["role"],
    isActive: Boolean(row.is_active)
  }));
}

export async function getUserById(
  userId: number
): Promise<{ ok: true; user: UserAccount } | { ok: false; message: string }> {
  const supabase = createSupabaseClient();

  if (!supabase) {
    const user = demoUsers.find((item) => item.id === userId);
    return user ? { ok: true, user } : { ok: false, message: "Usuario nao encontrado." };
  }

  const response = await withTimeout(
    supabase
      .from("users")
      .select("id,username,full_name,role,is_active")
      .eq("id", userId)
      .maybeSingle()
  );

  if (!response) {
    return {
      ok: false,
      message: "A leitura do usuario expirou ao falar com o Supabase. Tente novamente."
    };
  }

  if (response.error) {
    return {
      ok: false,
      message: `Nao foi possivel carregar o usuario no Supabase. Detalhes: ${response.error.message}`
    };
  }

  if (!response.data) {
    return {
      ok: false,
      message: "Usuario nao encontrado ou indisponivel para a role atual."
    };
  }

  const row = response.data as unknown as UserRow;

  return {
    ok: true,
    user: {
      id: Number(row.id),
      username: row.username ?? "",
      fullName: row.full_name ?? "",
      role: row.role ?? "atendente",
      isActive: Boolean(row.is_active)
    }
  };
}

export async function createUserRecord(
  input: UserAccountFormValues
): Promise<{ ok: true } | { ok: false; message: string }> {
  const supabase = createSupabaseAdminClient();
  if (!supabase) {
    return {
      ok: false,
      message: "SUPABASE_SERVICE_ROLE_KEY nao configurada no servidor. Nao foi possivel criar usuarios."
    };
  }

  const response = await withTimeout(
    supabase.from("users").insert({
      username: input.username,
      full_name: input.fullName,
      role: input.role,
      password_hash: hashPassword(input.password),
      is_active: input.isActive === "true",
      created_at: new Date().toISOString()
    })
  );

  if (!response) {
    return {
      ok: false,
      message: "A criacao do usuario expirou ao falar com o Supabase. Tente novamente."
    };
  }

  if (response.error) {
    return {
      ok: false,
      message: `Nao foi possivel criar o usuario. Detalhes: ${response.error.message}`
    };
  }

  return { ok: true };
}

export async function updateUserRecord(
  userId: number,
  input: UserAccountFormValues
): Promise<{ ok: true } | { ok: false; message: string }> {
  const supabase = createSupabaseAdminClient();
  if (!supabase) {
    return {
      ok: false,
      message: "SUPABASE_SERVICE_ROLE_KEY nao configurada no servidor. Nao foi possivel editar usuarios."
    };
  }

  const updatePayload: Record<string, string | boolean> = {
    username: input.username,
    full_name: input.fullName,
    role: input.role,
    is_active: input.isActive === "true"
  };

  if (input.password.trim()) {
    updatePayload.password_hash = hashPassword(input.password);
  }

  const response = await withTimeout(
    supabase
      .from("users")
      .update(updatePayload)
      .eq("id", userId)
      .select("id")
      .maybeSingle()
  );

  if (!response) {
    return {
      ok: false,
      message: "A atualizacao do usuario expirou ao falar com o Supabase. Tente novamente."
    };
  }

  if (response.error) {
    return {
      ok: false,
      message: `Nao foi possivel editar o usuario. Detalhes: ${response.error.message}`
    };
  }

  if (!response.data) {
    return {
      ok: false,
      message: "Usuario nao encontrado para edicao."
    };
  }

  return { ok: true };
}

export async function getWhatsappConversations(): Promise<WhatsappConversation[]> {
  const supabase = createSupabaseClient();
  if (!supabase) return demoWhatsappConversations;

  const response = await withTimeout(
    supabase
      .from("whatsapp_conversations")
      .select("id,contact_name,contact_number,status,last_message_at,message_count,linked_attendance_id,attendances(protocol)")
      .order("last_message_at", { ascending: false })
  );

  if (!response) return demoWhatsappConversations;
  const { data, error } = response;

  if (error || !hasRows(data)) return demoWhatsappConversations;

  return (data as unknown as WhatsappConversationRow[]).map((row) => {
    const attendance = firstRelation(row.attendances);

    return {
      id: Number(row.id),
      contactName: row.contact_name ?? "",
      contactNumber: row.contact_number ?? "",
      status: row.status,
      lastMessageAt: row.last_message_at ?? "",
      messageCount: Number(row.message_count ?? 0),
      linkedProtocol: attendance?.protocol ?? undefined,
      linkedAttendanceId: row.linked_attendance_id ?? undefined
    };
  });
}

export async function getWhatsappConversationById(
  conversationId: number
): Promise<{ ok: true; conversation: WhatsappConversation } | { ok: false; message: string }> {
  const supabase = createSupabaseClient();

  if (!supabase) {
    const conversation = demoWhatsappConversations.find((item) => item.id === conversationId);
    return conversation ? { ok: true, conversation } : { ok: false, message: "Conversa nao encontrada." };
  }

  const response = await withTimeout(
    supabase
      .from("whatsapp_conversations")
      .select("id,contact_name,contact_number,status,last_message_at,message_count,linked_attendance_id,attendances(protocol)")
      .eq("id", conversationId)
      .maybeSingle()
  );

  if (!response) {
    return {
      ok: false,
      message: "A leitura da conversa expirou ao falar com o Supabase. Tente novamente."
    };
  }

  if (response.error) {
    return {
      ok: false,
      message: `Nao foi possivel carregar a conversa no Supabase. Detalhes: ${response.error.message}`
    };
  }

  if (!response.data) {
    return {
      ok: false,
      message: "Conversa nao encontrada ou indisponivel para a role atual."
    };
  }

  const row = response.data as unknown as WhatsappConversationRow;
  const attendance = firstRelation(row.attendances);

  return {
    ok: true,
    conversation: {
      id: Number(row.id),
      contactName: row.contact_name ?? "",
      contactNumber: row.contact_number ?? "",
      status: row.status,
      lastMessageAt: row.last_message_at ?? "",
      messageCount: Number(row.message_count ?? 0),
      linkedProtocol: attendance?.protocol ?? undefined,
      linkedAttendanceId: row.linked_attendance_id ?? undefined
    }
  };
}

export async function getWhatsappConversationForAttendance(attendanceId: number): Promise<WhatsappConversation | null> {
  const supabase = createSupabaseClient();
  if (!supabase) return null;

  const response = await withTimeout(
    supabase
      .from("whatsapp_conversations")
      .select("id,contact_name,contact_number,status,last_message_at,message_count,linked_attendance_id,attendances(protocol)")
      .eq("linked_attendance_id", attendanceId)
      .maybeSingle()
  );

  if (!response || response.error || !response.data) return null;

  const row = response.data as unknown as WhatsappConversationRow;
  const attendance = firstRelation(row.attendances);

  return {
    id: Number(row.id),
    contactName: row.contact_name ?? "",
    contactNumber: row.contact_number ?? "",
    status: row.status,
    lastMessageAt: row.last_message_at ?? "",
    messageCount: Number(row.message_count ?? 0),
    linkedProtocol: attendance?.protocol ?? undefined,
    linkedAttendanceId: row.linked_attendance_id ?? undefined
  };
}

export async function linkWhatsappConversationToAttendance(
  conversationId: number,
  attendanceId: number | null
): Promise<{ ok: true } | { ok: false; message: string }> {
  const supabase = createSupabaseAdminClient();

  if (!supabase) {
    return {
      ok: false,
      message: "SUPABASE_SERVICE_ROLE_KEY nao configurada no servidor. Nao foi possivel vincular a conversa."
    };
  }

  const response = await withTimeout(
    supabase
      .from("whatsapp_conversations")
      .update({
        linked_attendance_id: attendanceId,
        updated_at: new Date().toISOString()
      })
      .eq("id", conversationId)
      .select("id")
      .maybeSingle()
  );

  if (!response) {
    return {
      ok: false,
      message: "O vinculo da conversa expirou ao falar com o Supabase. Tente novamente."
    };
  }

  if (response.error) {
    return {
      ok: false,
      message: `Nao foi possivel vincular a conversa. Detalhes: ${response.error.message}`
    };
  }

  if (!response.data) {
    return {
      ok: false,
      message: "Conversa nao encontrada para vinculo."
    };
  }

  return { ok: true };
}

export async function getWhatsappMessages(conversationId: number): Promise<WhatsappMessage[]> {
  const supabase = createSupabaseAdminClient();
  if (!supabase) return [];

  const response = await withTimeout(
    supabase
      .from("whatsapp_messages")
      .select("id,conversation_id,contact_number,direction,body,timestamp,wa_message_id")
      .eq("conversation_id", conversationId)
      .order("timestamp", { ascending: true })
  );

  if (!response) return [];
  const { data, error } = response;

  if (error || !hasRows(data)) return [];

  return (data as unknown as WhatsappMessageRow[]).map((row) => ({
    id: Number(row.id),
    conversationId: Number(row.conversation_id),
    contactNumber: row.contact_number ?? "",
    direction: row.direction,
    body: row.body ?? "",
    timestamp: row.timestamp ?? "",
    waMessageId: row.wa_message_id ?? undefined
  }));
}
