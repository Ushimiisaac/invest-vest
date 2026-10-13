"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition, useActionState } from "react";
import {
  addBankAccountAction,
  cancelWithdrawalAction,
  confirmDemoDepositAction,
  fundWalletAction,
  removeBankAccountAction,
  requestWithdrawalAction,
  retryFailedDepositAction,
  setDefaultBankAction,
  verifyDepositAction,
} from "@/app/(app)/actions";
import { Alert, Badge, Button, Card, Field, Input, Modal, Progress, Row, Select, useToast } from "@/components/ui";
import { BANKS } from "@/lib/banks";
import { LIVE_PAYMENTS, PRODUCT } from "@/lib/config";
import { IDLE, type ActionState } from "@/lib/action-helpers";
import { fmtDateTime, maskAccount, naira, toKobo } from "@/lib/utils";

type Bank = { id: string; bankName: string; accountNumber: string; accountName: string; verified: boolean; isDefault: boolean; verificationSource: string };
type AccountLite = { id: string; name: string; kind: string; balanceKobo: number; status: string };

/* ------------------------------- deposit ------------------------------ */

export function FundWalletCard({ accounts, defaultAccountId }: { accounts: AccountLite[]; defaultAccountId?: string }) {
  const [state, formAction, pending] = useActionState(fundWalletAction, IDLE);
  const [amount, setAmount] = useState("");
  const [channel, setChannel] = useState("card");
  const [accountId, setAccountId] = useState(defaultAccountId ?? accounts[0]?.id ?? "");
  const router = useRouter();
  const { push } = useToast();
  const quick = [1000, 5000, 20000, 100000, 500000];

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="idempotencyKey" value={`${accountId}:${amount}:${Date.now()}`} />
      <Field label="Destination" htmlFor="fund-account">
        <Select id="fund-account" name="accountId" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name} · {naira(a.balanceKobo)}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Amount (₦)" htmlFor="fund-amount" error={state.field === "amount" ? state.error : undefined} hint={`Minimum ${naira(PRODUCT.minDepositKobo)} · maximum ${naira(PRODUCT.maxDepositKobo, { compact: true })}`}>
        <Input id="fund-amount" name="amount" value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" placeholder="25,000" required />
      </Field>
      <div className="flex flex-wrap gap-1.5">
        {quick.map((q) => (
          <button
            key={q}
            type="button"
            onClick={() => setAmount(String(q))}
            className="rounded-lg border px-2.5 py-1 text-[12px] font-semibold muted hover:border-brand-500 hover:text-brand-700 dark:hover:text-brand-300"
          >
            {naira(q * 100, { compact: true })}
          </button>
        ))}
      </div>
      <Field label="Method" htmlFor="fund-channel" hint={LIVE_PAYMENTS ? "Processed by your configured provider." : "No provider key is set, so the checkout below is simulated."}>
        <Select id="fund-channel" name="channel" value={channel} onChange={(e) => setChannel(e.target.value)}>
          <option value="card">Debit / credit card</option>
          <option value="bank">Bank transfer</option>
          <option value="ussd">USSD</option>
          <option value="transfer">Direct transfer reference</option>
        </Select>
      </Field>
      {state.error && state.field !== "amount" ? <Alert tone="danger">{state.error}</Alert> : null}
      {state.ok && state.data?.reference ? (
        <Alert tone={LIVE_PAYMENTS ? "info" : "gold"} title="Payment session opened">
          <p>Reference {String(state.data.reference)}. Money is only credited after server-side verification.</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {LIVE_PAYMENTS ? (
              <Button size="sm" onClick={() => router.push(String(state.data?.checkoutUrl))}>
                Continue to secure checkout
              </Button>
            ) : (
              <Button
                size="sm"
                variant="gold"
                onClick={async () => {
                  const res = await confirmDemoDepositAction(String(state.data?.reference));
                  push({ tone: res.ok ? "success" : "error", title: res.ok ? "Deposit credited" : "Deposit failed", body: res.notice ?? res.error });
                  router.refresh();
                }}
              >
                Simulate successful payment
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={() => router.push(`/pay?ref=${String(state.data?.reference)}`)}>
              Open checkout page
            </Button>
          </div>
        </Alert>
      ) : null}
      <Button type="submit" size="lg" loading={pending} className="w-full">
        {pending ? "Preparing payment" : `Fund ${naira(toKobo(amount) || 0)}`}
      </Button>
    </form>
  );
}

