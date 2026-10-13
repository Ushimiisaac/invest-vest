"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, useActionState } from "react";
import {
  askAssistantAction,
  beginMfaAction,
  changePasswordAction,
  closeTicketAction,
  confirmMfaAction,
  createTicketAction,
  disableMfaAction,
  markAllNotificationsReadAction,
  markOneNotificationReadAction,
  recordConsentAction,
  replyTicketAction,
  requestAccountClosureAction,
  revokeDeviceAction,
  revokeSessionAction,
  saveNotificationPrefsAction,
  submitKycAction,
  syncReferralRewardsAction,
  updateProfileAction,
  withdrawAutomationConsentAction,
} from "@/app/(app)/account-actions";
import { Alert, Badge, Button, Card, CopyField, Field, Input, Modal, Select, Switch, Textarea, useToast } from "@/components/ui";
import { IDLE } from "@/lib/action-helpers";
import { BRAND } from "@/lib/config";
import { fmtDateTime, naira } from "@/lib/utils";
import { cn } from "@/lib/utils";

export function ProfileForm({ fullName, email, phone }: { fullName: string; email: string; phone: string | null }) {
  const [state, formAction, pending] = useActionState(updateProfileAction, IDLE);
  return (
    <form action={formAction} className="space-y-4">
      <Field label="Full legal name" htmlFor="p-name" error={state.field === "fullName" ? state.error : undefined}>
        <Input id="p-name" name="fullName" defaultValue={fullName} required />
      </Field>
      <Field label="Email" htmlFor="p-email" hint="Email changes go through a re-verification flow — contact support.">
        <Input id="p-email" value={email} disabled />
      </Field>
      <Field label="Phone" htmlFor="p-phone" error={state.field === "phone" ? state.error : undefined}>
        <Input id="p-phone" name="phone" defaultValue={phone ?? ""} required />
      </Field>
      {state.error && !state.field ? <Alert tone="danger">{state.error}</Alert> : null}
      {state.ok ? <Alert tone="brand">{state.notice}</Alert> : null}
      <Button type="submit" loading={pending}>
        Save profile
      </Button>
    </form>
  );
}

export function PasswordForm({ signOutOption = true }: { signOutOption?: boolean }) {
  const [state, formAction, pending] = useActionState(changePasswordAction, IDLE);
  const router = useRouter();
  return (
    <form action={formAction} className="space-y-4">
      <Field label="Current password" htmlFor="cp-cur" error={state.field === "currentPassword" ? state.error : undefined}>
        <Input id="cp-cur" name="currentPassword" type="password" autoComplete="current-password" required />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="New password" htmlFor="cp-new" error={state.field === "newPassword" ? state.error : undefined} hint="8+ chars, mixed case, number.">
          <Input id="cp-new" name="newPassword" type="password" autoComplete="new-password" required />
        </Field>
        <Field label="Confirm new password" htmlFor="cp-conf" error={state.field === "confirmPassword" ? state.error : undefined}>
          <Input id="cp-conf" name="confirmPassword" type="password" autoComplete="new-password" required />
        </Field>
      </div>
      {signOutOption ? (
        <label className="flex items-center gap-2 text-[13px]">
          <input type="checkbox" name="signOutEverywhere" className="size-4 accent-brand-600" defaultChecked /> Sign me out of every other device
        </label>
      ) : null}
      {state.error && !state.field ? <Alert tone="danger">{state.error}</Alert> : null}
      {state.ok ? (
        <Alert tone="brand" title="Password updated">
          {state.notice}{" "}
          {state.data?.reauth ? (
            <button type="button" className="font-semibold underline" onClick={() => router.push("/login")}>
              Sign in again
            </button>
          ) : null}
        </Alert>
      ) : null}
      <Button type="submit" loading={pending}>
        Change password
      </Button>
    </form>
  );
}

