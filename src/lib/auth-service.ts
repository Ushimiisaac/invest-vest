import { createHash } from "node:crypto";
import { and, eq, isNull, or } from "drizzle-orm";
import { db } from "@/db";
import { accounts, consents, referralCampaigns, referrals, sessions, users } from "@/db/schema";
import {
  hashPassword,
  issueToken,
  passwordIssues,
  recordLogin,
  startSession,
  verifyPassword,
  verifyTotp,
} from "@/lib/auth";
import { BRAND, POLICY_VERSION, SECURITY } from "@/lib/config";
import { notifyUser } from "@/lib/notify";
import { isPhone, normalisePhone, randomCode } from "@/lib/utils";

export type AuthOutcome =
  | { ok: true; userId: string; token: string; redirectTo: string }
  | { ok: false; error: string; code?: string };

export type MfaOutcome = { ok: true; userId: string; token: string; redirectTo: string } | { ok: false; error: string };

/**
 * Shared auth core used by BOTH Server Actions and the REST endpoints in
 * `app/api/auth/*`. Keeping one implementation means the iframe-safe REST path and
 * the cookie-based action path can never drift apart.
 */

function hashToken(raw: string) {
  return createHash("sha256").update(raw).digest("hex");
}

async function uniqueReferralCode() {
  for (let i = 0; i < 8; i += 1) {
    const code = randomCode(6);
    const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.referralCode, code)).limit(1);
    if (!existing) return code;
  }
  return `${randomCode(6)}${Date.now().toString(36).slice(-2)}`.toUpperCase();
}

async function createVerifiedAccount(input: {
  fullName: string;
  email: string;
  phone: string;
  password: string;
  refCode?: string;
  ip: string;
}) {
  const [referrer] = input.refCode
    ? await db.select({ id: users.id }).from(users).where(eq(users.referralCode, input.refCode)).limit(1)
    : [];

  const [user] = await db
    .insert(users)
    .values({
      email: input.email,
      phone: input.phone,
      fullName: input.fullName,
      passwordHash: await hashPassword(input.password),
      status: "active",
      referralCode: await uniqueReferralCode(),
      referredBy: referrer?.id ?? null,
    })
    .returning();

  await db.insert(accounts).values({ userId: user.id, kind: "flex", name: "Flex wallet", icon: "wallet", status: "active" });
  await db.insert(consents).values([
    { userId: user.id, kind: "terms", version: POLICY_VERSION, granted: true, ip: input.ip },
    { userId: user.id, kind: "privacy", version: POLICY_VERSION, granted: true, ip: input.ip },
    { userId: user.id, kind: "data_processing", version: POLICY_VERSION, granted: true, ip: input.ip },
  ]);

  if (referrer) {
    const [campaign] = await db.select().from(referralCampaigns).where(and(eq(referralCampaigns.active, true), isNull(referralCampaigns.endsAt))).limit(1);
    await db.insert(referrals).values({ referrerId: referrer.id, refereeId: user.id, campaignId: campaign?.id ?? null, status: "signed_up" });
    await notifyUser({
      userId: referrer.id,
      type: "general",
      severity: "success",
      title: "Someone joined with your referral code",
      body: `${input.fullName} signed up. Your reward unlocks once they verify and complete their first deposit.`,
      link: "/referrals",
    });
  }
  return user;
}

export async function performRegister(input: {
  fullName: string;
  email: string;
  phone: string;
  password: string;
  confirmPassword: string;
  refCode?: string;
  termsAccepted: boolean;
  ip: string;
}): Promise<AuthOutcome> {
  const { fullName, email, phone, password, confirmPassword } = input;
  if (fullName.length < 3) return { ok: false, error: "Enter your full name as it appears on your ID.", code: "fullName" };
  if (!/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(email)) return { ok: false, error: "Enter a valid email address.", code: "email" };
  if (!isPhone(phone)) return { ok: false, error: "Enter a valid Nigerian phone number, e.g. 08031234567.", code: "phone" };
  const issues = passwordIssues(password);
  if (issues.length) return { ok: false, error: `Password needs ${issues.join(", ")}.`, code: "password" };
  if (password !== confirmPassword) return { ok: false, error: "Passwords do not match.", code: "confirmPassword" };
  if (!input.termsAccepted) return { ok: false, error: "You must accept the terms and privacy policy.", code: "terms" };

  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  if (existing) return { ok: false, error: "An account already uses this email. Sign in instead.", code: "email" };

  const user = await createVerifiedAccount({
    fullName,
    email,
    phone,
    password,
    refCode: input.refCode,
    ip: input.ip,
  });

  const token = await issueToken(user.id, "verify_email", 24 * 60);
  await notifyUser({
    userId: user.id,
    type: "verification",
    severity: "info",
    title: "Confirm your email address",
    body: "Verification lifts your deposit and withdrawal limits.",
    link: `/verify?token=${token}`,
    email: {
      subject: `Confirm your ${BRAND.name} email`,
      html: `<p>Welcome, ${fullName.split(" ")[0]}.</p><p>Use this link to verify your email (valid 24 hours):</p><p><b>${BRAND.siteUrl}/verify?token=${token}</b></p>`,
    },
    sms: `${BRAND.name}: your phone is ${phone}. Open the app to confirm it and start saving.`,
  });

  const session = await startSession(user.id);
  return { ok: true, userId: user.id, token: session, redirectTo: "/dashboard?tour=1" };
}

