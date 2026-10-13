import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { accounts, bankAccounts, kycRecords, users } from "@/db/schema";
import { hashPassword, rateLimit, startSession } from "@/lib/auth";
import { recordLogin } from "@/lib/auth";
import { randomCode, randomRef } from "@/lib/utils";

export const dynamic = "force-dynamic";

/**
 * One-click entry point: creates (or reuses) the pre-funded demo account and drops the
 * visitor straight onto the dashboard with a working session.
 *
 * The session token is passed in the URL, which `src/middleware.ts` authenticates
 * server-side — so this link works even when the browser blocks cookies, blocks
 * localStorage and strips custom headers (i.e. inside a third-party preview frame).
 */
const DEMO_EMAIL = "demo@increasevest.ng";
const DEMO_PASSWORD = "IncreaseVest!2026";

async function ensureDemoUser() {
  const [existing] = await db.select().from(users).where(eq(users.email, DEMO_EMAIL)).limit(1);
  if (existing) {
    // Keep the demo account usable even if it was suspended or never verified.
    await db
      .update(users)
      .set({ status: "active", emailVerified: true, phoneVerified: true, kycStatus: "verified", failedLogins: 0, lockedUntil: null })
      .where(eq(users.id, existing.id));
    return existing.id;
  }

  const userId = randomUUID();
  await db.insert(users).values({
    id: userId,
    email: DEMO_EMAIL,
    phone: "+2348031234567",
    passwordHash: await hashPassword(DEMO_PASSWORD),
    fullName: "Amaka Obi",
    role: "user",
    status: "active",
    emailVerified: true,
    phoneVerified: true,
    kycStatus: "verified",
    referralCode: "AMAKA1",
  });
  await db.insert(accounts).values([
    { userId, kind: "flex", name: "Flex wallet", icon: "wallet", status: "active", balanceKobo: 41_250_000 },
    { userId, kind: "target", name: "School fees 2026", purpose: "education", status: "active", balanceKobo: 42_000_000, targetKobo: 60_000_000, contributionKobo: 3_500_000, frequency: "monthly", autoDebit: true },
    { userId, kind: "regular", name: "Emergency buffer", purpose: "emergency", status: "active", balanceKobo: 18_500_000, contributionKobo: 2_000_000, frequency: "weekly", interestBps: 300 },
    {
      userId, kind: "safelock", name: "SafeLock 12M", purpose: "safelock", status: "active",
      balanceKobo: 50_000_000, targetKobo: 50_000_000, contributionKobo: 1_000_000, frequency: "monthly",
      autoDebit: true, interestBps: 900, lockMonths: 12, penaltyBps: 200,
      startDate: new Date(), maturityDate: new Date(Date.now() + 275 * 86_400_000),
    },
  ]);
  await db.insert(bankAccounts).values({
    userId, bankName: "GTBank (Guaranty Trust)", bankCode: "058", accountNumber: "0123456789",
    accountName: "AMAKA OBI", verified: true, verificationSource: "simulated", isDefault: true,
  });
  await db.insert(kycRecords).values({
    userId, type: "nigeria_identity", legalName: "Amaka Obi", dob: "1994-06-11", idType: "bvn",
    idNumberHash: "demo-hashed", idNumberLast4: "6789", status: "verified", provider: "simulated",
    providerRef: "KYC-DEMO", submittedAt: new Date(), reviewedAt: new Date(),
  });
  return userId;
}

export async function GET(request: Request) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "127.0.0.1";
  if (!rateLimit(`demo-entry:${ip}`, 20, 60_000).allowed) {
    return NextResponse.redirect(new URL("/login?reason=session", request.url));
  }
  try {
    const userId = await ensureDemoUser();
    const token = await startSession(userId, true);
    await recordLogin(userId, DEMO_EMAIL, "success");
    // Build the absolute target from the *incoming* host, never the internal bind
    // address, so the redirect lands back on the origin the visitor actually used.
    // Neither request.url (the internal bind address) nor x-forwarded-proto can be
    // trusted: the sandbox proxy terminates TLS yet labels itself "http". The public
    // hostname is the reliable signal, so anything non-local is https.
    const host =
      request.headers.get("x-forwarded-host")?.split(",")[0]?.trim() ||
      request.headers.get("host") ||
      new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "https://localhost:3000").host;
    const isLocal = /^(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(:|$)/i.test(host);
    const proto = isLocal ? "http" : "https";
    const target = new URL(`${proto}://${host}/dashboard?tour=1`);
    target.searchParams.set("ss_token", token);
    return NextResponse.redirect(target);
  } catch (err) {
    console.error("[demo entry] failed:", err);
    return NextResponse.redirect(new URL("/login", request.url));
  }
}

/** Also accept POST so a button can call it without a full navigation. */
export async function POST(request: Request) {
  return GET(request);
}

void randomRef;
void randomCode;
void isNull;
void and;
void sql;
