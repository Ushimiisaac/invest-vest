import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { getCurrentUser } from "@/lib/auth";
import { BRAND, LIVE_PAYMENTS } from "@/lib/config";
import { accountBalances } from "@/lib/ledger";
import { getSettings, notificationsFor, unreadCount } from "@/lib/data";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const me = await getCurrentUser();
  if (!me) redirect("/login?reason=session");

  const [full, balances, notes, unread, settings] = await Promise.all([
    db.select({ fullName: users.fullName, kycStatus: users.kycStatus }).from(users).where(eq(users.id, me.id)).limit(1),
    accountBalances(me.id),
    notificationsFor(me.id).then((rows) =>
      rows.slice(0, 8).map((r) => ({
        id: r.id,
        title: r.title,
        body: r.body,
        severity: r.severity,
        createdAt: r.createdAt.toISOString(),
        link: r.link,
      })),
    ),
    unreadCount(me.id),
    getSettings(),
  ]);

  const brand = typeof settings["brand.name"] === "string" ? (settings["brand.name"] as string) : BRAND.name;
  const kycThreshold = typeof settings["limits.kycRequired"] === "boolean" ? (settings["limits.kycRequired"] as boolean) : true;

  return (
    <AppShell
      brand={brand}
      user={{ fullName: full[0]?.fullName ?? me.fullName, email: me.email, role: me.role, kycStatus: full[0]?.kycStatus ?? me.kycStatus }}
      balances={balances}
      notifications={notes}
      unread={unread}
      kycRequired={kycThreshold && full[0]?.kycStatus !== "verified"}
      demoMode={LIVE_PAYMENTS}
    >
      {children}
    </AppShell>
  );
}
