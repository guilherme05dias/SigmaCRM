"use client";

import Link from "next/link";
import type { ComponentType } from "react";
import { usePathname } from "next/navigation";
import {
  Building2,
  CalendarDays,
  ClipboardList,
  LayoutDashboard,
  MessageCircle,
  Users,
  Wrench
} from "lucide-react";
import { clsx } from "clsx";
import { hasPermission, type Permission } from "@/lib/access-control";
import type { SupabaseConfigState } from "@/lib/supabase";
import type { AuthSession } from "@/lib/types";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, permission: "route:dashboard" },
  { href: "/atendimentos", label: "Atendimentos", icon: ClipboardList, permission: "route:attendances" },
  { href: "/clientes", label: "Clientes", icon: Building2, permission: "route:clients" },
  { href: "/tecnicos", label: "Técnicos", icon: Wrench, permission: "route:technicians" },
  { href: "/usuarios", label: "Usuários", icon: Users, permission: "route:users" },
  { href: "/whatsapp", label: "WhatsApp", icon: MessageCircle, permission: "route:whatsapp" },
  { href: "/resumo", label: "Resumo", icon: CalendarDays, permission: "route:summary" }
] satisfies Array<{
  href: string;
  label: string;
  icon: ComponentType<{ size?: number }>;
  permission: Permission;
}>;

export function AppShell({
  children,
  supabaseConfig,
  currentUser
}: {
  children: React.ReactNode;
  supabaseConfig: SupabaseConfigState;
  currentUser: AuthSession;
}) {
  const pathname = usePathname();

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">S</div>
          <div>
            <strong>ServiçoCRM</strong>
            <span>Operação técnica</span>
          </div>
        </div>

        <nav className="nav-list" aria-label="Navegação principal">
          {navItems.filter((item) => hasPermission(currentUser.role, item.permission)).map((item) => {
            const Icon = item.icon;
            const active = pathname === item.href.split("?")[0];
            return (
              <Link className={clsx("nav-item", active && "nav-item-active")} href={item.href} key={item.href}>
                <Icon size={18} />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="sidebar-footer">
          <span>Perfil atual</span>
          <strong>{currentUser.fullName}</strong>
          <span>{currentUser.role}</span>
          <Link className="logout-link" href="/logout">
            Sair
          </Link>
        </div>
      </aside>

      <div className="content-shell">
        <div className="topbar">
          <div>
            <span className="topbar-label">Versão web</span>
            <strong>Migração em andamento</strong>
          </div>
          <div className={clsx("connection-pill", `connection-pill-${supabaseConfig.status}`)}>
            <span aria-hidden className="connection-pill-dot" />
            <span>{supabaseConfig.label}</span>
          </div>
        </div>
        <main className="main-content">{children}</main>
      </div>
    </div>
  );
}
