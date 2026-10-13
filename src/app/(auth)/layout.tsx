import type { ReactNode } from "react";
import Link from "next/link";
import { Wordmark } from "@/components/brand";
import { BRAND } from "@/lib/config";
import { getSettings } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function AuthLayout({ children }: { children: ReactNode }) {
  const settings = await getSettings();
  const brand = typeof settings["brand.name"] === "string" ? (settings["brand.name"] as string) : BRAND.name;
  return (
    <div className="relative min-h-dvh">
      <div className="hero-glow pointer-events-none fixed inset-0 opacity-70" />
      <div className="relative mx-auto flex max-w-6xl flex-col">
        <div className="flex items-center justify-between py-5">
          <Link href="/">
            <Wordmark name={brand} />
          </Link>
          <Link href="/" className="text-[13px] font-semibold muted hover:text-[var(--text-strong)]">
            ← Back to site
          </Link>
        </div>
        <div className="flex-1">{children}</div>
      </div>
    </div>
  );
}
