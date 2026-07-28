import { z } from 'zod';
import type { ReportFilters } from '@sigma/shared';

export const REPORT_TIMEZONE = 'America/Sao_Paulo' as const;

const datePattern = /^\d{4}-\d{2}-\d{2}$/;

function saoPauloDate(value: string): Date {
    if (!datePattern.test(value)) throw new Error('Data inválida. Use o formato AAAA-MM-DD.');
    const parsed = new Date(`${value}T00:00:00-03:00`);
    if (Number.isNaN(parsed.getTime())) throw new Error('Data inválida.');
    return parsed;
}

function localDateParts(date = new Date()) {
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: REPORT_TIMEZONE,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).formatToParts(date);
    const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return `${value.year}-${value.month}-${value.day}`;
}

export function defaultReportDates(now = new Date()) {
    const today = localDateParts(now);
    return { from: `${today.slice(0, 8)}01`, to: today };
}

export function parseReportFilters(query: Record<string, unknown>) {
    const defaults = defaultReportDates();
    const parsed = z.object({
        from: z.string().default(defaults.from),
        to: z.string().default(defaults.to),
        type: z.enum(['all', 'attendance', 'ticket']).default('all'),
        departmentId: z.string().uuid().optional(),
        responsibleUserId: z.string().uuid().optional(),
        attendanceStatus: z.enum(['OPEN', 'ASSIGNED', 'CLOSED']).optional(),
        ticketStatus: z.enum(['NEW', 'QUEUED', 'IN_PROGRESS', 'WAITING_CUSTOMER', 'WAITING_INTERNAL', 'SCHEDULED_FIELD_SERVICE', 'RESOLVED', 'CLOSED', 'CANCELED']).optional(),
        origin: z.enum(['WHATSAPP', 'MANUAL']).optional(),
    }).parse(query) as ReportFilters;

    const startInclusive = saoPauloDate(parsed.from);
    const endInclusive = saoPauloDate(parsed.to);
    if (startInclusive > endInclusive) throw new Error('A data inicial deve ser anterior à data final.');
    const endExclusive = new Date(endInclusive);
    endExclusive.setUTCDate(endExclusive.getUTCDate() + 1);

    return { filters: parsed, startInclusive, endExclusive };
}

export function todayRange(now = new Date()) {
    const today = localDateParts(now);
    const startInclusive = saoPauloDate(today);
    const endExclusive = new Date(startInclusive);
    endExclusive.setUTCDate(endExclusive.getUTCDate() + 1);
    return { startInclusive, endExclusive };
}

export function encodeCursor(date: Date, id: string) {
    return Buffer.from(JSON.stringify({ date: date.toISOString(), id }), 'utf8').toString('base64url');
}

export function decodeCursor(cursor?: string) {
    if (!cursor) return null;
    try {
        const value = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as { date: string; id: string };
        const date = new Date(value.date);
        if (!value.id || Number.isNaN(date.getTime())) throw new Error();
        return { date, id: value.id };
    } catch {
        throw new Error('Cursor inválido.');
    }
}

export function average(values: number[]) {
    return {
        value: values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null,
        sampleSize: values.length,
    };
}
