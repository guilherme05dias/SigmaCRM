import { useEffect, useRef, useState } from 'react';
import { apiRequest } from '../../lib/api';

type ContactAvatarProps = {
    contactId?: string | null;
    avatarUrl?: string | null;
    name: string;
    className: string;
    fetchOnMount?: boolean;
};

const avatarCache = new Map<string, string | null>();
const avatarRequests = new Map<string, Promise<string | null>>();

async function resolveAvatar(contactId: string, refresh = false): Promise<string | null> {
    if (!refresh && avatarCache.has(contactId)) return avatarCache.get(contactId) || null;
    const pending = avatarRequests.get(contactId);
    if (pending) return pending;

    const request = apiRequest<{ avatarUrl: string | null }>(`/api/contacts/${contactId}/avatar${refresh ? '?refresh=1' : ''}`)
        .then(({ avatarUrl }) => {
            avatarCache.set(contactId, avatarUrl);
            return avatarUrl;
        })
        .catch(() => {
            avatarCache.set(contactId, null);
            return null;
        })
        .finally(() => avatarRequests.delete(contactId));
    avatarRequests.set(contactId, request);
    return request;
}

export function ContactAvatar({ contactId, avatarUrl, name, className, fetchOnMount = true }: ContactAvatarProps) {
    const [source, setSource] = useState(avatarUrl || (contactId ? avatarCache.get(contactId) : null) || null);
    const [refreshAttempted, setRefreshAttempted] = useState(false);
    const elementRef = useRef<HTMLElement | null>(null);

    useEffect(() => {
        setRefreshAttempted(false);
        setSource(avatarUrl || (contactId ? avatarCache.get(contactId) : null) || null);
        if (!fetchOnMount || avatarUrl || !contactId) return;

        let active = true;
        const load = () => void resolveAvatar(contactId).then((url) => {
            if (active && url) setSource(url);
        });
        const target = elementRef.current;
        if (!target || typeof IntersectionObserver === 'undefined') {
            load();
            return () => { active = false; };
        }
        const observer = new IntersectionObserver((entries) => {
            if (!entries.some((entry) => entry.isIntersecting)) return;
            observer.disconnect();
            load();
        }, { rootMargin: '160px' });
        observer.observe(target);
        return () => { active = false; observer.disconnect(); };
    }, [avatarUrl, contactId, fetchOnMount]);

    if (source) {
        return (
            <img
                ref={(element) => { elementRef.current = element; }}
                src={source}
                alt=""
                className={`${className} object-cover`}
                loading="lazy"
                onError={() => {
                    if (contactId) avatarCache.set(contactId, null);
                    setSource(null);
                    if (contactId && !refreshAttempted) {
                        setRefreshAttempted(true);
                        void resolveAvatar(contactId, true).then((url) => url && setSource(url));
                    }
                }}
            />
        );
    }

    return (
        <span ref={(element) => { elementRef.current = element; }} className={`${className} flex items-center justify-center bg-primary/10 font-bold text-primary`} aria-hidden="true">
            {name.trim().charAt(0).toUpperCase() || '#'}
        </span>
    );
}
