"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useActionState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Alert, Badge, Button, Card, Field, Input, Spinner } from "@/components/ui";
import {
  accountRecoveryAction,
  forgotPasswordAction,
  loginAction,
  mfaAction,
  registerAction,
  resendEmailVerificationAction,
  resetPasswordAction,
  sendPhoneCodeAction,
  verifyEmailToken,
  verifyPhoneAction,
  type FormState,
} from "@/app/(auth)/actions";
import { BRAND, FEATURES, LIVE_PAYMENTS, POLICY_VERSION } from "@/lib/config";
import { buildLabel } from "@/lib/build";
import { useSession } from "@/components/session-bridge";
import { cn } from "@/lib/utils";

const EMPTY: FormState = { ok: false };

function Notice({ state }: { state: FormState }) {
  if (!state.notice && !state.ok) return null;
  return (
    <div className="space-y-2">
      {state.notice ? <Alert tone="brand">{state.notice}</Alert> : null}
      {state.ok && state.devLink ? (
        <Alert tone="gold" title="No email provider configured">
          In production this goes to your inbox. In this environment,{" "}
          <Link className="font-semibold underline" href={state.devLink}>
            open the secure link
          </Link>{" "}
          to continue.
        </Alert>
      ) : null}
    </div>
  );
}

function Err(state: FormState, field: string): string | undefined {
  if (state.field === field && state.error) return state.error;
  return undefined;
}
function Generic({ state }: { state: FormState }) {
  if (state.error && !state.field) return <Alert tone="danger">{state.error}</Alert>;
  return null;
}

/* -------------------------------- login ------------------------------- */

type ApiJson = {
  status: number;
  ok?: boolean;
  error?: string;
  code?: string;
  token?: string;
  redirectTo?: string;
  needsMfa?: boolean;
  mfaToken?: string;
  notice?: string;
};

const REASONS: Record<string, { title: string; body: string; tone: "info" | "warning" | "danger" }> = {
  session: {
    title: "Your session expired — please log in again",
    body:
      "This usually means the browser dropped the sign-in cookie, which happens when the app is opened inside another site's frame. IncreaseVest now keeps a second, cookie-free session, so signing in here will work and will stick.",
    tone: "warning",
  },
  reauth: {
    title: "Please confirm it's really you",
    body: "For your protection, that action needed a fresh sign-in.",
    tone: "info",
  },
  suspended: {
    title: "This account is restricted",
    body: "Contact support to have the restriction reviewed. Your money is never at risk from a suspension.",
    tone: "danger",
  },
};

export function SessionNotice({ reason }: { reason?: string }) {
  if (!reason) return null;
  const info = REASONS[reason];
  if (!info) return null;
  return (
    <Alert tone={info.tone} title={info.title} className="mb-4">
      {info.body}
    </Alert>
  );
}

async function postJson(url: string, payload: Record<string, unknown>): Promise<ApiJson> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { status: res.status, ...json } as ApiJson;
}

