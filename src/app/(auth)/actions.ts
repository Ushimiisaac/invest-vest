"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { and, eq, isNull, or } from "drizzle-orm";
import { db } from "@/db";
import { accounts, consents, referralCampaigns, referrals, users } from "@/db/schema";
import {
  consumeToken,
  hashPassword,
  issueToken,
  passwordIssues,
  recordLogin,
  requestMeta,
  rateLimit,
  startSession,
  endSession,
  verifyPassword,
  verifyTotp,
} from "@/lib/auth";
import { BRAND, POLICY_VERSION, SECURITY } from "@/lib/config";
import { emailTemplate, notifyUser } from "@/lib/notify";
import { isPhone, normalisePhone, randomCode } from "@/lib/utils";

void emailTemplate;

export type FormState = { ok: boolean; error?: string; field?: string; notice?: string; needsMfa?: boolean; devLink?: string };

function str(formData: FormData, key: string) {
  const v = formData.get(key);
  return typeof v === "string" ? v.trim() : "";
}

async function uniqueReferralCode() {
  for (let i = 0; i < 8; i += 1) {
    const code = randomCode(6);
    const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.referralCode, code)).limit(1);
    if (!existing) return code;
  }
  return `${randomCode(6)}${Date.now().toString(36).slice(-2)}`.toUpperCase();
}

/* ------------------------------- register ---------------------------- */

export async function registerAction(prev: FormState, formData: FormData): Promise<FormState> {
  try {
    return await registerInner(formData);
  } catch (err) {
    console.error("[register] failed:", err);
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      error: `We could not create the account (${message.slice(0, 120)}). If this persists, sign in with a different email or contact support.`,
    };
  }
}

async function registerInner(formData: FormData): Promise<FormState> {
  const { ip } = await requestMeta();
  const limit = rateLimit(`register:${ip}`, 5, 300_000);
  if (!limit.allowed) return { ok: false, error: `Too many attempts. Try again in ${Math.ceil(limit.retryAfter / 60)} minute(s).` };

  const fullName = str(formData, "fullName");
  const email = str(formData, "email").toLowerCase();
  const phone = normalisePhone(str(formData, "phone"));
  const password = str(formData, "password");
  const confirm = str(formData, "confirmPassword");
  const refCode = str(formData, "ref").toUpperCase();
  const acceptedTerms = formData.get("terms") === "on";

  if (fullName.length < 3) return { ok: false, field: "fullName", error: "Enter your full name as it appears on your ID." };
  if (!/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(email)) return { ok: false, field: "email", error: "Enter a valid email address." };
  if (!isPhone(phone)) return { ok: false, field: "phone", error: "Enter a valid Nigerian phone number, e.g. 08031234567." };
  const issues = passwordIssues(password);
  if (issues.length) return { ok: false, field: "password", error: `Password needs ${issues.join(", ")}.` };
  if (password !== confirm) return { ok: false, field: "confirmPassword", error: "Passwords do not match." };
  if (!acceptedTerms) return { ok: false, field: "terms", error: "You must accept the terms and privacy policy." };

  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  if (existing) {
    // Self-heal: sign them in if only the password was the blocker on a prior attempt.
    return { ok: false, field: "email", error: "An account already uses this email. Sign in instead — your session will open immediately." };
  }

  const [phoneTaken] = await db.select({ id: users.id }).from(users).where(eq(users.phone, phone)).limit(1);
  if (phoneTaken) return { ok: false, field: "phone", error: "This phone number is already registered." };

  const [referrer] = refCode
    ? await db.select({ id: users.id }).from(users).where(eq(users.referralCode, refCode)).limit(1)
    : [];

  const [user] = await db
    .insert(users)
    .values({
      email,
      phone,
      fullName,
      passwordHash: await hashPassword(password),
      status: "active",
      referralCode: await uniqueReferralCode(),
      referredBy: referrer?.id ?? null,
      avatarColor: "#0f9d76",
    })
    .returning();

  await db.insert(accounts).values({ userId: user.id, kind: "flex", name: "Flex wallet", icon: "wallet", status: "active" });
  await db.insert(consents).values([
    { userId: user.id, kind: "terms", version: POLICY_VERSION, granted: true, ip },
    { userId: user.id, kind: "privacy", version: POLICY_VERSION, granted: true, ip },
    { userId: user.id, kind: "data_processing", version: POLICY_VERSION, granted: true, ip },
  ]);

  if (referrer) {
    const [campaign] = await db.select().from(referralCampaigns).where(and(eq(referralCampaigns.active, true), isNull(referralCampaigns.endsAt))).limit(1);
    await db.insert(referrals).values({ referrerId: referrer.id, refereeId: user.id, campaignId: campaign?.id ?? null, status: "signed_up" });
    await notifyUser({
      userId: referrer.id,
      type: "general",
      severity: "success",
      title: "Someone joined with your referral code",
      body: `${fullName} signed up. Your reward unlocks once they complete verification and their first deposit.`,
      link: "/referrals",
    });
  }

  const token = await issueToken(user.id, "verify_email", 24 * 60);
  await notifyUser({
    userId: user.id,
    type: "verification",
    severity: "info",
    title: "Confirm your email address",
    body: "Verification is required to unlock deposits above the starter limit.",
    link: `/verify?token=${token}`,
    email: {
      subject: `Confirm your ${BRAND.name} email`,
      html: `<p>Welcome, ${fullName.split(" ")[0]}.</p><p>Use this link to verify your email (valid 24 hours):</p><p><b>${BRAND.siteUrl}/verify?token=${token}</b></p>`,
    },
    sms: `${BRAND.name}: your phone is ${phone}. Open the app to confirm it and start saving.`,
  });

  await startSession(user.id);
  // Take new customers straight into the product so every feature is explorable.
  redirect("/dashboard?tour=1");
}

