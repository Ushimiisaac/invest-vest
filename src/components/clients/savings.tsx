"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition, useActionState } from "react";
import {
  contributeAction,
  createGoalAction,
  createGroupAction,
  createLockAction,
  decideGroupAction,
  joinGroupAction,
  leaveGroupAction,
  raiseGroupDisputeAction,
  requestGroupWithdrawalAction,
  runAutomationAction,
  setAccountStatusAction,
  setLockTopUpAction,
  updateGoalAction,
  withdrawFromAccountAction,
  contributeToGroupAction,
  toggleRuleAction,
  deleteRuleAction,
  saveRuleAction,
  applyInvestmentAction,
  redeemHoldingAction,
} from "@/app/(app)/actions";
import { Alert, Badge, Button, Card, Field, Input, Modal, Progress, Select, Switch, Textarea, useToast } from "@/components/ui";
import { IDLE, type ActionState } from "@/lib/action-helpers";
import { PRODUCT } from "@/lib/config";
import { fmtDate, naira, toKobo } from "@/lib/utils";
import { cn } from "@/lib/utils";

type Plan = {
  id: string;
  name: string;
  kind: string;
  balanceKobo: number;
  targetKobo: number;
  contributionKobo: number;
  frequency: string | null;
  status: string;
  autoDebit: boolean;
  interestBps: number;
  lockMonths: number;
  penaltyBps: number;
  maturityDate: string | null;
  nextDueAt: string | null;
  progressPct?: number;
};

/* ============================ goals & plans =========================== */

export function GoalForm({ mode = "create", plan, accounts }: { mode?: "create" | "edit"; plan?: Plan; accounts?: Plan[] }) {
  const isEdit = mode === "edit" && Boolean(plan);
  const [state, formAction, pending] = useActionState(isEdit ? updateGoalAction : createGoalAction, IDLE);
  const [contribution, setContribution] = useState(String(plan?.contributionKobo ? plan.contributionKobo / 100 : ""));
  const [auto, setAuto] = useState(plan?.autoDebit ?? false);
  const router = useRouter();
  void accounts;

  return (
    <form action={formAction} className="space-y-4">
      {isEdit ? <input type="hidden" name="accountId" value={plan!.id} /> : null}
      <Field label="Goal name" htmlFor="g-name" error={state.field === "name" ? state.error : undefined}>
        <Input id="g-name" name="name" defaultValue={plan?.name} required placeholder="Lagos rent 2026" />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Target (₦)" htmlFor="g-target" error={state.field === "target" ? state.error : undefined}>
          <Input id="g-target" name="target" inputMode="decimal" defaultValue={plan?.targetKobo ? plan.targetKobo / 100 : ""} required placeholder="1800000" />
        </Field>
        <Field label="Purpose" htmlFor="g-purpose" hint="Used for grouping and reminders.">
          <Select id="g-purpose" name="purpose" defaultValue={plan?.kind === "regular" ? "regular" : "target"}>
            <option value="target">Specific goal</option>
            <option value="regular">Regular / no-deadline saving</option>
          </Select>
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={`Contribution (${naira(toKobo(contribution) || 0)} per cycle)`} htmlFor="g-contribution" error={state.field === "contribution" ? state.error : undefined}>
          <Input id="g-contribution" name="contribution" inputMode="decimal" value={contribution} onChange={(e) => setContribution(e.target.value)} placeholder="45000" />
        </Field>
        <Field label="Frequency" htmlFor="g-freq">
          <Select id="g-freq" name="frequency" defaultValue={plan?.frequency ?? "monthly"}>
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
          </Select>
        </Field>
      </div>
      {!isEdit ? (
        <Field label="Target date (optional)" htmlFor="g-deadline" hint="We derive the cadence needed if you leave the contribution blank.">
          <Input id="g-deadline" name="deadline" type="date" />
        </Field>
      ) : null}
      <div className="rounded-xl border p-3.5">
        <Switch
          checked={auto}
          onChange={setAuto}
          label="Automate this plan"
          description={`Pull ${naira(toKobo(contribution) || 0)} from the Flex wallet each cycle. If funds are short, we notify you instead of failing silently.`}
        />
        {auto ? (
          <label className="mt-3 flex items-start gap-2 text-[12.5px] muted">
            <input type="checkbox" name="consent" className="mt-0.5 size-4 accent-brand-600" defaultChecked={Boolean(plan)} />
            I consent to scheduled automatic transfers from my Flex wallet up to the amount above, and I can switch this off at any time.
          </label>
        ) : null}
        {state.field === "consent" ? <p className="mt-1 text-[12px] font-medium text-rose-600">{state.error}</p> : null}
      </div>
      {state.error && !state.field ? <Alert tone="danger">{state.error}</Alert> : null}
      {state.ok ? (
        <Alert tone="brand" title={isEdit ? "Plan updated" : "Plan created"}>
          {state.notice} <button className="font-semibold underline" type="button" onClick={() => router.refresh()}>Refresh</button>
        </Alert>
      ) : null}
      <div className="flex justify-end gap-2">
        <Button type="submit" loading={pending} size="lg">
          {isEdit ? "Save changes" : "Create plan"}
        </Button>
      </div>
    </form>
  );
}

