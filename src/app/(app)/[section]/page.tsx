import type { ReactNode } from "react";
import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import {
  DashboardSection,
  GroupsSection,
  InvestSection,
  NotificationsSection,
  PaySection,
  ReferralSection,
  RulesSection,
  SafeLockSection,
  SavingsSection,
  SettingsSection,
  SupportSection,
  TransactionsSection,
  WalletSection,
} from "@/components/sections";
import { AdminSection } from "@/components/sections/admin";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ section: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

function pick<T extends Record<string, string | string[] | undefined>>(sp: T, key: string, fallback = "") {
  const raw = sp[key];
  return Array.isArray(raw) ? (raw[0] ?? fallback) : (raw ?? fallback);
}

export default async function SectionRoute({ params, searchParams }: Props) {
  const [{ section }, sp] = await Promise.all([params, searchParams]);
  const user = await requireUser().catch(() => null);
  if (!user) redirect("/login?reason=session");
  const userId = user.id;

  let view: ReactNode;
  switch (section) {
    case "dashboard":
      view = <DashboardSection userId={userId} />;
      break;
    case "wallet":
      view = <WalletSection userId={userId} tab={String(pick(sp, "tab", "deposit"))} />;
      break;
    case "savings":
      view = <SavingsSection userId={userId} newGoal={pick(sp, "new") === "1"} planId={pick(sp, "plan") || undefined} />;
      break;
    case "safelock":
      view = <SafeLockSection userId={userId} />;
      break;
    case "groups":
      view = <GroupsSection userId={userId} />;
      break;
    case "transactions":
      view = <TransactionsSection userId={userId} q={pick(sp, "q") || undefined} />;
      break;
    case "invest":
      view = <InvestSection userId={userId} productSlug={pick(sp, "product") || undefined} />;
      break;
    case "rules":
      view = <RulesSection userId={userId} />;
      break;
    case "referrals":
      view = <ReferralSection userId={userId} />;
      break;
    case "notifications":
      view = <NotificationsSection userId={userId} />;
      break;
    case "support":
      view = <SupportSection userId={userId} tab={String(pick(sp, "tab", "assistant"))} />;
      break;
    case "settings":
      view = <SettingsSection userId={userId} tab={String(pick(sp, "tab", "profile"))} />;
      break;
    case "pay":
      view = <PaySection userId={userId} reference={pick(sp, "ref") || undefined} />;
      break;
    case "admin":
      if (user.role !== "admin" && user.role !== "support") redirect("/dashboard");
      view = <AdminSection userId={userId} role={user.role} tab={String(pick(sp, "tab", "overview"))} />;
      break;
    default:
      notFound();
  }

  return <div className="animate-fade-up">{view}</div>;
}
