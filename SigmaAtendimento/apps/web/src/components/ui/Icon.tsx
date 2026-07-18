import {
    LayoutGrid, Search, Bell, MessageCircle, LayoutDashboard, MessageSquare,
    MessagesSquare, Ticket, Building2, Users, BarChart3, Settings, Wrench,
    UserPlus, Pencil, Trash2, Clock, Smartphone, Eye, LogIn, Ban, ShieldCheck,
    UserCog, BadgeCheck, CheckCircle2, Smile, CircleAlert, QrCode, Save, Info,
    ListFilter, Hammer, Network, Mail, Lock, Sun, Moon, ChevronDown, Reply, SmilePlus, Menu, X,
    History, TicketPlus, CircleX, ArrowRightLeft, ArrowLeft, UserRoundCheck, type LucideIcon,
} from 'lucide-react';
import { cn } from '../../lib/utils';

// ─────────────────────────────────────────────────────────────────────────────
// Icon — registro central de ícones (lucide-react).
// Mapeia os nomes legados (ex Material Symbols) para componentes Lucide, de modo
// que o resto do app usa <Icon name="..." /> sem conhecer a lib de ícones.
// ─────────────────────────────────────────────────────────────────────────────
const registry = {
    // navegação / chrome
    grid_view: LayoutGrid,
    hub: Network,
    dashboard: LayoutDashboard,
    chat: MessageSquare,
    chat_bubble: MessageCircle,
    forum: MessagesSquare,
    local_activity: Ticket,
    confirmation_number: Ticket,
    business: Building2,
    domain: Building2,
    domain_add: Building2,
    add_business: Building2,
    group: Users,
    groups: Users,
    bar_chart: BarChart3,
    settings: Settings,
    search: Search,
    notifications: Bell,
    light_mode: Sun,
    dark_mode: Moon,
    menu: Menu,
    // ações
    filter_list: ListFilter,
    person_add: UserPlus,
    edit: Pencil,
    delete: Trash2,
    block: Ban,
    save: Save,
    login: LogIn,
    visibility: Eye,
    mail: Mail,
    lock: Lock,
    // status / domínio
    schedule: Clock,
    phonelink_setup: Smartphone,
    qr_code_2: QrCode,
    engineering: Wrench,
    build: Hammer,
    verified_user: ShieldCheck,
    manage_accounts: UserCog,
    domain_verification: BadgeCheck,
    task_alt: CheckCircle2,
    check_circle: CheckCircle2,
    sentiment_satisfied: Smile,
    error: CircleAlert,
    info: Info,
    expand_more: ChevronDown,
    reply: Reply,
    add_reaction: SmilePlus,
    history: History,
    add_ticket: TicketPlus,
    call_end: CircleX,
    swap_horiz: ArrowRightLeft,
    arrow_back: ArrowLeft,
    person_check: UserRoundCheck,
    close: X,
} satisfies Record<string, LucideIcon>;

export type IconName = keyof typeof registry;

interface IconProps {
    name: IconName;
    className?: string;
    /** Tamanho em px (default 20). Prefira `className="size-N"` quando possível. */
    size?: number;
    strokeWidth?: number;
    'aria-hidden'?: boolean;
}

export function Icon({ name, className, size, strokeWidth, ...rest }: IconProps) {
    const Cmp = registry[name];
    return <Cmp className={cn('shrink-0', className)} size={size} strokeWidth={strokeWidth} aria-hidden {...rest} />;
}
