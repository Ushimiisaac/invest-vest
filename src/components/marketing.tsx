"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useTheme } from "@/components/theme";
import { Wordmark } from "@/components/brand";
import { Button } from "@/components/ui";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "#products", label: "Products" },
  { href: "#how", label: "How it works" },
  { href: "/calculate", label: "Calculators" },
  { href: "/demo", label: "Live demo" },
  { href: "/products", label: "Invest" },
  { href: "#security", label: "Security" },
  { href: "/help", label: "Help" },
];

export function SiteNav({ brand, authed }: { brand: string; authed: boolean }) {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const { theme, toggle } = useTheme();
  void open;
  void setOpen;

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={cn(
        "sticky top-0 z-40 transition-all",
        scrolled ? "border-b bg-[color-mix(in_oklab,var(--surface)_88%,transparent)] backdrop-blur-xl" : "border-b border-transparent",
      )}
    >
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link href="/" className="rounded-lg" aria-label={`${brand} home`}>
          <Wordmark name={brand} />
        </Link>
        <nav className="hidden items-center gap-1 lg:flex" aria-label="Main">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-lg px-3 py-2 text-[13.5px] font-medium muted transition-colors hover:bg-[var(--surface-sunken)] hover:text-[var(--text-strong)]"
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <button
            onClick={toggle}
            aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
            className="grid size-9 place-items-center rounded-lg border bg-[var(--surface-raised)] hover:border-brand-500"
          >
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
          {authed ? (
            <Button href="/dashboard" size="sm">
              Open dashboard
            </Button>
          ) : (
            <>
              <Button href="/login" size="sm" variant="ghost" className="hidden sm:inline-flex">
                Log in
              </Button>
              <Button href="/register" size="sm">
                Create free account
              </Button>
            </>
          )}
          <button
            onClick={() => setOpen((v) => !v)}
            aria-label="Toggle navigation menu"
            aria-expanded={open}
            className="grid size-9 place-items-center rounded-lg border lg:hidden"
          >
            <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2">
              {open ? <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" /> : <path d="M4 7h16M4 12h16M4 17h16" strokeLinecap="round" />}
            </svg>
          </button>
        </div>
      </div>
      {open ? (
        <div className="border-t bg-[var(--surface-raised)] lg:hidden">
          <nav className="mx-auto grid max-w-6xl gap-1 px-4 py-3">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className="rounded-lg px-3 py-2.5 text-sm font-medium hover:bg-[var(--surface-sunken)]"
              >
                {item.label}
              </Link>
            ))}
            {!authed ? (
              <Link href="/login" onClick={() => setOpen(false)} className="rounded-lg px-3 py-2.5 text-sm font-medium hover:bg-[var(--surface-sunken)]">
                Log in
              </Link>
            ) : null}
          </nav>
        </div>
      ) : null}
    </header>
  );
}

const FOOTER_COLS = [
  {
    title: "Products",
    links: [
      { label: "SafeLock", href: "/register" },
      { label: "Target savings", href: "/register" },
      { label: "Flex wallet", href: "/register" },
      { label: "Group savings", href: "/register" },
      { label: "Investments", href: "/products" },
    ],
  },
  {
    title: "Tools",
    links: [
      { label: "Savings calculator", href: "/calculate" },
      { label: "Investment calculator", href: "/calculate?tab=invest" },
      { label: "Goal planner", href: "/calculate?tab=goal" },
      { label: "Plan comparison", href: "/calculate?tab=compare" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "Help centre", href: "/help" },
      { label: "Financial education", href: "/help?tab=education" },
      { label: "Security", href: "/legal/security" },
      { label: "Contact support", href: "/help?tab=contact" },
    ],
  },
  {
    title: "Legal",
    links: [
      { label: "Terms of use", href: "/legal/terms" },
      { label: "Privacy policy", href: "/legal/privacy" },
      { label: "Fees & charges", href: "/legal/fees" },
      { label: "Risk disclosure", href: "/legal/risk" },
    ],
  },
];

export function SiteFooter({ brand, legalName }: { brand: string; legalName: string }) {
  return (
    <footer className="mt-24 border-t bg-[var(--surface-raised)]">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 sm:px-6 lg:grid-cols-[1.4fr_repeat(4,1fr)]">
        <div>
          <Wordmark name={brand} />
          <p className="mt-4 max-w-xs text-[13px] leading-relaxed muted">
            Savings, targets, group pooling and investment tracking in one secure account built for Nigerian realities.
          </p>
          <div className="mt-5 flex flex-wrap gap-2 text-[11px] font-semibold">
            <span className="rounded-md border px-2 py-1 muted">BVN/NIN KYC ready</span>
            <span className="rounded-md border px-2 py-1 muted">PCI-aligned checkout</span>
          </div>
        </div>
        {FOOTER_COLS.map((col) => (
          <div key={col.title}>
            <p className="text-[12px] font-bold uppercase tracking-wider">{col.title}</p>
            <ul className="mt-3 space-y-2">
              {col.links.map((l) => (
                <li key={l.label}>
                  <Link href={l.href} className="text-[13px] muted transition-colors hover:text-brand-600">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-6 text-[12px] muted sm:px-6 md:flex-row md:items-center md:justify-between">
          <p>
            © {new Date().getFullYear()} {legalName}. {brand} is a technology platform; investment products shown in simulation are
            illustrative only and are not offers to invest.
          </p>
          <p className="shrink-0">Regulatory filings & licences appear in the admin product registry.</p>
        </div>
      </div>
    </footer>
  );
}