export function ContributeForm({ plan, flexBalance }: { plan: Plan; flexBalance: number }) {
  const [state, formAction, pending] = useActionState(contributeAction, IDLE);
  const [amount, setAmount] = useState("");
  const { push } = useToast();
  const router = useRouter();
  const external = false;
  void external;
  return (
    <form action={formAction} className="space-y-3.5">
      <input type="hidden" name="accountId" value={plan.id} />
      <Field label="Amount to save (₦)" htmlFor="c-amount" error={state.field === "amount" ? state.error : undefined} hint={`Flex wallet holds ${naira(flexBalance)}.`}>
        <Input id="c-amount" name="amount" value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" placeholder="10000" required />
      </Field>
      <div className="flex flex-wrap gap-1.5">
        {[2000, 5000, 10000, 25000].map((v) => (
          <button key={v} type="button" onClick={() => setAmount(String(v / 100))} className="rounded-lg border px-2.5 py-1 text-[12px] font-semibold muted hover:border-brand-500">
            {naira(v)}
          </button>
        ))}
        <button type="button" onClick={() => setAmount(String(Math.max(0, Math.round(flexBalance / 100))))} className="rounded-lg border px-2.5 py-1 text-[12px] font-semibold muted hover:border-brand-500">
          Max
        </button>
      </div>
      {state.error && !state.field ? <Alert tone="danger">{state.error}</Alert> : null}
      {state.ok ? <Alert tone="brand">{state.notice}</Alert> : null}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" loading={pending} className="flex-1">
          Move from Flex wallet
        </Button>
        <Button
          variant="outline"
          type="button"
          onClick={() => {
            push({ tone: "info", title: "Open the wallet tab", body: "Use “Fund wallet → to this plan” to pay in by card or transfer." });
            router.push("/wallet?tab=deposit");
          }}
        >
          Pay externally
        </Button>
      </div>
    </form>
  );
}