export function MfaPanel({ enabled, email }: { enabled: boolean; email: string }) {
  const [setup, setSetup] = useState<{ secret: string; uri: string } | null>(null);
  const [state, formAction, pending] = useActionState(confirmMfaAction, IDLE);
  const [disableState, disableForm, disablePending] = useActionState(disableMfaAction, IDLE);
  const [loading, start] = useTransition();
  const router = useRouter();

  if (enabled) {
    return (
      <Card className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[14px] font-bold">Two-factor authentication is on</p>
            <p className="mt-1 text-[12.5px] muted">Required for payouts, beneficiary changes and new-device sign-ins.</p>
          </div>
          <Badge tone="brand">Enabled</Badge>
        </div>
        <form action={disableForm} className="mt-4 flex flex-wrap items-end gap-2">
          <Field label="Confirm password to disable" htmlFor="mfa-off" error={disableState.field === "password" ? disableState.error : undefined} className="min-w-[14rem] flex-1">
            <Input id="mfa-off" name="password" type="password" />
          </Field>
          <Button size="sm" variant="danger" type="submit" loading={disablePending}>
            Disable 2FA
          </Button>
        </form>
        {disableState.ok ? (
          <Alert tone="warning" title="Two-factor disabled" className="mt-3">
            {disableState.notice}
          </Alert>
        ) : null}
      </Card>
    );
  }

  return (
    <Card className="p-5">
      <p className="text-[14px] font-bold">Protect withdrawals with an authenticator app</p>
      <p className="mt-1 text-[12.5px] muted">Use Google Authenticator, Microsoft Authenticator, 2FAS or Aegis. Time-based codes rotate every 30 seconds.</p>
      {!setup ? (
        <Button
          className="mt-4"
          loading={loading}
          onClick={() =>
            start(async () => {
              const res = await beginMfaAction();
              if (res.ok && res.data) setSetup({ secret: String(res.data.secret), uri: String(res.data.uri) });
            })
          }
        >
          Start setup
        </Button>
      ) : (
        <div className="mt-4 space-y-4">
          <ol className="list-decimal space-y-1.5 pl-5 text-[13px]">
            <li>In your authenticator app choose “Add account” → “Enter a setup key”.</li>
            <li>Paste the secret below (type: time-based).</li>
            <li>Enter the 6-digit code to confirm.</li>
          </ol>
          <div className="grid gap-3 sm:grid-cols-2">
            <CopyField label="Secret key" value={setup.secret} />
            <CopyField label={`Account (${email})`} value={setup.uri} />
          </div>
          <form action={formAction} className="flex flex-wrap items-end gap-2">
            <Field label="Code from your app" htmlFor="mfa-code" error={state.field === "code" ? state.error : undefined} className="min-w-[12rem] flex-1">
              <Input id="mfa-code" name="code" inputMode="numeric" maxLength={6} className="tracking-[0.35em]" />
            </Field>
            <Button type="submit" loading={pending} onClick={() => undefined}>
              Confirm
            </Button>
          </form>
          {state.error && !state.field ? <Alert tone="danger">{state.error}</Alert> : null}
          {state.ok ? (
            <Alert tone="brand" title="Two-factor enabled — save these recovery codes">
              <p>Each code works once if you lose your phone. Nobody from {BRAND.name} will ever ask you for them.</p>
              <code className="mt-2 block whitespace-pre-wrap rounded-lg bg-[var(--surface-sunken)] p-2.5 text-[12px]">{String(state.data?.codes).split(",").join("\n")}</code>
              <Button size="sm" variant="outline" className="mt-2" onClick={() => router.refresh()}>
                Done
              </Button>
            </Alert>
          ) : null}
        </div>
      )}
    </Card>
  );
}