export function LoginForm({ next }: { next?: string }) {
  const [state, form, pending] = useActionState(loginAction, EMPTY);
  const [apiState, setApiState] = useState<FormState>({ ok: false });
  const [busy, setBusy] = useState(false);
  const [mfaToken, setMfaToken] = useState<string | null>(null);
  const { save, goTo } = useSession();

  useEffect(() => {
    if (state.needsMfa) setMfaToken("__action_mfa__");
  }, [state.needsMfa, state]);

  const combined = apiState.error || apiState.notice ? apiState : state;
  const loading = pending || busy;

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    const formEl = event.currentTarget;
    const data = new FormData(formEl);
    const identifier = String(data.get("email") ?? "").trim();
    const password = String(data.get("password") ?? "");
    const remember = data.get("remember") === "on";
    if (!identifier || !password) return; // let the browser show native validation

    // REST path first: it returns the token in the body, so it works even when the
    // browser refuses to store our cookie inside a cross-site frame.
    event.preventDefault();
    setBusy(true);
    setApiState({ ok: false });
    try {
      const json = await postJson("/api/auth/login", { identifier, email: identifier, password, remember });
      if (json.needsMfa) {
        setMfaToken(String(json.mfaToken ?? ""));
        return;
      }
      if (json.ok && json.token) {
        save(String(json.token));
        setApiState({ ok: true, notice: "Signed in — opening your account…" });
        const target = next ?? String(json.redirectTo ?? "/dashboard");
        // goTo() carries the token in the URL so the server authenticates the very
        // next request even if storage and cookies are both unavailable.
        window.setTimeout(() => goTo(target), 60);
        return;
      }
      setApiState({ ok: false, error: String(json.error ?? "Sign-in failed."), field: String(json.code ?? "") });
    } catch (err) {
      setApiState({ ok: false, error: `Network error: ${err instanceof Error ? err.message : "unknown"}` });
    } finally {
      setBusy(false);
    }
    void formEl;
  };

  if (mfaToken) return <MfaStep mfaToken={mfaToken === "__action_mfa__" ? undefined : mfaToken} />;

  return (
    <form action={form} onSubmit={onSubmit} className="space-y-4">
      <Field label="Email or phone" htmlFor="email" error={Err(combined, "email")}>
        <Input id="email" name="email" autoComplete="username" required placeholder="you@example.com" />
      </Field>
      <Field label="Password" htmlFor="password">
        <PasswordInput id="password" name="password" autoComplete="current-password" required placeholder="••••••••" />
      </Field>
      <div className="flex items-center justify-between gap-3 text-[13px]">
        <label className="flex items-center gap-2 font-medium">
          <input type="checkbox" name="remember" className="size-4 accent-brand-600" /> Keep me signed in
        </label>
        <Link href="/reset" className="font-semibold text-brand-600 hover:underline dark:text-brand-300">
          Forgot password?
        </Link>
      </div>
      <Generic state={state} />
      <Notice state={state} />
      <Button type="submit" size="lg" loading={pending} className="w-full">
        {pending ? "Signing in" : "Sign in securely"}
      </Button>
      <p className="text-center text-[13px] muted">
        New to {BRAND.name}?{" "}
        <Link href="/register" className="font-semibold text-brand-600 hover:underline dark:text-brand-300">
          Create an account
        </Link>
      </p>
      {!LIVE_PAYMENTS ? (
        <p className="rounded-lg border border-dashed p-3 text-[11.5px] muted">
          Payment rails are in simulation mode — deposits update the ledger for testing but never move real money.
        </p>
      ) : null}
    </form>
  );
}

