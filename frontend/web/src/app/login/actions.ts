"use server";

import { redirect } from "next/navigation";
import { authenticateWebUser, setCurrentUser } from "@/lib/auth";

export async function loginAction(formData: FormData) {
  const username = String(formData.get("username") ?? "").trim();
  const password = String(formData.get("password") ?? "").trim();

  const result = await authenticateWebUser(username, password);

  if (!result.ok) {
    redirect(`/login?error=${encodeURIComponent(result.message)}`);
  }

  await setCurrentUser(result.user);
  redirect("/dashboard");
}
