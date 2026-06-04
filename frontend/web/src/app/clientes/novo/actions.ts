"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requirePermission } from "@/lib/auth";
import { createClientRecord, updateClientRecord } from "@/lib/data";
import type { ClientCreateFormState, ClientCreateFormValues } from "@/lib/types";

const clientSchema = z.object({
  name: z.string().trim().min(3, "Informe o nome do cliente com pelo menos 3 caracteres."),
  company: z.string().trim().min(3, "Informe a empresa vinculada ao cliente."),
  phone: z.string().trim().min(8, "Informe um telefone valido."),
  email: z.string().trim().email("Informe um e-mail valido."),
  city: z.string().trim().min(2, "Informe a cidade."),
  segment: z.string().trim().min(2, "Informe o segmento de atendimento."),
  status: z.enum(["Ativo", "Em negociação", "Inativo"])
});

function readValues(formData: FormData): ClientCreateFormValues {
  return {
    name: String(formData.get("name") ?? ""),
    company: String(formData.get("company") ?? ""),
    phone: String(formData.get("phone") ?? ""),
    email: String(formData.get("email") ?? ""),
    city: String(formData.get("city") ?? ""),
    segment: String(formData.get("segment") ?? ""),
    status: String(formData.get("status") ?? "Ativo") as ClientCreateFormValues["status"]
  };
}

export async function createClientAction(
  _previousState: ClientCreateFormState,
  formData: FormData
): Promise<ClientCreateFormState> {
  await requirePermission("client:create");
  return submitClientForm(readValues(formData), async (values) => createClientRecord(values), "/clientes");
}

export async function updateClientAction(
  clientId: number,
  _previousState: ClientCreateFormState,
  formData: FormData
): Promise<ClientCreateFormState> {
  await requirePermission("client:create");
  return submitClientForm(readValues(formData), async (values) => updateClientRecord(clientId, values), `/clientes/${clientId}`);
}

async function submitClientForm(
  values: ClientCreateFormValues,
  submit: (values: z.infer<typeof clientSchema>) => Promise<{ ok: true } | { ok: false; message: string }>,
  redirectTo: string
): Promise<ClientCreateFormState> {
  const parsed = clientSchema.safeParse(values);

  if (!parsed.success) {
    const flattened = parsed.error.flatten().fieldErrors;

    return {
      error: "Revise os campos destacados e tente novamente.",
      fieldErrors: {
        name: flattened.name?.[0],
        company: flattened.company?.[0],
        phone: flattened.phone?.[0],
        email: flattened.email?.[0],
        city: flattened.city?.[0],
        segment: flattened.segment?.[0],
        status: flattened.status?.[0]
      },
      values
    };
  }

  const result = await submit(parsed.data);

  if (!result.ok) {
    return {
      error: result.message,
      fieldErrors: {},
      values
    };
  }

  revalidatePath("/clientes");
  redirect(redirectTo);
}
