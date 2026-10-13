import Link from "next/link";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import {
  accounts,
  bankAccounts,
  consents,
  devices,
  groupActions,
  investmentHoldings,
  kycRecords,
  loginHistory,
  paymentIntents,
  rewards,
  savingsGroupMembers,
  savingsGroups,
  referralCampaigns,
  savingsRules,
  supportTickets,
  ticketMessages,
  users,
  withdrawalRequests,
  helpArticles,
  faqs,
} from "@/db/schema";
import {
  AllocationDonut,
  SavingsFlowChart,
} from "@/components/charts";
import {
  Badge,
  Button,
  Card,
  CardHead,
  CopyField,
  EmptyState,
  PageHeader,
  Progress,
  Row,
  Stat,
  Alert,
} from "@/components/ui";
import {
  BankAccountManager,
  BalanceBar,
  FundWalletCard,
  PendingDepositRow,
  TransactionTable,
  WithdrawalForm,
} from "@/components/clients/wallet";
import {
  ContributeForm,
  DecideButtons,
  GroupDisputeForm as DisputeArea,
  GoalForm,
  GroupContributeForm,
  GroupCreateForm,
  GroupJoinForm,
  GroupWithdrawForm,
  LeaveGroupButton,
  LockForm,
  LockTopUpForm,
  PlanCard,
  PlanManagerDialog,
  RedeemButton,
  RuleForm,
  RuleRow,
  RunAutomationButton,
  WithdrawPlanForm,
  InvestmentApplyForm,
} from "@/components/clients/savings";
import {
  ClosurePanel,
  ConsentCenter,
  KycForm,
  MfaPanel,
  NotificationList,
  NotificationPreferences,
  PasswordForm,
  ProfileForm,
  ReferralActions,
  RewardList,
  SessionManager,
  SupportAssistant,
  TicketComposer,
  TicketThread,
} from "@/components/clients/account";
import { ProductTour } from "@/components/clients/tour";
import { accountBalances } from "@/lib/ledger";
import {
  dueContributions,
  getAccountById,
  getDashboard,
  groupsFor,
  listProducts,
  listSavingsAccounts,
  monthlySavings,
  notificationsFor,
  openTickets,
  portfolio,
  profileOf,
  referralOverview,
  rulesFor,
  searchTransactions,
  withdrawalsFor,
  depositsFor,
  kycOf,
  consentsOf,
  loginEvents,
  bankAccountsOf,
} from "@/lib/data";
import { listActiveSessions, getCurrentUser } from "@/lib/auth";
import { BRAND, FEATURES, LIVE_PAYMENTS, POLICY_VERSION, PRODUCT, paymentModeLabel } from "@/lib/config";
import { addDays, fmtDate, fmtDateTime, fromNow, naira, pct } from "@/lib/utils";
import { verifyAndSettle } from "@/lib/payments";
import { getDefaultPreferences } from "@/lib/notify";
import { notFound, redirect } from "next/navigation";

function toPlan(row: typeof accounts.$inferSelect) {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind,
    balanceKobo: Number(row.balanceKobo),
    targetKobo: Number(row.targetKobo),
    contributionKobo: Number(row.contributionKobo),
    frequency: row.frequency,
    status: row.status,
    autoDebit: row.autoDebit,
    interestBps: Number(row.interestBps),
    lockMonths: Number(row.lockMonths),
    penaltyBps: Number(row.penaltyBps),
    maturityDate: row.maturityDate ? row.maturityDate.toISOString() : null,
    nextDueAt: row.nextDueAt ? row.nextDueAt.toISOString() : null,
  };
}

/* =============================== DASHBOARD ============================ */