export function WithdrawPlanForm({ plan }: { plan: Plan }) {
  const [state, formAction, pending] = useActionState(withdrawFromAccountAction, IDLE);
  const [amount, setAmount] = useState(String(Math.round(plan.balanceKobo / 100)));
  const early = plan.kind === "safelock" && plan.maturityDate ? new Date(plan.maturityDate).getTime() > Date.now() : false;
  return (
    <form action={formAction} className="space-y-3.5">
      <input type="hidden" name="accountId" value={plan.id} />
      <Field label="Amount (₦)" htmlFor="w-amount" error={state.field === "amount" ? state.error : undefined} hint={`Holding ${naira(plan.balanceKobo)}`}>
        <Input id="w-amount" name="amount" value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" required />
      </Field>
      {early ? (
        <Alert tone="warning" title={`Locked until ${fmtDate(plan.maturityDate)}`}>
          <label className="mt-1 flex items-start gap-2 text-[12.5px]">
            <input type="checkbox" name="acknowledge" className="mt-0.5 size-4 accent-amber-500" />
            I understand an early exit costs {(plan.penaltyBps / 100).toFixed(2)}% of accrued interest and forfeits the remaining term.
          </label>
          {state.field === "acknowledge" ? <p className="mt-1 text-[12px] font-semibold text-rose-600">{state.error}</p> : null}
        </Alert>
      ) : null}
      {state.error && !state.field ? <Alert tone="danger">{state.error}</Alert> : null}
      {state.ok ? <Alert tone="brand">{state.notice}</Alert> : null}
      <Button type="submit" loading={pending} className="w-full" variant={early ? "danger" : "primary"}>
        {early ? "Withdraw early" : "Move to Flex wallet"}
      </Button>
    </form>
  );
}