function MfaStep({ mfaToken }: { mfaToken?: string }) {
  const [state, form, pending] = useActionState(mfaAction, EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { save, goTo } = useSession();

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    if (!mfaToken) return; // no bearer token -> fall back to the Server Action
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setBusy(true);
    setError(null);
    try {
      const json = await postJson("/api/auth/mfa", {
        mfaToken,
        code: String(data.get("code") ?? ""),
        recovery: String(data.get("recovery") ?? ""),
      });
      if (json.ok && json.token) {
        save(String(json.token));
        window.setTimeout(() => goTo(String(json.redirectTo ?? "/dashboard")), 60);
        return;
      }
      setError(String(json.error ?? "Verification failed."));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form action={form} onSubmit={submit} className="space-y-4">
      <div className="flex items-center gap-2">
        <Badge tone="info">Step 2 of 2</Badge>
        <p className="text-[13px] font-semibold">Two-factor authentication</p>
      </div>
      <Field label="Authenticator code" htmlFor="code" error={error ?? undefined} hint="Six digits from your app. Codes rotate every 30 seconds.">
        <Input id="code" name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={7} className="text-center text-lg tracking-[0.5em]" placeholder="000000" />
      </Field>
      <details className="rounded-xl border p-3 text-[13px]">
        <summary className="cursor-pointer font-semibold">Lost your device? Use a recovery code</summary>
        <Input name="recovery" className="mt-2" placeholder="XXXXX-XXXXX" autoComplete="off" />
      </details>
      <Generic state={state} />
      <Button type="submit" size="lg" loading={pending || busy} className="w-full">
        Verify and continue
      </Button>
      <button type="button" onClick={() => window.location.assign("/login")} className="w-full text-[13px] font-semibold muted hover:text-[var(--text-strong)]">
        Back to sign in
      </button>
    </form>
  );
}

/* ------------------------------- register ----------------------------- */

export function RegisterForm({ initialRef }: { initialRef?: string }) {
  const [state, form, pending] = useActionState(registerAction, EMPTY);
  const [apiState, setApiState] = useState<FormState>({ ok: false });
  const [busy, setBusy] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const { save, goTo } = useSession();
  const combined = apiState.error || apiState.notice ? apiState : state;

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setBusy(true);
    setApiState({ ok: false });
    try {
      const json = await postJson("/api/auth/register", {
        fullName: String(data.get("fullName") ?? ""),
        email: String(data.get("email") ?? ""),
        phone: String(data.get("phone") ?? ""),
        password: String(data.get("password") ?? ""),
        confirmPassword: String(data.get("confirmPassword") ?? ""),
        ref: String(data.get("ref") ?? ""),
        terms: accepted,
      });
      if (json.ok && json.token) {
        save(String(json.token));
        setApiState({ ok: true, notice: "Account created — opening your dashboard…" });
        window.setTimeout(() => goTo(String(json.redirectTo ?? "/dashboard?tour=1")), 60);
        return;
      }
      setApiState({ ok: false, error: String(json.error ?? "Could not create the account."), field: String(json.code ?? "") });
    } catch (err) {
      setApiState({ ok: false, error: `Network error: ${err instanceof Error ? err.message : "unknown"}` });
    } finally {
      setBusy(false);
    }
  };

  return (
    <form action={form} onSubmit={onSubmit} className="space-y-4">
      <Field label="Full name" htmlFor="fullName" error={Err(state, "fullName")} hint="Exactly as it appears on your ID — required for KYC.">
        <Input id="fullName" name="fullName" autoComplete="name" required placeholder="Chukwuemerika Obi" />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Email address" htmlFor="reg-email" error={Err(combined, "email")}>
          <Input id="reg-email" name="email" type="email" autoComplete="email" required placeholder="you@example.com" />
        </Field>
        <Field label="Phone number" htmlFor="phone" error={Err(combined, "phone")}>
          <Input id="phone" name="phone" inputMode="tel" autoComplete="tel" required placeholder="08031234567" />
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Password" htmlFor="new-password" error={Err(combined, "password")} hint="8+ chars, upper, lower, number.">
          <PasswordInput id="new-password" name="password" autoComplete="new-password" required />
        </Field>
        <Field label="Confirm password" htmlFor="confirm" error={Err(combined, "confirmPassword")}>
          <PasswordInput id="confirm" name="confirmPassword" autoComplete="new-password" required />
        </Field>
      </div>
      <Field label="Referral code (optional)" htmlFor="ref" error={Err(combined, "ref")} hint={FEATURES.referrals ? "Friends earn rewards when you both qualify." : "Referrals are currently disabled."}>
        <Input id="ref" name="ref" defaultValue={initialRef} maxLength={10} className="uppercase" placeholder="AB12CD" />
      </Field>
      <label className={cn("flex cursor-pointer items-start gap-3 rounded-xl border p-3.5 text-[12.5px] leading-relaxed", !accepted && "border-rose-400/60")}>
        <input type="checkbox" name="terms" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} className="mt-0.5 size-4 accent-brand-600" />
        <span>
          I agree to the <Link href="/legal/terms" className="font-semibold underline">terms of use</Link>, the{" "}
          <Link href="/legal/privacy" className="font-semibold underline">privacy policy</Link> and the{" "}
          <Link href="/legal/fees" className="font-semibold underline">fee schedule</Link> (version {POLICY_VERSION}). I consent to IncreaseVest processing my
          data to operate my savings accounts.
        </span>
      </label>
      {Err(state, "terms") ? <p className="text-[12px] font-medium text-rose-600">{Err(combined, "terms")}</p> : null}
      <Generic state={state} />
      <Button type="submit" size="lg" loading={pending} className="w-full">
        {pending ? "Creating account" : "Create my account"}
      </Button>
      <p className="text-center text-[13px] muted">
        Already saving with us?{" "}
        <Link href="/login" className="font-semibold text-brand-600 hover:underline dark:text-brand-300">
          Sign in
        </Link>
      </p>
    </form>
  );
}

