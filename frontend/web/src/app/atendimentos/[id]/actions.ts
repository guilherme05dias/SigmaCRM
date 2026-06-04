"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requirePermission } from "@/lib/auth";
import { updateAttendanceStatus } from "@/lib/data";

const statusSchema = z.enum(["Novo", "Em andamento", "Aguardando cliente", "Aguardando retorno", "Concluído", "Cancelado"]);

export async function updateAttendanceStatusAction(attendanceId: number, formData: FormData) {
  await requirePermission("attendance:update");

  const parsed = statusSchema.safeParse(String(formData.get("status") ?? ""));

  if (!parsed.success) {
    redirect(`/atendimentos/${attendanceId}?error=status-invalido`);
  }

  const result = await updateAttendanceStatus(attendanceId, parsed.data);

  if (!result.ok) {
    redirect(`/atendimentos/${attendanceId}?error=update-status`);
  }

  revalidatePath("/atendimentos");
  revalidatePath(`/atendimentos/${attendanceId}`);
  redirect(`/atendimentos/${attendanceId}`);
}