export function PlanCard({ plan, onOpen, href }: { plan: Plan; onOpen?: () => void; href?: string }) {
  const pct = plan.targetKobo > 0 ? Math.min(100, (plan.balanceKobo / plan.targetKobo) * 100) : 0;
  return (
    <Card className="group overflow-hidden transition-shadow hover:shadow-[var(--shadow-float)]">
      <div className="flex items-start gap-3 p-4">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl text-[11px] font-bold text-white" style={{ background: plan.kind === "safelock" ? "#0b8a65" : plan.kind === "group" ? "#2f6fb5" : "#0f9d76" }}>
          {plan.name.slice(0, 2).toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-[14.5px] font-bold">{plan.name}</h3>
            {plan.status !== "active" ? <Badge tone={plan.status === "paused" ? "warning" : "info"}>{plan.status}</Badge> : null}
            {plan.autoDebit ? <Badge tone="brand">Auto</Badge> : null}
          </div>
          <p className="mt-0.5 text-[12px] muted capitalize">
            {plan.kind === "safelock" ? `Locked · matures ${fmtDate(plan.maturityDate)}` : plan.kind === "group" ? "Group plan" : plan.kind === "regular" ? "Regular savings" : "Target savings"}
            {plan.contributionKobo ? ` · ${naira(plan.contributionKobo)} ${plan.frequency}` : ""}
          </p>
        </div>
        <span className="tnum shrink-0 text-right text-[15px] font-bold">{naira(plan.balanceKobo)}</span>
      </div>
      {plan.targetKobo > 0 ? (
        <div className="px-4 pb-3">
          <div className="flex justify-between text-[11.5px] muted">
            <span>{pct.toFixed(1)}% funded</span>
            <span>of {naira(plan.targetKobo)}</span>
          </div>
          <Progress value={pct} className="mt-1.5" />
        </div>
      ) : null}
      {href && !onOpen ? (
        <Link href={href} className="block border-t px-4 py-2.5 text-[12.5px] font-semibold text-brand-600 hover:bg-[var(--surface-sunken)] dark:text-brand-300">
          Manage plan →
        </Link>
      ) : null}
      {onOpen ? (
        <button onClick={onOpen} className="w-full border-t px-4 py-2.5 text-left text-[12.5px] font-semibold text-brand-600 hover:bg-[var(--surface-sunken)] dark:text-brand-300">
          Manage plan →
        </button>
      ) : null}
    </Card>
  );
}

export function PauseResumeButton({ plan }: { plan: Plan }) {
  const [pending, start] = useTransition();
  return (
    <Button
      size="sm"
      variant="outline"
      loading={pending}
      onClick={() => start(async () => { await setAccountStatusAction(plan.id, plan.status === "paused" ? "active" : "paused"); window.location.reload(); })}
    >
      {plan.status === "paused" ? "Resume" : "Pause"}
    </Button>
  );
}

export function PlanManagerDialog({ plan, flexBalance, open, onClose }: { plan: Plan; flexBalance: number; open: boolean; onClose: () => void }) {
  const [tab, setTab] = useState<"add" | "withdraw" | "settings">("add");
  return (
    <Modal
      open={open}
      onClose={onClose}
      width="max-w-xl"
      title={plan.name}
      description={`${naira(plan.balanceKobo)} held${plan.targetKobo ? ` · target ${naira(plan.targetKobo)}` : ""}`}
      footer={
        <div className="flex w-full items-center justify-between">
          <div className="flex gap-1">
            {(["add", "withdraw", "settings"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={cn("rounded-lg px-2.5 py-1.5 text-[12.5px] font-semibold capitalize", tab === t ? "bg-brand-600 text-white" : "muted hover:bg-[var(--surface-sunken)]")}
              >
                {t === "add" ? "Add money" : t === "withdraw" ? "Withdraw" : "Settings"}
              </button>
            ))}
          </div>
          <PauseResumeButton plan={plan} />
        </div>
      }
    >
      {tab === "add" ? <ContributeForm plan={plan} flexBalance={flexBalance} /> : null}
      {tab === "withdraw" ? <WithdrawPlanForm plan={plan} /> : null}
      {tab === "settings" ? <GoalForm mode="edit" plan={plan} /> : null}
    </Modal>
  );
}

/* ================================ lock ================================ */

export function LockForm({ flexBalance }: { flexBalance: number }) {
  const [state, formAction, pending] = useActionState(createLockAction, IDLE);
  const [amount, setAmount] = useState("100000");
  const [months, setMonths] = useState(12);
  const tier = PRODUCT.safelockTiers.reduce((best, t) => (Math.abs(t.months - months) < Math.abs(best.months - months) ? t : best), PRODUCT.safelockTiers[0]);
  const gross = Math.round((toKobo(amount) * (tier.bps / 10000) * tier.months) / 12);
  const net = gross - Math.round(gross * 0.1);
  return (
    <form action={formAction} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Amount to lock (₦)" htmlFor="l-amount" error={state.field === "amount" ? state.error : undefined} hint={`Flex wallet: ${naira(flexBalance)}`}>
          <Input id="l-amount" name="amount" value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" required />
        </Field>
        <Field label="Plan name" htmlFor="l-name">
          <Input id="l-name" name="name" placeholder="Emergency buffer" className="mt-1.5" />
        </Field>
      </div>
      <div>
        <p className="text-[13px] font-medium">Choose a term</p>
        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-5">
          {PRODUCT.safelockTiers.map((t) => (
            <button
              type="button"
              key={t.months}
              onClick={() => setMonths(t.months)}
              className={cn(
                "rounded-xl border px-2 py-2.5 text-center transition-all",
                months === t.months ? "border-brand-500 bg-brand-50 dark:bg-brand-900/40" : "hover:border-brand-300",
              )}
            >
              <span className="block text-[13px] font-bold">{t.months}m</span>
              <span className="block text-[11px] muted">{(t.bps / 100).toFixed(2)}%</span>
            </button>
          ))}
        </div>
        <input type="hidden" name="months" value={months} />
      </div>
      <div className="grid grid-cols-3 gap-3">
        {[
          { k: "Gross interest", v: naira(gross) },
          { k: "Net of 10% WHT", v: naira(net) },
          { k: "Maturity value", v: naira(toKobo(amount) + net) },
        ].map((b) => (
          <div key={b.k} className="rounded-xl bg-[var(--surface-sunken)] p-3">
            <p className="text-[11px] muted">{b.k}</p>
            <p className="tnum mt-0.5 text-[14px] font-bold">{b.v}</p>
          </div>
        ))}
      </div>
      <label className="flex items-start gap-2.5 rounded-xl border p-3.5 text-[12.5px] leading-relaxed">
        <input type="checkbox" name="consent" className="mt-0.5 size-4 accent-brand-600" />
        <span>
          I understand locked funds are only freely available on maturity ({fmtDate(new Date(Date.now() + tier.months * 2_592_000_000))}) and early exit costs{" "}
          {(PRODUCT.safelockPenaltyBps / 100).toFixed(2)}% of accrued interest. Returns shown are indicative.
        </span>
      </label>
      {state.field === "consent" ? <p className="text-[12px] font-medium text-rose-600">{state.error}</p> : null}
      <label className="flex items-center gap-2 text-[12.5px]">
        <input type="checkbox" name="autoTopUp" className="size-4 accent-brand-600" /> Add a monthly top-up to this lock
      </label>
      <Field label="Monthly top-up (₦)" htmlFor="l-topup">
        <Input id="l-topup" name="topUp" inputMode="decimal" placeholder="10000" />
      </Field>
      {state.error && !state.field ? <Alert tone="danger">{state.error}</Alert> : null}
      {state.ok ? <Alert tone="brand">{state.notice}</Alert> : null}
      <Button type="submit" size="lg" loading={pending} className="w-full">
        Lock {naira(toKobo(amount) || 0)}
      </Button>
    </form>
  );
}

export function LockTopUpForm({ plan }: { plan: Plan }) {
  const [state, formAction, pending] = useActionState(setLockTopUpAction, IDLE);
  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="accountId" value={plan.id} />
      <Field label="Monthly top-up (₦)" htmlFor="t-topup" error={state.field ? state.error : undefined}>
        <Input id="t-topup" name="topUp" inputMode="decimal" defaultValue={plan.contributionKobo ? plan.contributionKobo / 100 : ""} />
      </Field>
      <label className="flex items-center gap-2 text-[12.5px]">
        <input type="checkbox" name="autoTopUp" defaultChecked={plan.autoDebit} className="size-4 accent-brand-600" /> Run automatically each month from my Flex wallet
      </label>
      {state.ok ? <Alert tone="brand">{state.notice}</Alert> : null}
      <Button type="submit" size="sm" loading={pending}>
        Save schedule
      </Button>
    </form>
  );
}

