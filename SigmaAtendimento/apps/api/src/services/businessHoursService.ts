import { PrismaClient, Settings } from '@prisma/client';

const prisma = new PrismaClient();

const defaultBusinessHours = [
    { status: 'CLOSED', startTime: '08:00', endTime: '18:00' }, // 0: Sunday
    { status: 'OPEN', startTime: '08:00', endTime: '18:00' }, // 1: Monday
    { status: 'OPEN', startTime: '08:00', endTime: '18:00' }, // 2: Tuesday
    { status: 'OPEN', startTime: '08:00', endTime: '18:00' }, // 3: Wednesday
    { status: 'OPEN', startTime: '08:00', endTime: '18:00' }, // 4: Thursday
    { status: 'OPEN', startTime: '08:00', endTime: '18:00' }, // 5: Friday
    { status: 'CLOSED', startTime: '08:00', endTime: '12:00' }, // 6: Saturday
];

export async function getCurrentSettings(): Promise<Settings> {
    const settings = await prisma.settings.findFirst();
    if (settings) {
        return settings;
    }

    // If no settings exist, grab the first company and create default settings
    const company = await prisma.company.findFirst();
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
    const dayOfWeek = date.getDay(); // 0 is Sunday

    const businessHoursArray = settings.businessHours as Array<{ status: string, startTime: string, endTime: string }> | undefined;
    if (!businessHoursArray || !Array.isArray(businessHoursArray) || businessHoursArray.length !== 7) {
        // Failsafe: if settings are malformed, assume OPEN
        console.warn("Business hours malformed or empty, assuming OPEN");
        return true;
    }

    const todayConfig = businessHoursArray[dayOfWeek];

    if (!todayConfig || todayConfig.status === 'CLOSED') {
        return false;
    }

    if (todayConfig.status === 'SPECIAL') {
        // Optional: could handle special holidays here. For now assume it obeys start/end if special
    }

    const [startHour, startMinute] = todayConfig.startTime.split(':').map(Number);
    const [endHour, endMinute] = todayConfig.endTime.split(':').map(Number);

    // Convert current time to minutes from start of day to compare
    const currentMinutes = date.getHours() * 60 + date.getMinutes();
    const startMinutes = startHour * 60 + startMinute;
    const endMinutes = endHour * 60 + endMinute;

    return currentMinutes >= startMinutes && currentMinutes <= endMinutes;
}
