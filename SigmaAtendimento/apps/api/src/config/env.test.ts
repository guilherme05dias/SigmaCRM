import { describe, expect, it } from 'vitest';
import { isPrivateNetworkOrigin, validateProductionEnvironment } from './env';

describe('isPrivateNetworkOrigin', () => {
    it.each([
        'http://localhost:5173',
        'http://127.0.0.1:5173',
        'http://192.168.0.2:5173',
        'https://10.20.30.40:5173',
        'http://172.16.0.1:5173',
        'http://172.31.255.254:5173',
    ])('allows a development origin on the private network: %s', (origin) => {
        expect(isPrivateNetworkOrigin(origin)).toBe(true);
    });

    it.each([
        'http://172.32.0.1:5173',
        'https://example.com',
        'file:///tmp/index.html',
        'not-a-url',
    ])('rejects a non-private origin: %s', (origin) => {
        expect(isPrivateNetworkOrigin(origin)).toBe(false);
    });
});

describe('validateProductionEnvironment', () => {
    const validProductionEnv = {
        NODE_ENV: 'production',
        JWT_SECRET: 'j'.repeat(32),
        SIGMA_INTERNAL_TOKEN: 'i'.repeat(32),
        UAZAPI_WEBHOOK_SECRET: 'w'.repeat(32),
        CORS_ORIGIN: 'https://crm.example.com',
        WHATSAPP_PROVIDER: 'uazapi',
        DEFAULT_COMPANY_ID: 'company-id',
        ASSISTANT_ENABLED: 'true',
        OLLAMA_BASE_URL: 'http://127.0.0.1:11434',
        OLLAMA_ASSISTANT_MODEL: 'llama3.2:1b',
    } as NodeJS.ProcessEnv;

    it('aceita uma configuracao de producao completa', () => {
        expect(() => validateProductionEnvironment(validProductionEnv)).not.toThrow();
    });

    it('rejeita segredos repetidos', () => {
        expect(() => validateProductionEnvironment({
            ...validProductionEnv,
            JWT_SECRET: 'x'.repeat(32),
            SIGMA_INTERNAL_TOKEN: 'x'.repeat(32),
        })).toThrow(/devem ser diferentes/);
    });

    it('rejeita Ollama remoto e modelo cloud', () => {
        expect(() => validateProductionEnvironment({
            ...validProductionEnv,
            OLLAMA_BASE_URL: 'http://192.168.0.20:11434',
            OLLAMA_ASSISTANT_MODEL: 'qwen3:8b-cloud',
        })).toThrow(/localhost.*modelo local/);
    });
});