/* ================================ groups =============================== */

export function GroupCreateForm() {
  const [state, formAction, pending] = useActionState(createGroupAction, IDLE);
  const [code, setCode] = useState<string | null>(null);
  return (
    <form action={formAction} className="space-y-4">
      <Field label="Group name" htmlFor="gr-name" error={state.field === "name" ? state.error : undefined}>
        <Input id="gr-name" name="name" required placeholder="Siblings December fund" />
      </Field>
      <Field label="What is this for?" htmlFor="gr-desc">
        <Textarea id="gr-desc" name="description" placeholder="Everyone pays ₦20,000 monthly; the pot is shared in December." />
      </Field>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Per member / cycle (₦)" htmlFor="gr-per" error={state.field === "perMember" ? state.error : undefined}>
          <Input id="gr-per" name="perMember" inputMode="decimal" required placeholder="20000" />
        </Field>
        <Field label="Total target (₦)" htmlFor="gr-target">
          <Input id="gr-target" name="target" inputMode="decimal" placeholder="480000" />
        </Field>
        <Field label="Frequency" htmlFor="gr-freq">
          <Select id="gr-freq" name="frequency" defaultValue="monthly">
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
          </Select>
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Max members" htmlFor="gr-max">
          <Input id="gr-max" name="maxMembers" type="number" min={2} max={50} defaultValue={8} />
        </Field>
        <Field label="Contributions before any withdrawal" htmlFor="gr-min">
          <Input id="gr-min" name="minBeforeWithdraw" type="number" min={0} defaultValue={1} />
        </Field>
        <div className="pt-6">
          <Switch checked onChange={() => undefined} label={<span className="text-[12.5px]">Owner must approve withdrawals</span>} description="Applied by default" />
          <input type="hidden" name="requireApproval" value="on" />
        </div>
      </div>
      <Field label="Dispute policy" htmlFor="gr-disp" hint="Shown to every member and stored with each decision.">
        <Input id="gr-disp" name="disputePolicy" placeholder="Written disputes resolve within 7 days; refunds are pro-rata by contribution." />
      </Field>
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
      {state.ok ? (
        <Alert tone="brand" title="Group live">
          {state.notice}
          {state.data?.joinCode ? (
            <button type="button" className="mt-1 block font-mono font-bold underline" onClick={() => setCode(String(state.data?.joinCode))}>
              {String(state.data.joinCode)}
            </button>
          ) : null}
          {code ? <p className="mt-1 text-[12px]">Copied join code: {code}</p> : null}
        </Alert>
      ) : null}
      <Button type="submit" loading={pending} size="lg" className="w-full">
        Create group
      </Button>
    </form>
  );
}