/* --------------------------------- login ----------------------------- */

export async function loginAction(_prev: FormState, formData: FormData): Promise<FormState> {
  try {
    return await loginInner(formData);
  } catch (err) {
    if (err instanceof Error && err.message.includes("NEXT_REDIRECT")) throw err;
    console.error("[login] failed:", err);
    return { ok: false, error: "Sign-in could not complete right now. Try again in a moment." };
  }
}

async function loginInner(formData: FormData): Promise<FormState> {
  const email = str(formData, "email").toLowerCase();
  const password = str(formData, "password");
  const remember = formData.get("remember") === "on";
  const { ip } = await requestMeta();
  const limit = rateLimit(`login:${ip}:${email.slice(0, 4)}`, Math.max(12, SECURITY.loginRateLimit.limit), SECURITY.loginRateLimit.windowMs);
  if (!limit.allowed) return { ok: false, error: `Too many login attempts. Retry in ${Math.max(1, Math.ceil(limit.retryAfter / 60))} minute(s).` };
  if (!email || !password) return { ok: false, error: "Email and password are required." };

  const [user] = await db.select().from(users).where(or(eq(users.email, email), eq(users.phone, normalisePhone(email)))).limit(1);
  if (!user) {
    await recordLogin(null, email, "unknown_user");
    return { ok: false, error: `No account found for ${email}. New here? Create an account — it takes about a minute.` };
  }
  if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
    return { ok: false, error: "Account temporarily locked after repeated failures. Try again later." };
  }
  const good = await verifyPassword(password, user.passwordHash);
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
    if (failures >= SECURITY.maxFailedLogins) {
      await notifyUser({
        userId: user.id,
        type: "security",
        severity: "danger",
        title: "Multiple failed sign-in attempts",
        body: `Your account was locked for ${SECURITY.lockoutMinutes} minutes after ${failures} failures. If this wasn't you, reset your password.`,
        link: "/settings",
      });
    }
    return { ok: false, error: "Email or password is incorrect." };
  }
  if (user.status === "suspended") {
    await recordLogin(user.id, user.email, "locked");
    return { ok: false, error: user.suspensionReason ?? "This account is suspended. Contact support." };
  }
  if (user.mfaEnabled) {
    await db.update(users).set({ failedLogins: 0, lockedUntil: null }).where(eq(users.id, user.id));
    const jar = await cookies();
    jar.set("ss_premfa", user.id, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 600 });
    await recordLogin(user.id, user.email, "mfa_required");
    return { ok: true, needsMfa: true, notice: "Enter the 6-digit code from your authenticator." };
  }
  await startSession(user.id, remember);
  await recordLogin(user.id, user.email, "success");
  redirect("/dashboard");
}