export async function DashboardSection({ userId }: { userId: string }) {
  const data = await getDashboard(userId);
  const plans = data.accounts;
  const allocation = [
    { name: "Flex wallet", value: data.balances.available, color: "#10a376" },
    { name: "Locked plans", value: data.balances.locked, color: "#fbbf3c" },
    { name: "Investments", value: data.investment.value, color: "#2f6fb5" },
  ];
  const profile = await profileOf(userId);

  return (
    <div className="space-y-6">
      <ProductTour />
      {!LIVE_PAYMENTS ? (
        <Alert tone="gold" title="Simulation rails active">
          No live payment provider key is configured, so deposits are simulated end-to-end. Real naira never moves, and every simulated entry is labelled in
          your ledger. {paymentModeLabel().hint}
        </Alert>
      ) : null}
      <PageHeader
        eyebrow={new Date().toLocaleDateString("en-NG", { weekday: "long", day: "numeric", month: "long" })}
        title={`Good day, ${profile?.fullName.split(" ")[0] ?? "saver"}`}
        description="Everything moving in and out of your plans, with the next actions that matter."
        actions={
          <>
            <Button href="/wallet?tab=deposit">Fund wallet</Button>
            <Button href="/savings?new=1" variant="outline">
              New goal
            </Button>
            <RunAutomationButton />
          </>
        }
      />

      <div className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Total savings" value={naira(data.balances.savingsTotal + data.investment.value)} hint={`${naira(data.balances.totalContributions)} contributed all-time`} />
        <Stat label="Available now" value={naira(data.balances.available)} hint="In the Flex wallet, withdrawable" tone="brand" />
        <Stat label="Locked in plans" value={naira(data.balances.locked)} hint={`${plans.filter((p) => p.kind === "safelock").length} active SafeLock(s)`} tone="gold" />
        <Stat label="Invested" value={naira(data.investment.value)} hint={`Returns so far ${naira(data.balances.totalReturns)}`} tone="info" />
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.5fr_1fr]">
        <Card>
          <CardHead title="Savings momentum" subtitle="Credited into plans vs moved out, last 6 months" />
          <div className="p-4">
            {data.monthly.every((m) => !m.credited && !m.debited) ? (
              <EmptyState title="No flow yet" description="Fund your wallet or make the first contribution and this chart comes alive." action={<Button href="/wallet?tab=deposit" size="sm">Fund wallet</Button>} />
            ) : (
              <SavingsFlowChart data={data.monthly} />
            )}
          </div>
        </Card>
        <Card>
          <CardHead title="Allocation" subtitle="Where every naira currently sits" />
          <div className="p-4">
            <AllocationDonut data={allocation} />
            <div className="mt-2 space-y-1.5">
              {allocation.map((a) => (
                <div key={a.name} className="flex items-center justify-between text-[12.5px]">
                  <span className="flex items-center gap-2">
                    <span className="size-2 rounded-full" style={{ background: a.color }} /> {a.name}
                  </span>
                  <span className="tnum font-semibold">{naira(a.value)}</span>
                </div>
              ))}
            </div>
          </div>
        </Card>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.15fr_1fr]">
        <Card>
          <CardHead title="Your plans" subtitle={`${plans.length} active · ${plans.filter((p) => p.autoDebit).length} automated`} action={<Link href="/savings" className="text-[12.5px] font-semibold text-brand-600 hover:underline dark:text-brand-300">Manage</Link>} />
          <div className="space-y-2 p-4">
            {plans.length === 0 ? (
              <EmptyState title="No savings plan yet" description="Target savings is the fastest habit to build." action={<Button size="sm" href="/savings?new=1">Create a goal</Button>} />
            ) : (
              plans.slice(0, 4).map((p) => (
                <Link key={p.id} href={`/savings?plan=${p.id}`} className="block rounded-xl border p-3 transition-colors hover:border-brand-400">
                  <div className="flex items-center justify-between gap-3 text-[13px]">
                    <span className="truncate font-semibold">{p.name}</span>
                    <span className="tnum font-bold">{naira(p.balanceKobo)}</span>
                  </div>
                  {p.targetKobo > 0 ? (
                    <>
                      <Progress value={p.targetKobo ? (Number(p.balanceKobo) / Number(p.targetKobo)) * 100 : 0} size="sm" className="mt-2" />
                      <p className="mt-1.5 text-[11.5px] muted">
                        {pct(Number(p.balanceKobo), Number(p.targetKobo))}% of {naira(p.targetKobo)}
                        {p.nextDueAt ? ` · next ${fmtDate(p.nextDueAt)}` : ""}
                      </p>
                    </>
                  ) : (
                    <p className="mt-1.5 text-[11.5px] muted">{p.kind === "safelock" ? `Matures ${fmtDate(p.maturityDate)}` : "Open-ended plan"}</p>
                  )}
                </Link>
              ))
            )}
          </div>
        </Card>

        <div className="space-y-5">
          <Card>
            <CardHead title="Upcoming & overdue" subtitle="Scheduled transfers pulled from the Flex wallet" action={<Link href="/rules" className="text-[12.5px] font-semibold text-brand-600 hover:underline dark:text-brand-300">Rules</Link>} />
            <div className="p-4">
              {data.upcoming.length === 0 ? (
                <p className="text-[13px] muted">Nothing scheduled. Turn on auto-save for any plan to schedule it.</p>
              ) : (
                <ul className="space-y-2">
                  {data.upcoming.slice(0, 4).map((u) => {
                    const overdue = u.nextDueAt && u.nextDueAt.getTime() < Date.now();
                    return (
                      <li key={u.id} className="flex items-center justify-between gap-3 rounded-xl border p-2.5 text-[13px]">
                        <span className="min-w-0">
                          <span className="block truncate font-semibold">{u.name}</span>
                          <span className={`block text-[11.5px] ${overdue ? "font-semibold text-amber-600" : "muted"}`}>
                            {overdue ? "Due now · " : ""}
                            {fmtDate(u.nextDueAt)}
                          </span>
                        </span>
                        <span className="tnum font-bold">{naira(u.contributionKobo)}</span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </Card>
          <Card>
            <CardHead title="Recent activity" action={<Link href="/transactions" className="text-[12.5px] font-semibold text-brand-600 hover:underline dark:text-brand-300">Full ledger</Link>} />
            <div className="divide-y">
              {data.recent.length === 0 ? <p className="p-4 text-[13px] muted">No transactions yet.</p> : null}
              {data.recent.slice(0, 6).map((t) => (
                <div key={t.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-[13px]">
                  <span className="min-w-0">
                    <span className="block truncate">{t.description || t.type.replace(/_/g, " ")}</span>
                    <span className="block text-[11px] muted">
                      {fromNow(t.createdAt)} · {t.status}
                    </span>
                  </span>
                  <span className={`tnum shrink-0 font-bold ${t.direction === "credit" ? "text-brand-600 dark:text-brand-300" : ""}`}>
                    {t.direction === "credit" ? "+" : "−"}
                    {naira(t.amountKobo)}
                  </span>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

/* ================================= WALLET ============================== */

export async function WalletSection({ userId, tab = "deposit" }: { userId: string; tab?: string }) {
  const [balances, plans, banks, withdrawals, deposits] = await Promise.all([
    accountBalances(userId),
    listSavingsAccounts(userId),
    bankAccountsOf(userId),
    withdrawalsFor(userId),
    depositsFor(userId),
  ]);
  const me = await getCurrentUser();
  const limitInfo = await import("@/lib/data").then((m) => m.withdrawalLimitCheck(userId));
  const flex = plans.find((p) => p.kind === "flex");
  const tabs = [
    { key: "deposit", label: "Fund" },
    { key: "withdraw", label: "Withdraw" },
    { key: "beneficiaries", label: "Beneficiaries" },
    { key: "history", label: "Deposits & payouts" },
  ];

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Flex Naira" title="Wallet" description="Fund by card, transfer or USSD. Withdraw to any verified Nigerian bank account. Locked plans are handled in their own pages." />
      <BalanceBar available={balances.available} locked={balances.locked} invested={0} pending={balances.pendingDebits} />
      <div className="grid gap-5 lg:grid-cols-[1.05fr_1fr]">
        <Card>
          <div className="flex gap-1 border-b p-2">
            {tabs.map((t) => (
              <Link
                key={t.key}
                href={`/wallet?tab=${t.key}`}
                className={`rounded-lg px-3 py-1.5 text-[12.5px] font-semibold ${tab === t.key ? "bg-brand-600 text-white" : "muted hover:bg-[var(--surface-sunken)]"}`}
              >
                {t.label}
              </Link>
            ))}
          </div>
          <div className="p-5">
            {tab === "withdraw" ? (
              <WithdrawalForm
                mfaEnabled={Boolean(me?.mfaEnabled)}
                limitRemaining={limitInfo.remaining}
                accounts={plans.map((p) => ({ id: p.id, name: p.name, kind: p.kind, balanceKobo: Number(p.balanceKobo), status: p.status }))}
                banks={banks.map((b) => ({ id: b.id, bankName: b.bankName, accountNumber: b.accountNumber, accountName: b.accountName, verified: b.verified, isDefault: b.isDefault, verificationSource: b.verificationSource }))}
              />
            ) : tab === "beneficiaries" ? (
              <BankAccountManager banks={banks.map((b) => ({ id: b.id, bankName: b.bankName, accountNumber: b.accountNumber, accountName: b.accountName, verified: b.verified, isDefault: b.isDefault, verificationSource: b.verificationSource }))} />
            ) : tab === "history" ? (
              <div className="space-y-5">
                <div>
                  <p className="text-[13px] font-semibold">Deposit attempts</p>
                  {deposits.length === 0 ? <p className="mt-2 text-[12.5px] muted">No deposits yet.</p> : null}
                  <div className="mt-1 divide-y">
                    {deposits.map((d) => (
                      <PendingDepositRow key={d.id} reference={d.reference} amountKobo={Number(d.amountKobo)} status={d.status} createdAt={d.createdAt.toISOString()} />
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-[13px] font-semibold">Withdrawal requests</p>
                  {withdrawals.length === 0 ? <p className="mt-2 text-[12.5px] muted">No payouts requested yet.</p> : null}
                  <ul className="mt-1 divide-y">
                    {withdrawals.map(({ w, bank }) => (
                      <li key={w.id} className="flex flex-wrap items-center gap-3 py-2.5 text-[13px]">
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-mono text-[12px] font-semibold">{w.reference}</span>
                          <span className="block truncate text-[11.5px] muted">
                            {bank?.bankName ?? "—"} · {fmtDateTime(w.createdAt)}
                          </span>
                        </span>
                        <span className="tnum font-bold">{naira(w.amountKobo)}</span>
                        <Badge tone={w.status === "paid" ? "brand" : w.status === "rejected" || w.status === "failed" ? "danger" : "warning"}>{w.status}</Badge>
                        {w.status === "pending" || w.status === "approved" ? (
                          <CancelInline id={w.id} />
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            ) : (
              <FundWalletCard
                defaultAccountId={flex?.id}
                accounts={plans.map((p) => ({ id: p.id, name: p.name, kind: p.kind, balanceKobo: Number(p.balanceKobo), status: p.status }))}
              />
            )}
          </div>
        </Card>
        <div className="space-y-5">
          <Card>
            <CardHead title="Wallet summary" subtitle="Never mixes simulated figures with real held balances" />
            <div className="p-5">
              <Row label="Available balance" value={naira(balances.available)} mono />
              <Row label="Locked in savings plans" value={naira(balances.locked)} mono />
              <Row label="Pending outgoing" value={naira(balances.pendingDebits)} mono />
              <Row label="Total contributions" value={naira(balances.totalContributions)} mono />
              <Row label="Interest & rewards" value={naira(balances.totalReturns)} mono />
              <Row label="Total withdrawn" value={naira(balances.totalWithdrawn)} mono />
            </div>
          </Card>
          <Card>
            <CardHead title="Limits & rails" subtitle={paymentModeLabel().label} />
            <div className="p-5">
              <Row label="Daily withdrawal limit" value={naira(limitInfo.limit)} mono />
              <Row label="Used today" value={naira(limitInfo.used)} mono />
              <Row label="Remaining" value={<span className="text-brand-600 dark:text-brand-300">{naira(limitInfo.remaining)}</span>} mono />
              <Row label="Min deposit" value={naira(PRODUCT.minDepositKobo)} mono />
              <Row label="Payout fee" value={`${(PRODUCT.withdrawalFeeBps / 100).toFixed(2)}% (min ${naira(PRODUCT.withdrawalFeeKobo)})`} mono />
              <p className="mt-3 text-[12px] muted">
                {me?.kycStatus === "verified" ? "Identity verified — full limits apply." : "Complete verification in settings to raise limits and unlock real investment products."}
              </p>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

async function CancelInline({ id }: { id: string }) {
  const { CancelWithdrawalButton } = await import("@/components/clients/wallet");
  return <CancelWithdrawalButton id={id} />;
}

/* ================================ SAVINGS ============================= */

export async function SavingsSection({ userId, newGoal, planId }: { userId: string; newGoal?: boolean; planId?: string }) {
  const [plans, balances] = await Promise.all([listSavingsAccounts(userId), accountBalances(userId)]);
  const nonFlex = plans.filter((p) => p.kind !== "flex");
  const selected = planId ? await getAccountById(userId, planId) : null;
  const groups = [
    { key: "target", label: "Target savings" },
    { key: "regular", label: "Regular savings" },
    { key: "group", label: "Group plans" },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Goals"
        title="Target & regular savings"
        description="Named goals with deadlines, or open-ended regular saving. Both can auto-fund from the Flex wallet."
        actions={
          <>
            <Button href="/savings?new=1">New goal</Button>
            <Button href="/groups" variant="outline">
              Group savings
            </Button>
          </>
        }
      />
      <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <div className="space-y-4">
          {groups.map((g) => {
            const items = nonFlex.filter((p) => p.kind === g.key || (g.key === "target" && p.kind === "target"));
            if (!items.length) return null;
            return (
              <section key={g.key}>
                <h2 className="mb-2 text-[12px] font-bold uppercase tracking-wider muted">{g.label}</h2>
                <div className="grid gap-3 md:grid-cols-2">
                  {items.map((p) => (
                    <PlanCard key={p.id} plan={toPlan(p)} href={`/savings?plan=${p.id}`} />
                  ))}
                </div>
              </section>
            );
          })}
          {nonFlex.length === 0 ? (
            <Card>
              <EmptyState
                title="No savings plan yet"
                description="Create your first goal — a name, a number and a date is all it takes."
                action={
                  <Button size="sm" href="/savings?new=1">
                    Create a goal
                  </Button>
                }
              />
            </Card>
          ) : null}
        </div>
        <div className="space-y-5">
          <Card>
            <CardHead title={newGoal ? "Create a goal" : "Quick add to Flex plan"} subtitle={newGoal ? "Name it, set a target, decide the cadence." : `Wallet ${naira(balances.available)} available`} />
            <div className="p-5">{newGoal ? <GoalForm /> : <ContributeOrCreate userId={userId} />}</div>
          </Card>
          <Card>
            <CardHead title="Progress discipline" subtitle="How consistent you have been" />
            <div className="space-y-3 p-5">
              {nonFlex.length === 0 ? <p className="text-[13px] muted">Create a plan to start tracking streaks.</p> : null}
              {nonFlex.slice(0, 5).map((p) => {
                const target = Number(p.targetKobo) || 1;
                const value = Number(p.balanceKobo);
                return (
                  <div key={p.id}>
                    <div className="flex justify-between text-[12.5px]">
                      <span className="truncate font-semibold">{p.name}</span>
                      <span className="tnum muted">{pct(value, target)}%</span>
                    </div>
                    <Progress value={(value / target) * 100} size="sm" className="mt-1" />
                  </div>
                );
              })}
            </div>
          </Card>
        </div>
      </div>
      {selected ? (
        <PlanManagerDialog
          plan={toPlan(selected)}
          flexBalance={balances.available}
          open
          onClose={() => redirect("/savings")}
        />
      ) : null}
    </div>
  );
}

async function ContributeOrCreate({ userId }: { userId: string }) {
  const plans = await listSavingsAccounts(userId);
  const first = plans.find((p) => p.kind === "target" || p.kind === "regular");
  if (!first) return <GoalForm />;
  return <ContributeForm plan={toPlan(first)} flexBalance={first.balanceKobo ? Number(plans.find((p) => p.kind === "flex")?.balanceKobo ?? 0) : 0} />;
}

/* ================================ SAFELOCK ============================= */

export async function SafeLockSection({ userId }: { userId: string }) {
  const [plans, balances] = await Promise.all([listSavingsAccounts(userId), accountBalances(userId)]);
  const locks = plans.filter((p) => p.kind === "safelock");
  const totalLocked = locks.reduce((a, b) => a + Number(b.balanceKobo), 0);
  const matured = locks.filter((l) => l.maturityDate && l.maturityDate.getTime() <= Date.now());

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Locked savings"
        title="SafeLock"
        description="Fix an amount for a term, see the maturity date and the cost of leaving early before you commit."
        actions={<Button href="/wallet?tab=deposit">Fund wallet</Button>}
      />
      <div className="grid gap-3.5 sm:grid-cols-3">
        <Stat label="Total locked" value={naira(totalLocked)} tone="gold" />
        <Stat label="Active locks" value={String(locks.length - matured.length)} hint={`${matured.length} matured`} />
        <Stat label="Indicative earnings" value={naira(balances.totalReturns)} hint="Interest + rewards actually credited" tone="info" />
      </div>
      <div className="grid gap-5 lg:grid-cols-[1fr_1.1fr]">
        <Card>
          <CardHead title="Open a new lock" subtitle={`From ${naira(PRODUCT.safelockMinKobo)} · ${(PRODUCT.safelockPenaltyBps / 100).toFixed(2)}% early-exit penalty`} />
          <div className="p-5">
            <LockForm flexBalance={balances.available} />
          </div>
        </Card>
        <div className="space-y-4">
          {locks.length === 0 ? (
            <Card>
              <EmptyState title="No locks yet" description="A lock is the cheapest way to stop spending what you meant to keep." />
            </Card>
          ) : (
            locks.map((l) => {
              const days = l.maturityDate ? Math.round((l.maturityDate.getTime() - Date.now()) / 86_400_000) : 0;
              const gross = Math.round((Number(l.balanceKobo) * (Number(l.interestBps) / 10000) * Number(l.lockMonths)) / 12);
              const net = gross - Math.round(gross * 0.1);
              return (
                <Card key={l.id} className="p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-[15px] font-bold">{l.name}</p>
                      <p className="mt-0.5 text-[12px] muted">
                        {days > 0 ? `Matures ${fmtDate(l.maturityDate)} · ${days} days left` : `Matured ${fmtDate(l.maturityDate)} — withdrawable without penalty`}
                      </p>
                    </div>
                    <Badge tone={days > 0 ? "gold" : "brand"}>{days > 0 ? "Locked" : "Matured"}</Badge>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                    {[
                      { k: "Locked", v: naira(l.balanceKobo) },
                      { k: "Rate", v: `${(Number(l.interestBps) / 100).toFixed(2)}%` },
                      { k: "Est. net return", v: naira(net) },
                      { k: "Maturity value", v: naira(Number(l.balanceKobo) + net) },
                    ].map((b) => (
                      <div key={b.k} className="rounded-xl bg-[var(--surface-sunken)] p-2.5">
                        <p className="text-[10.5px] uppercase tracking-wide muted">{b.k}</p>
                        <p className="tnum mt-0.5 text-[13.5px] font-bold">{b.v}</p>
                      </div>
                    ))}
                  </div>
                  <Progress value={days > 0 ? Math.max(2, 100 - (days / Math.max(1, Number(l.lockMonths) * 30)) * 100) : 100} className="mt-3" tone={days > 0 ? "gold" : "brand"} />
                  <div className="mt-4 grid gap-4 sm:grid-cols-2">
                    <WithdrawPlanForm plan={toPlan(l)} />
                    <LockTopUpForm plan={toPlan(l)} />
                  </div>
                </Card>
              );
            })
          )}
          <Alert tone="info" title="Why the estimates look conservative">
            Interest is prorated on the days actually locked, then reduced by 10% withholding tax on the interest component. Rates can change for new locks; your
            contracted rate never moves.
          </Alert>
        </div>
      </div>
    </div>
  );
}

/* ================================= GROUPS ============================== */

export async function GroupsSection({ userId }: { userId: string }) {
  const groups = await groupsFor(userId);
  const [balances] = await Promise.all([accountBalances(userId)]);
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Thrift & teamwork"
        title="Group savings"
        description="Shared goals with visible contribution history, permissioned withdrawals and a written dispute trail."
        actions={<Button href="/groups?new=1">Create group</Button>}
      />
      <div className="grid gap-5 lg:grid-cols-[1.35fr_1fr]">
        <div className="space-y-4">
          {groups.length === 0 ? (
            <Card>
              <EmptyState title="Not in a group yet" description="Create one and share the join code, or join an existing circle." />
            </Card>
          ) : (
            groups.map((g) => {
              const myAccount = null;
              return (
                <Card key={g.id}>
                  <CardHead
                    title={g.name}
                    subtitle={`${g.members.length} member(s) · ${naira(g.perMemberKobo)} per ${g.frequency} · total ${naira(g.totalKobo)}`}
                    action={<Badge tone={g.myRole === "owner" ? "brand" : "info"}>{g.myRole}</Badge>}
                  />
                  <div className="p-5">
                    <Progress value={g.targetKobo ? (g.totalKobo / g.targetKobo) * 100 : 0} />
                    <p className="mt-1.5 text-[11.5px] muted">
                      {pct(g.totalKobo, g.targetKobo)}% of {naira(g.targetKobo)} · join code <span className="font-mono font-semibold">{g.joinCode}</span>
                    </p>
                    <ul className="mt-4 divide-y">
                      {g.members.map((m) => (
                        <li key={m.id} className="flex items-center gap-3 py-2 text-[13px]">
                          <span className="grid size-7 place-items-center rounded-lg bg-[var(--surface-sunken)] text-[11px] font-bold">{m.name.slice(0, 1)}</span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate font-semibold">
                              {m.userId === userId ? `${m.name} (you)` : m.name}
                            </span>
                            <span className="block truncate text-[11.5px] muted">{m.email}</span>
                          </span>
                          <span className="tnum font-bold">{naira(m.contribution)}</span>
                          <Badge tone={m.role === "owner" ? "brand" : "neutral"}>{m.role}</Badge>
                        </li>
                      ))}
                    </ul>
                    <div className="mt-4 grid gap-4 sm:grid-cols-2">
                      <div className="rounded-xl border p-3.5">
                        <p className="mb-2 text-[12.5px] font-bold">Contribute</p>
                        <GroupContributeForm groupId={g.id} suggested={Number(g.perMemberKobo)} />
                      </div>
                      <div className="rounded-xl border p-3.5">
                        <p className="mb-2 text-[12.5px] font-bold">Withdraw from my group balance</p>
                        <GroupWithdrawForm groupId={g.id} />
                      </div>
                    </div>
                    <div className="mt-4 rounded-xl border border-dashed p-3.5">
                      <p className="mb-2 text-[12.5px] font-bold">Governance</p>
                      <p className="text-[12px] muted">
                        Min {g.minContributionsBeforeWithdraw} contribution(s) before withdrawal · {g.requireOwnerApproval ? "owner approval required" : "self-service exit"} · {g.disputePolicy}
                      </p>
                      <div className="mt-3 flex flex-wrap items-center gap-3">
                        <GroupDisputeLauncher groupId={g.id} />
                        {g.myRole === "owner" ? <LeaveGroupButton groupId="__owner_no_leave" /> : <LeaveGroupButton groupId={g.id} />}
                      </div>
                      <PendingGroupActions groupId={g.id} isAdmin={g.myRole === "owner"} />
                    </div>
                    {myAccount ? null : null}
                  </div>
                </Card>
              );
            })
          )}
        </div>
        <div className="space-y-5">
          <Card>
            <CardHead title="Join a group" subtitle="Paste the code your organiser shared" />
            <div className="p-5">
              <GroupJoinForm />
            </div>
          </Card>
          <Card>
            <CardHead title="Start a group" subtitle="Free, and the ledger is transparent to everyone" />
            <div className="p-5">{new URLSearchParams({}).get("x") ? null : <GroupCreateForm />}</div>
          </Card>
          <Card>
            <CardHead title="Your wallet context" />
            <div className="p-5">
              <Row label="Flex wallet" value={naira(balances.available)} mono />
              <Row label="Locked in plans" value={naira(balances.locked)} mono />
              <p className="mt-3 text-[12px] muted">Group contributions move from your Flex wallet so there is never a surprise debit.</p>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

function GroupDisputeLauncher({ groupId }: { groupId: string }) {
  return <DisputeArea groupId={groupId} />;
}

async function PendingGroupActions({ groupId, isAdmin }: { groupId: string; isAdmin: boolean }) {
  if (!isAdmin) return null;
  const rows = await db.select().from(groupActions).where(and(eq(groupActions.groupId, groupId), eq(groupActions.status, "pending"))).orderBy(desc(groupActions.createdAt));
  if (!rows.length) return <p className="mt-3 text-[12px] muted">No pending requests.</p>;
  return (
    <ul className="mt-3 space-y-2">
      {rows.map((r) => (
        <li key={r.id} className="flex flex-wrap items-center gap-3 rounded-lg border p-2.5 text-[12.5px]">
          <span className="min-w-0 flex-1">
            <span className="block font-semibold capitalize">
              {r.type} · {r.amountKobo ? naira(r.amountKobo) : "no amount"}
            </span>
            <span className="block truncate text-[11.5px] muted">{r.note || "No note provided"}</span>
          </span>
          {r.type === "withdraw" ? <DecideButtons actionId={r.id} /> : <Badge tone="warning">Review</Badge>}
        </li>
      ))}
    </ul>
  );
}

/* =============================== TRANSACTIONS ========================== */

export async function TransactionsSection({ userId, q }: { userId: string; q?: string }) {
  const [rows, plans] = await Promise.all([
    searchTransactions(userId, { q, limit: 200 }),
    listSavingsAccounts(userId),
  ]);
  const nameById = new Map(plans.map((p) => [p.id, p.name]));
  const shaped = rows.map((t) => ({
    id: t.id,
    reference: t.reference,
    createdAt: t.createdAt.toISOString(),
    type: t.type,
    amountKobo: Number(t.amountKobo),
    status: t.status,
    direction: t.direction as "credit" | "debit",
    provider: t.provider,
    description: t.description,
    accountName: t.accountId ? (nameById.get(t.accountId) ?? "Account") : undefined,
  }));
  const { TransactionTable } = await import("@/components/clients/wallet");
  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Ledger"
        title="Transactions"
        description="Every movement, filterable and exportable. Simulated entries stay labelled as simulated."
        actions={
          <Link href={`/api/reports/statement`} className="inline-flex h-10 items-center rounded-xl border bg-[var(--surface-raised)] px-4 text-sm font-semibold hover:border-brand-500">
            Download statement (CSV)
          </Link>
        }
      />
      {q ? (
        <p className="text-[12.5px] muted">
          Search: “{q}” · <Link href="/transactions" className="font-semibold text-brand-600 hover:underline dark:text-brand-300">clear</Link>
        </p>
      ) : null}
      <Card className="p-4">
        <TransactionTable rows={shaped} accounts={plans.map((p) => ({ id: p.id, name: p.name, kind: p.kind, balanceKobo: Number(p.balanceKobo), status: p.status }))} />
      </Card>
    </div>
  );
}

/* =============================== INVESTMENTS =========================== */

export async function InvestSection({ userId, productSlug }: { userId: string; productSlug?: string }) {
  const [products, holdings, balances, profile] = await Promise.all([listProducts(), portfolio(userId), accountBalances(userId), profileOf(userId)]);
  const selected = productSlug ? products.find((p) => p.slug === productSlug) : undefined;
  const active = holdings.filter((h) => h.status === "active");
  const totalValue = holdings.reduce((a, h) => a + Number(h.principalKobo) + Number(h.accrued), 0);
  const maturedCount = holdings.filter((h) => h.redeemable && h.status !== "redeemed").length;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Investment desk"
        title="Invest & track"
        description="A product register with risk, fees, tenors and status — plus your holdings, maturities and distribution history."
        actions={
          <>
            <Button href="/invest?product=treasury-bill-182d">Worked example</Button>
            <Button href="/calculate?tab=invest" variant="outline">
              Return calculator
            </Button>
          </>
        }
      />
      <div className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Portfolio value" value={naira(totalValue)} hint="Principal + accrued, marked to plan" />
        <Stat label="Active positions" value={String(active.length)} tone="info" />
        <Stat label="Ready to redeem" value={String(maturedCount)} tone={maturedCount ? "gold" : "neutral"} />
        <Stat label="KYC status" value={profile?.kycStatus ?? "unverified"} hint={profile?.kycStatus === "verified" ? "Real products unlocked" : "Verification required for real products"} tone={profile?.kycStatus === "verified" ? "brand" : "warning"} />
      </div>
      <div className="grid gap-5 lg:grid-cols-[1.35fr_1fr]">
        <Card>
          <CardHead title="Product register" subtitle="Only partner-approved products accept real subscriptions" />
          <div className="divide-y">
            {products.map((p) => (
              <div key={p.id} className="flex flex-wrap items-center gap-3 p-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-[14px] font-bold">{p.name}</h3>
                    <Badge tone={p.status === "active" ? "brand" : p.status === "simulated" ? "warning" : "neutral"}>{p.status === "active" ? "live · partner" : p.status}</Badge>
                    <Badge tone={p.riskLevel === "low" ? "info" : p.riskLevel === "medium" ? "warning" : "danger"}>{p.riskLevel} risk</Badge>
                  </div>
                  <p className="mt-1 text-[12.5px] muted">{p.summary}</p>
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11.5px] muted">
                    <span>Min {naira(p.minKobo)}</span>
                    <span>{p.tenorMonths} months</span>
                    <span>Indicative {(p.indicativeReturnBps / 100).toFixed(2)}% p.a.</span>
                    <span>Fee {(p.feeBps / 100).toFixed(2)}%</span>
                    <span className="capitalize">{p.liquidity.replace(/_/g, " ")}</span>
                  </div>
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button size="sm" variant="outline" href={`/invest?product=${p.slug}`}>
                    Review & apply
                  </Button>
                </div>
                {p.regulatoryNote ? <p className="w-full rounded-lg bg-[var(--surface-sunken)] p-2 text-[11.5px] muted">{p.regulatoryNote}</p> : null}
              </div>
            ))}
          </div>
        </Card>
        <div className="space-y-5">
          {selected ? (
            <Card>
              <CardHead title={`Apply — ${selected.name}`} subtitle={`${selected.tenorMonths} months · indicative ${(selected.indicativeReturnBps / 100).toFixed(2)}% p.a.`} />
              <div className="p-5">
                <InvestmentApplyForm
                  flexBalance={balances.available}
                  product={{
                    id: selected.id,
                    name: selected.name,
                    minKobo: Number(selected.minKobo),
                    maxKobo: Number(selected.maxKobo),
                    tenorMonths: Number(selected.tenorMonths),
                    indicativeReturnBps: Number(selected.indicativeReturnBps),
                    feeBps: Number(selected.feeBps),
                    status: selected.status,
                    riskLevel: selected.riskLevel,
                  }}
                />
              </div>
            </Card>
          ) : null}
          <Card>
            <CardHead title="Your holdings" subtitle="Marked at plan, not market-price fantasy" action={<Link href="/invest" className="text-[12.5px] font-semibold text-brand-600">Refresh</Link>} />
            <div className="divide-y">
              {holdings.length === 0 ? (
                <p className="p-5 text-[13px] muted">No positions. Pick a product on the left to model one.</p>
              ) : (
                holdings.map((h) => (
                  <div key={h.id} className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-[13.5px] font-bold">{h.productName}</p>
                        <p className="text-[11.5px] muted">
                          {fmtDate(h.startAt)} → {h.maturityLabel} · <span className="font-mono">{h.applicationRef}</span>
                        </p>
                      </div>
                      <Badge tone={h.status === "redeemed" ? "neutral" : h.status === "matured" ? "brand" : "info"}>{h.status}</Badge>
                    </div>
                    <div className="mt-2 grid grid-cols-3 gap-2 text-[12px]">
                      <span>
                        <span className="block muted">Principal</span>
                        <span className="tnum font-bold">{naira(h.principalKobo)}</span>
                      </span>
                      <span>
                        <span className="block muted">Accrued</span>
                        <span className="tnum font-bold">{naira(h.accrued)}</span>
                      </span>
                      <span>
                        <span className="block muted">Projected</span>
                        <span className="tnum font-bold">{naira(h.projected)}</span>
                      </span>
                    </div>
                    <Progress value={h.progressPct} size="sm" className="mt-2" />
                    {h.status !== "redeemed" ? (
                      <div className="mt-3 flex items-center gap-2">
                        <RedeemButton holdingId={h.id} />
                        <span className="text-[11.5px] muted">{h.redeemable ? "Eligible now" : `Unlocks ${h.maturityLabel}`}</span>
                      </div>
                    ) : null}
                  </div>
                ))
              )}
            </div>
          </Card>
          <Alert tone="warning" title="No promises here">
            Indicative returns are illustrations built from the published rate for each product. They are not guarantees, they are not contractual, and
            products marked <b>simulated</b> hold no real securities at all.
          </Alert>
        </div>
      </div>
    </div>
  );
}

/* ================================ RULES =============================== */

export async function RulesSection({ userId }: { userId: string }) {
  const [rules, plans] = await Promise.all([rulesFor(userId), listSavingsAccounts(userId)]);
  const automatable = plans.filter((p) => p.kind !== "flex");
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Automation"
        title="Savings rules & reminders"
        description="Fixed amounts, percentage-of-income sweeps, round-ups and reminders. Every rule carries its own consent stamp and can be killed instantly."
        actions={<RunAutomationButton />}
      />
      {!FEATURES.autoSavings ? <Alert tone="warning">Automated savings is disabled for this deployment.</Alert> : null}
      <div className="grid gap-5 lg:grid-cols-[1.05fr_1fr]">
        <Card>
          <CardHead title="Create a rule" subtitle="Nothing runs without the consent tick" />
          <div className="p-5">
            <RuleForm plans={automatable.map((p) => ({ id: p.id, name: p.name, kind: p.kind, balanceKobo: Number(p.balanceKobo), targetKobo: Number(p.targetKobo), contributionKobo: Number(p.contributionKobo), frequency: p.frequency, status: p.status, autoDebit: p.autoDebit, interestBps: Number(p.interestBps), lockMonths: Number(p.lockMonths), penaltyBps: Number(p.penaltyBps), maturityDate: p.maturityDate?.toISOString() ?? null, nextDueAt: p.nextDueAt?.toISOString() ?? null }))} />
          </div>
        </Card>
        <Card>
          <CardHead title="Active rules" subtitle={`${rules.filter((r) => r.active).length} running`} />
          <div className="divide-y">
            {rules.length === 0 ? <p className="p-5 text-[13px] muted">No rules yet. A “Salary-day sweep” is the most popular starting point.</p> : null}
            {rules.map((r) => (
              <div key={r.id} className="flex flex-wrap items-center gap-3 p-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-[13.5px] font-bold">{r.name}</p>
                    <Badge tone={r.active ? "brand" : "neutral"}>{r.active ? "on" : "paused"}</Badge>
                  </div>
                  <p className="mt-0.5 text-[11.5px] muted capitalize">
                    {r.kind.replace(/_/g, " ")} · {naira(r.amountKobo)} or {(Number(r.percentageBps) / 100).toFixed(1)}% · {r.frequency}
                    {Number(r.capKobo) > 0 ? ` · capped ${naira(r.capKobo)}` : ""}
                  </p>
                  <p className="mt-1 text-[11px] muted">
                    {r.lastRunAt ? `Last run ${fmtDate(r.lastRunAt)}` : "Never run"} · {r.nextRunAt ? `next ${fmtDate(r.nextRunAt)}` : "no next run"} · consent v
                    {r.consentVersion ?? POLICY_VERSION}
                  </p>
                </div>
                <RuleRow id={r.id} active={r.active} />
              </div>
            ))}
          </div>
        </Card>
      </div>
      <Card>
        <CardHead title="What each rule type does" />
        <div className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { t: "Fixed amount", d: "Moves a set figure from the Flex wallet on your cadence. Fails loudly with a notification if the wallet is short." },
            { t: "Percentage of income", d: "Takes a slice whenever an income event is recorded. Without a payroll link, runs are labelled simulated." },
            { t: "Round-ups", d: "Rounds purchases up to a step you choose. Requires a card-rail partner that reports settled amounts." },
            { t: "Reminder only", d: "Never touches money. Pings you when a planned contribution is missed." },
          ].map((b) => (
            <div key={b.t} className="rounded-xl border p-4">
              <p className="text-[13px] font-bold">{b.t}</p>
              <p className="mt-1 text-[12px] leading-relaxed muted">{b.d}</p>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

/* ============================ REFERRALS =============================== */

export async function ReferralSection({ userId }: { userId: string }) {
  const data = await referralOverview(userId);
  const [campaign] = await db.select().from(referralCampaigns).where(eq(referralCampaigns.active, true)).limit(1);
  const links = await db
    .select({ id: users.id, name: users.fullName, email: users.email, kyc: users.kycStatus, createdAt: users.createdAt })
    .from(users)
    .where(eq(users.referredBy, userId))
    .orderBy(desc(users.createdAt));
  const url = `${BRAND.siteUrl}/register?ref=${data.code}`;
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Rewards" title="Referrals" description="Rewards are credited only after the person you invite verifies, funds the minimum deposit and clears the fraud window." actions={<ReferralActions />} />
      <div className="grid gap-5 lg:grid-cols-[1.1fr_1fr]">
        <Card>
          <CardHead title="Your invite link" subtitle="Share it anywhere — the code is tied to your account" />
          <div className="space-y-3 p-5">
            <CopyField label="Link" value={url} />
            <CopyField label="Code" value={data.code} />
            <div className="grid grid-cols-3 gap-3 pt-1">
              {[
                { k: "Invited", v: String(data.invited) },
                { k: "Qualified", v: String(data.qualified) },
                { k: "Earned", v: naira(data.totalEarnedKobo) },
              ].map((b) => (
                <div key={b.k} className="rounded-xl bg-[var(--surface-sunken)] p-3">
                  <p className="text-[11px] uppercase tracking-wide muted">{b.k}</p>
                  <p className="tnum mt-0.5 text-[16px] font-bold">{b.v}</p>
                </div>
              ))}
            </div>
            {campaign ? (
              <Alert tone="brand" title={`Active campaign · ${campaign.name}`}>
                <p className="text-[12.5px]">
                  {naira(campaign.referrerRewardKobo)} to you and {naira(campaign.rewardKobo)} to your friend once they verify and deposit at least{" "}
                  {naira(campaign.minFirstDepositKobo)}, after a {campaign.fraudWindowDays}-day fraud window. Duplicate devices and self-referrals are voided.
                </p>
              </Alert>
            ) : (
              <Alert tone="neutral">No campaign is running right now, so invites are tracked but no reward accrues yet.</Alert>
            )}
          </div>
        </Card>
        <div className="space-y-5">
          <Card>
            <CardHead title="People you invited" subtitle={`${links.length} tracked`} />
            <ul className="divide-y">
              {links.length === 0 ? <li className="p-5 text-[13px] muted">Nobody yet. Send the link to one person who actually needs a savings habit.</li> : null}
              {links.map((l) => (
                <li key={l.id} className="flex items-center justify-between gap-3 p-3.5 text-[13px]">
                  <span className="min-w-0">
                    <span className="block truncate font-semibold">{l.name}</span>
                    <span className="block truncate text-[11.5px] muted">joined {fmtDate(l.createdAt)}</span>
                  </span>
                  <Badge tone={l.kyc === "verified" ? "brand" : "warning"}>{l.kyc}</Badge>
                </li>
              ))}
            </ul>
          </Card>
          <Card>
            <CardHead title="Reward history" />
            <div className="p-4">
              <RewardList items={data.rewards.map((r) => ({ id: r.id, label: r.label, amountKobo: Number(r.amountKobo), status: r.status, createdAt: r.createdAt.toISOString() }))} />
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

/* =========================== NOTIFICATIONS ============================ */

export async function NotificationsSection({ userId }: { userId: string }) {
  const items = await notificationsFor(userId);
  const { notificationPreferences } = await import("@/db/schema");
  const [prefRow] = await db
    .select({ channels: notificationPreferences.channels })
    .from(notificationPreferences)
    .where(eq(notificationPreferences.userId, userId))
    .limit(1);
  const defaults = await getDefaultPreferences();
  const initial = (prefRow?.channels ?? defaults) as Record<string, { in_app: boolean; email: boolean; sms: boolean }>;
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Inbox" title="Notifications" description="Deposits, payouts, automation, milestones, maturity and security events in one place." />
      <div className="grid gap-5 lg:grid-cols-[1.3fr_1fr]">
        <Card className="p-4">
          <NotificationList
            items={items.map((n) => ({
              id: n.id,
              title: n.title,
              body: n.body,
              severity: n.severity,
              createdAt: n.createdAt.toISOString(),
              link: n.link,
              readAt: n.readAt ? n.readAt.toISOString() : null,
              type: n.type,
            }))}
          />
        </Card>
        <Card>
          <CardHead title="Channel preferences" subtitle="In-app is always on for security and payout events" />
          <div className="p-5">
            <NotificationPreferences initial={initial} />
          </div>
        </Card>
      </div>
    </div>
  );
}

/* ================================ SUPPORT ============================= */

export async function SupportSection({ userId, tab = "assistant" }: { userId: string; tab?: string }) {
  const tickets = await openTickets(userId);
  const [articles, faqRows] = await Promise.all([
    db.select().from(helpArticles).where(and(eq(helpArticles.published, true), inArray(helpArticles.audience, ["all", "help"]))).orderBy(desc(helpArticles.updatedAt)).limit(6),
    db.select().from(faqs).limit(8),
  ]);
  const withMessages = await Promise.all(
    tickets.map(async (t) => ({
      ...t,
      messages: await db.select().from(ticketMessages).where(eq(ticketMessages.ticketId, t.id)).orderBy(ticketMessages.createdAt),
    })),
  );
  const tabs = [
    { key: "assistant", label: "Assistant" },
    { key: "tickets", label: "My tickets" },
    { key: "new", label: "New ticket" },
    { key: "library", label: "Help library" },
  ];
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Support" title="Help centre & education" description="Self-serve answers first, human support second, and money basics explained without the jargon." actions={<Button href="/help" variant="outline">Open public help centre</Button>} />
      <Card>
        <div className="flex gap-1 overflow-x-auto border-b p-2">
          {tabs.map((t) => (
            <Link key={t.key} href={`/support?tab=${t.key}`} className={`shrink-0 rounded-lg px-3 py-1.5 text-[12.5px] font-semibold ${tab === t.key ? "bg-brand-600 text-white" : "muted hover:bg-[var(--surface-sunken)]"}`}>
              {t.label}
            </Link>
          ))}
        </div>
        <div className="p-5">
          {tab === "tickets" ? (
            withMessages.length === 0 ? (
              <EmptyState title="No tickets" description="Nothing open. When you need us, the queue answers in under 4 business hours." action={<Button size="sm" href="/support?tab=new">Open a ticket</Button>} />
            ) : (
              <div className="space-y-4">
                {withMessages.map((t) => (
                  <div key={t.id} className="rounded-xl border p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-[13.5px] font-bold">
                        {t.subject} <span className="ml-1 font-mono text-[11.5px] muted">{t.reference}</span>
                      </p>
                      <Badge tone={t.status === "open" ? "warning" : t.status === "resolved" || t.status === "closed" ? "neutral" : "info"}>{t.status}</Badge>
                    </div>
                    <div className="mt-3">
                      <TicketThread
                        ticketId={t.id}
                        status={t.status}
                        messages={t.messages.map((m) => ({ id: m.id, body: m.body, fromStaff: m.fromStaff, createdAt: m.createdAt.toISOString() }))}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )
          ) : tab === "new" ? (
            <TicketComposer />
          ) : tab === "library" ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {articles.map((a) => (
                <Link key={a.id} href={`/help?article=${a.slug}`} className="rounded-xl border p-4 transition-colors hover:border-brand-400">
                  <p className="text-[13.5px] font-bold">{a.title}</p>
                  <p className="mt-1 text-[12px] muted">{a.excerpt}</p>
                  <p className="mt-2 text-[11px] muted">{a.readMinutes} min read</p>
                </Link>
              ))}
            </div>
          ) : (
            <div className="grid gap-5 lg:grid-cols-[1.2fr_1fr]">
              <Card className="p-4">
                <SupportAssistant />
              </Card>
              <div>
                <p className="text-[12px] font-bold uppercase tracking-wide muted">Common questions</p>
                <ul className="mt-2 space-y-2">
                  {faqRows.slice(0, 5).map((f) => (
                    <li key={f.id} className="rounded-xl border p-3">
                      <p className="text-[13px] font-semibold">{f.question}</p>
                      <p className="mt-1 text-[12px] leading-relaxed muted">{f.answer.slice(0, 170)}…</p>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}

/* ================================ SETTINGS ============================ */

export async function SettingsSection({ userId, tab = "profile" }: { userId: string; tab?: string }) {
  const [profile, kyc, consentsList, logins, sessions, deviceRows, history] = await Promise.all([
    profileOf(userId),
    kycOf(userId),
    consentsOf(userId),
    loginEvents(userId),
    listActiveSessions(userId),
    db.select().from(devices).where(eq(devices.userId, userId)).orderBy(desc(devices.lastSeenAt)).limit(6),
    db.select({ note: users.suspensionReason, status: users.status }).from(users).where(eq(users.id, userId)).limit(1),
  ]);
  if (!profile) notFound();
  const tabs = [
    { key: "profile", label: "Profile" },
    { key: "security", label: "Security" },
    { key: "kyc", label: "Identity" },
    { key: "consent", label: "Consent" },
    { key: "danger", label: "Account status" },
  ];
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Account" title="Settings & security" description="Profile, two-factor, sessions, devices, identity verification, consent records and closure." />
      <Card>
        <div className="flex gap-1 overflow-x-auto border-b p-2">
          {tabs.map((t) => (
            <Link key={t.key} href={`/settings?tab=${t.key}`} className={`shrink-0 rounded-lg px-3 py-1.5 text-[12.5px] font-semibold ${tab === t.key ? "bg-brand-600 text-white" : "muted hover:bg-[var(--surface-sunken)]"}`}>
              {t.label}
            </Link>
          ))}
        </div>
        <div className="p-5">
          {tab === "security" ? (
            <div className="space-y-6">
              <MfaPanel enabled={Boolean(profile.mfaEnabled)} email={profile.email} />
              <div className="grid gap-6 lg:grid-cols-2">
                <div>
                  <p className="mb-3 text-[13px] font-bold">Change password</p>
                  <PasswordForm />
                </div>
                <div>
                  <p className="mb-3 text-[13px] font-bold">Sessions & devices</p>
                  <SessionManager
                    sessions={sessions.map((s) => ({ ...s, createdAt: s.createdAt.toISOString(), expiresAt: s.expiresAt.toISOString() }))}
                    devices={deviceRows.map((d) => ({ id: d.id, label: d.label, lastSeenAt: d.lastSeenAt.toISOString(), ip: d.ip }))}
                  />
                </div>
              </div>
              <div>
                <p className="mb-2 text-[13px] font-bold">Recent sign-in activity</p>
                <ul className="divide-y rounded-xl border">
                  {history.length === 0 ? <li className="p-4 text-[13px] muted">No recorded sign-ins.</li> : null}
                  {logins.slice(0, 8).map((h) => (
                    <li key={h.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5 text-[12.5px]">
                      <span className="min-w-0 flex-1 truncate">
                        {h.userAgent ?? "unknown"} · {h.ip ?? "—"}
                      </span>
                      <Badge tone={h.outcome === "success" ? "brand" : h.outcome === "mfa_required" ? "info" : "danger"}>{h.outcome.replace(/_/g, " ")}</Badge>
                      <span className="muted">{fmtDateTime(h.createdAt)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ) : tab === "kyc" ? (
            <div className="space-y-4">
              <KycForm status={kyc?.status ?? profile.kycStatus} last4={kyc?.idNumberLast4 ?? null} />
              {kyc ? (
                <Card className="p-4">
                  <Row label="Provider reference" value={kyc.providerRef ?? "—"} mono />
                  <Row label="Provider" value={kyc.provider} />
                  <Row label="Submitted" value={fmtDateTime(kyc.submittedAt)} />
                  {kyc.reviewedAt ? <Row label="Reviewed" value={fmtDateTime(kyc.reviewedAt)} /> : null}
                  {kyc.rejectionReason ? <Row label="Rejection reason" value={kyc.rejectionReason} /> : null}
                </Card>
              ) : null}
            </div>
          ) : tab === "consent" ? (
            <ConsentCenter consents={consentsList.map((c) => ({ kind: c.kind, version: c.version, granted: c.granted, createdAt: c.createdAt.toISOString() }))} />
          ) : tab === "danger" ? (
            <div className="space-y-4">
              <Alert tone={history[0]?.status === "suspended" ? "danger" : "info"} title={`Account status: ${history[0]?.status ?? profile.status}`}>
                {history[0]?.note ? String(history[0].note) : "Your account is in good standing. Suspension happens only for regulatory or fraud reasons, always with written notice."}
              </Alert>
              <div className="rounded-xl border p-4">
                <p className="text-[13.5px] font-bold">Close this account</p>
                <p className="mt-1 mb-3 max-w-lg text-[12.5px] muted">
                  Requires a zero balance across every plan. Payouts already queued stay in force, and a 30-day recovery window applies.
                </p>
                <ClosurePanel />
              </div>
            </div>
          ) : (
            <div className="grid gap-6 lg:grid-cols-[1.1fr_1fr]">
              <ProfileForm fullName={profile.fullName} email={profile.email} phone={profile.phone} />
              <div className="space-y-3">
                <Row label="Member since" value={fmtDate(profile.createdAt, "long")} />
                <Row label="Last login" value={fmtDateTime(profile.lastLoginAt)} />
                <Row label="Email verified" value={profile.emailVerified ? "Yes" : "Pending"} />
                <Row label="Phone verified" value={profile.phoneVerified ? "Yes" : "Pending"} />
                <Row label="Identity" value={profile.kycStatus} />
                <Row label="Two-factor" value={profile.mfaEnabled ? "Enabled" : "Off"} />
                <Row label="Referral code" value={profile.referralCode ?? "—"} mono />
                <Row label="Policy set" value={`v${POLICY_VERSION}`} />
                <Link href="/verify" className="text-[12.5px] font-semibold text-brand-600 hover:underline dark:text-brand-300">
                  Verification centre →
                </Link>
              </div>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}

/* ================================== PAY ================================ */

export async function PaySection({ userId, reference }: { userId: string; reference?: string }) {
  if (!reference) redirect("/wallet?tab=deposit");
  const [intent] = await db.select().from(paymentIntents).where(eq(paymentIntents.reference, reference)).limit(1);
  if (!intent || intent.userId !== userId) redirect("/wallet?tab=deposit");
  if (intent.status === "success") {
    return (
      <div className="mx-auto max-w-lg space-y-5 py-8">
        <Card className="p-7 text-center">
          <span className="mx-auto grid size-14 place-items-center rounded-full bg-brand-50 text-brand-600 dark:bg-brand-900/40 dark:text-brand-300">✓</span>
          <h1 className="mt-4 text-[20px] font-bold">Payment confirmed</h1>
          <p className="mt-1.5 text-[13px] muted">
            {naira(intent.amountKobo)} credited and reconciled server-side. Reference <span className="font-mono">{intent.reference}</span>.
          </p>
          <Button href="/dashboard" className="mt-5">
            Back to overview
          </Button>
        </Card>
      </div>
    );
  }
  const { DemoCheckout } = await import("@/components/clients/wallet").then((m) => ({ DemoCheckout: m.DemoCheckout }));
  return (
    <div className="mx-auto max-w-lg py-6">
      <DemoCheckout reference={intent.reference} amountKobo={Number(intent.amountKobo)} provider={intent.provider} channel={intent.channel} />
    </div>
  );
}

export async function settleFromQuery(reference: string) {
  const res = await verifyAndSettle(reference);
  return res.ok;
}

/* ------------------------------ unused guards -------------------------- */
void addDays;
void AllocationDonut;