export function GroupJoinForm() {
  const [state, formAction, pending] = useActionState(joinGroupAction, IDLE);
  return (
    <form action={formAction} className="flex flex-wrap items-end gap-2">
      <Field label="Join code" htmlFor="join-code" error={state.field === "code" ? state.error : undefined} className="min-w-[10rem] flex-1">
        <Input id="join-code" name="code" placeholder="GRPXXXXXX" className="uppercase" required />
      </Field>
      <Button type="submit" loading={pending}>
        Join
      </Button>
      {state.ok ? <p className="w-full text-[12px] font-medium text-brand-600 dark:text-brand-300">{state.notice}</p> : null}
    </form>
  );
}

export function GroupContributeForm({ groupId, suggested }: { groupId: string; suggested: number }) {
  const [state, formAction, pending] = useActionState(contributeToGroupAction, IDLE);
  return (
    <form action={formAction} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="groupId" value={groupId} />
      <label className="min-w-[8rem] flex-1 text-[12.5px] font-medium">
        Contribution (₦)
        <Input name="amount" inputMode="decimal" defaultValue={suggested ? suggested / 100 : ""} className="mt-1 h-9" />
      </label>
      <Button type="submit" size="sm" loading={pending}>
        Pay in
      </Button>
      {state.error ? <p className="w-full text-[12px] font-medium text-rose-600">{state.error}</p> : null}
      {state.ok ? <p className="w-full text-[12px] font-medium text-brand-600 dark:text-brand-300">{state.notice}</p> : null}
    </form>
  );
}

export function GroupWithdrawForm({ groupId }: { groupId: string }) {
  const [state, formAction, pending] = useActionState(requestGroupWithdrawalAction, IDLE);
  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="groupId" value={groupId} />
      <Field label="Amount (₦)" htmlFor="gw-amount" error={state.field === "amount" ? state.error : undefined}>
        <Input id="gw-amount" name="amount" inputMode="decimal" required />
      </Field>
      <Field label="Reason for the group" htmlFor="gw-note">
        <Textarea id="gw-note" name="note" placeholder="Rent top-up — already contributed 6 cycles." className="min-h-16" />
      </Field>
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
      {state.ok ? <Alert tone="brand">{state.notice}</Alert> : null}
      <Button type="submit" size="sm" loading={pending}>
        Request withdrawal
      </Button>
    </form>
  );
}

export function GroupDisputeForm({ groupId }: { groupId: string }) {
  const [state, formAction, pending] = useActionState(raiseGroupDisputeAction, IDLE);
  return (
    <form action={formAction} className="space-y-2.5">
      <input type="hidden" name="groupId" value={groupId} />
      <Field label="Raise a dispute" htmlFor="gd-note" hint="Visible to all members and to the platform audit trail.">
        <Textarea id="gd-note" name="note" className="min-h-16" placeholder="My ₦20,000 from the 4th cycle is missing from the ledger." required />
      </Field>
      {state.error ? <p className="text-[12px] font-medium text-rose-600">{state.error}</p> : null}
      {state.ok ? <p className="text-[12px] font-medium text-brand-600 dark:text-brand-300">{state.notice}</p> : null}
      <Button type="submit" size="sm" variant="outline" loading={pending}>
        Log dispute
      </Button>
    </form>
  );
}

