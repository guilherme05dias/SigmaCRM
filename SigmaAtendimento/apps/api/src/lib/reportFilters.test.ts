import { describe, expect, it } from 'vitest';
import { average, decodeCursor, defaultReportDates, encodeCursor, parseReportFilters, todayRange } from './reportFilters';

describe('filtros dos relatórios', () => {
    it('abre no mês atual de São Paulo', () => {
        expect(defaultReportDates(new Date('2026-07-18T02:00:00.000Z'))).toEqual({ from: '2026-07-01', to: '2026-07-17' });
    });

    it('usa início inclusivo e o próximo dia exclusivo', () => {
        const result = parseReportFilters({ from: '2026-07-17', to: '2026-07-18', type: 'all' });
        expect(result.startInclusive.toISOString()).toBe('2026-07-17T03:00:00.000Z');
        expect(result.endExclusive.toISOString()).toBe('2026-07-19T03:00:00.000Z');
    });

    it('calcula hoje na virada do dia em São Paulo', () => {
        const result = todayRange(new Date('2026-07-18T02:59:59.000Z'));
        expect(result.startInclusive.toISOString()).toBe('2026-07-17T03:00:00.000Z');
        expect(result.endExclusive.toISOString()).toBe('2026-07-18T03:00:00.000Z');
    });

    it('rejeita período invertido', () => {
        expect(() => parseReportFilters({ from: '2026-07-20', to: '2026-07-18' })).toThrow('data inicial');
    });

    it('preserva data e id no cursor composto', () => {
        const date = new Date('2026-07-18T12:30:00.000Z');
        expect(decodeCursor(encodeCursor(date, 'registro-2'))).toEqual({ date, id: 'registro-2' });
    });

    it('informa a cobertura das médias e ignora ausências', () => {
        expect(average([])).toEqual({ value: null, sampleSize: 0 });
        expect(average([30, 90])).toEqual({ value: 60, sampleSize: 2 });
    });
});