function PasswordInput(props: React.ComponentProps<"input">) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <Input {...props} type={show ? "text" : "password"} className="pr-11" />
      <button
        type="button"
        onClick={() => setShow((v) => !v)}
        aria-label={show ? "Hide password" : "Show password"}
        className="absolute right-2 top-2.5 rounded-lg p-1.5 muted hover:bg-[var(--surface-sunken)]"
      >
        <svg viewBox="0 0 24 24" className="size-4.5" fill="none" stroke="currentColor" strokeWidth="1.8">
          {show ? (
            <>
              <path d="M3 3l18 18" strokeLinecap="round" />
              <path d="M10.6 5.2A9.6 9.6 0 0 1 12 5c5 0 9 4.5 9 7 0 .9-.9 2.4-2.4 3.7M6.3 7.6C4 9.1 3 10.9 3 12c0 2.5 4 7 9 7 1.4 0 2.7-.3 3.8-.9" />
            </>
          ) : (
            <>
              <path d="M3 12s4-7 9-7 9 7 9 7-4 7-9 7-9-7-9-7Z" />
              <circle cx="12" cy="12" r="2.6" />
            </>
          )}
        </svg>
      </button>
    </div>
  );
}

/* ------------------------------ reset flow ---------------------------- */

export function ForgotPasswordForm() {
  const [state, form, pending] = useActionState(forgotPasswordAction, EMPTY);
  const combined = state;
  return (
    <form action={form} className="space-y-4">
      <Field label="Account email" htmlFor="forgot-email" error={Err(combined, "email")}>
        <Input id="forgot-email" name="email" type="email" autoComplete="email" required placeholder="you@example.com" />
      </Field>
      <Generic state={state} />
      <Notice state={state} />
      <Button type="submit" size="lg" loading={pending} className="w-full">
        Send reset link
      </Button>
      <p className="text-center text-[13px] muted">
        <Link href="/reset?mode=recover" className="font-semibold text-brand-600 hover:underline dark:text-brand-300">
          Locked out of everything? Request account recovery
        </Link>
      </p>
    </form>
  );
}

export function ResetPasswordForm({ token }: { token?: string }) {
  const [state, form, pending] = useActionState(resetPasswordAction, EMPTY);
  const combined = state;
  if (!token) return <ForgotPasswordForm />;
  return (
    <form action={form} className="space-y-4">
      <input type="hidden" name="token" value={token} />
      <Field label="New password" htmlFor="np" error={Err(combined, "password")} hint="Must not have been used on this account before.">
        <PasswordInput id="np" name="password" autoComplete="new-password" required />
      </Field>
      <Field label="Confirm new password" htmlFor="np2" error={Err(combined, "confirmPassword")}>
        <PasswordInput id="np2" name="confirmPassword" autoComplete="new-password" required />
      </Field>
      <Generic state={state} />
      <Notice state={state} />
      <Button type="submit" size="lg" loading={pending} className="w-full">
        Update password
      </Button>
      <p className="text-center text-[12.5px] muted">All other devices will be signed out automatically.</p>
    </form>
  );
}

export function RecoveryForm() {
  const [state, form, pending] = useActionState(accountRecoveryAction, EMPTY);
  const combined = state;
  return (
    <form action={form} className="space-y-4">
      <Field label="Account email" htmlFor="rec-email" error={Err(combined, "email")}>
        <Input id="rec-email" name="email" type="email" required />
      </Field>
      <Field label="What happened?" htmlFor="rec-note" hint="Do not include passwords, PINs, OTPs or full card numbers.">
        <textarea id="rec-note" name="note" className="min-h-24 w-full rounded-xl border bg-[var(--surface-raised)] px-3.5 py-2.5 text-sm" />
      </Field>
      <Generic state={state} />
      <Notice state={state} />
      <Button type="submit" size="lg" loading={pending} className="w-full">
        Submit recovery request
      </Button>
    </form>
  );
}

