import { describe, expect, it } from 'vitest';
import { providerTimestampToDate, selectMessagesAfter, shouldReconcileRecentChat } from './uazApiReconciliation.service';

describe('UAZAPI reconciliation helpers', () => {
    it('normalizes timestamps in seconds and milliseconds', () => {
        expect(providerTimestampToDate(1_784_548_663)?.toISOString()).toBe('2026-07-20T11:57:43.000Z');
        expect(providerTimestampToDate(1_784_548_663_000)?.toISOString()).toBe('2026-07-20T11:57:43.000Z');
    });

    it('detects recent provider activity that is newer than the CRM', () => {
        expect(shouldReconcileRecentChat({
            providerLastMessageAt: Date.parse('2026-07-20T12:00:00Z'),
            unreadCount: 0,
            persistedLastMessageAt: new Date('2026-07-20T11:59:00Z'),
            now: new Date('2026-07-20T12:01:00Z'),
        })).toBe(true);
    });

    it('does not depend on the provider unread counter when activity is newer', () => {
        expect(shouldReconcileRecentChat({
            providerLastMessageAt: Date.parse('2026-07-20T12:00:00Z'),
            unreadCount: 0,
            persistedLastMessageAt: null,
            now: new Date('2026-07-20T12:01:00Z'),
        })).toBe(true);
    });

    it('ignores stale chats outside the lookback window', () => {
        expect(shouldReconcileRecentChat({
            providerLastMessageAt: Date.parse('2026-07-10T12:00:00Z'),
            unreadCount: 4,
            persistedLastMessageAt: null,
            now: new Date('2026-07-20T12:01:00Z'),
            lookbackMs: 48 * 60 * 60 * 1000,
        })).toBe(false);
    });

    it('selects only messages after the persisted cutoff', () => {
        const selected = selectMessagesAfter('5549999999999', [
            { direction: 'INBOUND', type: 'TEXT', body: 'old', waMessageId: 'old', timestamp: Date.parse('2026-07-20T11:58:00Z') },
            { direction: 'INBOUND', type: 'TEXT', body: 'new', waMessageId: 'new', timestamp: Date.parse('2026-07-20T12:00:00Z') },
        ], new Date('2026-07-20T11:59:00Z'));

        expect(selected.map((message) => message.waMessageId)).toEqual(['new']);
    });
});
