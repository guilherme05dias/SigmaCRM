import { canViewAll } from '../middlewares/authorization.middleware';

type ConversationAccessUser = {
    id?: string | null;
    role?: string | null;
    canViewAllConversations?: boolean | null;
};

type ConversationAssignment = {
    assignedUserId?: string | null;
};

export function canReadAllConversations(user?: ConversationAccessUser | null) {
    return canViewAll(user?.role) || user?.canViewAllConversations === true;
}

export function canOperateConversation(
    user: ConversationAccessUser | null | undefined,
    conversation: ConversationAssignment,
) {
    if (canViewAll(user?.role)) return true;
    return Boolean(user?.id && conversation.assignedUserId === user.id);
}