/* ------------------------------ withdrawal ----------------------------- */

export function WithdrawalForm({ accounts, banks, mfaEnabled, limitRemaining }: { accounts: AccountLite[]; banks: Bank[]; mfaEnabled: boolean; limitRemaining: number }) {
  const [state, formAction, pending] = useActionState(requestWithdrawalAction, IDLE);
  const [amount, setAmount] = useState("");
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const fee = Math.max(PRODUCT.withdrawalFeeKobo, Math.round((toKobo(amount) * PRODUCT.withdrawalFeeBps) / 10000));
  const router = useRouter();

  return (
    <form action={formAction} className="space-y-4">
      <Field label="From account" htmlFor="wd-account">
        <Select id="wd-account" name="accountId" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name} · {naira(a.balanceKobo)} {a.kind !== "flex" ? "(from plan)" : ""}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Amount (₦)" htmlFor="wd-amount" error={state.field === "amount" ? state.error : undefined} hint={`Fee ${naira(fee)} · daily limit remaining ${naira(limitRemaining)}`}>
        <Input id="wd-amount" name="amount" value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" placeholder="50,000" required />
      </Field>
      <Field label="Beneficiary" htmlFor="wd-bank" error={state.field === "bankAccountId" ? state.error : undefined}>
        {banks.length === 0 ? (
          <p className="rounded-xl border border-dashed p-3 text-[12.5px] muted">Add and verify a bank account first — payouts only go to accounts we can match a name against.</p>
        ) : (
          <Select id="wd-bank" name="bankAccountId" defaultValue={banks.find((b) => b.isDefault)?.id ?? banks[0].id}>
            {banks.map((b) => (
              <option key={b.id} value={b.id}>
                {b.bankName} {maskAccount(b.accountNumber)} — {b.accountName}
              </option>
            ))}
          </Select>
        )}
      </Field>
      {mfaEnabled ? (
        <Field label="Authenticator or recovery code" htmlFor="wd-code" error={state.field === "code" ? state.error : undefined}>
          <Input id="wd-code" name="code" inputMode="numeric" maxLength={12} placeholder="6-digit code" />
        </Field>
      ) : (
        <Field label="Confirm with password" htmlFor="wd-pass" error={state.field === "password" ? state.error : undefined} hint="Payouts always require a second factor — code or password.">
          <Input id="wd-pass" name="password" type="password" autoComplete="current-password" />
        </Field>
      )}
      {state.error && !state.field ? <Alert tone="danger">{state.error}</Alert> : null}
      {state.ok ? (
        <Alert tone="brand" title="Request logged">
          {state.notice} <button type="button" onClick={() => router.refresh()} className="font-semibold underline">Refresh</button>
        </Alert>
      ) : null}
      <Button type="submit" size="lg" loading={pending} className="w-full" disabled={banks.length === 0}>
        Request withdrawal
      </Button>
    </form>
  );
}

export function CancelWithdrawalButton({ id }: { id: string }) {
  const [pending, start] = useTransition();
  return (
    <Button
      size="sm"
      variant="ghost"
      loading={pending}
      onClick={() =>
        start(async () => {
          const res = await cancelWithdrawalAction(id);
          window.location.reload();
          void res;
        })
      }
    >
      Cancel
    </Button>
  );
}

/* ------------------------------- banks --------------------------------- */

