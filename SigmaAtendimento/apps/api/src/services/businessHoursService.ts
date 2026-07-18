import { PrismaClient, Settings } from '@prisma/client';

const prisma = new PrismaClient();

const defaultBusinessHours = [
    { day: 'Segunda-feira', status: 'OPEN', startTime: '08:00', endTime: '18:00' },
    { day: 'Terça-feira', status: 'OPEN', startTime: '08:00', endTime: '18:00' },
    { day: 'Quarta-feira', status: 'OPEN', startTime: '08:00', endTime: '18:00' },
    { day: 'Quinta-feira', status: 'OPEN', startTime: '08:00', endTime: '18:00' },
    { day: 'Sexta-feira', status: 'OPEN', startTime: '08:00', endTime: '18:00' },
    { day: 'Sábado', status: 'CLOSED', startTime: '08:00', endTime: '12:00' },
    { day: 'Domingo', status: 'CLOSED', startTime: '', endTime: '' },
];

const BUSINESS_TIME_ZONE = 'America/Sao_Paulo';
const PORTUGUESE_WEEKDAYS = ['domingo', 'segunda-feira', 'terca-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sabado'];

type BusinessHour = {
    day?: string;
    status?: string;
    startTime?: string;
    endTime?: string;
};

function normalizedDay(value: string): string {
    return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
}

function zonedDateParts(date: Date) {
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: BUSINESS_TIME_ZONE,
        weekday: 'short',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
    }).formatToParts(date);
    const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value || '';
    const weekdayIndex = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(value('weekday'));
    return {
        weekdayIndex,
        hour: Number(value('hour')),
        minute: Number(value('minute')),
        dateKey: `${value('year')}-${value('month')}-${value('day')}`,
    };
}

function businessHourForDate(hours: BusinessHour[], weekdayIndex: number): BusinessHour | undefined {
    const expectedDay = PORTUGUESE_WEEKDAYS[weekdayIndex];
    const byLabel = hours.find((item) => item.day && normalizedDay(item.day) === expectedDay);
    if (byLabel) return byLabel;

    const hasDayLabels = hours.some((item) => Boolean(item.day));
    if (hasDayLabels) return hours[(weekdayIndex + 6) % 7]; // arrays da tela começam na segunda-feira
    return hours[weekdayIndex]; // compatibilidade com o formato legado que começava no domingo
}

export async function getCurrentSettings(companyId?: string): Promise<Settings> {
    const settings = companyId
        ? await prisma.settings.findUnique({ where: { companyId } })
        : await prisma.settings.findFirst();

    if (settings) {
        return settings;
    }

    // If no settings exist, grab the first company and create default settings
    const company = companyId
        ? await prisma.company.findUnique({ where: { id: companyId } })
        : await prisma.company.findFirst({ orderBy: { createdAt: 'asc' } });

    if (!company) {
        throw new Error("No company found. Cannot create default settings.");
    }

    return await prisma.settings.create({
        data: {
            companyId: company.id,
            businessHours: defaultBusinessHours,
            welcomeMessage: "Olá! Bem-vindo ao Sigma Atendimento. Em instantes um de nossos especialistas irá atendê-lo.",
            awayMessage: "No momento estamos fora do horário de atendimento. Deixe sua mensagem e responderemos assim que retornarmos.",
            closingMessage: "Seu atendimento foi encerrado. Agradecemos o contato!"
        }
    });
}

export function isWithinBusinessHours(date: Date, settings: Settings): boolean {
    const businessHoursArray = settings.businessHours as BusinessHour[] | undefined;
    if (!businessHoursArray || !Array.isArray(businessHoursArray) || businessHoursArray.length !== 7) {
        // Failsafe: if settings are malformed, assume OPEN
        console.warn("Business hours malformed or empty, assuming OPEN");
        return true;
    }

    const current = zonedDateParts(date);
    const todayConfig = businessHourForDate(businessHoursArray, current.weekdayIndex);

    if (!todayConfig || todayConfig.status === 'CLOSED' || !todayConfig.startTime || !todayConfig.endTime) {
        return false;
    }

    if (todayConfig.status === 'SPECIAL') {
        // Optional: could handle special holidays here. For now assume it obeys start/end if special
    }

    const [startHour, startMinute] = todayConfig.startTime.split(':').map(Number);
    const [endHour, endMinute] = todayConfig.endTime.split(':').map(Number);
    if (![startHour, startMinute, endHour, endMinute].every(Number.isFinite)) return false;

    const currentMinutes = current.hour * 60 + current.minute;
    const startMinutes = startHour * 60 + startMinute;
    const endMinutes = endHour * 60 + endMinute;

    if (endMinutes <= startMinutes) {
        return currentMinutes >= startMinutes || currentMinutes < endMinutes;
    }
    return currentMinutes >= startMinutes && currentMinutes < endMinutes;
}

export function wasAutomaticMessageSentToday(lastSentAt: Date | string | null | undefined, now: Date): boolean {
    if (!lastSentAt) return false;
    const parsed = lastSentAt instanceof Date ? lastSentAt : new Date(lastSentAt);
    if (Number.isNaN(parsed.getTime())) return false;
    return zonedDateParts(parsed).dateKey === zonedDateParts(now).dateKey;
}
