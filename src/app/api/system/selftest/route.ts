import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { accounts, users } from "@/db/schema";
import { hashPassword, verifyPassword, passwordIssues } from "@/lib/auth";
import { accountBalances, credit, debit } from "@/lib/ledger";
import { toKobo } from "@/lib/utils";

export const dynamic = "force-dynamic";

/**
 * Exercises the real auth + ledger code path end-to-end and cleans up after itself.
 * Used to separate "product logic broken" from "browser could not reach the action".
 */
export async function GET() {
  const log: string[] = [];
  const email = `selftest-${Date.now()}@increasevest.local`;
  const password = "SaveSelftest!1";
  const userId = randomUUID();
  const accountId = randomUUID();
  try {
    log.push(`policy:${passwordIssues(password).length === 0 ? "password accepted by policy" : "policy rejected"}`);
    const hash = await hashPassword(password);
    log.push(`hash:${hash.startsWith("$2b$11$") ? "bcrypt cost 11 ok" : "unexpected hash"}`);
    log.push(`verify:${(await verifyPassword(password, hash)) ? "correct password matches" : "MISMATCH"}`);
    log.push(`verify-negative:${(await verifyPassword("wrong" + password, hash)) ? "FALSE POSITIVE" : "wrong password rejected"}`);

    await db.insert(users).values({
      id: userId, email, phone: "+2348099999999", fullName: "Self Test", passwordHash: hash,
      status: "active", emailVerified: true, phoneVerified: true, kycStatus: "unverified",
      referralCode: `ST${Date.now().toString(36).slice(-4).toUpperCase()}`,
    });
    log.push("insert-user:ok");
    await db.insert(accounts).values({ id: accountId, userId, kind: "flex", name: "Flex wallet", status: "active" });
    log.push("insert-account:ok");

    const dep = await credit({ userId, accountId, type: "deposit", direction: "credit", amountKobo: toKobo(25000), description: "selftest deposit" });
    const over = await debit({ userId, accountId, type: "withdrawal", direction: "debit", amountKobo: toKobo(999999), description: "selftest overdraft" });
    const ok = await debit({ userId, accountId, type: "withdrawal", direction: "debit", amountKobo: toKobo(1000), description: "selftest payout" });
    const balances = await accountBalances(userId);
    log.push(`ledger:credit=${dep.ok ? "ok" : "FAIL"} overdraw=${over.ok ? "NOT BLOCKED" : "blocked"} debit=${ok.ok ? "ok" : "FAIL"} available=${balances.available}`);

    const [row] = await db.select({ email: users.email }).from(users).where(eq(users.id, userId)).limit(1);
    log.push(`read-back:${row?.email === email ? "ok" : "FAIL"}`);
    return NextResponse.json({ pass: dep.ok && !over.ok && ok.ok && balances.available === toKobo(24000) && !!row, log });
  } catch (err) {
    return NextResponse.json({ pass: false, log, error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  } finally {
    await db.delete(accounts).where(eq(accounts.userId, userId)).catch(() => null);
    await db.delete(users).where(eq(users.id, userId)).catch(() => null);
  }
}
