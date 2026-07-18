const BRAZIL_COUNTRY_CODE = '55';
const MOBILE_SUBSCRIBER_PREFIXES = new Set(['6', '7', '8', '9']);

export function phoneDigits(value: string | null | undefined) {
    return String(value || '').replace(/\D/g, '');
}

/**
 * Stores Brazilian numbers as 55 + DDD + subscriber number. WhatsApp may
 * return older mobile accounts without the ninth digit, so that digit is
 * restored when the eight-digit subscriber starts with a mobile prefix.
 */
export function normalizePhone(value: string | null | undefined) {
    const digits = phoneDigits(value);
    if (!digits) return '';

    if (digits.startsWith(BRAZIL_COUNTRY_CODE)) {
        if (digits.length === 12 && MOBILE_SUBSCRIBER_PREFIXES.has(digits[4])) {
            return `${digits.slice(0, 4)}9${digits.slice(4)}`;
        }
        return digits;
    }

    if (digits.length === 10) {
        const withNinthDigit = MOBILE_SUBSCRIBER_PREFIXES.has(digits[2])
            ? `${digits.slice(0, 2)}9${digits.slice(2)}`
            : digits;
        return `${BRAZIL_COUNTRY_CODE}${withNinthDigit}`;
    }

    if (digits.length === 11) {
        return `${BRAZIL_COUNTRY_CODE}${digits}`;
    }

    return digits;
}

/**
 * Includes canonical, national and legacy WhatsApp variants so records made
 * before the canonical format was adopted can still be located and repaired.
 */
export function phoneAliases(value: string | null | undefined) {
    const raw = phoneDigits(value);
    const canonical = normalizePhone(raw);
    const aliases = new Set<string>();

    if (raw) aliases.add(raw);
    if (canonical) aliases.add(canonical);

    if (canonical.startsWith(BRAZIL_COUNTRY_CODE) && (canonical.length === 12 || canonical.length === 13)) {
        aliases.add(canonical.slice(2));

        if (canonical.length === 13 && canonical[4] === '9') {
            const legacyInternational = `${canonical.slice(0, 4)}${canonical.slice(5)}`;
            aliases.add(legacyInternational);
            aliases.add(legacyInternational.slice(2));
        }
    }

    return [...aliases].filter((phone) => phone.length >= 10);
}