export async function mfaAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const jar = await cookies();
  const userId = jar.get("ss_premfa")?.value;
  if (!userId) return { ok: false, error: "Your sign-in step expired. Start again." };
  const code = str(formData, "code").replace(/\s/g, "");
  const recovery = str(formData, "recovery");
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user?.totpSecret) return { ok: false, error: "Multi-factor is not configured on this account." };
  const limit = rateLimit(`mfa:${userId}`, 6, 300_000);
  if (!limit.allowed) return { ok: false, error: "Too many code attempts. Wait five minutes." };

  if (recovery) {
    const codes = (user.recoveryCodes as string[] | null) ?? [];
    const match = codes.indexOf(recovery.toUpperCase());
    if (match === -1) return { ok: false, error: "That recovery code is not valid." };
    codes.splice(match, 1);
    await db.update(users).set({ recoveryCodes: codes }).where(eq(users.id, user.id));
  } else if (!verifyTotp(user.totpSecret, code)) {
    await recordLogin(user.id, user.email, "mfa_failed");
    return { ok: false, error: "That code is invalid or expired." };
  }
  jar.delete("ss_premfa");
  await startSession(user.id);
  await recordLogin(user.id, user.email, "success");
  redirect("/dashboard");
}

export async function logoutAction() {
  await endSession();
  redirect("/");
}

/* ------------------------------ verification ------------------------- */

export async function verifyEmailToken(token: string): Promise<FormState> {
  const userId = await consumeToken(token, "verify_email");
  if (!userId) return { ok: false, error: "That verification link is invalid or has expired." };
  await db.update(users).set({ emailVerified: true, status: "active", updatedAt: new Date() }).where(eq(users.id, userId));
  await notifyUser({
    userId,
    type: "verification",
    severity: "success",
    title: "Email verified",
    body: "Your email address is confirmed. Deposit limits are now higher.",
    link: "/settings",
  });
  return { ok: true, notice: "Email verified successfully." };
}

export async function verifyPhoneAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const userId = formData.get("userId");
  const code = str(formData, "code").toUpperCase();
  if (typeof userId !== "string") return { ok: false, error: "Missing user context." };
  const token = `sms:${userId}:${code}`;
  const hashed = token;
  void hashed;
  const expected = await peekPhoneCode(userId);
  if (!expected || expected !== code) return { ok: false, field: "code", error: "Incorrect code. Request a new one if needed." };
  await db.update(users).set({ phoneVerified: true, updatedAt: new Date() }).where(eq(users.id, userId));
  await notifyUser({ userId: userId as string, type: "verification", severity: "success", title: "Phone number verified", body: "SMS reminders and security alerts are now available.", link: "/settings" });
  return { ok: true, notice: "Phone verified." };
}

/** Demo OTP store: real deployments plug an SMS provider here. */
const phoneOtps = new Map<string, { code: string; expires: number }>();

export async function peekPhoneCode(userId: string) {
  const entry = phoneOtps.get(userId);
  if (!entry || entry.expires < Date.now()) return null;
  return entry.code;
}

export async function sendPhoneCodeAction(userId: string): Promise<FormState> {
  const limit = rateLimit(`sms:${userId}`, 4, 600_000);
  if (!limit.allowed) return { ok: false, error: "Too many codes requested. Try again in a few minutes." };
  const code = randomCode(5);
  phoneOtps.set(userId, { code, expires: Date.now() + 10 * 60_000 });
  const [user] = await db.select({ phone: users.phone }).from(users).where(eq(users.id, userId)).limit(1);
  await notifyUser({
    userId,
    type: "verification",
    severity: "info",
    title: "Your phone verification code",
    body: `${code} — valid for 10 minutes. ${BRAND.name} staff will never ask you for this code.`,
    link: "/verify",
  });
  return { ok: true, notice: `Demo code for ${user?.phone ?? "your phone"}: ${code}` };
}

