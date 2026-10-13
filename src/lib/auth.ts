import { createHmac, createHash, randomBytes, timingSafeEqual } from "node:crypto";
import bcrypt from "bcryptjs";
import { cache } from "react";
import { and, eq, gt, isNull, desc } from "drizzle-orm";
import { db } from "@/db";
import { authTokens, devices, loginHistory, sessions, users } from "@/db/schema";
import { SECURITY } from "@/lib/config";
import { addDays, randomCode } from "@/lib/utils";

export const SESSION_COOKIE = "ss_session";
export const CSRF_COOKIE = "ss_csrf";

/* ----------------------------- passwords ---------------------------- */

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 11);
}
export async function verifyPassword(password: string, hash: string) {
  try {
    return await bcrypt.compare(password, hash);
  } catch {
    return false;
  }
}
export function passwordIssues(password: string) {
  const issues: string[] = [];
  if (password.length < 8) issues.push("at least 8 characters");
  if (!/[A-Z]/.test(password)) issues.push("one uppercase letter");
  if (!/[a-z]/.test(password)) issues.push("one lowercase letter");
  if (!/\d/.test(password)) issues.push("one number");
  return issues;
}

/* ------------------------------ requests ----------------------------- */

export async function requestMeta(): Promise<{ ip: string; userAgent: string; deviceLabel: string }> {
  const { headers } = await import("next/headers");
  const h = await headers();
  const forwarded = h.get("x-forwarded-for") ?? "";
  const ip = forwarded.split(",")[0]?.trim() || h.get("x-real-ip") || "127.0.0.1";
  const userAgent = h.get("user-agent") ?? "unknown";
  return { ip, userAgent, deviceLabel: describeDevice(userAgent) };
}

function describeDevice(ua: string) {
  const os = /Windows/i.test(ua)
    ? "Windows"
    : /Android/i.test(ua)
      ? "Android"
      : /iPhone|iPad|iOS/i.test(ua)
        ? "iOS"
        : /Mac OS X/i.test(ua)
          ? "macOS"
          : /Linux/i.test(ua)
            ? "Linux"
            : "Unknown OS";
  const browser = /Edg\//i.test(ua)
    ? "Edge"
    : /Chrome\//i.test(ua)
      ? "Chrome"
      : /Safari\//i.test(ua)
        ? "Safari"
        : /Firefox\//i.test(ua)
          ? "Firefox"
          : "Browser";
  return `${browser} · ${os}`;
}

/* ----------------------------- rate limiter -------------------------- */

type Bucket = { count: number; reset: number };
const buckets = new Map<string, Bucket>();

export function rateLimit(key: string, limit = SECURITY.writeRateLimit.limit, windowMs = SECURITY.writeRateLimit.windowMs) {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || bucket.reset < now) {
    buckets.set(key, { count: 1, reset: now + windowMs });
    if (buckets.size > 5000) {
      for (const [k, b] of buckets) if (b.reset < now) buckets.delete(k);
    }
    return { allowed: true, remaining: limit - 1, retryAfter: 0 };
  }
  bucket.count += 1;
  if (bucket.count > limit) {
    return { allowed: false, remaining: 0, retryAfter: Math.ceil((bucket.reset - now) / 1000) };
  }
  return { allowed: true, remaining: limit - bucket.count, retryAfter: 0 };
}

/* ------------------------------- sessions ---------------------------- */

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export type SessionUser = {
  id: string;
  email: string;
  fullName: string;
  phone: string | null;
  role: string;
  status: string;
  emailVerified: boolean;
  phoneVerified: boolean;
  mfaEnabled: boolean;
  kycStatus: string;
  referralCode: string | null;
  avatarColor: string;
};

