import { createClient } from "@supabase/supabase-js";

export type SupabaseConfigStatus = "configured" | "partial" | "missing";

export type SupabaseConfigState = {
  label: string;
  status: SupabaseConfigStatus;
};

export function getSupabaseConfigState(): SupabaseConfigState {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();

  if (url && anonKey) {
    return {
      label: "Supabase configurado",
      status: "configured"
    };
  }

  if (url || anonKey) {
    return {
      label: "Supabase incompleto",
      status: "partial"
    };
  }

  return {
    label: "Supabase não configurado",
    status: "missing"
  };
}

type SupabaseActor = {
  fullName: string;
  role: string;
} | null;

export function createSupabaseClient(actor?: SupabaseActor) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();

  if (getSupabaseConfigState().status !== "configured" || !url || !anonKey) {
    return null;
  }

  return createClient(url, anonKey, {
    global: {
      headers: {
        "x-app-actor": actor?.fullName ?? "Sistema",
        "x-app-role": actor?.role ?? "sistema"
      }
    }
  });
}

export function createSupabaseAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!url || !serviceRoleKey) {
    return null;
  }

  return createClient(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });
}

export const createSupabaseBrowserClient = createSupabaseClient;