export function SessionManager({ sessions, devices }: { sessions: { id: string; ip: string | null; userAgent: string | null; createdAt: string; expiresAt: string }[]; devices: { id: string; label: string; lastSeenAt: string; ip: string | null }[] }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-[13px] font-semibold">Active sessions</p>
        <Button size="sm" variant="ghost" disabled={pending} onClick={() => start(async () => { await Promise.all(sessions.map((s) => revokeSessionAction(s.id))); router.refresh(); })}>
          Sign out all
        </Button>
      </div>
      <ul className="divide-y text-[13px]">
        {sessions.length === 0 ? <li className="py-4 muted">No other sessions.</li> : null}
        {sessions.map((s) => (
          <li key={s.id} className="flex flex-wrap items-center gap-3 py-2.5">
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">{(s.userAgent ?? "Unknown device").slice(0, 70)}</span>
              <span className="block text-[11.5px] muted">
                {s.ip ?? "—"} · created {fmtDateTime(s.createdAt)} · expires {fmtDateTime(s.expiresAt)}
              </span>
            </span>
            <button
              onClick={async () => {
                await revokeSessionAction(s.id);
                router.refresh();
              }}
              className="text-[12px] font-semibold text-rose-600 hover:underline"
            >
              Revoke
            </button>
          </li>
        ))}
      </ul>
      {devices.length ? (
        <div>
          <p className="text-[13px] font-semibold">Known devices</p>
          <ul className="mt-2 space-y-1.5">
            {devices.map((d) => (
              <li key={d.id} className="flex items-center gap-2 text-[12.5px]">
                <span className="min-w-0 flex-1 truncate">
                  {d.label} · last seen {fmtDateTime(d.lastSeenAt)}
                </span>
                <button
                  onClick={async () => {
                    await revokeDeviceAction(d.id);
                    router.refresh();
                  }}
                  className="font-semibold text-rose-600 hover:underline"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

export function KycForm({ status, last4 }: { status: string; last4: string | null }) {
  const [state, formAction, pending] = useActionState(submitKycAction, IDLE);
  if (status === "verified")
    return (
      <Alert tone="brand" title="Identity verified">
        Your ID matches our records (ending {last4 ?? "----"}). Higher deposit and withdrawal limits and real investment products are unlocked.
      </Alert>
    );
  return (
    <form action={formAction} className="space-y-4">
      <Alert tone="info" title="How we store your identifier">
        We hash your BVN/NIN with a server-side secret and keep only the final four digits for support verification. The raw number is never written to the
        database. Verification is {process.env.NODE_ENV === "production" ? "reviewed by compliance" : "auto-approved when the sandbox flag is set"}.
      </Alert>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name on your ID" htmlFor="k-name" error={state.field === "legalName" ? state.error : undefined}>
          <Input id="k-name" name="legalName" required placeholder="Chukwuemerika Obi" />
        </Field>
        <Field label="Date of birth" htmlFor="k-dob" error={state.field === "dob" ? state.error : undefined}>
          <Input id="k-dob" name="dob" type="date" required />
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Identifier type" htmlFor="k-type">
          <Select id="k-type" name="idType" defaultValue="bvn">
            <option value="bvn">BVN</option>
            <option value="nin">NIN</option>
            <option value="passport">International passport</option>
            <option value="drivers">Driver&apos;s licence</option>
          </Select>
        </Field>
        <Field label="Identifier number" htmlFor="k-num" error={state.field === "idNumber" ? state.error : undefined}>
          <Input id="k-num" name="idNumber" required inputMode="numeric" />
        </Field>
      </div>
      {state.error && !state.field ? <Alert tone="danger">{state.error}</Alert> : null}
      {state.ok ? <Alert tone="brand">{state.notice}</Alert> : null}
      <Button type="submit" loading={pending} size="lg">
        {status === "pending" ? "Resubmit for review" : "Submit for verification"}
      </Button>
    </form>
  );
}

const PREF_KEYS: { key: string; label: string; desc: string }[] = [
  { key: "deposit", label: "Deposits", desc: "Successful and failed top-ups" },
  { key: "withdrawal", label: "Withdrawals", desc: "Requests, approvals, payouts, declines" },
  { key: "contribution", label: "Contributions", desc: "Each scheduled transfer that runs" },
  { key: "missed", label: "Missed contributions", desc: "When automation cannot fund a plan" },
  { key: "milestone", label: "Milestones", desc: "25 / 50 / 75 / 100 percent of a goal" },
  { key: "maturity", label: "Plan maturity", desc: "SafeLock and investment maturity events" },
  { key: "security", label: "Security alerts", desc: "New devices, password and 2FA changes" },
  { key: "verification", label: "Verification", desc: "Email, phone and KYC status" },
  { key: "product", label: "Product updates", desc: "Feature and policy announcements" },
];

export function NotificationPreferences({ initial }: { initial: Record<string, { in_app: boolean; email: boolean; sms: boolean }> }) {
  const [prefs, setPrefs] = useState<Record<string, { in_app: boolean; email: boolean; sms: boolean }>>(() => {
    const base: Record<string, { in_app: boolean; email: boolean; sms: boolean }> = {};
    for (const k of PREF_KEYS) base[k.key] = initial[k.key] ?? { in_app: true, email: false, sms: false };
    return base;
  });
  const [saved, setSaved] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const { push } = useToast();
  return (
    <div className="space-y-3">
      <div className="hidden grid-cols-[1fr_repeat(3,5.2rem)] gap-2 border-b pb-2 text-[11px] font-bold uppercase tracking-wide muted sm:grid">
        <span>Event</span>
        <span className="text-center">In-app</span>
        <span className="text-center">Email</span>
        <span className="text-center">SMS</span>
      </div>
      {PREF_KEYS.map((k) => (
        <div key={k.key} className="grid grid-cols-1 items-center gap-2 border-b py-2.5 last:border-0 sm:grid-cols-[1fr_repeat(3,5.2rem)]">
          <div>
            <p className="text-[13px] font-semibold">{k.label}</p>
            <p className="text-[11.5px] muted">{k.desc}</p>
          </div>
          {(["in_app", "email", "sms"] as const).map((ch) => (
            <div key={ch} className="flex justify-center">
              <Switch
                checked={Boolean(prefs[k.key]?.[ch])}
                onChange={(v) => setPrefs((prev) => ({ ...prev, [k.key]: { ...prev[k.key], [ch]: v } }))}
              />
            </div>
          ))}
        </div>
      ))}
      <div className="flex items-center gap-3 pt-1">
        <Button
          size="sm"
          loading={pending}
          onClick={() =>
            start(async () => {
              const res = await saveNotificationPrefsAction(prefs);
              setSaved(res.notice ?? null);
              push({ tone: "success", title: "Preferences saved" });
            })
          }
        >
          Save preferences
        </Button>
        {saved ? <span className="text-[12.5px] font-medium text-brand-600 dark:text-brand-300">{saved}</span> : null}
      </div>
      <p className="text-[11.5px] muted">SMS for security and payout events is on by default and cannot be replaced by email alone.</p>
    </div>
  );
}

export function ConsentCenter({ consents, onWithdrawAutomation }: { consents: { kind: string; version: string; granted: boolean; createdAt: string }[]; onWithdrawAutomation?: () => void }) {
  const [pending, start] = useTransition();
  const latest = (kind: string) => consents.find((c) => c.kind === kind);
  return (
    <div className="space-y-2.5">
      {[
        { kind: "terms", label: "Terms of use", desc: `v${BRAND.rcNumber}` },
        { kind: "privacy", label: "Privacy policy", desc: "How your data is used and retained" },
        { kind: "data_processing", label: "Data processing", desc: "Ledger, KYC and support records" },
        { kind: "auto_debit", label: "Automatic transfers", desc: "Scheduled pulls from your Flex wallet" },
        { kind: "investments", label: "Investment risk acknowledgement", desc: "Read before subscribing to any product" },
      ].map((row) => {
        const record = latest(row.kind);
        return (
          <div key={row.kind} className="flex flex-wrap items-center gap-3 rounded-xl border p-3.5">
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-semibold">{row.label}</p>
              <p className="text-[11.5px] muted">{row.desc}</p>
            </div>
            {record ? (
              <span className="text-[11.5px] muted">{record.granted ? `Accepted ${fmtDateTime(record.createdAt)}` : `Withdrawn ${fmtDateTime(record.createdAt)}`}</span>
            ) : (
              <Badge tone="warning">Not recorded</Badge>
            )}
            <Button
              size="sm"
              variant={record?.granted ? "outline" : "primary"}
              loading={pending}
              onClick={() => start(async () => { await recordConsentAction(row.kind, !record?.granted); window.location.reload(); })}
            >
              {record?.granted ? "Withdraw" : "Accept"}
            </Button>
          </div>
        );
      })}
      <button
        onClick={() =>
          start(async () => {
            await withdrawAutomationConsentAction();
            onWithdrawAutomation?.();
            window.location.reload();
          })
        }
        className="text-[12.5px] font-semibold text-rose-600 hover:underline"
      >
        Withdraw all automation consent and pause every rule
      </button>
    </div>
  );
}

export function ClosurePanel() {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(requestAccountClosureAction, IDLE);
  return (
    <>
      <Button variant="danger" size="sm" onClick={() => setOpen(true)}>
        Request account closure
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Close your account" description="Zero balance required. A 30-day recovery window applies before deletion.">
        <form action={formAction} className="space-y-3">
          <Field label="Confirm with your password" htmlFor="cl-pass" error={state.field === "password" ? state.error : undefined}>
            <Input id="cl-pass" name="password" type="password" required />
          </Field>
          {state.error && !state.field ? <Alert tone="danger">{state.error}</Alert> : null}
          {state.ok ? <Alert tone="brand">{state.notice}</Alert> : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Keep account
            </Button>
            <Button type="submit" variant="danger" loading={pending}>
              Schedule closure
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}

export function NotificationList({ items }: { items: { id: string; title: string; body: string; severity: string; createdAt: string; link: string | null; readAt: string | null; type: string }[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-[13px] muted">{items.filter((i) => !i.readAt).length} unread</p>
        <Button size="sm" variant="outline" loading={pending} onClick={() => start(async () => { await markAllNotificationsReadAction(); router.refresh(); })}>
          Mark all read
        </Button>
      </div>
      <ul className="divide-y overflow-hidden rounded-2xl border bg-[var(--surface-raised)]">
        {items.length === 0 ? <li className="p-8 text-center text-[13px] muted">No notifications yet.</li> : null}
        {items.map((n) => (
          <li key={n.id} className={cn("flex items-start gap-3 p-4", !n.readAt && "bg-brand-50/40 dark:bg-brand-900/15")}>
            <span className={cn("mt-1 size-2 shrink-0 rounded-full", n.severity === "success" ? "bg-brand-500" : n.severity === "warning" ? "bg-amber-500" : n.severity === "danger" ? "bg-rose-500" : "bg-sky-500")} />
            <div className="min-w-0 flex-1">
              <p className="text-[13.5px] font-semibold">{n.title}</p>
              <p className="mt-1 text-[12.5px] leading-snug muted">{n.body}</p>
              <p className="mt-1.5 text-[11px] muted capitalize">
                {n.type.replace(/_/g, " ")} · {fmtDateTime(n.createdAt)}
              </p>
            </div>
            {!n.readAt ? (
              <button
                onClick={async () => {
                  await markOneNotificationReadAction(n.id);
                  router.refresh();
                }}
                className="shrink-0 text-[12px] font-semibold text-brand-600 hover:underline dark:text-brand-300"
              >
                Mark read
              </button>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function TicketComposer({ categories = ["general", "deposits", "withdrawal", "savings", "investments", "security", "kyc", "bugs"] }: { categories?: string[] }) {
  const [state, formAction, pending] = useActionState(createTicketAction, IDLE);
  return (
    <form action={formAction} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-[1fr_11rem]">
        <Field label="Subject" htmlFor="t-subject" error={state.field === "subject" ? state.error : undefined}>
          <Input id="t-subject" name="subject" required placeholder="Withdrawal pending since Monday" />
        </Field>
        <Field label="Category" htmlFor="t-cat">
          <Select id="t-cat" name="category" defaultValue={categories[0]}>
            {categories.map((c) => (
              <option key={c} value={c} className="capitalize">
                {c}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <Field label="Details" htmlFor="t-body" error={state.field === "body" ? state.error : undefined} hint="Include a transaction reference if relevant. Never include passwords, PINs, OTPs or card numbers.">
        <Textarea id="t-body" name="body" required placeholder="What happened, when, and what you expected." />
      </Field>
      {state.error && !state.field ? <Alert tone="danger">{state.error}</Alert> : null}
      {state.ok ? <Alert tone="brand" title="Ticket created">{state.notice}</Alert> : null}
      <Button type="submit" loading={pending}>
        Send to support
      </Button>
    </form>
  );
}

export function TicketThread({ ticketId, messages, status }: { ticketId: string; messages: { id: string; body: string; fromStaff: boolean; createdAt: string }[]; status: string }) {
  const [state, formAction, pending] = useActionState(replyTicketAction, IDLE);
  const [open, setOpen] = useState(false);
  const router = useRouter();
  return (
    <div className="space-y-3">
      <ul className="space-y-2">
        {messages.map((m) => (
          <li key={m.id} className={cn("rounded-xl border p-3 text-[13px]", m.fromStaff ? "bg-brand-50/60 dark:bg-brand-900/20" : "bg-[var(--surface-sunken)]")}>
            <div className="flex items-center justify-between text-[11.5px] muted">
              <span className="font-semibold">{m.fromStaff ? `${BRAND.name} support` : "You"}</span>
              <span>{fmtDateTime(m.createdAt)}</span>
            </div>
            <p className="mt-1.5 leading-relaxed">{m.body}</p>
          </li>
        ))}
      </ul>
      {status !== "closed" ? (
        <form action={formAction} className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="ticketId" value={ticketId} />
          <Field label="Reply" htmlFor={`reply-${ticketId}`} className="min-w-[14rem] flex-1">
            <Input id={`reply-${ticketId}`} name="body" placeholder="Add more detail…" />
          </Field>
          <Button type="submit" size="sm" loading={pending}>
            Send
          </Button>
          <Button size="sm" variant="ghost" type="button" onClick={() => setOpen(true)}>
            Close ticket
          </Button>
        </form>
      ) : (
        <Badge tone="neutral">Closed</Badge>
      )}
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
      <Modal open={open} onClose={() => setOpen(false)} title="Close this ticket?" description="You can always open a new one.">
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Keep open
          </Button>
          <Button
            variant="danger"
            onClick={async () => {
              await closeTicketAction(ticketId);
              router.refresh();
              setOpen(false);
            }}
          >
            Close ticket
          </Button>
        </div>
      </Modal>
    </div>
  );
}

const QUICK = ["What are the withdrawal limits?", "How does SafeLock maturity work?", "Why did my automatic transfer fail?", "How do I finish KYC?"];

export function SupportAssistant() {
  const [thread, setThread] = useState<{ role: "user" | "bot"; text: string; sources?: { title: string; slug: string }[] }[]>([
    { role: "bot", text: `Hi — I'm the ${BRAND.name} assistant. I can explain limits, plan rules, fees and verification. I will never ask for a password, PIN, OTP or card number.` },
  ]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);

  const ask = async (question: string) => {
    if (!question.trim() || busy) return;
    setThread((t) => [...t, { role: "user", text: question }]);
    setInput("");
    setBusy(true);
    const res = await askAssistantAction(question);
    setThread((t) => [...t, { role: "bot", text: res.answer, sources: res.sources }]);
    setBusy(false);
  };

  return (
    <div className="flex h-[420px] flex-col">
      <div className="flex-1 space-y-3 overflow-y-auto pr-1">
        {thread.map((m, i) => (
          <div key={i} className={cn("max-w-[88%] rounded-2xl px-3.5 py-2.5 text-[13px] leading-relaxed", m.role === "bot" ? "border bg-[var(--surface-raised)]" : "ml-auto bg-brand-600 text-white")}>
            {m.text}
            {m.sources?.length ? (
              <div className="mt-2 space-y-1 border-t pt-2">
                {m.sources.map((s) => (
                  <a key={s.slug || s.title} href={s.slug ? `/help?article=${s.slug}` : "/help"} className="block text-[12px] font-semibold text-brand-600 hover:underline dark:text-brand-300">
                    {s.slug ? `Read: ${s.title}` : s.title}
                  </a>
                ))}
              </div>
            ) : null}
          </div>
        ))}
        {busy ? <p className="text-[12px] muted">Searching the help centre…</p> : null}
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {QUICK.map((q) => (
          <button key={q} onClick={() => void ask(q)} className="rounded-lg border px-2.5 py-1 text-[11.5px] font-semibold muted hover:border-brand-500">
            {q}
          </button>
        ))}
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void ask(input);
        }}
        className="mt-2 flex gap-2"
      >
        <Input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ask about limits, fees, plans…" />
        <Button type="submit" loading={busy}>
          Ask
        </Button>
      </form>
    </div>
  );
}

export function ReferralActions() {
  const [pending, start] = useTransition();
  const { push } = useToast();
  return (
    <Button size="sm" variant="outline" loading={pending} onClick={() => start(async () => { const res = await syncReferralRewardsAction(); push({ tone: res.ok ? "success" : "info", title: "Reward check", body: res.notice ?? res.error }); })}>
      Check reward eligibility
    </Button>
  );
}

export function RewardList({ items }: { items: { id: string; label: string; amountKobo: number; status: string; createdAt: string }[] }) {
  return (
    <ul className="divide-y">
      {items.length === 0 ? <li className="py-6 text-center text-[13px] muted">No rewards yet.</li> : null}
      {items.map((r) => (
        <li key={r.id} className="flex items-center justify-between gap-3 py-2.5 text-[13px]">
          <span className="min-w-0 flex-1 truncate">{r.label}</span>
          <span className="tnum font-bold">{naira(r.amountKobo)}</span>
          <Badge tone={r.status === "credited" ? "brand" : r.status === "void" ? "danger" : "warning"}>{r.status}</Badge>
        </li>
      ))}
    </ul>
  );
}