function toSessionUser(row: typeof users.$inferSelect): SessionUser {
  return {
    id: row.id,
    email: row.email,
    fullName: row.fullName,
    phone: row.phone,
    role: row.role,
    status: row.status,
    emailVerified: row.emailVerified,
    phoneVerified: row.phoneVerified,
    mfaEnabled: row.mfaEnabled,
    kycStatus: row.kycStatus,
    referralCode: row.referralCode,
    avatarColor: row.avatarColor,
  };
}

/**
 * Cookies must survive being embedded in the sandbox preview iframe: over HTTPS we
 * use SameSite=None + Secure, and fall back to Lax for plain local development.
 */
async function cookiePolicy() {
  const { headers } = await import("next/headers");
  const h = await headers();
  const proto = (h.get("x-forwarded-proto") ?? "").split(",")[0]?.trim();
  const referer = h.get("referer") ?? "";
  const secure = proto === "https" || referer.startsWith("https://") || process.env.NODE_ENV === "production";
  return {
    secure,
    // `Partitioned` (CHIPS) keeps the cookie usable inside a cross-site iframe even
    // when the browser blocks third-party cookies outright.
    partitioned: secure,
    sameSite: (secure ? "none" : "lax") as "none" | "lax",
    path: "/",
  };
}

export async function startSession(userId: string, remember = false) {
  const token = randomBytes(32).toString("hex");
  const { ip, userAgent, deviceLabel } = await requestMeta();
  const expiresAt = addDays(new Date(), remember ? SECURITY.rememberDays : SECURITY.sessionDays);
  await db.insert(sessions).values({ userId, tokenHash: hashToken(token), expiresAt, ip, userAgent });
  await db
    .insert(devices)
    .values({ userId, label: deviceLabel, userAgent, ip, lastSeenAt: new Date() });
  await db.update(users).set({ lastLoginAt: new Date(), failedLogins: 0, lockedUntil: null }).where(eq(users.id, userId));
  const { cookies } = await import("next/headers");
  const jar = await cookies();
  const policy = await cookiePolicy();
  jar.set(SESSION_COOKIE, token, { ...policy, httpOnly: true, expires: expiresAt, partitioned: policy.secure });
  jar.set("ss_csrf", token.slice(0, 16), { ...policy, httpOnly: false, expires: expiresAt, partitioned: policy.secure });
  return token;
}

export async function endSession() {
  const { cookies } = await import("next/headers");
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) {
    await db.update(sessions).set({ revokedAt: new Date() }).where(eq(sessions.tokenHash, hashToken(token)));
  }
  jar.delete(SESSION_COOKIE);
  jar.delete(CSRF_COOKIE);
  jar.delete("ss_csrf");
}

/**
 * Memoised per-request lookup of the signed-in user (or null).
 *
 * Accepts the session token from either the HttpOnly cookie or the `x-ss-session`
 * request header. The header exists because browsers block third-party cookies when
 * the app is embedded in another origin's iframe, which would otherwise leave framed
 * users permanently logged out.
 */
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  const { cookies, headers } = await import("next/headers");
  const jar = await cookies();
  const headerBag = await headers();
  const token = jar.get(SESSION_COOKIE)?.value ?? headerBag.get("x-ss-session") ?? undefined;
  if (!token) return null;
  const [row] = await db
    .select({ session: sessions, user: users })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.tokenHash, hashToken(token)), isNull(sessions.revokedAt), gt(sessions.expiresAt, new Date())))
    .limit(1);
  if (!row) return null;
  return toSessionUser(row.user);
});

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) throw new AuthError("UNAUTHENTICATED", "Please sign in to continue.");
  if (user.status === "suspended")
    throw new AuthError("SUSPENDED", "This account is suspended. Contact support for reinstatement.");
  return user;
}

export async function requireStaff() {
  const user = await requireUser();
  if (user.role !== "admin" && user.role !== "support")
    throw new AuthError("FORBIDDEN", "You do not have permission to view this area.");
  return user;
}

