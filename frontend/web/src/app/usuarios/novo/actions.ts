"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requirePermission } from "@/lib/auth";
import { createUserRecord, updateUserRecord } from "@/lib/data";
import type { UserAccountFormState, UserAccountFormValues } from "@/lib/types";

const baseSchema = z.object({
  username: z.string().trim().min(3, "Informe um login com pelo menos 3 caracteres."),
  fullName: z.string().trim().min(3, "Informe o nome completo."),
  role: z.enum(["gerente", "atendente", "tecnico"]),
  password: z.string(),
  isActive: z.enum(["true", "false"])
});

function readValues(formData: FormData): UserAccountFormValues {
  return {
    username: String(formData.get("username") ?? ""),
    fullName: String(formData.get("fullName") ?? ""),
    role: String(formData.get("role") ?? "atendente") as UserAccountFormValues["role"],
    password: String(formData.get("password") ?? ""),
    isActive: String(formData.get("isActive") ?? "true") as UserAccountFormValues["isActive"]
  };
}

export async function createUserAction(
  _previousState: UserAccountFormState,
  formData: FormData
): Promise<UserAccountFormState> {
  await requirePermission("user:manage");
  return submitUserForm(readValues(formData), async (values) => createUserRecord(values), "/usuarios", true);
}

export async function updateUserAction(
  userId: number,
  _previousState: UserAccountFormState,
  formData: FormData
): Promise<UserAccountFormState> {
  await requirePermission("user:manage");
  return submitUserForm(readValues(formData), async (values) => updateUserRecord(userId, values), "/usuarios", false);
}

async function submitUserForm(
  values: UserAccountFormValues,
  submit: (values: UserAccountFormValues) => Promise<{ ok: true } | { ok: false; message: string }>,
  redirectTo: string,
  requirePassword: boolean
): Promise<UserAccountFormState> {
  const schema = baseSchema.superRefine((value, context) => {
    if (requirePassword && value.password.trim().length < 6) {
      context.addIssue({
        code: "custom",
        message: "Informe uma senha com pelo menos 6 caracteres.",
        path: ["password"]
      });
    }

    if (!requirePassword && value.password.trim() && value.password.trim().length < 6) {
      context.addIssue({
        code: "custom",
        message: "A nova senha precisa ter pelo menos 6 caracteres.",
        path: ["password"]
      });
    }
  });

  const parsed = schema.safeParse(values);

  if (!parsed.success) {
    const flattened = parsed.error.flatten().fieldErrors;

    return {
      error: "Revise os campos destacados e tente novamente.",
      fieldErrors: {
        username: flattened.username?.[0],
        fullName: flattened.fullName?.[0],
        role: flattened.role?.[0],
        password: flattened.password?.[0],
        isActive: flattened.isActive?.[0]
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

  revalidatePath("/usuarios");
  redirect(redirectTo);
}
