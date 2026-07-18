import dotenv from 'dotenv';

dotenv.config();

const rawCorsOrigins = (process.env.CORS_ORIGIN || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

const isProduction = process.env.NODE_ENV === 'production';
const fallbackJwtSecret = 'sigma-dev-only-change-me';

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
};

export function isOriginAllowed(origin?: string): boolean {
    if (!origin) return true;

    if (env.corsOrigins.length === 0) {
        return !isProduction;
    }

    return env.corsOrigins.includes(origin);
}