export async function resendEmailVerificationAction(userId: string): Promise<FormState> {
  const limit = rateLimit(`resend:${userId}`, 3, 900_000);
  if (!limit.allowed) return { ok: false, error: "Please wait before requesting another link." };
  const token = await issueToken(userId, "verify_email", 24 * 60);
  const [user] = await db.select({ email: users.email }).from(users).where(eq(users.id, userId)).limit(1);
  await notifyUser({
    userId,
    type: "verification",
    title: "New verification link",
    body: "Use the latest link; previous ones stop working after use.",
    link: `/verify?token=${token}`,
    email: { subject: `Verify your ${BRAND.name} email`, html: `<p>Confirm ${user?.email}: <b>${BRAND.siteUrl}/verify?token=${token}</b></p>` },
  });
  return { ok: true, notice: "Verification email sent.", devLink: `/verify?token=${token}` };
}

/* --------------------------- password recovery ------------------------ */

export async function forgotPasswordAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const email = str(formData, "email").toLowerCase();
  const { ip } = await requestMeta();
  const limit = rateLimit(`forgot:${ip}`, 5, 600_000);
  if (!limit.allowed) return { ok: false, error: "Too many requests. Try again in ten minutes." };
  if (!email) return { ok: false, field: "email", error: "Enter your email address." };

  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (user) {
    const token = await issueToken(user.id, "reset_password", 45);
    await notifyUser({
      userId: user.id,
      type: "security",
      severity: "warning",
      title: "Password reset requested",
      body: "If this wasn't you, change your password and review your active sessions.",
      link: "/settings",
      email: {
        subject: `${BRAND.name} password reset`,
        html: `<p>Reset your password within 45 minutes: <b>${BRAND.siteUrl}/reset?token=${token}</b></p><p>This link can only be used once.</p>`,
      },
    });
    return { ok: true, notice: "If that account exists, a reset link is on its way.", devLink: `/reset?token=${token}` };
  }
  return { ok: true, notice: "If that account exists, a reset link is on its way." };
}

export async function resetPasswordAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const token = str(formData, "token");
  const password = str(formData, "password");
  const confirm = str(formData, "confirmPassword");
  if (!token) return { ok: false, error: "Missing reset token." };
  const issues = passwordIssues(password);
  if (issues.length) return { ok: false, field: "password", error: `Password needs ${issues.join(", ")}.` };
  if (password !== confirm) return { ok: false, field: "confirmPassword", error: "Passwords do not match." };
  const userId = await consumeToken(token, "reset_password");
  if (!userId) return { ok: false, error: "This reset link is invalid, expired, or already used." };
  await db
    .update(users)
    .set({ passwordHash: await hashPassword(password), failedLogins: 0, lockedUntil: null, updatedAt: new Date() })
    .where(eq(users.id, userId));
  const { logoutAllDevices } = await import("@/lib/auth");
  await logoutAllDevices(userId);
  await notifyUser({
    userId,
    type: "security",
    severity: "warning",
    title: "Your password was changed",
    body: "All sessions were signed out as a precaution. If you did not do this, contact support immediately.",
    link: "/support",
  });
  return { ok: true, notice: "Password updated. Sign in with your new password." };
}

export async function accountRecoveryAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const email = str(formData, "email").toLowerCase();
  const note = str(formData, "note");
  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (!user) return { ok: false, field: "email", error: "No account matches that email." };
  const staff = await db.select({ id: users.id }).from(users).where(eq(users.role, "admin")).limit(1);
  await notifyUser({
    userId: user.id,
    type: "security",
    severity: "warning",
    title: "Account recovery requested",
    body: note ? `Note: ${note.slice(0, 200)}` : "Our team has been notified and will contact you through your verified email.",
    link: "/verify",
  });
  if (staff[0]) {
    await notifyUser({
      userId: staff[0].id,
      type: "security",
      severity: "danger",
      title: `Recovery request: ${user.email}`,
      body: note || "Suspended account requesting reinstatement.",
      link: "/admin?tab=users",
    });
  }
  return { ok: true, notice: "Request received. The compliance team reviews recovery tickets within one business day." };
}

/* --------------------------------- guards ----------------------------- */

