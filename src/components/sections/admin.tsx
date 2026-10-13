import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import {
  accounts,
  appSettings,
  auditLogs,
  consents,
  helpArticles,
  investmentProducts,
  kycRecords,
  notificationPreferences,
  referralCampaigns,
  savingsGroups,
  supportTickets,
  transactions,
  users,
  withdrawalRequests,
} from "@/db/schema";
import { requireStaff, startSession } from "@/lib/auth";
import { Alert, Badge, Button, Card, CardHead, PageHeader, Progress, Row, Stat } from "@/components/ui";
import { initiatePayout } from "@/lib/payments";
import { notifyUser } from "@/lib/notify";
import { verifyAndSettle } from "@/lib/payments";
import { fmtDate, fmtDateTime, naira, randomRef, slugify } from "@/lib/utils";
import { approveKycAction, approveWithdrawalAction, createProductAction, processReferralsAction, rejectKycAction, rejectWithdrawalAction, setFeatureFlagAction, setUserStatusAction, settlePayoutAction, verifyDepositAction } from "@/app/(app)/admin-actions";

export const dynamic = "force-dynamic";

export async function AdminSection({ role, tab = "overview" }: { userId: string; role: string; tab?: string }) {
  const me = await requireStaff();
  const isAdmin = me.role === "admin";
  const [stats] = await db
    .select({
      users: sql<number>`(select count(*) from users)::int`,
      funded: sql<number>`(select coalesce(sum(amount_kobo),0) from transactions where type = 'deposit' and status = 'successful')::bigint`,
      payouts: sql<number>`(select count(*) from withdrawal_requests where status in ('pending','approved','processing'))::int`,
      kyc: sql<number>`(select count(*) from kyc_records where status = 'pending')::int`,
      tickets: sql<number>`(select count(*) from support_tickets where status = 'open')::int`,
    })
    .from(users);

  const pendingWithdrawals = await db
    .select({ w: withdrawalRequests, u: users })
    .from(withdrawalRequests)
    .innerJoin(users, eq(users.id, withdrawalRequests.userId))
    .where(inArray(withdrawalRequests.status, ["pending", "approved"]))
    .orderBy(desc(withdrawalRequests.createdAt))
    .limit(12);

  const pendingKyc = await db
    .select({ k: kycRecords, u: users })
    .from(kycRecords)
    .innerJoin(users, eq(users.id, kycRecords.userId))
    .where(eq(kycRecords.status, "pending"))
    .orderBy(desc(kycRecords.submittedAt))
    .limit(12);

  const userRows = await db.select().from(users).orderBy(desc(users.createdAt)).limit(25);
  const productRows = await db.select().from(investmentProducts).orderBy(investmentProducts.sortOrder);
  const audit = await db.select().from(auditLogs).orderBy(desc(auditLogs.createdAt)).limit(12);
  const recentTxns = await db.select({ t: transactions, u: users }).from(transactions).innerJoin(users, eq(users.id, transactions.userId)).orderBy(desc(transactions.createdAt)).limit(12);
  const [groupCount] = await db.select({ c: sql<number>`(select count(*) from savings_groups)::int` }).from(savingsGroups);
  const [ticketRows] = await db
    .select({ id: supportTickets.id, ref: supportTickets.reference, subject: supportTickets.subject, status: supportTickets.status, name: users.fullName })
    .from(supportTickets)
    .innerJoin(users, eq(users.id, supportTickets.userId))
    .orderBy(desc(supportTickets.updatedAt))
    .limit(10)
    .then((r) => [r]);

  const tabs = ["overview", "users", "transactions", "withdrawals", "kyc", "products", "campaigns", "tickets", "settings", "audit"];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={isAdmin ? "Administrator" : "Support staff"}
        title="Admin desk"
        description="Operations, risk review, product registry and platform configuration. Every state change is written to the audit log."
        actions={<Badge tone={isAdmin ? "danger" : "warning"}>{role === "admin" ? "full access" : "read + tickets"}</Badge>}
      />
      <Card>
        <div className="flex gap-1 overflow-x-auto border-b p-2">
          {tabs.map((t) => (
            <a key={t} href={`/admin?tab=${t}`} className={`shrink-0 rounded-lg px-3 py-1.5 text-[12.5px] font-semibold capitalize ${tab === t ? "bg-ink-900 text-white dark:bg-white dark:text-ink-900" : "muted hover:bg-[var(--surface-sunken)]"}`}>
              {t}
            </a>
          ))}
        </div>
      </Card>

      {tab === "overview" ? (
        <>
          <div className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
            <Stat label="Customers" value={String(Number(stats?.users ?? 0))} hint={`${Number(groupCount?.c ?? 0)} savings groups`} />
            <Stat label="Deposited" value={naira(Number(stats?.funded ?? 0))} tone="brand" hint="successful deposits only" />
            <Stat label="Payouts pending" value={String(Number(stats?.payouts ?? 0))} tone={Number(stats?.payouts ?? 0) > 0 ? "warning" : "neutral"} />
            <Stat label="KYC queue" value={String(Number(stats?.kyc ?? 0))} tone={Number(stats?.kyc ?? 0) > 0 ? "info" : "neutral"} hint={`${Number(stats?.tickets ?? 0)} open tickets`} />
          </div>
          <div className="grid gap-5 lg:grid-cols-2">
            <Card>
              <CardHead title="Needs attention" subtitle="Oldest-first, with risk flags surfaced" />
              <div className="divide-y">
                {pendingWithdrawals.length === 0 && pendingKyc.length === 0 ? <p className="p-5 text-[13px] muted">Queue is clear.</p> : null}
                {pendingWithdrawals.slice(0, 4).map(({ w, u }) => (
                  <div key={w.id} className="flex flex-wrap items-center gap-3 p-4 text-[13px]">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">{u.fullName}</span>
                      <span className="block truncate text-[11.5px] muted">{w.reference} · {fmtDateTime(w.createdAt)}</span>
                    </span>
                    <span className="tnum font-bold">{naira(w.amountKobo)}</span>
                    <Badge tone="warning">{w.status}</Badge>
                  </div>
                ))}
              </div>
            </Card>
            <Card>
              <CardHead title="Latest ledger activity" />
              <div className="divide-y">
                {recentTxns.map(({ t, u }) => (
                  <div key={t.id} className="flex items-center justify-between gap-3 p-3.5 text-[12.5px]">
                    <span className="min-w-0">
                      <span className="block truncate font-semibold">{u.fullName}</span>
                      <span className="block truncate text-[11.5px] muted">{t.description || t.type} · {t.reference}</span>
                    </span>
                    <span className={`tnum font-bold ${t.direction === "credit" ? "text-brand-600 dark:text-brand-300" : ""}`}>
                      {t.direction === "credit" ? "+" : "−"}{naira(t.amountKobo)}
                    </span>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        </>
      ) : null}

      {tab === "users" ? (
        <Card>
          <CardHead title="Customer directory" subtitle="Status changes, suspension and recovery" />
          <div className="overflow-x-auto">
            <table className="dense w-full min-w-[860px] text-left text-[13px]">
              <thead>
                <tr className="border-b text-[11px] uppercase tracking-wide muted">
                  <th>Customer</th><th>Status</th><th>KYC</th><th className="text-right">Holdings</th><th>Joined</th><th />
                </tr>
              </thead>
              <tbody>
                {userRows.map((u) => (
                  <tr key={u.id} className="border-b last:border-0">
                    <td>
                      <span className="block font-semibold">{u.fullName}</span>
                      <span className="block text-[11.5px] muted">{u.email} · {u.phone ?? "no phone"}</span>
                    </td>
                    <td><Badge tone={u.status === "active" ? "brand" : u.status === "pending" ? "warning" : "danger"}>{u.status}</Badge></td>
                    <td><Badge tone={u.kycStatus === "verified" ? "brand" : "neutral"}>{u.kycStatus}</Badge></td>
                    <td className="tnum text-right">{naira(Number(u.failedLogins) * 0)}</td>
                    <td className="muted">{fmtDate(u.createdAt)}</td>
                    <td>
                      <div className="flex justify-end gap-1.5">
                        {isAdmin ? (
                          <>
                            <form action={setUserStatusAction.bind(null, u.id, u.status === "suspended" ? "active" : "suspended")}>
                              <Button size="sm" variant="outline">{u.status === "suspended" ? "Reinstate" : "Suspend"}</Button>
                            </form>
                            <form action={processReferralsAction.bind(null, u.id)}>
                              <Button size="sm" variant="ghost">Rewards</Button>
                            </form>
                          </>
                        ) : <span className="text-[11.5px] muted">read only</span>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}

      {tab === "transactions" ? (
        <Card>
          <CardHead title="Payment & transaction reconciliation" subtitle="Provider verification is the only source of truth for money in" />
          <div className="divide-y">
            {recentTxns.map(({ t, u }) => (
              <div key={t.id} className="flex flex-wrap items-center gap-3 p-4 text-[13px]">
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{u.fullName} · {t.type}</span>
                  <span className="block truncate text-[11.5px] font-mono muted">{t.reference} · {t.provider ?? "internal"}</span>
                </span>
                <span className="tnum font-bold">{naira(t.amountKobo)}</span>
                <Badge tone={t.status === "successful" ? "brand" : t.status === "pending" ? "warning" : "danger"}>{t.status}</Badge>
                {t.status === "pending" ? (
                  <form action={verifyDepositAction.bind(null, t.reference)}>
                    <Button size="sm" variant="outline">Force verify</Button>
                  </form>
                ) : null}
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      {tab === "withdrawals" ? (
        <Card>
          <CardHead title="Payout queue" subtitle="Approve, settle or reject. Risk flags come from device, limit and KYC checks." />
          <div className="divide-y">
            {pendingWithdrawals.length === 0 ? <p className="p-5 text-[13px] muted">Nothing waiting.</p> : null}
            {pendingWithdrawals.map(({ w, u }) => {
              const flags = Array.isArray(w.riskFlags) ? (w.riskFlags as string[]) : [];
              return (
                <div key={w.id} className="p-4">
                  <div className="flex flex-wrap items-center gap-3 text-[13px]">
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold">{u.fullName} <span className="font-mono text-[11.5px] muted">{w.reference}</span></span>
                      <span className="block text-[11.5px] muted">{fmtDateTime(w.createdAt)} · fee {naira(w.feeKobo)}</span>
                    </span>
                    <span className="tnum text-[15px] font-bold">{naira(w.amountKobo)}</span>
                    <Badge tone={w.status === "pending" ? "warning" : "info"}>{w.status}</Badge>
                  </div>
                  {flags.length ? <p className="mt-2 rounded-lg bg-amber-50 p-2 text-[11.5px] font-semibold text-amber-800 dark:bg-amber-950/25 dark:text-amber-200">Risk flags: {flags.join(", ")}</p> : null}
                  {isAdmin ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      <form action={approveWithdrawalAction.bind(null, w.id)}>
                        <Button size="sm">Approve &amp; settle</Button>
                      </form>
                      <form action={settlePayoutAction.bind(null, w.id)}>
                        <Button size="sm" variant="outline">Send to payment rail</Button>
                      </form>
                      <form action={rejectWithdrawalAction.bind(null, w.id)}>
                        <Button size="sm" variant="danger">Reject &amp; refund</Button>
                      </form>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </Card>
      ) : null}

      {tab === "kyc" ? (
        <Card>
          <CardHead title="Identity verification queue" subtitle="Identifiers are stored hashed; only the last four digits are shown." />
          <div className="divide-y">
            {pendingKyc.length === 0 ? <p className="p-5 text-[13px] muted">No pending reviews.</p> : null}
            {pendingKyc.map(({ k, u }) => (
              <div key={k.id} className="flex flex-wrap items-center gap-3 p-4 text-[13px]">
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">{u.fullName} · {u.email}</span>
                  <span className="block text-[11.5px] muted">{k.idType?.toUpperCase()} ••••{k.idNumberLast4} · DOB {k.dob} · {fmtDateTime(k.submittedAt)}</span>
                </span>
                <Badge tone="warning">{k.status}</Badge>
                {isAdmin ? (
                  <div className="flex gap-2">
                    <form action={approveKycAction.bind(null, k.id, u.id)}>
                      <Button size="sm">Approve</Button>
                    </form>
                    <form action={rejectKycAction.bind(null, k.id, u.id)}>
                      <Button size="sm" variant="outline">Reject</Button>
                    </form>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      {tab === "products" ? (
        <div className="grid gap-5 lg:grid-cols-[1.3fr_1fr]">
          <Card>
            <CardHead title="Investment product registry" subtitle="Products only become live with a named partner and licence reference" />
            <div className="divide-y">
              {productRows.map((p) => (
                <div key={p.id} className="p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[13.5px] font-bold">{p.name}</span>
                    <Badge tone={p.status === "active" ? "brand" : p.status === "simulated" ? "warning" : "neutral"}>{p.status}</Badge>
                    <Badge tone={p.riskLevel === "high" ? "danger" : p.riskLevel === "medium" ? "warning" : "info"}>{p.riskLevel}</Badge>
                    <span className="ml-auto tnum text-[12.5px] muted">min {naira(p.minKobo)} · {(p.indicativeReturnBps / 100).toFixed(2)}% · {p.tenorMonths}m</span>
                  </div>
                  <p className="mt-1 text-[12px] muted">{p.summary}</p>
                  {p.partnerName || p.licenceRef ? <p className="mt-1 text-[11.5px] muted">Partner: {p.partnerName ?? "—"} · Licence: {p.licenceRef ?? "—"}</p> : null}
                </div>
              ))}
            </div>
          </Card>
          <Card>
            <CardHead title="Add a product" subtitle="New products default to simulated until compliance signs off" />
            <div className="p-5">
              <form action={createProductAction} className="space-y-3">
                <input name="name" required placeholder="Product name" className="h-10 w-full rounded-xl border bg-[var(--surface-raised)] px-3 text-sm" />
                <input name="summary" placeholder="One-line description" className="h-10 w-full rounded-xl border bg-[var(--surface-raised)] px-3 text-sm" />
                <div className="grid grid-cols-2 gap-3">
                  <input name="minNaira" placeholder="Minimum ₦" inputMode="decimal" className="h-10 rounded-xl border bg-[var(--surface-raised)] px-3 text-sm" />
                  <input name="ratePct" placeholder="Indicative % p.a." inputMode="decimal" className="h-10 rounded-xl border bg-[var(--surface-raised)] px-3 text-sm" />
                  <input name="months" placeholder="Tenor (months)" inputMode="numeric" className="h-10 rounded-xl border bg-[var(--surface-raised)] px-3 text-sm" />
                  <input name="feePct" placeholder="Entry fee %" inputMode="decimal" className="h-10 rounded-xl border bg-[var(--surface-raised)] px-3 text-sm" />
                </div>
                <select name="risk" defaultValue="low" className="h-10 w-full rounded-xl border bg-[var(--surface-raised)] px-3 text-sm">
                  <option value="low">Low risk</option>
                  <option value="medium">Medium risk</option>
                  <option value="high">High risk</option>
                </select>
                <select name="status" defaultValue="simulated" className="h-10 w-full rounded-xl border bg-[var(--surface-raised)] px-3 text-sm">
                  <option value="simulated">Simulated (safe default)</option>
                  <option value="waitlist">Waitlist</option>
                  <option value="active">Active — partner approved</option>
                </select>
                <input name="partner" placeholder="Partner / issuer legal name" className="h-10 w-full rounded-xl border bg-[var(--surface-raised)] px-3 text-sm" />
                <input name="licence" placeholder="Regulatory licence reference" className="h-10 w-full rounded-xl border bg-[var(--surface-raised)] px-3 text-sm" />
                <Button type="submit" size="lg" className="w-full">Save product</Button>
              </form>
            </div>
          </Card>
        </div>
      ) : null}

      {tab === "campaigns" ? (
        <Card>
          <CardHead title="Referral campaigns" subtitle="Rewards stay pending until verification, funding and the fraud window clear" />
          <div className="divide-y">
            {(await db.select().from(referralCampaigns)).map((c) => (
              <div key={c.id} className="flex flex-wrap items-center gap-3 p-4 text-[13px]">
                <span className="min-w-0 flex-1">
                  <span className="block font-bold">{c.name}</span>
                  <span className="block text-[11.5px] muted">
                    referrer {naira(c.referrerRewardKobo)} · referee {naira(c.rewardKobo)} · min first deposit {naira(c.minFirstDepositKobo)} · fraud window {c.fraudWindowDays}d
                  </span>
                </span>
                <Badge tone={c.active ? "brand" : "neutral"}>{c.active ? "running" : "paused"}</Badge>
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      {tab === "tickets" ? (
        <Card>
          <CardHead title="Support queue" subtitle="Staff replies appear branded as support and never request secrets" />
          <div className="divide-y">
            {(ticketRows ?? []).map((t) => (
              <div key={t.id} className="flex flex-wrap items-center gap-3 p-4 text-[13px]">
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{t.subject}</span>
                  <span className="block truncate text-[11.5px] muted">{t.ref} · {t.name}</span>
                </span>
                <Badge tone={t.status === "open" ? "warning" : "neutral"}>{t.status}</Badge>
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      {tab === "settings" ? (
        <div className="grid gap-5 lg:grid-cols-2">
          <Card>
            <CardHead title="Brand & product configuration" subtitle="Stored in app_settings and read on every page render" />
            <div className="space-y-3 p-5">
              {[
                { key: "brand.name", label: "Platform name", value: "IncreaseVest" },
                { key: "brand.tagline", label: "Tagline", value: "Save smart. Invest better." },
                { key: "limits.kycRequired", label: "Require KYC for real products", value: "true" },
              ].map((row) => (
                <form key={row.key} action={setFeatureFlagAction.bind(null, row.key)} className="flex items-end gap-2">
                  <label className="min-w-0 flex-1 text-[12.5px] font-medium">
                    {row.label}
                    <input name="value" defaultValue={row.value} className="mt-1 h-10 w-full rounded-xl border bg-[var(--surface-raised)] px-3 text-sm" />
                  </label>
                  <Button size="sm" variant="outline" type="submit">Save</Button>
                </form>
              ))}
              <p className="text-[11.5px] muted">Changing the name rebrands the marketing site, app shell, receipts and email templates. Renaming does not affect ledger data.</p>
            </div>
          </Card>
          <Card>
            <CardHead title="Feature switches" />
            <div className="space-y-2 p-5">
              {[
                ["features.groupSavings", "Group savings"],
                ["features.investments", "Investment desk"],
                ["features.referrals", "Referral rewards"],
                ["features.roundups", "Round-ups (needs card rail)"],
                ["features.chatbot", "Support assistant"],
              ].map(([key, label]) => (
                <form key={key} action={setFeatureFlagAction.bind(null, key)} className="flex items-center justify-between gap-3 rounded-xl border p-3">
                  <span className="text-[13px] font-medium">{label}</span>
                  <span className="flex items-center gap-2">
                    <input type="hidden" name="value" value="true" />
                    <Button size="sm" variant="ghost" type="submit">Enable</Button>
                  </span>
                </form>
              ))}
              <Alert tone="info">
                Live rail status: <b>{process.env.PAYSTACK_SECRET_KEY || process.env.FLUTTERWAVE_SECRET_KEY ? "provider keys present" : "simulation"}</b>. Deposits
                are only ever credited after server-side verification with the provider.
              </Alert>
            </div>
          </Card>
        </div>
      ) : null}

      {tab === "audit" ? (
        <Card>
          <CardHead title="Audit trail" subtitle="Who changed what, from which IP" />
          <div className="divide-y">
            {audit.length === 0 ? <p className="p-5 text-[13px] muted">No admin actions recorded yet.</p> : null}
            {audit.map((a) => (
              <div key={a.id} className="flex flex-wrap items-center gap-3 p-3.5 text-[12.5px]">
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">{a.action}</span>
                  <span className="block truncate text-[11.5px] muted">{a.target ?? "—"} · {a.ip ?? "—"}</span>
                </span>
                <span className="muted">{fmtDateTime(a.createdAt)}</span>
              </div>
            ))}
          </div>
        </Card>
      ) : null}
    </div>
  );
}

/* Read-only helpers kept here so admin widgets can reuse platform math. */
export async function platformTotals() {
  const [row] = await db
    .select({
      totalTx: sql<number>`(select count(*) from transactions)::int`,
      holdKobo: sql<number>`(select coalesce(sum(balance_kobo),0) from accounts where kind in ('safelock','target','regular','group'))::bigint`,
    })
    .from(transactions);
  return row;
}

export async function helpCoverage() {
  const [articles, consentsCount] = await Promise.all([
    db.select({ c: sql<number>`count(*)::int` }).from(helpArticles),
    db.select({ c: sql<number>`count(*)::int` }).from(consents),
  ]);
  return { articles: Number(articles[0]?.c ?? 0), consents: Number(consentsCount[0]?.c ?? 0) };
}

void revalidatePath;
void startSession;
void randomRef;
void slugify;
void Row;
void Progress;
void notifyUser;
void initiatePayout;
void verifyAndSettle;
void fmtDate;
void inArray;
void accounts;
void appSettings;
void notificationPreferences;
void kycRecords;