/* ------------------------------ verification -------------------------- */

export function VerifyPanel({
  userId,
  email,
  phone,
  emailVerified,
  phoneVerified,
  token,
  nextHref = "/dashboard",
}: {
  userId: string;
  email: string;
  phone: string | null;
  emailVerified: boolean;
  phoneVerified: boolean;
  token?: string;
  nextHref?: string;
}) {
  const [state, form, pending] = useActionState(verifyEmailTokenActionWrapper, { ok: false } as FormState);
  const [phoneState, phoneForm, phonePending] = useActionState(verifyPhoneAction, EMPTY);
  const [sentCode, setSentCode] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [autoRan, setAutoRan] = useState(false);

  useEffect(() => {
    if (token && !autoRan && !emailVerified) {
      setAutoRan(true);
      const data = new FormData();
      data.set("token", token);
      void verifyEmailTokenActionWrapper(EMPTY, data);
      window.setTimeout(() => window.location.assign(nextHref), 900);
    }
  }, [token, autoRan, emailVerified, nextHref]);

  const done = useMemo(() => emailVerified && phoneVerified, [emailVerified, phoneVerified]);

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[13.5px] font-semibold">Email address</p>
            <p className="mt-0.5 text-[12.5px] muted">{email}</p>
          </div>
          {emailVerified ? <Badge tone="brand">Verified</Badge> : <Badge tone="warning">Action needed</Badge>}
        </div>
        {!emailVerified ? (
          <div className="mt-3 space-y-2">
            <form action={form}>
              <input type="hidden" name="token" value={token ?? ""} />
              <div className="flex flex-wrap gap-2">
                <Button size="sm" type="submit" loading={pending}>
                  Verify with my link
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  type="button"
                  onClick={async () => {
                    const res = await resendEmailVerificationAction(userId);
                    setSentCode(res.notice ?? res.error ?? null);
                  }}
                >
                  Resend email
                </Button>
              </div>
            </form>
            {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
            {sentCode ? <Alert tone="info">{sentCode}</Alert> : null}
          </div>
        ) : null}
      </Card>

      <Card className="p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[13.5px] font-semibold">Phone number</p>
            <p className="mt-0.5 text-[12.5px] muted">{phone ?? "Add a phone number in settings"}</p>
          </div>
          {phoneVerified ? <Badge tone="brand">Verified</Badge> : <Badge tone="warning">Action needed</Badge>}
        </div>
        {!phoneVerified ? (
          <div className="mt-3 space-y-3">
            <Button
              size="sm"
              variant="outline"
              loading={sending}
              onClick={async () => {
                setSending(true);
                const res = await sendPhoneCodeAction(userId);
                setSentCode(res.notice ?? res.error ?? null);
                setSending(false);
              }}
            >
              Send me a code
            </Button>
            <form action={phoneForm} className="flex flex-wrap items-end gap-2">
              <input type="hidden" name="userId" value={userId} />
              <label className="min-w-[9rem] flex-1 text-[12.5px] font-medium">
                Enter code
                <Input name="code" className="mt-1" placeholder="ABCDE" maxLength={6} />
              </label>
              <Button size="sm" type="submit" loading={phonePending}>
                Confirm
              </Button>
            </form>
            {phoneState.error ? <Alert tone="danger">{phoneState.error}</Alert> : null}
            {sentCode ? <Alert tone="gold" title="Demo environment">{sentCode}</Alert> : null}
          </div>
        ) : null}
      </Card>

      {done ? (
        <Alert tone="brand" title="Verification complete">
          Your account is fully verified.{" "}
          <Link href={nextHref} className="font-semibold underline">
            Continue to dashboard
          </Link>
        </Alert>
      ) : (
        <p className="text-[12.5px] muted">
          Until verification finishes, deposits above the starter limit and withdrawals are restricted.{" "}
          <Link href={nextHref} className="font-semibold text-brand-600 underline dark:text-brand-300">
            Explore anyway
          </Link>
        </p>
      )}
    </div>
  );
}

