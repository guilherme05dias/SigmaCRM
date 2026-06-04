"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requirePermission } from "@/lib/auth";
import { createTechnicianRecord, updateTechnicianRecord } from "@/lib/data";
import type { TechnicianCreateFormState, TechnicianCreateFormValues } from "@/lib/types";

const technicianSchema = z.object({
  name: z.string().trim().min(3, "Informe o nome do tecnico com pelo menos 3 caracteres."),
  specialty: z.string().trim().min(2, "Informe a especialidade principal."),
  phone: z.string().trim().min(8, "Informe um telefone valido."),
  email: z.string().trim().email("Informe um e-mail valido."),
  active: z.enum(["true", "false"])
});

function readValues(formData: FormData): TechnicianCreateFormValues {
  return {
    name: String(formData.get("name") ?? ""),
    specialty: String(formData.get("specialty") ?? ""),
    phone: String(formData.get("phone") ?? ""),
    email: String(formData.get("email") ?? ""),
    active: String(formData.get("active") ?? "true") as TechnicianCreateFormValues["active"]
  };
}

export async function createTechnicianAction(
  _previousState: TechnicianCreateFormState,
  formData: FormData
): Promise<TechnicianCreateFormState> {
  await requirePermission("technician:create");
  return submitTechnicianForm(readValues(formData), async (values) => createTechnicianRecord(values), "/tecnicos");
}

export async function updateTechnicianAction(
  technicianId: number,
  _previousState: TechnicianCreateFormState,
  formData: FormData
): Promise<TechnicianCreateFormState> {
  await requirePermission("technician:create");
  return submitTechnicianForm(readValues(formData), async (values) => updateTechnicianRecord(technicianId, values), "/tecnicos");
}

async function submitTechnicianForm(
  values: TechnicianCreateFormValues,
  submit: (values: { name: string; specialty: string; phone: string; email: string; active: boolean }) => Promise<{ ok: true } | { ok: false; message: string }>,
  redirectTo: string
): Promise<TechnicianCreateFormState> {
  const parsed = technicianSchema.safeParse(values);

  if (!parsed.success) {
    const flattened = parsed.error.flatten().fieldErrors;

    return {
      error: "Revise os campos destacados e tente novamente.",
      fieldErrors: {
        name: flattened.name?.[0],
        specialty: flattened.specialty?.[0],
        phone: flattened.phone?.[0],
        email: flattened.email?.[0],
        active: flattened.active?.[0]
      },
      values
    };
  }

  const result = await submit({
    ...parsed.data,
    active: parsed.data.active === "true"
  });

  if (!result.ok) {
    return {
      error: result.message,
      fieldErrors: {},
      values
    };
  }

  revalidatePath("/tecnicos");
  redirect(redirectTo);
}
