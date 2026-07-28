export function reportIsoDate(date: Date) {
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(date);
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return `${values.year}-${values.month}-${values.day}`;
}

export function currentMonthReportDates(now = new Date()) {
    const to = reportIsoDate(now);
    return { from: `${to.slice(0, 8)}01`, to };
}

export function rollingReportDates(days: number, now = new Date()) {
    const to = reportIsoDate(now);
    const date = new Date(`${to}T12:00:00-03:00`);
    date.setDate(date.getDate() - Math.max(0, days - 1));
    return { from: reportIsoDate(date), to };
}