async function verifyEmailTokenActionWrapper(_prev: FormState, formData: FormData): Promise<FormState> {
  const token = String(formData.get("token") ?? "");
  if (!token) return { ok: false, error: "Open this page from the link in your verification email." };
  return verifyEmailToken(token);
}

export function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="mx-auto grid min-h-dvh max-w-6xl grid-cols-1 items-stretch gap-0 px-4 py-8 sm:px-6 lg:grid-cols-2 lg:gap-10 lg:py-14">
      <div className="hidden flex-col justify-between rounded-3xl bg-gradient-to-br from-brand-700 via-brand-800 to-ink-900 p-8 text-white lg:flex">
        <div>
          <span className="text-[11.5px] font-bold uppercase tracking-[0.22em] opacity-80">{BRAND.name}</span>
          <h2 className="mt-6 text-[30px] font-extrabold leading-tight">{BRAND.tagline}</h2>
          <p className="mt-3 max-w-sm text-[14px] leading-relaxed opacity-90">
            Locked savings, named goals, transparent group pots, a flexible wallet and an investment register — reconciled on one ledger.
          </p>
        </div>
        <ul className="mt-10 space-y-3 text-[13.5px]">
          {[
            "bcrypt-hashed passwords and server-side sessions",
            "Optional TOTP two-factor with recovery codes",
            "Deposits verified on the server, never from the browser",
            "Every plan rule disclosed before money moves",
          ].map((item) => (
            <li key={item} className="flex gap-2.5">
              <svg viewBox="0 0 24 24" className="mt-0.5 size-4 shrink-0 text-brand-200" fill="none" stroke="currentColor" strokeWidth="2.4">
                <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span className="opacity-95">{item}</span>
            </li>
          ))}
        </ul>
      </div>
      <div className="flex flex-col justify-center">
        <Card className="p-6 sm:p-8">
          <h1 className="text-[22px] font-bold tracking-tight">{title}</h1>
          <p className="mt-1.5 text-[13.5px] muted">{subtitle}</p>
          <div className="mt-6">{children}</div>
          {footer}
        </Card>
        {pendingHint()}
      </div>
    </div>
  );
}

function pendingHint() {
  return (
    <p className="mt-4 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-[11.5px] muted">
      <Spinner className="size-3" /> Protected by rate limiting, encrypted sessions and CSRF-safe form posts.
      <span className="rounded-md border px-1.5 py-0.5 font-mono text-[10.5px]">build {buildLabel()}</span>
    </p>
  );
}


/** One-click exploration of a pre-funded, simulated account. Never the admin account. */
export function DemoLoginBlock() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { save, goTo } = useSession();

  // Fastest, most reliable path: a single request that creates the session server-side
  // and redirects with the token, so no storage or cookie is required at all.
  const instantEntry = () => {
    window.location.assign("/api/auth/demo");
  };

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      const json = await postJson("/api/auth/login", {
        identifier: "demo@increasevest.ng",
        email: "demo@increasevest.ng",
        password: "IncreaseVest!2026",
        remember: true,
      });
      if (json.ok && json.token) {
        save(String(json.token));
        window.setTimeout(() => goTo("/dashboard?tour=1"), 60);
        return;
      }
      setError(String(json.error ?? "The demo account could not be opened."));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-5 rounded-xl border border-dashed border-gold-400/70 bg-amber-50/60 p-4 dark:bg-amber-950/20">
      <p className="text-[13px] font-bold text-amber-900 dark:text-amber-200">Just want to look around?</p>
      <p className="mt-1 text-[12.5px] leading-relaxed muted">
        Open a pre-funded demo account with simulated money — a funded wallet, a live goal, a 12-month SafeLock, a group pot, an
        investment holding and six months of history. Nothing here is real money.
      </p>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <Button variant="gold" size="sm" loading={busy} onClick={instantEntry}>
          ✨ Instant entry (1 click)
        </Button>
        <Button variant="outline" size="sm" loading={busy} onClick={run}>
          Sign in as demo
        </Button>
      </div>
      {error ? <p className="mt-2 text-[12px] font-semibold text-rose-600">{error}</p> : null}
    </div>
  );
}
