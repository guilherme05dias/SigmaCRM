import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { canOperateConversation, canReadAllConversations } from './conversationAuthorization';

describe('acompanhamento global de conversas', () => {
    it('@spec:AC-010 concede a capability ao Carlos sem alterar seu perfil técnico', () => {
        const migration = readFileSync(
            'supabase/migrations/20260807163220_add_conversation_oversight_permission.sql',
            'utf8',
        );
        const carlosGrantMigration = readFileSync(
            'supabase/migrations/20260807164526_grant_carlos_conversation_oversight.sql',
            'utf8',
        );

        expect(migration).toContain('can_view_all_conversations');
        expect(migration).toContain('carlos@dragonbyte.com');
        expect(carlosGrantMigration).toContain('carlos@sigmapdv.com');
        expect(canReadAllConversations({
            id: 'carlos-id',
            role: 'TECHNICIAN',
            canViewAllConversations: true,
        })).toBe(true);
    });

    it('@spec:AC-011 mantém ações de terceiros restritas para a capability de leitura', () => {
        const carlos = {
            id: 'carlos-id',
            role: 'TECHNICIAN',
            canViewAllConversations: true,
        };

        expect(canOperateConversation(carlos, { assignedUserId: 'outra-pessoa' })).toBe(false);
        expect(canOperateConversation(carlos, { assignedUserId: 'carlos-id' })).toBe(true);
    });
});
