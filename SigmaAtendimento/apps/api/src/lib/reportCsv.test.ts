import { describe, expect, it } from 'vitest';
import { csvEscape, serializeCsv } from './reportCsv';

describe('CSV de relatórios', () => {
    it('escapa acentos, separador, aspas e quebras de linha para o Excel', () => {
        expect(csvEscape('José, "Sigma";\nSuporte')).toBe('"José, ""Sigma"";\nSuporte"');
    });

    it('gera UTF-8 com BOM e separador ponto e vírgula', () => {
        expect(serializeCsv([['Tipo', 'Cliente'], ['Atendimento', 'João']]))
            .toBe('\uFEFFTipo;Cliente\r\nAtendimento;João');
    });
});
