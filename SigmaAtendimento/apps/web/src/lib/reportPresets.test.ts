import { describe, expect, it } from 'vitest';
import { currentMonthReportDates, rollingReportDates } from './reportPresets';

const now = new Date('2026-07-18T15:00:00.000Z');

describe('atalhos de período', () => {
    it('calcula mês atual', () => expect(currentMonthReportDates(now)).toEqual({ from: '2026-07-01', to: '2026-07-18' }));
    it('calcula hoje', () => expect(rollingReportDates(1, now)).toEqual({ from: '2026-07-18', to: '2026-07-18' }));
    it('calcula 7 dias incluindo hoje', () => expect(rollingReportDates(7, now)).toEqual({ from: '2026-07-12', to: '2026-07-18' }));
    it('calcula 30 dias incluindo hoje', () => expect(rollingReportDates(30, now)).toEqual({ from: '2026-06-19', to: '2026-07-18' }));
});
