import type { Metadata } from "next";
import "./globals.css";
import { AppShell } from "@/components/app-shell";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseConfigState } from "@/lib/supabase";

export const metadata: Metadata = {
  title: "ServiçoCRM Web",
  description: "CRM web para gestão de atendimentos técnicos"
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const supabaseConfig = getSupabaseConfigState();
  const currentUser = await getCurrentUser();

  return (
    <html lang="pt-BR">
      <body>
        {currentUser ? (
          <AppShell currentUser={currentUser} supabaseConfig={supabaseConfig}>{children}</AppShell>
        ) : (
          children
        )}
      </body>
    </html>
  );
}
