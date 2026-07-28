import dotenv from 'dotenv';

dotenv.config();

const rawCorsOrigins = (process.env.CORS_ORIGIN || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

const isProduction = process.env.NODE_ENV === 'production';
const fallbackJwtSecret = 'sigma-dev-only-change-me';

function enabled(value?: string) {
    return value?.trim().toLowerCase() === 'true';
}

function isLoopbackHttpUrl(value: string) {
    try {
        const url = new URL(value);
        return url.protocol === 'http:'
            && !url.username
            && !url.password
            && !url.search
            && !url.hash
            && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname);
    } catch {
        return false;
    }
}

export function validateProductionEnvironment(source: NodeJS.ProcessEnv) {
    if (source.NODE_ENV !== 'production') return;

    const errors: string[] = [];
    const jwtSecret = source.JWT_SECRET?.trim() || '';
    const internalToken = source.SIGMA_INTERNAL_TOKEN?.trim() || '';
    const webhookSecret = source.UAZAPI_WEBHOOK_SECRET?.trim() || '';

    if (jwtSecret.length < 32) errors.push('JWT_SECRET deve ter pelo menos 32 caracteres');
    if (!source.CORS_ORIGIN?.trim()) errors.push('CORS_ORIGIN deve listar o frontend de producao');
    if (internalToken.length < 32) errors.push('SIGMA_INTERNAL_TOKEN deve ter pelo menos 32 caracteres');

    if (source.WHATSAPP_PROVIDER?.trim().toLowerCase() === 'uazapi') {
        if (webhookSecret.length < 32) errors.push('UAZAPI_WEBHOOK_SECRET deve ter pelo menos 32 caracteres');
        if (!(source.DEFAULT_COMPANY_ID || source.SIGMA_DEFAULT_COMPANY_ID)?.trim()) {
            errors.push('DEFAULT_COMPANY_ID deve identificar a empresa dos webhooks');
        }
    }

    const secrets = [jwtSecret, internalToken, webhookSecret].filter(Boolean);
    if (new Set(secrets).size !== secrets.length) {
        errors.push('JWT_SECRET, SIGMA_INTERNAL_TOKEN e UAZAPI_WEBHOOK_SECRET devem ser diferentes');
    }

    if (enabled(source.ASSISTANT_ENABLED)) {
        const ollamaUrl = source.OLLAMA_BASE_URL?.trim() || 'http://127.0.0.1:11434';
        const assistantModel = source.OLLAMA_ASSISTANT_MODEL?.trim() || 'llama3.2:1b';
        if (!isLoopbackHttpUrl(ollamaUrl)) {
            errors.push('OLLAMA_BASE_URL deve apontar somente para localhost');
        }
        if (assistantModel.toLowerCase().includes('cloud')) {
            errors.push('OLLAMA_ASSISTANT_MODEL deve ser um modelo local');
        }
    }

    if (errors.length > 0) {
        throw new Error(`Configuracao de producao invalida: ${errors.join('; ')}.`);
    }
}

validateProductionEnvironment(process.env);

if (isProduction && !process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET é obrigatório em produção.');
}

if (!isProduction && !process.env.JWT_SECRET) {
    console.warn('[config] JWT_SECRET não definido. Usando segredo local apenas para desenvolvimento.');
}

export const env = {
    port: Number(process.env.PORT || 3333),
    jwtSecret: process.env.JWT_SECRET || fallbackJwtSecret,
    corsOrigins: rawCorsOrigins,
    internalToken: process.env.SIGMA_INTERNAL_TOKEN || '',
    uazapiWebhookSecret: process.env.UAZAPI_WEBHOOK_SECRET || '',
    defaultCompanyId: process.env.DEFAULT_COMPANY_ID || process.env.SIGMA_DEFAULT_COMPANY_ID || '',
    muriloApiBaseUrl: (process.env.MURILO_WHATSAPP_API_BASE_URL || 'http://localhost:3000').replace(/\/$/, ''),
    assistantEnabled: enabled(process.env.ASSISTANT_ENABLED),
    ollamaBaseUrl: (process.env.OLLAMA_BASE_URL?.trim() || 'http://127.0.0.1:11434').replace(/\/$/, ''),
    assistantModel: process.env.OLLAMA_ASSISTANT_MODEL?.trim() || 'llama3.2:1b',
    assistantTimeoutMs: Math.max(5_000, Number(process.env.OLLAMA_TIMEOUT_MS || 90_000)),
    assistantReminderIntervalMs: Math.max(15_000, Number(process.env.ASSISTANT_REMINDER_INTERVAL_MS || 60_000)),
    assistantCustomerReplyReminderMinutes: Math.max(5, Number(process.env.ASSISTANT_CUSTOMER_REPLY_REMINDER_MINUTES || 30)),
    assistantCustomerReplyDigestIntervalMinutes: Math.max(15, Number(process.env.ASSISTANT_CUSTOMER_REPLY_DIGEST_INTERVAL_MINUTES || 60)),
    assistantUndatedTaskReminderHours: Math.max(1, Number(process.env.ASSISTANT_UNDATED_TASK_REMINDER_HOURS || 24)),
};

export function isPrivateNetworkOrigin(origin: string): boolean {
    try {
        const url = new URL(origin);
        if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
        if (url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '[::1]') return true;

        const octets = url.hostname.split('.').map(Number);
        if (octets.length !== 4 || octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) {
            return false;
        }

        return octets[0] === 10
            || (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31)
            || (octets[0] === 192 && octets[1] === 168);
    } catch {
        return false;
    }
}

export function isOriginAllowed(origin?: string): boolean {
    if (!origin) return true;

    if (env.corsOrigins.length === 0) {
        return !isProduction;
    }

    return env.corsOrigins.includes(origin)
        || (!isProduction && isPrivateNetworkOrigin(origin));
}
