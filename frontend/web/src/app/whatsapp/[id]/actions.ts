"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { hasPermission } from "@/lib/access-control";
import { requirePermission } from "@/lib/auth";
import { createAttendance, linkWhatsappConversationToAttendance } from "@/lib/data";

const linkSchema = z.object({
  attendanceId: z.coerce.number().int().positive()
});

const createSchema = z.object({
  title: z.string().trim().min(3),
  clientId: z.coerce.number().int().positive(),
  technicianId: z.coerce.number().int().positive(),
  priority: z.enum(["Baixa", "Média", "Alta", "Crítica"]),
  nextAction: z.string().trim().min(3)
});

function fail(conversationId: number, code: string) {
  redirect(`/whatsapp/${conversationId}?error=${code}`);
}

export async function linkConversationAction(conversationId: number, formData: FormData) {
  await requirePermission("route:whatsapp");

  const parsed = linkSchema.safeParse({
    attendanceId: formData.get("attendanceId")
  });

  if (!parsed.success) {
    return fail(conversationId, "atendimento-invalido");
  }

  const result = await linkWhatsappConversationToAttendance(conversationId, parsed.data.attendanceId);

  if (!result.ok) {
    return fail(conversationId, "falha-vinculo");
  }

  revalidatePath("/whatsapp");
  revalidatePath(`/whatsapp/${conversationId}`);
  revalidatePath(`/atendimentos/${parsed.data.attendanceId}`);
  redirect(`/whatsapp/${conversationId}`);
}

export async function unlinkConversationAction(conversationId: number) {
  await requirePermission("route:whatsapp");

  const result = await linkWhatsappConversationToAttendance(conversationId, null);

  if (!result.ok) {
    return fail(conversationId, "falha-desvinculo");
  }

  revalidatePath("/whatsapp");
  revalidatePath(`/whatsapp/${conversationId}`);
  redirect(`/whatsapp/${conversationId}`);
}

export async function createAttendanceFromConversationAction(conversationId: number, formData: FormData) {
  const currentUser = await requirePermission("route:whatsapp");

  if (!hasPermission(currentUser.role, "attendance:create")) {
    redirect(`/whatsapp/${conversationId}?error=sem-permissao`);
  }

  const parsed = createSchema.safeParse({
    title: formData.get("title"),
    clientId: formData.get("clientId"),
    technicianId: formData.get("technicianId"),
    priority: formData.get("priority"),
    nextAction: formData.get("nextAction")
  });

  if (!parsed.success) {
    return fail(conversationId, "formulario-invalido");
  }

  const created = await createAttendance({
    title: parsed.data.title,
    clientId: parsed.data.clientId,
    technicianId: parsed.data.technicianId,
    priority: parsed.data.priority,
    channel: "WhatsApp",
    serviceType: "Remoto",
    nextAction: parsed.data.nextAction
  });

  if (!created.ok) {
    return fail(conversationId, "falha-criacao");
  }

  const linked = await linkWhatsappConversationToAttendance(conversationId, created.id);

  if (!linked.ok) {
    redirect(`/atendimentos/${created.id}?error=whatsapp-link`);
  }

  revalidatePath("/whatsapp");
  revalidatePath(`/whatsapp/${conversationId}`);
  revalidatePath("/atendimentos");
  redirect(`/atendimentos/${created.id}`);
}
