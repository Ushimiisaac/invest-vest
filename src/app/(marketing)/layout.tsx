import type { ReactNode } from "react";
import { SiteFooter, SiteNav } from "@/components/marketing";
import { getCurrentUser } from "@/lib/auth";
import { BRAND } from "@/lib/config";
import { getSettings } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function MarketingLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser().catch(() => null);
  void user;
  const settings = await getSettings();
  const brand = typeof settings["brand.name"] === "string" ? (settings["brand.name"] as string) : BRAND.name;
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteNav brand={brand} authed={Boolean(user)} />
      <main id="main" className="flex-1">
        {children}
      </main>
      <SiteFooter brand={brand} legalName={BRAND.legalName} />
    </div>
  );
}
