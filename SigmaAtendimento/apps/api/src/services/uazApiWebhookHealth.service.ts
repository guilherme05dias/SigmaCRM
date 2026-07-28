import { prisma } from '../lib/prisma';

const HEALTH_CACHE_TTL_MS = 60_000;

type PermissionRow = {
    privateSchemaUsage: boolean;
    triggerFunctionExecute: boolean;
    canonicalFunctionExecute: boolean;
};

export type UazApiWebhookDatabaseHealth = PermissionRow & {
    applicable: boolean;
    healthy: boolean;
    checkedAt: string;
    error?: string;
};

let cachedHealth: UazApiWebhookDatabaseHealth | null = null;
let cacheExpiresAt = 0;
let pendingCheck: Promise<UazApiWebhookDatabaseHealth> | null = null;

export function evaluateUazApiWebhookPermissions(row: PermissionRow): boolean {
    return row.privateSchemaUsage
        && row.triggerFunctionExecute
        && row.canonicalFunctionExecute;
}

export async function checkUazApiWebhookDatabaseHealth(options: { force?: boolean } = {}): Promise<UazApiWebhookDatabaseHealth> {
    const applicable = (process.env.WHATSAPP_PROVIDER || '').trim().toLowerCase() === 'uazapi';
    if (!applicable) {
        return {
            applicable: false,
            healthy: true,
            privateSchemaUsage: false,
            triggerFunctionExecute: false,
            canonicalFunctionExecute: false,
            checkedAt: new Date().toISOString(),
        };
    }

    if (!options.force && cachedHealth && Date.now() < cacheExpiresAt) return cachedHealth;
    if (pendingCheck) return pendingCheck;

    pendingCheck = (async () => {
        try {
            const [row] = await prisma.$queryRaw<PermissionRow[]>`
                select
                    has_schema_privilege('service_role', 'private', 'USAGE') as "privateSchemaUsage",
                    has_function_privilege('service_role', 'private.normalize_contact_phone_before_write()', 'EXECUTE') as "triggerFunctionExecute",
                    has_function_privilege('service_role', 'private.canonical_brazil_phone(text)', 'EXECUTE') as "canonicalFunctionExecute"
            `;
            const health: UazApiWebhookDatabaseHealth = {
                applicable: true,
                healthy: Boolean(row && evaluateUazApiWebhookPermissions(row)),
                privateSchemaUsage: Boolean(row?.privateSchemaUsage),
                triggerFunctionExecute: Boolean(row?.triggerFunctionExecute),
                canonicalFunctionExecute: Boolean(row?.canonicalFunctionExecute),
                checkedAt: new Date().toISOString(),
            };
            cachedHealth = health;
            cacheExpiresAt = Date.now() + HEALTH_CACHE_TTL_MS;
            return health;
        } catch (error) {
            const health: UazApiWebhookDatabaseHealth = {
                applicable: true,
                healthy: false,
                privateSchemaUsage: false,
                triggerFunctionExecute: false,
                canonicalFunctionExecute: false,
                checkedAt: new Date().toISOString(),
                error: error instanceof Error ? error.message : String(error),
            };
            cachedHealth = health;
            cacheExpiresAt = Date.now() + HEALTH_CACHE_TTL_MS;
            return health;
        } finally {
            pendingCheck = null;
        }
    })();

    return pendingCheck;
}

export async function logUazApiWebhookDatabaseHealth(): Promise<void> {
    const health = await checkUazApiWebhookDatabaseHealth({ force: true });
    if (!health.applicable) return;
    if (health.healthy) {
        console.info('[SIGMA] Permissões do webhook UAZAPI verificadas.');
        return;
    }
    console.error('[SIGMA] Webhook UAZAPI sem permissão para criar novos contatos.', health);
}