export async function requireAdmin() {
  const user = await requireUser();
  if (user.role !== "admin") throw new AuthError("FORBIDDEN", "Administrator access required.");
  return user;
}

export class AuthError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

export async function logoutAllDevices(userId: string) {
  await db.update(sessions).set({ revokedAt: new Date() }).where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt)));
}

export async function listActiveSessions(userId: string) {
  const rows = await db
    .select()
    .from(sessions)
    .where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt), gt(sessions.expiresAt, new Date())))
    .orderBy(desc(sessions.createdAt))
    .limit(20);
  return rows.map((r) => ({
    id: r.id,
    ip: r.ip,
    userAgent: r.userAgent,
    createdAt: r.createdAt,
    expiresAt: r.expiresAt,
  }));
}

export async function revokeSessionById(userId: string, sessionId: string) {
  await db.update(sessions).set({ revokedAt: new Date() }).where(and(eq(sessions.id, sessionId), eq(sessions.userId, userId)));
}

export async function recordLogin(userId: string | null, email: string, outcome: string) {
  const { ip, userAgent } = await requestMeta();
  await db.insert(loginHistory).values({ userId, email, ip, userAgent, outcome });
}

/* ------------------------------- tokens ------------------------------ */

export async function issueToken(userId: string, kind: string, ttlMinutes = SECURITY.tokenTtlMinutes) {
  const raw = randomBytes(24).toString("hex");
  await db.insert(authTokens).values({
    userId,
    kind,
    tokenHash: hashToken(raw),
    expiresAt: addDays(new Date(), ttlMinutes / 1440),
  });
  return raw;
}

export async function consumeToken(raw: string, kind: string): Promise<string | null> {
  const [row] = await db
    .select()
    .from(authTokens)
    .where(and(eq(authTokens.tokenHash, hashToken(raw)), eq(authTokens.kind, kind), isNull(authTokens.usedAt)))
    .limit(1);
  if (!row) return null;
  if (row.expiresAt.getTime() < Date.now()) return null;
  await db.update(authTokens).set({ usedAt: new Date() }).where(eq(authTokens.id, row.id));
  return row.userId;
}

/* --------------------------------- TOTP ------------------------------ */

const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function generateTotpSecret(length = 20) {
  const bytes = randomBytes(length);
  let out = "";
  for (const b of bytes) out += B32[b % 32];
  return out;
}

function base32Decode(input: string) {
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const char of input.replace(/=+$/, "").toUpperCase()) {
    const idx = B32.indexOf(char);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

export function totpCode(secret: string, counter = Math.floor(Date.now() / 30_000)) {
  const key = base32Decode(secret);
  const buf = Buffer.alloc(8);
  buf.writeUInt32BE(Math.floor(counter / 0x100000000), 0);
  buf.writeUInt32BE(counter % 0x100000000, 4);
  const digest = createHmac("sha1", key).update(buf).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const code = ((digest[offset] & 0x7f) << 24) | (digest[offset + 1] << 16) | (digest[offset + 2] << 8) | digest[offset + 3];
  return String(code % 1_000_000).padStart(6, "0");
}

export function verifyTotp(secret: string, code: string, windowSteps = 1) {
  const clean = code.replace(/\D/g, "");
  if (clean.length !== 6) return false;
  const counter = Math.floor(Date.now() / 30_000);
  for (let i = -windowSteps; i <= windowSteps; i += 1) {
    const expected = totpCode(secret, counter + i);
    const a = Buffer.from(expected);
    const b = Buffer.from(clean);
    if (a.length === b.length && timingSafeEqual(a, b)) return true;
  }
  return false;
}

export function otpauthUri(secret: string, email: string, issuer: string) {
  return `otpauth://totp/${encodeURIComponent(`${issuer}:${email}`)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&period=30&digits=6`;
}

export function makeRecoveryCodes(count = 8) {
  return Array.from({ length: count }, () => `${randomCode(5)}-${randomCode(5)}`);
}
