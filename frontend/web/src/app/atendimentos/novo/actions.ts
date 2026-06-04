"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requirePermission } from "@/lib/auth";
import { createAttendance, updateAttendance } from "@/lib/data";
import type { AttendanceCreateFormState, AttendanceCreateFormValues } from "@/lib/types";

const attendanceSchema = z.object({
  title: z.string().trim().min(3, "Informe um titulo com pelo menos 3 caracteres."),
  clientId: z.coerce.number().int().positive("Selecione um cliente."),
  technicianId: z.coerce.number().int().positive("Selecione um tecnico."),
  priority: z.enum(["Baixa", "Média", "Alta", "Crítica"]),
  channel: z.string().trim().min(1, "Informe o canal de entrada."),
  serviceType: z.string().trim().min(1, "Informe o tipo de atendimento."),
  dueDate: z.string().trim().optional(),
  nextAction: z.string().trim().min(3, "Descreva a proxima acao."),
  status: z.enum(["Novo", "Em andamento", "Aguardando cliente", "Aguardando retorno", "Concluído", "Cancelado"]),
  resolution: z.string().trim(),
  timeSpentHours: z.coerce.number().min(0, "Informe horas validas.")
});

function readValues(formData: FormData): AttendanceCreateFormValues {
  return {
    title: String(formData.get("title") ?? ""),
    clientId: String(formData.get("clientId") ?? ""),
    technicianId: String(formData.get("technicianId") ?? ""),
    priority: (String(formData.get("priority") ?? "Média") as AttendanceCreateFormValues["priority"]),
    channel: String(formData.get("channel") ?? "WhatsApp"),
    serviceType: String(formData.get("serviceType") ?? "Remoto"),
    dueDate: String(formData.get("dueDate") ?? ""),
    nextAction: String(formData.get("nextAction") ?? ""),
    status: String(formData.get("status") ?? "Novo") as AttendanceCreateFormValues["status"],
    resolution: String(formData.get("resolution") ?? ""),
    timeSpentHours: String(formData.get("timeSpentHours") ?? "0")
  };
}

export async function createAttendanceAction(
  _previousState: AttendanceCreateFormState,
  formData: FormData
): Promise<AttendanceCreateFormState> {
  await requirePermission("attendance:create");
  return submitAttendanceForm(readValues(formData), async (values) => createAttendance(values));
}

export async function updateAttendanceAction(
  attendanceId: number,
  _previousState: AttendanceCreateFormState,
  formData: FormData
): Promise<AttendanceCreateFormState> {
  await requirePermission("attendance:update");
  return submitAttendanceForm(readValues(formData), async (values) => updateAttendance(attendanceId, values));
}

async function submitAttendanceForm(
  values: AttendanceCreateFormValues,
  submit: (values: z.infer<typeof attendanceSchema> & { dueDate?: string }) => Promise<{ ok: true } | { ok: false; message: string }>
): Promise<AttendanceCreateFormState> {
  const parsed = attendanceSchema.safeParse(values);

  if (!parsed.success) {
    const flattened = parsed.error.flatten().fieldErrors;

    return {
      error: "Revise os campos destacados e tente novamente.",
      fieldErrors: {
        title: flattened.title?.[0],
        clientId: flattened.clientId?.[0],
        technicianId: flattened.technicianId?.[0],
        priority: flattened.priority?.[0],
        channel: flattened.channel?.[0],
        serviceType: flattened.serviceType?.[0],
        dueDate: flattened.dueDate?.[0],
        nextAction: flattened.nextAction?.[0],
        status: flattened.status?.[0],
        resolution: flattened.resolution?.[0],
        timeSpentHours: flattened.timeSpentHours?.[0]
      },
      values
    };
  }

  const result = await submit({
    ...parsed.data,
    dueDate: parsed.data.dueDate || undefined,
    timeSpentHours: Number(parsed.data.timeSpentHours)
  });

  if (!result.ok) {
    return {
      error: result.message,
      fieldErrors: {},
      values
    };
  }

  revalidatePath("/atendimentos");
  redirect("/atendimentos");
}