export function DecideButtons({ actionId }: { actionId: string }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <div className="flex gap-2">
      <Button size="sm" loading={pending} onClick={() => start(async () => { await decideGroupAction(actionId, true); router.refresh(); })}>
        Approve
      </Button>
      <Button size="sm" variant="outline" disabled={pending} onClick={() => start(async () => { await decideGroupAction(actionId, false); router.refresh(); })}>
        Reject
      </Button>
    </div>
  );
}

export function LeaveGroupButton({ groupId }: { groupId: string }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <Button size="sm" variant="ghost" loading={pending} onClick={() => start(async () => { await leaveGroupAction(groupId); router.refresh(); })}>
      Leave group
    </Button>
  );
}

/* ============================== automation ============================= */

export function RuleForm({ plans, rule }: { plans: Plan[]; rule?: Record<string, unknown> }) {
  const [state, formAction, pending] = useActionState(saveRuleAction, IDLE);
  const [kind, setKind] = useState(String((rule?.kind as string) ?? "fixed"));
  void rule;
  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="ruleId" value={String((rule?.id as string) ?? "")} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Rule name" htmlFor="r-name">
          <Input id="r-name" name="name" placeholder="Salary-day sweep" required />
        </Field>
        <Field label="Type" htmlFor="r-kind">
          <Select id="r-kind" name="kind" value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value="fixed">Fixed amount each cycle</option>
            <option value="percentage_income">Percentage of income logged</option>
            <option value="roundup">Round-up spare change</option>
            <option value="reminder">Reminder only (no movement)</option>
          </Select>
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label={kind === "percentage_income" ? "Base salary (₦)" : "Amount (₦)"} htmlFor="r-amount" error={state.field === "amount" ? state.error : undefined}>
          <Input id="r-amount" name="amount" inputMode="decimal" placeholder={kind === "percentage_income" ? "450000" : "15000"} />
        </Field>
        <Field label="Percentage" htmlFor="r-pct" hint="For percentage rules">
          <Input id="r-pct" name="percentage" inputMode="decimal" placeholder="10" />
        </Field>
        <Field label="Cadence" htmlFor="r-freq">
          <Select id="r-freq" name="frequency" defaultValue="monthly">
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
          </Select>
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Move into" htmlFor="r-account">
          <Select id="r-account" name="accountId" defaultValue={plans[0]?.id}>
            {plans.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Hard cap per cycle (₦)" htmlFor="r-cap" hint="Safety ceiling. 0 = amount itself.">
          <Input id="r-cap" name="cap" inputMode="decimal" placeholder="50000" />
        </Field>
      </div>
      <label className="flex items-start gap-2.5 rounded-xl border p-3.5 text-[12.5px] leading-relaxed">
        <input type="checkbox" name="consent" className="mt-0.5 size-4 accent-brand-600" />
        I consent to this rule moving money from my Flex wallet on schedule. I can pause it instantly, and every run is written to my transaction history.
      </label>
      {state.field === "consent" ? <p className="text-[12px] font-medium text-rose-600">{state.error}</p> : null}
      {state.error && !state.field ? <Alert tone="danger">{state.error}</Alert> : null}
      {state.ok ? <Alert tone="brand">{state.notice}</Alert> : null}
      <Button type="submit" loading={pending}>
        Save rule
      </Button>
    </form>
  );
}

export function RuleRow({ id, active }: { id: string; active: boolean }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <div className="flex items-center gap-2">
      <Switch
        checked={active}
        disabled={pending}
        onChange={async (v) => {
          await toggleRuleAction(id, v);
          router.refresh();
        }}
      />
      <button
        onClick={() => start(async () => { await deleteRuleAction(id); router.refresh(); })}
        className="text-[12px] font-semibold text-rose-600 hover:underline"
      >
        Delete
      </button>
    </div>
  );
}

export function RunAutomationButton() {
  const [pending, start] = useTransition();
  const router = useRouter();
  const { push } = useToast();
  return (
    <Button
      size="sm"
      variant="secondary"
      loading={pending}
      onClick={() =>
        start(async () => {
          const res = await runAutomationAction();
          push({ tone: res.ok ? "success" : "error", title: "Automation run", body: res.notice });
          router.refresh();
        })
      }
    >
      Run due transfers now
    </Button>
  );
}

