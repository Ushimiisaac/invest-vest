"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Wordmark } from "@/components/brand";
import { useTheme } from "@/components/theme";
import { Badge, Button, Progress } from "@/components/ui";
import { naira } from "@/lib/utils";
import { buildLabel } from "@/lib/build";
import { cn } from "@/lib/utils";

export type NavItem = { href: string; label: string; icon: ReactNode; badge?: string; hint?: string };

export function NavGroup({ title, items }: { title: string; items: NavItem[] }) {
  const pathname = usePathname();
  return (
    <div className="mb-5">
      <p className="px-3 text-[10.5px] font-bold uppercase tracking-[0.16em] muted">{title}</p>
      <ul className="mt-2 space-y-0.5">
        {items.map((item) => {
          const active = pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(item.href));
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                className={cn(
                  "group flex items-center gap-2.5 rounded-xl px-3 py-2 text-[13.5px] font-medium transition-colors",
                  active
                    ? "bg-brand-600 text-white shadow-[0_10px_24px_-16px_rgb(11_138_101/0.9)]"
                    : "muted hover:bg-[var(--surface-sunken)] hover:text-[var(--text-strong)]",
                )}
              >
                <span className={cn("grid size-5 place-items-center", active ? "text-white" : "text-brand-600 dark:text-brand-300")}>{item.icon}</span>
                <span className="flex-1 truncate">{item.label}</span>
                {item.badge ? (
                  <span className={cn("rounded-full px-1.5 py-0.5 text-[10px] font-bold", active ? "bg-white/20 text-white" : "bg-brand-50 text-brand-700 dark:bg-brand-900/50 dark:text-brand-200")}>
                    {item.badge}
                  </span>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function Sidebar({
  brand,
  user,
  balances,
  kycRequired,
}: {
  brand: string;
  user: { fullName: string; email: string; role: string; kycStatus: string };
  balances: { available: number; locked: number };
  kycRequired: boolean;
}) {
  return (
    <div className="flex h-full flex-col">
      <Link href="/dashboard" className="flex items-center gap-2 px-3 py-4">
        <Wordmark name={brand} />
      </Link>
      {kycRequired ? (
        <Link href="/settings?tab=kyc" className="mx-3 mb-4 rounded-xl border border-amber-300/60 bg-amber-50/70 p-3 text-[12px] leading-snug dark:bg-amber-950/20">
          <p className="font-bold text-amber-800 dark:text-amber-200">Finish identity verification</p>
          <p className="mt-1 muted">Higher limits and real investment products unlock after approval.</p>
        </Link>
      ) : null}
      <div className="mx-3 mb-4 rounded-xl border bg-[var(--surface-raised)] p-3">
        <p className="text-[10.5px] font-bold uppercase tracking-wider muted">Available to move</p>
        <p className="tnum mt-1 text-[19px] font-bold">{naira(balances.available)}</p>
        <div className="mt-2 flex items-center justify-between text-[11.5px]">
          <span className="muted">Locked in plans</span>
          <span className="tnum font-semibold">{naira(balances.locked)}</span>
        </div>
        <Progress value={balances.available + balances.locked > 0 ? (balances.locked / (balances.available + balances.locked)) * 100 : 0} size="sm" className="mt-2" />
      </div>
      <nav className="flex-1 overflow-y-auto px-2 pb-4" aria-label="Dashboard">
        <NavGroup
          title="Money"
          items={[
            { href: "/dashboard", label: "Overview", icon: <I.dash /> },
            { href: "/wallet", label: "Flex wallet", icon: <I.wallet /> },
            { href: "/savings", label: "Goals & plans", icon: <I.target /> },
            { href: "/safelock", label: "SafeLock", icon: <I.lock /> },
            { href: "/groups", label: "Group savings", icon: <I.users /> },
            { href: "/transactions", label: "Transactions", icon: <I.list /> },
          ]}
        />
        <NavGroup
          title="Grow"
          items={[
            { href: "/invest", label: "Investments", icon: <I.chart /> },
            { href: "/rules", label: "Automation", icon: <I.bolt /> },
            { href: "/calculate", label: "Calculators", icon: <I.calc /> },
            { href: "/referrals", label: "Referrals", icon: <I.gift /> },
          ]}
        />
        <NavGroup
          title="Account"
          items={[
            { href: "/notifications", label: "Notifications", icon: <I.bell /> },
            { href: "/support", label: "Help & education", icon: <I.life /> },
            { href: "/settings", label: "Settings & security", icon: <I.gear /> },
            ...(user.role === "admin" || user.role === "support" ? [{ href: "/admin", label: "Admin desk", icon: <I.shield /> }] : []),
          ]}
        />
      </nav>
      <UserCard user={user} />
    </div>
  );
}

function UserCard({ user }: { user: { fullName: string; email: string; role: string } }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative border-t p-3">
      {open ? (
        <div className="absolute bottom-16 left-3 right-3 z-20 rounded-xl border bg-[var(--surface-raised)] p-1.5 shadow-[var(--shadow-float)]">
          <Link href="/settings" onClick={() => setOpen(false)} className="block rounded-lg px-3 py-2 text-[13px] font-medium hover:bg-[var(--surface-sunken)]">
            Profile & security
          </Link>
          <Link href="/settings?tab=kyc" onClick={() => setOpen(false)} className="block rounded-lg px-3 py-2 text-[13px] font-medium hover:bg-[var(--surface-sunken)]">
            Identity verification
          </Link>
          <button
            onClick={async () => {
              const token = localStorage.getItem("ss-session-token");
              await fetch("/api/auth/logout", {
                method: "POST",
                headers: token ? { "x-ss-session": token, "Content-Type": "application/json" } : undefined,
              }).catch(() => null);
              localStorage.removeItem("ss-session-token");
              window.location.assign("/");
            }}
            className="w-full rounded-lg px-3 py-2 text-left text-[13px] font-medium text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30"
          >
            Sign out
          </button>
        </div>
      ) : null}
      <button onClick={() => setOpen((v) => !v)} className="flex w-full items-center gap-2.5 rounded-xl p-2 text-left hover:bg-[var(--surface-sunken)]" aria-expanded={open}>
        <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-brand-600 text-[12px] font-bold text-white">
          {user.fullName.slice(0, 1).toUpperCase()}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-semibold">{user.fullName}</span>
          <span className="block truncate text-[11.5px] muted">{user.role === "admin" ? "Administrator" : user.email}</span>
        </span>
      </button>
    </div>
  );
}

const TITLES: [RegExp, string][] = [
  [/^\/dashboard/, "Financial overview"],
  [/^\/wallet/, "Flex wallet"],
  [/^\/savings\/[^/]+/, "Savings plan"],
  [/^\/savings/, "Goals & plans"],
  [/^\/safelock/, "SafeLock"],
  [/^\/groups/, "Group savings"],
  [/^\/transactions/, "Transaction ledger"],
  [/^\/invest/, "Investment desk"],
  [/^\/rules/, "Savings automation"],
  [/^\/calculate/, "Financial calculators"],
  [/^\/notifications/, "Notification centre"],
  [/^\/referrals/, "Referrals & rewards"],
  [/^\/support/, "Help & education"],
  [/^\/settings\/kyc|^\/settings/, "Settings & security"],
  [/^\/admin/, "Administration desk"],
  [/^\/pay/, "Secure checkout"],
];

export function Topbar({
  notifications,
  unread,
  demoMode,
}: {
  notifications: { id: string; title: string; body: string; severity: string; createdAt: string; link: string | null }[];
  unread: number;
  demoMode: boolean;
}) {
  const { theme, toggle } = useTheme();
  const [openBell, setOpenBell] = useState(false);
  const [openMobile, setOpenMobile] = useState(false);
  const bellRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const pathname = usePathname();
  const title = TITLES.find(([re]) => re.test(pathname))?.[1] ?? "IncreaseVest";

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (bellRef.current && !bellRef.current.contains(e.target as Node)) setOpenBell(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  return (
    <header className="sticky top-0 z-30 border-b bg-[color-mix(in_oklab,var(--surface)_90%,transparent)] backdrop-blur-xl">
      <div className="flex h-14 items-center gap-2 px-3 sm:px-5">
        <button onClick={() => setOpenMobile((v) => !v)} className="grid size-9 place-items-center rounded-lg border lg:hidden" aria-label="Toggle menu">
          <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M4 7h16M4 12h16M4 17h16" strokeLinecap="round" />
          </svg>
        </button>
        <h1 className="truncate text-[15px] font-bold tracking-tight sm:text-[16px]">{title}</h1>
        <span className="hidden rounded-md border px-1.5 py-0.5 font-mono text-[10.5px] muted md:inline" title="Deployed build">
          {buildLabel()}
        </span>
        {!demoMode ? <Badge tone="gold" className="hidden sm:inline-flex">Simulation rails</Badge> : null}
        <div className="ml-auto flex items-center gap-1.5">
          <button
            onClick={() => router.push("/wallet?tab=deposit")}
            className="hidden rounded-lg border bg-[var(--surface-raised)] px-3 py-1.5 text-[12.5px] font-semibold hover:border-brand-500 sm:inline-flex"
          >
            + Fund wallet
          </button>
          <button onClick={toggle} aria-label="Toggle colour theme" className="grid size-9 place-items-center rounded-lg border bg-[var(--surface-raised)] hover:border-brand-500">
            {theme === "dark" ? (
              <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.8">
                <circle cx="12" cy="12" r="4" />
                <path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M19 5l-1.5 1.5M6.5 17.5L5 19" strokeLinecap="round" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M20 13.5A8 8 0 1 1 10.5 4a6.5 6.5 0 0 0 9.5 9.5Z" strokeLinejoin="round" />
              </svg>
            )}
          </button>
          <div className="relative" ref={bellRef}>
            <button
              onClick={() => setOpenBell((v) => !v)}
              aria-label={`Notifications, ${unread} unread`}
              className="relative grid size-9 place-items-center rounded-lg border bg-[var(--surface-raised)] hover:border-brand-500"
            >
              <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M18 15V10a6 6 0 1 0-12 0v5l-1.6 2.4h15.2L18 15ZM10 20.5a2.2 2.2 0 0 0 4 0" strokeLinejoin="round" />
              </svg>
              {unread > 0 ? (
                <span className="absolute -right-1 -top-1 grid min-w-4 place-items-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">{unread}</span>
              ) : null}
            </button>
            {openBell ? (
              <div className="absolute right-0 top-11 z-40 w-[min(92vw,360px)] overflow-hidden rounded-xl border bg-[var(--surface-raised)] shadow-[var(--shadow-float)]">
                <div className="flex items-center justify-between border-b px-3.5 py-2.5">
                  <p className="text-[13px] font-bold">Recent activity</p>
                  <Link href="/notifications" className="text-[12px] font-semibold text-brand-600 hover:underline dark:text-brand-300">
                    View all
                  </Link>
                </div>
                <div className="max-h-80 divide-y overflow-y-auto">
                  {notifications.length === 0 ? (
                    <p className="px-3.5 py-6 text-center text-[12.5px] muted">Nothing yet. Fund a plan or set a rule and updates land here.</p>
                  ) : (
                    notifications.slice(0, 8).map((n) => (
                      <Link key={n.id} href={n.link ?? "/notifications"} onClick={() => setOpenBell(false)} className="block px-3.5 py-2.5 hover:bg-[var(--surface-sunken)]">
                        <div className="flex items-start gap-2">
                          <span
                            className={cn(
                              "mt-1 size-1.5 shrink-0 rounded-full",
                              n.severity === "success" && "bg-brand-500",
                              n.severity === "warning" && "bg-amber-500",
                              n.severity === "danger" && "bg-rose-500",
                              n.severity === "info" && "bg-sky-500",
                            )}
                          />
                          <div className="min-w-0">
                            <p className="truncate text-[12.5px] font-semibold">{n.title}</p>
                            <p className="mt-0.5 line-clamp-2 text-[11.5px] muted">{n.body}</p>
                          </div>
                        </div>
                      </Link>
                    ))
                  )}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>
      {openMobile ? (
        <div className="border-t bg-[var(--surface-raised)] px-3 py-2 lg:hidden">
          <div className="grid grid-cols-2 gap-1.5">
            {[
              { href: "/dashboard", label: "Overview" },
              { href: "/wallet", label: "Flex wallet" },
              { href: "/savings", label: "Goals" },
              { href: "/safelock", label: "SafeLock" },
              { href: "/groups", label: "Groups" },
              { href: "/invest", label: "Invest" },
              { href: "/rules", label: "Automation" },
              { href: "/settings", label: "Settings" },
            ].map((l) => (
              <Link
                key={l.href}
                href={l.href}
                onClick={() => setOpenMobile(false)}
                className={cn("rounded-lg px-3 py-2 text-[13px] font-medium", pathname === l.href ? "bg-brand-600 text-white" : "muted hover:bg-[var(--surface-sunken)]")}
              >
                {l.label}
              </Link>
            ))}
          </div>
          <Button href="/wallet?tab=deposit" size="sm" className="mt-2 w-full">
            Fund wallet
          </Button>
        </div>
      ) : null}
    </header>
  );
}

export function AppShell({
  brand,
  user,
  balances,
  notifications,
  unread,
  kycRequired,
  demoMode,
  children,
}: {
  brand: string;
  user: { fullName: string; email: string; role: string; kycStatus: string };
  balances: { available: number; locked: number };
  notifications: { id: string; title: string; body: string; severity: string; createdAt: string; link: string | null }[];
  unread: number;
  kycRequired: boolean;
  demoMode: boolean;
  children: ReactNode;
}) {
  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[264px_1fr]">
      <aside className="sticky top-0 hidden h-dvh border-r bg-[var(--surface-raised)] lg:block">
        <Sidebar brand={brand} user={user} balances={balances} kycRequired={kycRequired} />
      </aside>
      <div className="min-w-0">
        <Topbar notifications={notifications} unread={unread} demoMode={demoMode} />
        <main id="main" className="mx-auto w-full max-w-[1180px] px-3.5 py-5 sm:px-5 sm:py-7">
          {children}
        </main>
      </div>
    </div>
  );
}

/* --------------------------- inline icon set -------------------------- */

const base = { viewBox: "0 0 24 24", className: "size-4.5", fill: "none", stroke: "currentColor", strokeWidth: 1.8 } as const;
export const I = {
  dash: () => (
    <svg {...base}>
      <rect x="3" y="3" width="8" height="8" rx="2" />
      <rect x="13" y="3" width="8" height="5" rx="2" />
      <rect x="13" y="11" width="8" height="10" rx="2" />
      <rect x="3" y="14" width="8" height="7" rx="2" />
    </svg>
  ),
  wallet: () => (
    <svg {...base}>
      <rect x="3" y="6" width="18" height="13" rx="3" />
      <path d="M16 12.5h2" strokeLinecap="round" />
      <path d="M3 9h18" />
    </svg>
  ),
  target: () => (
    <svg {...base}>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="4.5" />
      <circle cx="12" cy="12" r="1" />
    </svg>
  ),
  lock: () => (
    <svg {...base}>
      <rect x="4.5" y="10" width="15" height="10" rx="2.5" />
      <path d="M8 10V7.5a4 4 0 0 1 8 0V10" />
    </svg>
  ),
  users: () => (
    <svg {...base}>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3.5 20c.6-3.4 2.9-5.2 5.5-5.2S14 16.6 14.6 20" strokeLinecap="round" />
      <path d="M16 5.4a3.2 3.2 0 0 1 0 6M18 14.9c1.9.6 3 2.4 3.4 5.1" strokeLinecap="round" />
    </svg>
  ),
  list: () => (
    <svg {...base}>
      <path d="M4 6h16M4 12h16M4 18h10" strokeLinecap="round" />
    </svg>
  ),
  chart: () => (
    <svg {...base}>
      <path d="M4 19V5M4 19h16" strokeLinecap="round" />
      <path d="M8 15l3.5-4.5L15 14l4-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  bolt: () => (
    <svg {...base}>
      <path d="M13 3L5 14h5l-1 7 8-11h-5l1-7Z" strokeLinejoin="round" />
    </svg>
  ),
  calc: () => (
    <svg {...base}>
      <rect x="5" y="3" width="14" height="18" rx="2.5" />
      <path d="M8.5 7.5h7M8.5 12h2M13.5 12h2M8.5 16h2M13.5 16h2" strokeLinecap="round" />
    </svg>
  ),
  gift: () => (
    <svg {...base}>
      <rect x="3.5" y="9" width="17" height="11.5" rx="2" />
      <path d="M3.5 13h17M12 9v11.5" />
      <path d="M8.5 9a2.5 2.5 0 1 1 0-5C10.5 4 12 9 12 9M15.5 9a2.5 2.5 0 1 0 0-5C13.5 4 12 9 12 9" />
    </svg>
  ),
  bell: () => (
    <svg {...base}>
      <path d="M18 15V10a6 6 0 1 0-12 0v5l-1.6 2.4h15.2L18 15ZM10 20.5a2.2 2.2 0 0 0 4 0" strokeLinejoin="round" />
    </svg>
  ),
  life: () => (
    <svg {...base}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M9.5 9.5a2.6 2.6 0 1 1 3.6 2.4c-.7.3-1.1.9-1.1 1.7" strokeLinecap="round" />
      <circle cx="12" cy="17" r="0.8" fill="currentColor" stroke="none" />
    </svg>
  ),
  gear: () => (
    <svg {...base}>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3v2.2M12 18.8V21M4.2 7.5l1.9 1.1M17.9 15.4l1.9 1.1M4.2 16.5l1.9-1.1M17.9 8.6l1.9-1.1" strokeLinecap="round" />
    </svg>
  ),
  shield: () => (
    <svg {...base}>
      <path d="M12 3l7 3v6c0 4.2-2.9 7.6-7 9-4.1-1.4-7-4.8-7-9V6l7-3Z" strokeLinejoin="round" />
    </svg>
  ),
  eye: () => (
    <svg {...base}>
      <path d="M2.5 12S6.5 5.5 12 5.5 21.5 12 21.5 12 17.5 18.5 12 18.5 2.5 12 2.5 12Z" />
      <circle cx="12" cy="12" r="2.6" />
    </svg>
  ),
};
