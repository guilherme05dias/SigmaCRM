import { describe, expect, it } from 'vitest';
import { evaluateUazApiWebhookPermissions } from './uazApiWebhookHealth.service';

describe('evaluateUazApiWebhookPermissions', () => {
    it('requires all permissions used by the contact phone trigger', () => {
        expect(evaluateUazApiWebhookPermissions({
            privateSchemaUsage: true,
            triggerFunctionExecute: true,
            canonicalFunctionExecute: true,
        })).toBe(true);
    });

    it.each([
        { privateSchemaUsage: false, triggerFunctionExecute: true, canonicalFunctionExecute: true },
        { privateSchemaUsage: true, triggerFunctionExecute: false, canonicalFunctionExecute: true },
        { privateSchemaUsage: true, triggerFunctionExecute: true, canonicalFunctionExecute: false },
    ])('reports an unhealthy permission chain: %o', (permissions) => {
        expect(evaluateUazApiWebhookPermissions(permissions)).toBe(false);
    });
});