/* ============================== investments ============================ */

export function InvestmentApplyForm({
  product,
  flexBalance,
}: {
  product: { id: string; name: string; minKobo: number; maxKobo: number; tenorMonths: number; indicativeReturnBps: number; feeBps: number; status: string; riskLevel: string };
  flexBalance: number;
}) {
  const [state, formAction, pending] = useActionState(applyInvestmentAction, IDLE);
  const [amount, setAmount] = useState(String(Math.round(product.minKobo / 100)));
  const kobo = toKobo(amount);
  const years = product.tenorMonths / 12;
  const growth = Math.round(kobo * (product.indicativeReturnBps / 10000) * years);
  const fee = Math.round((kobo * product.feeBps) / 10000);
  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="productId" value={product.id} />
      <Field label="Amount (₦)" htmlFor="i-amount" error={state.field === "amount" ? state.error : undefined} hint={`Min ${naira(product.minKobo)} · max ${product.maxKobo ? naira(product.maxKobo) : "no cap"} · Flex balance ${naira(flexBalance)}`}>
        <Input id="i-amount" name="amount" value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" required />
      </Field>
      <div className="grid grid-cols-3 gap-3">
        {[
          { k: "Entry fee", v: naira(fee) },
          { k: "Indicative growth", v: naira(growth) },
          { k: "Projected total", v: naira(kobo + growth - fee) },
        ].map((b) => (
          <div key={b.k} className="rounded-xl bg-[var(--surface-sunken)] p-3">
            <p className="text-[11px] muted">{b.k}</p>
            <p className="tnum mt-0.5 text-[14px] font-bold">{b.v}</p>
          </div>
        ))}
      </div>
      <Alert tone={product.status === "simulated" ? "warning" : "info"} title={product.status === "simulated" ? "Simulated instrument" : "Risk disclosure"}>
        {product.status === "simulated"
          ? "This is a demo instrument for testing flows. No real security is bought and no real return accrues."
          : `Capital is at risk. ${product.riskLevel} risk products can lose value. Projected figures are estimates based on the indicative rate and are not a promise of performance.`}
      </Alert>
      <label className="flex items-start gap-2.5 rounded-xl border p-3.5 text-[12.5px] leading-relaxed">
        <input type="checkbox" name="consent" className="mt-0.5 size-4 accent-brand-600" />
        I have read the risk disclosure, fees and tenor, and I understand returns are not guaranteed and capital can be lost.
      </label>
      {product.status === "simulated" ? (
        <label className="flex items-start gap-2.5 rounded-xl border border-amber-300/60 p-3.5 text-[12.5px] leading-relaxed">
          <input type="checkbox" name="confirmSimulated" className="mt-0.5 size-4 accent-amber-500" />
          I acknowledge this is simulated data used for testing, not a real investment offer.
        </label>
      ) : null}
      {state.error && !["amount"].includes(state.field ?? "") ? <Alert tone="danger">{state.error}</Alert> : null}
      {state.ok ? <Alert tone="brand">{state.notice}</Alert> : null}
      <Button type="submit" size="lg" loading={pending} className="w-full">
        Confirm {product.status === "simulated" ? "simulated" : ""} investment of {naira(kobo || 0)}
      </Button>
    </form>
  );
}

export function RedeemButton({ holdingId }: { holdingId: string }) {
  const [pending, start] = useTransition();
  const { push } = useToast();
  return (
    <Button
      size="sm"
      variant="outline"
      loading={pending}
      onClick={() =>
        start(async () => {
          const res = await redeemHoldingAction(holdingId);
          push({ tone: res.ok ? "success" : "error", title: res.ok ? "Redemption settled" : "Cannot redeem", body: res.notice ?? res.error });
        })
      }
    >
      Redeem to wallet
    </Button>
  );
}
