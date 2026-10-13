import type { Metadata } from "next";
import Link from "next/link";
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { accounts, investmentHoldings, investmentProducts, savingsGroupMembers, savingsGroups, transactions, users } from "@/db/schema";
import { AllocationDonut, SavingsFlowChart } from "@/components/charts";
import { Alert, Badge, Button, Card, CardHead, EmptyState, Progress, Row, Stat } from "@/components/ui";
import { CalculatorSuite } from "@/components/calculators";
import { Section } from "@/components/landing-sections";
import { accountBalances } from "@/lib/ledger";
import { monthlySavings } from "@/lib/data";
import { fmtDate, fmtDateTime, naira, pct } from "@/lib/utils";
import { PRODUCT } from "@/lib/config";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Live product demo — no signup needed",
  description: "Explore the full IncreaseVest dashboard with simulated money: balances, goals, SafeLock, investments, groups and the transaction ledger.",
};

const DEMO_EMAIL = "demo@increasevest.ng";

export default async function PublicDemoPage() {
  const [demo] = await db
    .select({ id: users.id, name: users.fullName, kyc: users.kycStatus })
    .from(users)
    .where(eq(users.email, DEMO_EMAIL))
    .limit(1);

  if (!demo) {
    return (
      <Section title="Demo data is not seeded yet" lead="Run the seed script or open the one-click demo entry once.">
        <Card className="p-8 text-center">
          <EmptyState title="No demo account found" description="Open /api/auth/demo once to create it, then reload this page." action={<Button href="/api/auth/demo">Create the demo account</Button>} />
        </Card>
      </Section>
    );
  }

  const [balances, plans, txns, monthly, holdings, groups, products] = await Promise.all([
    accountBalances(demo.id),
    db.select().from(accounts).where(and(eq(accounts.userId, demo.id), sql`${accounts.status} <> 'closed'`)).orderBy(desc(accounts.updatedAt)),
    db.select().from(transactions).where(eq(transactions.userId, demo.id)).orderBy(desc(transactions.createdAt)).limit(25),
    monthlySavings(demo.id, 6),
    db
      .select({ h: investmentHoldings, p: investmentProducts })
      .from(investmentHoldings)
      .innerJoin(investmentProducts, eq(investmentProducts.id, investmentHoldings.productId))
      .where(eq(investmentHoldings.userId, demo.id)),
    db
      .select({
        g: savingsGroups,
        m: savingsGroupMembers,
        totalKobo: sql<number>`coalesce((select sum(${accounts.balanceKobo}) from ${accounts} where ${accounts.groupId} = ${savingsGroups.id}), 0)::int`,
      })
      .from(savingsGroups)
      .innerJoin(savingsGroupMembers, eq(savingsGroupMembers.groupId, savingsGroups.id))
      .where(eq(savingsGroupMembers.userId, demo.id)),
    db.select().from(investmentProducts).orderBy(desc(investmentProducts.indicativeReturnBps)).limit(4),
  ]);

  const investedValue = holdings.reduce((a: number, row) => a + Number(row.h.principalKobo) + Number(row.h.accruedKobo), 0);
  const flex = plans.find((p) => p.kind === "flex");
  const goalPlans = plans.filter((p) => p.kind === "target" || p.kind === "regular");
  const locks = plans.filter((p) => p.kind === "safelock");
  const groupPlans = plans.filter((p) => p.kind === "group");

  const allocation = [
    { name: "Flex wallet", value: balances.available, color: "#10a376" },
    { name: "Locked plans", value: balances.locked, color: "#fbbf3c" },
    { name: "Investments", value: investedValue, color: "#2f6fb5" },
  ];

  return (
    <>
      <Section
        eyebrow="Live product demo"
        title="This is the real dashboard — no signup, no password"
        lead="Every number below comes from the same code path a signed-in customer sees. The money is simulated, so you can click through SafeLock penalties, withdrawal limits, automation and investment maturity without risking anything."
      >
        <Alert tone="gold" title="Read-only public demo" className="mb-6">
          You are viewing a customer account with simulated balances. To move money you need your own account — that takes about a minute and no card is
          required.{" "}
          <Link href="/api/auth/demo" className="font-semibold underline">
            Or open the interactive demo session
          </Link>
          .
        </Alert>

        <div className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
          <Stat label="Total savings" value={naira(balances.savingsTotal + investedValue)} hint={`${naira(balances.totalContributions)} contributed`} />
          <Stat label="Available now" value={naira(balances.available)} hint="Withdrawable to a verified bank" />
          <Stat label="Locked in plans" value={naira(balances.locked)} hint={`${locks.length} SafeLock(s)`} tone="gold" />
          <Stat label="Invested" value={naira(investedValue)} hint={`Returns ${naira(balances.totalReturns)}`} tone="info" />
        </div>
      </Section>

      <section className="mx-auto max-w-6xl px-4 pb-10 sm:px-6">
        <div className="grid gap-5 lg:grid-cols-[1.5fr_1fr]">
          <Card>
            <CardHead title="Savings momentum" subtitle="Money in vs money out over six months" />
            <div className="p-4">
              {monthly.every((m) => !m.credited && !m.debited) ? (
                <EmptyState title="No flow yet" />
              ) : (
                <SavingsFlowChart data={monthly} />
              )}
            </div>
          </Card>
          <Card>
            <CardHead title="Allocation" subtitle="Where every naira sits right now" />
            <div className="p-4">
              <AllocationDonut data={allocation} />
            </div>
          </Card>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-10 sm:px-6">
        <h2 className="mb-3 text-[19px] font-bold">Savings plans</h2>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {goalPlans.map((p: (typeof plans)[number]) => (
            <Card key={p.id} className="p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-[14.5px] font-bold">{p.name}</p>
                  <p className="mt-0.5 text-[12px] muted capitalize">
                    {p.kind === "regular" ? "Regular savings" : "Target savings"}
                    {p.frequency ? ` · ${naira(p.contributionKobo)} ${p.frequency}` : ""}
                  </p>
                </div>
                {p.autoDebit ? <Badge tone="brand">Auto</Badge> : null}
              </div>
              <p className="tnum mt-3 text-[20px] font-bold">{naira(p.balanceKobo)}</p>
              {p.targetKobo > 0 ? (
                <>
                  <Progress value={(Number(p.balanceKobo) / Number(p.targetKobo)) * 100} className="mt-2" />
                  <p className="mt-1.5 text-[11.5px] muted">
                    {pct(Number(p.balanceKobo), Number(p.targetKobo))}% of {naira(p.targetKobo)}
                    {p.nextDueAt ? ` · next ${fmtDate(p.nextDueAt)}` : ""}
                  </p>
                </>
              ) : null}
            </Card>
          ))}
          {locks.map((l: (typeof plans)[number]) => {
            const days = l.maturityDate ? Math.round((l.maturityDate.getTime() - Date.now()) / 86_400_000) : 0;
            const gross = Math.round((Number(l.balanceKobo) * (Number(l.interestBps) / 10000) * Number(l.lockMonths)) / 12);
            const net = gross - Math.round(gross * 0.1);
            return (
              <Card key={l.id} className="p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-[14.5px] font-bold">{l.name}</p>
                    <p className="mt-0.5 text-[12px] muted">
                      {days > 0 ? `Matures ${fmtDate(l.maturityDate)} · ${days} days left` : `Matured ${fmtDate(l.maturityDate)}`}
                    </p>
                  </div>
                  <Badge tone={days > 0 ? "gold" : "brand"}>{days > 0 ? "Locked" : "Matured"}</Badge>
                </div>
                <p className="tnum mt-3 text-[20px] font-bold">{naira(l.balanceKobo)}</p>
                <div className="mt-3 grid grid-cols-2 gap-2 text-[12px]">
                  <span className="rounded-lg bg-[var(--surface-sunken)] p-2">
                    <span className="block muted">Rate</span>
                    <span className="tnum font-bold">{(Number(l.interestBps) / 100).toFixed(2)}%</span>
                  </span>
                  <span className="rounded-lg bg-[var(--surface-sunken)] p-2">
                    <span className="block muted">Est. net return</span>
                    <span className="tnum font-bold">{naira(net)}</span>
                  </span>
                </div>
                <p className="mt-2 text-[11.5px] muted">Early exit costs {(Number(l.penaltyBps) / 100).toFixed(2)}% of accrued interest.</p>
              </Card>
            );
          })}
          {groupPlans.map((g: (typeof plans)[number]) => (
            <Card key={g.id} className="p-5">
              <p className="truncate text-[14.5px] font-bold">{g.name}</p>
              <p className="mt-0.5 text-[12px] muted">Group plan · {naira(g.contributionKobo)} {g.frequency}</p>
              <p className="tnum mt-3 text-[20px] font-bold">{naira(g.balanceKobo)}</p>
            </Card>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-10 sm:px-6">
        <div className="grid gap-5 lg:grid-cols-2">
          <Card>
            <CardHead title="Investments" subtitle="Positions, maturities and indicative returns" />
            <div className="divide-y">
              {holdings.length === 0 ? <p className="p-5 text-[13px] muted">No positions in the demo account.</p> : null}
              {holdings.map(({ h, p }: { h: (typeof holdings)[number]["h"]; p: (typeof holdings)[number]["p"] }) => (
                <div key={h.id} className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-[13.5px] font-bold">{p.name}</p>
                      <p className="text-[11.5px] muted">
                        {fmtDate(h.startAt)} → {fmtDate(h.maturityAt)} · <span className="font-mono">{h.applicationRef}</span>
                      </p>
                    </div>
                    <Badge tone={h.status === "redeemed" ? "neutral" : h.status === "matured" ? "brand" : "info"}>{h.status}</Badge>
                  </div>
                  <div className="mt-2 grid grid-cols-3 gap-2 text-[12px]">
                    <span><span className="block muted">Principal</span><span className="tnum font-bold">{naira(h.principalKobo)}</span></span>
                    <span><span className="block muted">Accrued</span><span className="tnum font-bold">{naira(h.accruedKobo)}</span></span>
                    <span><span className="block muted">Projected</span><span className="tnum font-bold">{naira(Math.round(Number(h.principalKobo) * (Number(h.indicativeReturnBps) / 10000)))}</span></span>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <Card>
            <CardHead title="Group savings" subtitle="Transparent, member-visible contribution ledger" />
            <div className="divide-y">
              {groups.length === 0 ? <p className="p-5 text-[13px] muted">No groups in the demo account.</p> : null}
              {groups.map(({ g, m, totalKobo }: { g: (typeof groups)[number]["g"]; m: (typeof groups)[number]["m"]; totalKobo: number }) => (
                <div key={g.id} className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-[13.5px] font-bold">{g.name}</p>
                      <p className="text-[11.5px] muted">
                        {m.role} · join code <span className="font-mono font-semibold">{g.joinCode}</span>
                      </p>
                    </div>
                    <span className="tnum font-bold">{naira(m.contributionKobo)}</span>
                  </div>
                  <Progress value={g.targetKobo ? (Number(totalKobo) / Number(g.targetKobo)) * 100 : 0} size="sm" className="mt-2" />
                  <p className="mt-1.5 text-[11.5px] muted">
                    Pot {naira(totalKobo)} of {naira(g.targetKobo)} · {naira(g.perMemberKobo)} per member {g.frequency}
                  </p>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-10 sm:px-6">
        <Card>
          <CardHead title="Transaction ledger" subtitle="The same rows a customer sees, with receipts and CSV export" />
          <div className="overflow-x-auto">
            <table className="dense w-full min-w-[680px] text-left text-[13px]">
              <thead>
                <tr className="border-b text-[11px] uppercase tracking-wide muted">
                  <th className="font-bold">Date</th><th className="font-bold">Description</th><th className="font-bold">Type</th>
                  <th className="text-right font-bold">Amount</th><th className="font-bold">Status</th>
                </tr>
              </thead>
              <tbody>
                {txns.map((t: (typeof txns)[number]) => (
                  <tr key={t.id} className="border-b last:border-0">
                    <td className="whitespace-nowrap muted">{fmtDateTime(t.createdAt)}</td>
                    <td className="max-w-[240px] truncate">{t.description || t.type.replace(/_/g, " ")}</td>
                    <td className="capitalize">{t.type.replace(/_/g, " ")}</td>
                    <td className={`tnum text-right font-bold ${t.direction === "credit" ? "text-brand-600 dark:text-brand-300" : ""}`}>
                      {t.direction === "credit" ? "+" : "−"}
                      {naira(t.amountKobo)}
                    </td>
                    <td><Badge tone={t.status === "successful" ? "brand" : t.status === "pending" ? "warning" : "danger"}>{t.status}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-16 sm:px-6">
        <Card className="p-5">
          <CardHead title="Available investment register" subtitle="Risk tiers, fees, tenors and minimums — simulated status is labelled" />
          <div className="divide-y">
            {products.map((p: (typeof products)[number]) => (
              <div key={p.id} className="flex flex-wrap items-center gap-3 p-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-[13.5px] font-bold">{p.name}</p>
                    <Badge tone={p.status === "active" ? "brand" : p.status === "simulated" ? "warning" : "neutral"}>{p.status}</Badge>
                    <Badge tone={p.riskLevel === "high" ? "danger" : p.riskLevel === "medium" ? "warning" : "info"}>{p.riskLevel} risk</Badge>
                  </div>
                  <p className="mt-1 text-[12.5px] muted">{p.summary}</p>
                </div>
                <div className="text-right text-[12px]">
                  <p className="tnum font-bold">{(p.indicativeReturnBps / 100).toFixed(2)}% p.a.</p>
                  <p className="muted">min {naira(p.minKobo)} · {p.tenorMonths}m</p>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </section>

      <Section
        eyebrow="Try the maths"
        title="The calculators, live"
        lead="Goal completion, compound growth, SafeLock quotes and investment returns — the same engine the signed-in app uses."
      >
        <CalculatorSuite initialTab="goal" />
      </Section>

      <section className="mx-auto max-w-6xl px-4 pb-20 sm:px-6">
        <Card className="flex flex-wrap items-center justify-between gap-4 p-6">
          <div>
            <p className="text-[16px] font-bold">Ready to move real (simulated) money?</p>
            <p className="mt-1 text-[13px] muted">Create an account to unlock deposits, withdrawals, SafeLock, groups, automation and investments.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button href="/api/auth/demo" variant="gold" size="lg">⚡ Interactive demo session</Button>
            <Button href="/register" size="lg">Create free account</Button>
          </div>
        </Card>
        <p className="mt-4 text-[11.5px] muted">
          Limits shown: min deposit {naira(PRODUCT.minDepositKobo)} · SafeLock from {PRODUCT.safelockTiers[0].months} months · early-exit penalty{" "}
          {(PRODUCT.safelockPenaltyBps / 100).toFixed(2)}% of accrued interest.
        </p>
      </section>
    </>
  );
}