export function BankAccountManager({ banks }: { banks: Bank[] }) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(addBankAccountAction, IDLE);
  const { push } = useToast();
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-[13px] font-semibold">Payout beneficiaries</p>
        <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
          + Add account
        </Button>
      </div>
      {banks.length === 0 ? (
        <p className="rounded-xl border border-dashed p-4 text-[13px] muted">No beneficiary yet. Payouts are blocked until one is verified.</p>
      ) : (
        <ul className="divide-y">
          {banks.map((b) => (
            <li key={b.id} className="flex flex-wrap items-center gap-3 py-3">
              <span className="grid size-9 place-items-center rounded-lg bg-brand-50 text-[11px] font-bold text-brand-700 dark:bg-brand-900/40 dark:text-brand-200">
                {b.bankName.slice(0, 2).toUpperCase()}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13.5px] font-semibold">
                  {b.bankName} · {maskAccount(b.accountNumber)}
                </span>
                <span className="block truncate text-[12px] muted">
                  {b.accountName} {b.verificationSource === "simulated" ? "· simulated match" : "· provider verified"}
                </span>
              </span>
              {b.isDefault ? <Badge tone="brand">Default</Badge> : (
                <button
                  onClick={async () => {
                    await setDefaultBankAction(b.id);
                    push({ tone: "success", title: "Default beneficiary updated" });
                  }}
                  className="text-[12px] font-semibold muted hover:text-brand-600"
                >
                  Make default
                </button>
              )}
              <button
                onClick={async () => {
                  await removeBankAccountAction(b.id);
                  push({ tone: "warning", title: "Beneficiary removed" });
                }}
                className="text-[12px] font-semibold text-rose-600 hover:underline"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Add a verified bank account"
        description="We resolve the account name before saving it. Payouts only go to verified beneficiaries."
      >
        <form action={formAction} className="space-y-4">
          <Field label="Bank" htmlFor="bank-name" error={state.field === "bankName" ? state.error : undefined}>
            <Select id="bank-name" name="bankName" defaultValue={BANKS[0].name}>
              {BANKS.map((b) => (
                <option key={b.code + b.name}>{b.name}</option>
              ))}
            </Select>
          </Field>
          <Field label="Account number" htmlFor="bank-num" error={state.field === "accountNumber" ? state.error : undefined} hint="10 digits, NUBAN format.">
            <Input id="bank-num" name="accountNumber" inputMode="numeric" maxLength={10} required />
          </Field>
          {state.error && !state.field ? <Alert tone="danger">{state.error}</Alert> : null}
          {state.ok ? <Alert tone="brand">{state.notice}</Alert> : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Close
            </Button>
            <Button type="submit" loading={pending}>
              Verify & save
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

/* --------------------------- pending & receipts ------------------------ */

export function PendingDepositRow({ reference, amountKobo, status, createdAt }: { reference: string; amountKobo: number; status: string; createdAt: string }) {
  const [pending, start] = useTransition();
  const { push } = useToast();
  return (
    <div className="flex flex-wrap items-center gap-3 border-b py-3 last:border-0">
      <div className="min-w-0 flex-1">
        <p className="truncate font-mono text-[12.5px] font-semibold">{reference}</p>
        <p className="text-[11.5px] muted">{fmtDateTime(createdAt)}</p>
      </div>
      <span className="tnum text-[13.5px] font-bold">{naira(amountKobo)}</span>
      <Badge tone={status === "success" ? "brand" : status === "failed" ? "danger" : "warning"}>{status === "success" ? "Credited" : status === "failed" ? "Verify again" : "Awaiting provider"}</Badge>
      {status !== "success" ? (
        <Button
          size="sm"
          variant="outline"
          loading={pending}
          onClick={() =>
            start(async () => {
              const res = status === "failed" ? await retryFailedDepositAction(reference) : await verifyDepositAction(reference);
              push({ tone: res.ok ? "success" : "error", title: res.ok ? "Reconciled" : "Still unconfirmed", body: res.notice ?? res.error });
            })
          }
        >
          Re-verify
        </Button>
      ) : null}
    </div>
  );
}

export function ReceiptDialog({ txn, accountName, open, onClose }: { txn: TxnLike | null; accountName: string; open: boolean; onClose: () => void }) {
  if (!txn) return null;
  return (
    <Modal open={open} onClose={onClose} title="Transaction receipt" description={`Reference ${txn.reference}`}>
      <div className="space-y-1">
        <Row label="Date" value={fmtDateTime(txn.createdAt)} />
        <Row label="Account" value={accountName} />
        <Row label="Type" value={txn.type.replace(/_/g, " ")} />
        <Row label="Amount" value={naira(txn.amountKobo, { sign: txn.direction === "credit" })} mono />
        <Row label="Status" value={txn.status} />
        <Row label="Provider" value={txn.provider ?? "internal"} />
        <Row label="Direction" value={txn.direction} />
      </div>
      <div className="mt-4 flex gap-2">
        <Button size="sm" variant="outline" onClick={() => window.print()}>
          Print
        </Button>
        <Button size="sm" variant="ghost" onClick={onClose}>
          Done
        </Button>
      </div>
      <p className="mt-3 text-[11.5px] muted">
        Keep this reference for any support query. Receipts reflect ledger state at the moment of viewing.
      </p>
    </Modal>
  );
}

export type TxnLike = {
  reference: string;
  createdAt: string;
  type: string;
  amountKobo: number;
  status: string;
  direction: "credit" | "debit";
  provider: string | null;
  description: string | null;
  accountName?: string;
};

export function TransactionTable({ rows, accounts, canFilter = true }: { rows: (TxnLike & { id: string; accountName?: string })[]; accounts: AccountLite[]; canFilter?: boolean }) {
  const [selected, setSelected] = useState<TxnLike | null>(null);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [type, setType] = useState("all");
  const router = useRouter();

  const filtered = rows.filter((r) => {
    if (type !== "all" && r.type !== type) return false;
    if (from && new Date(r.createdAt) < new Date(from)) return false;
    if (to && new Date(r.createdAt) > new Date(`${to}T23:59:59`)) return false;
    return true;
  });

  return (
    <div>
      {canFilter ? (
        <div className="mb-3 flex flex-wrap items-end gap-2">
          <label className="text-[12px] font-medium">
            From
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="mt-1 h-9 w-[9.5rem]" />
          </label>
          <label className="text-[12px] font-medium">
            To
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="mt-1 h-9 w-[9.5rem]" />
          </label>
          <label className="text-[12px] font-medium">
            Type
            <Select value={type} onChange={(e) => setType(e.target.value)} className="mt-1 h-9 w-[10.5rem]">
              <option value="all">All types</option>
              {[...new Set(rows.map((r) => r.type))].map((t) => (
                <option key={t} value={t}>
                  {t.replace(/_/g, " ")}
                </option>
              ))}
            </Select>
          </label>
          <Link
            href={`/api/reports/statement?from=${from}&to=${to}&type=${type}`}
            className="rounded-lg border px-3 py-2 text-[12.5px] font-semibold hover:border-brand-500"
          >
            Download CSV
          </Link>
          <button onClick={() => router.refresh()} className="text-[12.5px] font-semibold muted hover:text-brand-600">
            Refresh
          </button>
          <span className="ml-auto text-[12px] muted">
            {filtered.length} of {rows.length} shown · {accounts.length} accounts
          </span>
        </div>
      ) : null}
      <div className="overflow-x-auto">
        <table className="dense w-full min-w-[640px] text-left text-[13px]">
          <thead>
            <tr className="border-b text-[11px] uppercase tracking-wide muted">
              <th className="font-bold">Date</th>
              <th className="font-bold">Description</th>
              <th className="font-bold">Type</th>
              <th className="text-right font-bold">Amount</th>
              <th className="font-bold">Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-10 text-center text-[13px] muted">
                  No transactions in this window.
                </td>
              </tr>
            ) : (
              filtered.map((r) => (
                <tr key={r.reference} className="border-b last:border-0 hover:bg-[var(--surface-sunken)]">
                  <td className="whitespace-nowrap muted">{fmtDateTime(r.createdAt)}</td>
                  <td className="max-w-[220px] truncate">{r.description ?? r.accountName ?? "—"}</td>
                  <td className="capitalize">{r.type.replace(/_/g, " ")}</td>
                  <td className={`tnum text-right font-bold ${r.direction === "credit" ? "text-brand-600 dark:text-brand-300" : ""}`}>
                    {r.direction === "credit" ? "+" : "−"}
                    {naira(r.amountKobo)}
                  </td>
                  <td>
                    <Badge tone={r.status === "successful" ? "brand" : r.status === "pending" ? "warning" : r.status === "reversed" ? "info" : "danger"}>{r.status}</Badge>
                  </td>
                  <td className="text-right">
                    <button onClick={() => setSelected(r)} className="text-[12px] font-semibold text-brand-600 hover:underline dark:text-brand-300">
                      Receipt
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <ReceiptDialog txn={selected} accountName={(selected as { accountName?: string })?.accountName ?? "IncreaseVest account"} open={Boolean(selected)} onClose={() => setSelected(null)} />
    </div>
  );
}

/* ---------------------------- balances summary ------------------------- */

export function BalanceBar({ available, locked, invested, pending }: { available: number; locked: number; invested: number; pending: number }) {
  const total = Math.max(1, available + locked + invested);
  const items = [
    { label: "Available", value: available, cls: "bg-brand-500" },
    { label: "Locked in plans", value: locked, cls: "bg-gold-400" },
    { label: "Invested", value: invested, cls: "bg-sky-500" },
  ];
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between text-[12px]">
        <span className="font-semibold">Where your money sits</span>
        {pending > 0 ? <Badge tone="warning">{naira(pending)} pending</Badge> : <Badge tone="brand">Nothing pending</Badge>}
      </div>
      <div className="mt-3 flex h-2.5 overflow-hidden rounded-full bg-[var(--surface-sunken)]">
        {items.map((i) => (
          <div key={i.label} className={i.cls} style={{ width: `${(i.value / total) * 100}%` }} />
        ))}
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        {items.map((i) => (
          <div key={i.label}>
            <span className="flex items-center gap-1.5 text-[11.5px] muted">
              <span className={`size-2 rounded-full ${i.cls}`} /> {i.label}
            </span>
            <p className="tnum mt-0.5 text-[15px] font-bold">{naira(i.value)}</p>
          </div>
        ))}
      </div>
      <Progress value={0} className="hidden" />
    </Card>
  );
}

export function DemoCheckout({ reference, amountKobo, provider, channel }: { reference: string; amountKobo: number; provider: string; channel: string }) {
  const [busy, start] = useTransition();
  const [done, setDone] = useState(false);
  const router = useRouter();
  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b bg-ink-900 px-5 py-3 text-white">
        <span className="text-[12px] font-bold uppercase tracking-[0.2em]">{provider === "demo" ? "IncreaseVest test checkout" : "Provider checkout"}</span>
        <span className="font-mono text-[11.5px] opacity-80">{reference}</span>
      </div>
      <div className="space-y-4 p-6 text-center">
        <p className="text-[13px] muted">You are about to pay</p>
        <p className="tnum text-[34px] font-extrabold">{naira(amountKobo)}</p>
        <p className="text-[12.5px] muted">Method: {channel} · This screen exists because no live provider key is configured. Nothing real is charged; the ledger path is identical to production.</p>
        {done ? (
          <Alert tone="brand" title="Paid">Verification ran on the server and your wallet was credited.</Alert>
        ) : null}
        <div className="flex flex-col gap-2">
          <Button
            size="lg"
            loading={busy}
            onClick={() =>
              start(async () => {
                const res = await confirmDemoDepositAction(reference);
                setDone(Boolean(res.ok));
                pushToast(res.ok ? "Payment confirmed" : (res.error ?? "Payment failed"));
                router.refresh();
              })
            }
          >
            Pay {naira(amountKobo)}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => router.push("/wallet?tab=deposit")}>
            Cancel and return
          </Button>
        </div>
      </div>
    </Card>
  );
}

function pushToast(title: string) {
  window.dispatchEvent(new CustomEvent("ss-toast", { detail: title }));
}
