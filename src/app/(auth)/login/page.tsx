import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthShell, DemoLoginBlock, LoginForm, SessionNotice } from "@/components/auth-forms";
import { getCurrentUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Sign in" };
export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ reason?: string; next?: string }> }) {
  const { reason, next } = await searchParams;
  if (await getCurrentUser()) redirect(next ?? "/dashboard");
  return (
    <AuthShell title="Welcome back" subtitle="Sign in to check balances, move money and review your goals.">
      <Link
        href="/demo"
        className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-brand-500/40 bg-brand-50/70 px-4 py-3 text-[13px] font-semibold text-brand-900 transition-colors hover:bg-brand-100 dark:bg-brand-900/25 dark:text-brand-100"
      >
        <span>
          👀 <b>No account? Browse the full dashboard first.</b>{" "}
          <span className="font-normal opacity-80">Balances, goals, SafeLock, investments and the ledger — no signup, no password.</span>
        </span>
        <span aria-hidden>→</span>
      </Link>
      <SessionNotice reason={reason} />
      <LoginForm next={next} />
      <DemoLoginBlock />
    </AuthShell>
  );
}
