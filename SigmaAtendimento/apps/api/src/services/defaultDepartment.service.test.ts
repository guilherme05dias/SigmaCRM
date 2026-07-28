import { describe, expect, it } from 'vitest';
import { isDefaultSupportDepartmentName } from './defaultDepartment.service';

describe('setor padrão de atendimento', () => {
    it('reconhece Suporte Técnico com ou sem acento', () => {
        expect(isDefaultSupportDepartmentName('Suporte Técnico')).toBe(true);
        expect(isDefaultSupportDepartmentName(' suporte tecnico ')).toBe(true);
        expect(isDefaultSupportDepartmentName('SUPORTE TÉCNICO')).toBe(true);
    });

    it('não confunde outros setores com o suporte técnico', () => {
        expect(isDefaultSupportDepartmentName('Comercial')).toBe(false);
        expect(isDefaultSupportDepartmentName(null)).toBe(false);
    });
});
