export const csvEscape = (value: unknown) => {
    const text = value === null || value === undefined ? '' : String(value);
    return /[";,\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

export const localReportDate = (value?: string | null) => value
    ? new Date(value).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })
    : '';

export const reportDuration = (seconds?: number | null) => seconds === null || seconds === undefined
    ? ''
    : `${Math.floor(seconds / 3600)}:${String(Math.floor((seconds % 3600) / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;

export function serializeCsv(rows: unknown[][]) {
    return `\uFEFF${rows.map((row) => row.map(csvEscape).join(';')).join('\r\n')}`;
}
