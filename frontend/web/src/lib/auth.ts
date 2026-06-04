import "server-only";

import { createHmac, pbkdf2Sync, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { hasPermission, type Permission } from "./access-control";
import { createSupabaseClient } from "./supabase";
import type { AuthSession, Role } from "./types";

const SESSION_COOKIE = "servicocrm_session";
const SESSION_MAX_AGE = 60 * 60 * 8;

type AuthUserRow = {
  id: number;
  username: string;
  full_name: string;
  role: Role;
  is_active: boolean;
};

function getAuthSecret() {
  return (
    process.env.AUTH_SECRET?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ||
    "servicocrm-local-development-secret"
  );
}

function base64UrlEncode(value: string) {
  return Buffer.from(value, "utf8").toString("base64url");
}

function base64UrlDecode(value: string) {
  return Buffer.from(value, "base64url").toString("utf8");
}

function signPayload(payload: string) {
  return createHmac("sha256", getAuthSecret()).update(payload).digest("base64url");
}

function encodeSession(session: AuthSession) {
  const payload = base64UrlEncode(JSON.stringify(session));
  return `${payload}.${signPayload(payload)}`;
}

function decodeSession(value: string | undefined): AuthSession | null {
  if (!value) return null;

  const [payload, signature] = value.split(".");
  if (!payload || !signature) return null;

  const expected = signPayload(payload);
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);

  if (actualBuffer.length !== expectedBuffer.length || !timingSafeEqual(actualBuffer, expectedBuffer)) {
    return null;
  }

  try {
    const parsed = JSON.parse(base64UrlDecode(payload)) as AuthSession;
    if (!parsed.id || !parsed.username || !parsed.fullName || !parsed.role) return null;
    return parsed;
  } catch {
    return null;
  }
}

function verifyPasswordHash(password: string, storedHash: string) {
  const [algorithm, iterationsRaw, saltHex, hashHex] = storedHash.split("$");

  if (algorithm !== "pbkdf2_sha256" || !iterationsRaw || !saltHex || !hashHex) return false;

  const iterations = Number(iterationsRaw);
  if (!Number.isInteger(iterations) || iterations <= 0) return false;

  const expected = Buffer.from(hashHex, "hex");
  const actual = pbkdf2Sync(password, Buffer.from(saltHex, "hex"), iterations, expected.length, "sha256");

  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function getLocalAuthUser(username: string, password: string): AuthSession | null {
  const localUsername = process.env.LOCAL_AUTH_USERNAME?.trim();
  const localPassword = process.env.LOCAL_AUTH_PASSWORD?.trim();
  const localPasswordHash = process.env.LOCAL_AUTH_PASSWORD_HASH?.trim();
  const localRole = (process.env.LOCAL_AUTH_ROLE?.trim() || "gerente") as Role;
  const localFullName = process.env.LOCAL_AUTH_FULL_NAME?.trim() || "Administrador Local";

  if (!localUsername || username !== localUsername) return null;
  if (!["gerente", "atendente", "tecnico"].includes(localRole)) return null;
  if (localPassword) {
    if (password !== localPassword) return null;
  } else if (!localPasswordHash || !verifyPasswordHash(password, localPasswordHash)) {
    return null;
  }

  return {
    id: -1,
    username: localUsername,
    fullName: localFullName,
    role: localRole
  };
}

export async function getCurrentUser(): Promise<AuthSession | null> {
  const cookieStore = await cookies();
  return decodeSession(cookieStore.get(SESSION_COOKIE)?.value);
}

export async function requireCurrentUser(): Promise<AuthSession> {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  return user;
}

export async function requirePermission(permission: Permission): Promise<AuthSession> {
  const user = await requireCurrentUser();

  if (!hasPermission(user.role, permission)) {
    redirect("/dashboard");
  }

  return user;
}

export async function setCurrentUser(user: AuthSession) {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, encodeSession(user), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: SESSION_MAX_AGE,
    path: "/"
  });
}

export async function clearCurrentUser() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
}

export async function authenticateWebUser(
  username: string,
  password: string
): Promise<{ ok: true; user: AuthSession } | { ok: false; message: string }> {
  const localUser = getLocalAuthUser(username, password);

  if (localUser) {
    return {
      ok: true,
      user: localUser
    };
  }

  const supabase = createSupabaseClient();

  if (!supabase) {
    return {
      ok: false,
      message: "Supabase nao configurado. Nao foi possivel autenticar."
    };
  }

  const { data, error } = await supabase.rpc("authenticate_user", {
    login_username: username,
    login_password: password
  });

  if (error) {
    return {
      ok: false,
      message: `Nao foi possivel autenticar no Supabase. Detalhes: ${error.message}`
    };
  }

  const rows = Array.isArray(data) ? (data as AuthUserRow[]) : [];
  const user = rows[0];

  if (!user?.is_active) {
    return {
      ok: false,
      message: "Login ou senha invalidos."
    };
  }

  return {
    ok: true,
    user: {
      id: Number(user.id),
      username: user.username,
      fullName: user.full_name,
      role: user.role
    }
  };
}