export type LoginResult =
  | { ok: true; userId: string; token: string; redirectTo: string; needsMfa?: false }
  | { ok: true; userId: string; token: string; redirectTo: string; needsMfa: true; mfaToken: string }
  | { ok: false; error: string; code?: string };

export async function performLogin(input: { identifier: string; password: string; ip: string; remember?: boolean }): Promise<LoginResult> {
  const identifier = input.identifier.trim().toLowerCase();
  if (!identifier || !input.password) return { ok: false, error: "Email and password are required." };

  const [user] = await db.select().from(users).where(or(eq(users.email, identifier), eq(users.phone, normalisePhone(identifier)))).limit(1);
  if (!user) {
    await recordLogin(null, identifier, "unknown_user");
    return { ok: false, error: `No account found for ${identifier}. New here? Create an account — it takes about a minute.` };
  }
  if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
    return { ok: false, error: "Account temporarily locked after repeated failures. Try again in a few minutes." };
  }
  const good = await verifyPassword(input.password, user.passwordHash);
  if (!good) {
    const failures = user.failedLogins + 1;
    await db
      .update(users)
      .set({
        failedLogins: failures,
        lockedUntil: failures >= SECURITY.maxFailedLogins ? new Date(Date.now() + SECURITY.lockoutMinutes * 60_000) : null,
      })
      .where(eq(users.id, user.id));
    await recordLogin(user.id, user.email, "bad_password");
    return { ok: false, error: "Email or password is incorrect." };
  }
  if (user.status === "suspended") {
    await recordLogin(user.id, user.email, "locked");
    return { ok: false, error: user.suspensionReason ?? "This account is suspended. Contact support for reinstatement." };
  }
  await db.update(users).set({ failedLogins: 0, lockedUntil: null }).where(eq(users.id, user.id));

  if (user.mfaEnabled && user.totpSecret) {
    // Step-up: single-use short-lived token, so the client never handles a raw user id.
    const mfaToken = await issueToken(user.id, "premfa", 10);
    await recordLogin(user.id, user.email, "mfa_required");
    return { ok: true, userId: user.id, token: "", redirectTo: "/dashboard", needsMfa: true, mfaToken };
  }
  const token = await startSession(user.id, input.remember ?? true);
  await recordLogin(user.id, user.email, "success");
  return { ok: true, userId: user.id, token, redirectTo: "/dashboard" };
}

export async function performMfa(input: { mfaToken: string; code?: string; recovery?: string }): Promise<MfaOutcome> {
  if (!input.mfaToken) return { ok: false, error: "Your sign-in step expired. Start again." };
  const { authTokens } = await import("@/db/schema");
  const [tokenRow] = await db
    .select()
    .from(authTokens)
    .where(and(eq(authTokens.tokenHash, hashToken(input.mfaToken)), eq(authTokens.kind, "premfa"), isNull(authTokens.usedAt)))
    .limit(1);
  if (!tokenRow || tokenRow.expiresAt.getTime() < Date.now()) return { ok: false, error: "That sign-in step expired. Start again." };

  const [user] = await db.select().from(users).where(eq(users.id, tokenRow.userId)).limit(1);
  if (!user?.totpSecret) return { ok: false, error: "Multi-factor is not configured on this account." };

  const clean = (input.code ?? "").trim();
  if (input.recovery) {
    const codes = (user.recoveryCodes as string[] | null) ?? [];
    const index = codes.indexOf(input.recovery.toUpperCase());
    if (index === -1) return { ok: false, error: "That recovery code is not valid." };
    codes.splice(index, 1);
    await db.update(users).set({ recoveryCodes: codes }).where(eq(users.id, user.id));
  } else if (!verifyTotp(user.totpSecret, clean)) {
    await recordLogin(user.id, user.email, "mfa_failed");
    return { ok: false, error: "That code is invalid or expired." };
  }
  await db.update(authTokens).set({ usedAt: new Date() }).where(eq(authTokens.id, tokenRow.id));
  const token = await startSession(user.id, true);
  await recordLogin(user.id, user.email, "success");
  return { ok: true, userId: user.id, token, redirectTo: "/dashboard" };
}

export async function performLogout(token: string | undefined) {
  if (token) {
    await db.update(sessions).set({ revokedAt: new Date() }).where(eq(sessions.tokenHash, hashToken(token)));
  }
}

export function readTokenFromRequest(request: Request): string | undefined {
  const header = request.headers.get("x-ss-session") ?? request.headers.get("authorization");
  if (header) {
    if (header.toLowerCase().startsWith("bearer ")) return header.slice(7).trim();
    return header.trim();
  }
  const cookie = request.headers.get("cookie") ?? "";
  const match = /(?:^|;\s*)ss_session=([^;]+)/.exec(cookie);
  return match ? decodeURIComponent(match[1]) : undefined;
}

export async function userFromBearerToken(token: string) {
  const [row] = await db
    .select({ user: users, expiresAt: sessions.expiresAt })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.tokenHash, hashToken(token)), isNull(sessions.revokedAt)))
    .limit(1);
  if (!row || row.expiresAt.getTime() < Date.now()) return null;
  return row.user;
}
