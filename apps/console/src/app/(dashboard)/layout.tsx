"use client";

import React, { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  Sidebar,
  Topbar,
  StatusDot,
  Badge,
  type SidebarSection,
} from "@liveflow/design-system";
import {
  IconOverview,
  IconMonitoring,
  IconStudio,
  IconAdmin,
  IconChat,
  IconAnalytics,
  IconLogout,
} from "@/components/NavIcons";
import {
  clearAuth,
  getStoredUser,
  getToken,
  decodeJwtPayload,
} from "@liveflow/api-client";

// Ruoli abilitati alla Console agenzia. Le CREATOR usano l'app Creator dedicata.
const AGENCY_ROLES = ["OWNER", "MANAGER", "CHATTER"];

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement {
  const pathname = usePathname();
  const router = useRouter();
  const user = getStoredUser();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [authReady, setAuthReady] = useState(false);

  // Auth guard: senza token si va al login (niente accesso al gestionale senza sessione).
  // Inoltre la Console è riservata allo staff agenzia: un token con ruolo non abilitato
  // (es. una CREATOR, che usa l'app Creator) o senza ruolo (sessione stale) viene
  // invalidato e rimandato al login. Difesa lato client speculare al gate del login.
  useEffect(() => {
    const t = getToken();
    if (!t) {
      router.replace("/login");
      return;
    }
    const role = decodeJwtPayload(t)?.["role"];
    if (typeof role !== "string" || !AGENCY_ROLES.includes(role)) {
      clearAuth();
      router.replace("/login");
      return;
    }
    setAuthReady(true);
  }, [router]);

  if (!authReady) return <></>;

  const handleLogout = () => {
    clearAuth();
    router.push("/login");
  };

  // Ruolo dal TOKEN (fonte di verità), con fallback allo user salvato.
  const token = getToken();
  const tokenRole =
    (token ? (decodeJwtPayload(token)?.["role"] as string | undefined) : undefined) ??
    user?.role;
  const canAdmin = tokenRole === "OWNER" || tokenRole === "MANAGER";

  const navSections: SidebarSection[] = [
    {
      id: "main",
      items: [
        {
          id: "overview",
          label: "Overview",
          icon: <IconOverview />,
          href: "/",
          active: pathname === "/",
        },
        {
          id: "monitoring",
          label: "Monitoring",
          icon: <IconMonitoring />,
          href: "/monitoring",
          active: pathname === "/monitoring",
        },
        {
          id: "studio",
          label: "Studio",
          icon: <IconStudio />,
          href: "/studio",
          active: pathname === "/studio",
        },
        {
          id: "multibrowser",
          label: "Multi-Browser",
          icon: <IconMonitoring />,
          href: "/multibrowser",
          active: pathname === "/multibrowser",
        },
        ...(canAdmin
          ? [
              {
                id: "admin",
                label: "Admin",
                icon: <IconAdmin />,
                href: "/admin",
                active: pathname === "/admin",
              },
            ]
          : []),
      ],
    },
    {
      id: "coming-soon",
      label: "Coming Soon",
      items: [
        {
          id: "chat",
          label: "Chat",
          icon: <IconChat className="opacity-40" />,
          badge: (
            <Badge variant="default" size="sm">
              Soon
            </Badge>
          ),
          active: false,
        },
        {
          id: "analytics",
          label: "Analytics",
          icon: <IconAnalytics className="opacity-40" />,
          badge: (
            <Badge variant="default" size="sm">
              Soon
            </Badge>
          ),
          active: false,
        },
      ],
    },
  ];

  return (
    <div className="flex h-screen bg-bg-base overflow-hidden">
      <Sidebar
        sections={navSections}
        collapsed={sidebarCollapsed}
        logo={<SidebarLogo collapsed={sidebarCollapsed} />}
        footer={
          <button
            onClick={() => setSidebarCollapsed((v) => !v)}
            title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            className="flex items-center gap-2 w-full text-xs text-text-muted hover:text-text-primary transition-colors duration-fast rounded-lg p-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
            aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            <span aria-hidden="true">{sidebarCollapsed ? "→" : "←"}</span>
            {!sidebarCollapsed && <span>Collapse</span>}
          </button>
        }
      />

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <Topbar
          title={<PageTitle pathname={pathname} />}
          right={
            <TopbarRight
              user={user ? { email: user.email, role: tokenRole ?? user.role } : null}
              onLogout={handleLogout}
            />
          }
        />

        <main className="flex-1 overflow-y-auto p-6 animate-fade-in">
          {children}
        </main>
      </div>
    </div>
  );
}

function SidebarLogo({ collapsed }: { collapsed: boolean }): React.ReactElement {
  return (
    <div className="flex items-center gap-2">
      <svg
        width="28"
        height="28"
        viewBox="0 0 32 32"
        fill="none"
        aria-label="LiveFlow Console"
        xmlns="http://www.w3.org/2000/svg"
        className="flex-shrink-0"
      >
        <rect width="32" height="32" rx="8" fill="var(--lf-primary)" />
        <path
          d="M8 20 L13 12 L16 17 L19 14 L24 20"
          stroke="white"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
        <circle cx="24" cy="10" r="3" fill="var(--lf-live)" />
      </svg>
      {!collapsed && (
        <span className="text-base font-bold text-text-primary tracking-tight">
          LiveFlow
        </span>
      )}
    </div>
  );
}

const PAGE_TITLES: Record<string, string> = {
  "/": "Overview",
  "/monitoring": "Monitoring",
  "/studio": "Live Studio",
  "/multibrowser": "Multi-Browser",
  "/admin": "Admin",
  "/showcase": "Showcase",
};

function PageTitle({ pathname }: { pathname: string }): React.ReactElement {
  const title = PAGE_TITLES[pathname] ?? "Console";
  return <span>{title}</span>;
}

function TopbarRight({
  user,
  onLogout,
}: {
  user: { email: string; role: string } | null;
  onLogout: () => void;
}): React.ReactElement {
  return (
    <div className="flex items-center gap-3">
      <StatusDot status="success" showLabel size="sm" label="API Online" />

      {user && (
        <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-bg-elevated border border-border">
          <div className="w-6 h-6 rounded-full bg-primary/30 flex items-center justify-center">
            <span className="text-xs font-bold text-primary-hover uppercase">
              {user.email[0]}
            </span>
          </div>
          <span className="text-sm font-medium text-text-primary hidden sm:block">
            {user.email.split("@")[0]}
          </span>
          <Badge variant="primary" size="sm">
            {user.role}
          </Badge>
        </div>
      )}

      <button
        onClick={onLogout}
        title="Sign out"
        aria-label="Sign out"
        className="p-1.5 rounded-lg text-text-muted hover:text-danger hover:bg-danger-muted transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
      >
        <IconLogout />
      </button>
    </div>
  );
}
