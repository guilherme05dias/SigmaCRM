import { redirect } from "next/navigation";
import { clearCurrentUser } from "@/lib/auth";

export async function GET() {
  await clearCurrentUser();
  redirect("/login");
}

