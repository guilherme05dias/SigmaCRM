import bcrypt from 'bcryptjs';

// ─────────────────────────────────────────────────────────────────────────────
// Hash de senha (C1) — bcryptjs (JS puro, sem build nativo).
// Suporta migração preguiçosa: senhas legadas em texto puro continuam aceitas e
// são re-hasheadas no próximo login bem-sucedido (ver auth.routes.ts).
// ─────────────────────────────────────────────────────────────────────────────

const ROUNDS = 10;

/** Gera o hash bcrypt de uma senha em texto puro. */
export async function hashPassword(plain: string): Promise<string> {
    return bcrypt.hash(plain, ROUNDS);
}

/** True se a string já é um hash bcrypt ($2a/$2b/$2y$...). */
export function isHashed(value: string | null | undefined): boolean {
    return typeof value === 'string' && /^\$2[aby]\$/.test(value);
}

/**
 * Verifica uma senha contra o valor armazenado.
 * - Se o armazenado for hash bcrypt → compara com bcrypt.
 * - Se for texto puro (legado) → compara direto (será migrado no login).
 */
export async function verifyPassword(plain: string, stored: string | null | undefined): Promise<boolean> {
    if (!stored) return false;
    if (isHashed(stored)) return bcrypt.compare(plain, stored);
    return plain === stored;
}

/** Garante que o valor recebido vire um hash (hasheia se vier em texto puro). */
export async function ensureHashed(value: string): Promise<string> {
    return isHashed(value) ? value : hashPassword(value);
}
