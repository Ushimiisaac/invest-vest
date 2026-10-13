"use server";

import { revalidatePath } from "next/cache";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  accounts,
  bankAccounts,
  groupActions,
  investmentHoldings,
  investmentProducts,
  paymentIntents,
  savingsGroupMembers,
  savingsGroups,
  savingsRules,
  transactions,
  users,
  withdrawalRequests,
} from "@/db/schema";
import { AuthError, rateLimit, requireUser, verifyPassword } from "@/lib/auth";
import { FEATURES, KYC, POLICY_VERSION, PRODUCT } from "@/lib/config";
import { processMaturities, runDueContributions, withdrawalLimitCheck } from "@/lib/data";
import { accountBalances, credit, debit } from "@/lib/ledger";
import { lockQuote } from "@/lib/calculators";
import { initiateDeposit, resolveBankAccount, verifyAndSettle } from "@/lib/payments";
import { notifyUser } from "@/lib/notify";
import { addDays, naira, toKobo, randomRef } from "@/lib/utils";
import { IDLE, checked, field, num, type ActionState } from "@/lib/action-helpers";

void IDLE;

const PATHS = [
  "/dashboard",
  "/wallet",
  "/savings",
  "/safelock",
  "/groups",
  "/invest",
  "/rules",
  "/transactions",
  "/notifications",
  "/referrals",
];

function revalidateAll() {
  for (const p of PATHS) revalidatePath(p);
}

async function guard(userId: string, scope: string, limit = 30) {
  const rl = rateLimit(`${scope}:${userId}`, limit, 60_000);
  if (!rl.allowed) throw new AuthError("RATE_LIMIT", "You are moving fast. Wait a minute and try again.");
}

async function ownedAccount(userId: string, accountId: string) {
  const [account] = await db.select().from(accounts).where(and(eq(accounts.id, accountId), eq(accounts.userId, userId))).limit(1);
  if (!account) throw new AuthError("NOT_FOUND", "That savings account is not on your profile.");
  return account;
}

async function flexOf(userId: string) {
  const [flex] = await db
    .select()
    .from(accounts)
    .where(and(eq(accounts.userId, userId), eq(accounts.kind, "flex")))
    .limit(1);
  if (flex) return flex;
  const [created] = await db
    .insert(accounts)
    .values({ userId, kind: "flex", name: "Flex wallet", icon: "wallet", status: "active" })
    .returning();
  return created;
}

/* ============================== DEPOSITS ============================== */

export async function fundWalletAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  await guard(user.id, "deposit", 12);
  const amountKobo = toKobo(field(formData, "amount"));
  const accountTargetId = field(formData, "accountId");
  const channel = (field(formData, "channel") || "card") as "card" | "bank" | "ussd" | "transfer";
  const note = field(formData, "note");
  const idem = field(formData, "idempotencyKey") || `${user.id}:${amountKobo}:${note || "manual"}`;

  const account = accountTargetId ? await ownedAccount(user.id, accountTargetId) : await flexOf(user.id);
  const intent = await initiateDeposit({
    userId: user.id,
    email: user.email,
    amountKobo,
    accountId: account.id,
    channel,
    idempotencyKey: idem.slice(0, 120),
  });
  if (!intent.ok) return { ok: false, field: "amount", error: intent.error };
  return {
    ok: true,
    notice: intent.live ? "Checkout opened. We credit your account only after the provider confirms." : "Simulated checkout opened.",
    data: { reference: intent.reference, checkoutUrl: intent.checkoutUrl, live: intent.live, accountId: account.id },
  };
}

export async function confirmDemoDepositAction(reference: string) {
  const user = await requireUser();
  const [intent] = await db.select().from(paymentIntents).where(eq(paymentIntents.reference, reference)).limit(1);
  if (!intent || intent.userId !== user.id) return { ok: false, error: "Unknown payment reference." };
  const result = await verifyAndSettle(reference);
  revalidateAll();
  return result.ok
    ? { ok: true, notice: `₦${(intent.amountKobo / 100).toLocaleString("en-NG")} credited.`, data: { reference } }
    : { ok: false, error: result.error };
}

export async function verifyDepositAction(reference: string): Promise<ActionState> {
  const user = await requireUser();
  const result = await verifyAndSettle(reference);
  revalidateAll();
  return result.ok
    ? { ok: true, notice: "Deposit verified and credited.", data: { amount: (result.amountKobo / 100).toFixed(2) } }
    : { ok: false, error: result.error };
}

export async function retryFailedDepositAction(reference: string): Promise<ActionState> {
  const user = await requireUser();
  const [intent] = await db.select().from(paymentIntents).where(eq(paymentIntents.reference, reference)).limit(1);
  if (!intent || intent.userId !== user.id) return { ok: false, error: "Unknown reference." };
  await db.update(paymentIntents).set({ status: "pending", verifiedAt: null }).where(eq(paymentIntents.reference, reference));
  const res = await verifyAndSettle(reference);
  revalidateAll();
  return res.ok ? { ok: true, notice: "Re-verified with the provider and credited." } : { ok: false, error: res.error };
}

/* ============================= WITHDRAWALS ============================ */

export async function requestWithdrawalAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  await guard(user.id, "withdraw", 8);
  const amountKobo = toKobo(field(formData, "amount"));
  const accountId = field(formData, "accountId");
  const bankId = field(formData, "bankAccountId");
  const code = field(formData, "code");
  const password = field(formData, "password");

  if (amountKobo < PRODUCT.minTransferKobo) return { ok: false, field: "amount", error: `Minimum withdrawal is ${naira(PRODUCT.minTransferKobo)}.` };
  if (!bankId) return { ok: false, field: "bankAccountId", error: "Choose a verified beneficiary account." };

  const [bank] = await db
    .select()
    .from(bankAccounts)
    .where(and(eq(bankAccounts.id, bankId), eq(bankAccounts.userId, user.id), eq(bankAccounts.status, "active")))
    .limit(1);
  if (!bank) return { ok: false, field: "bankAccountId", error: "Beneficiary not found." };
  if (!bank.verified) return { ok: false, field: "bankAccountId", error: "Beneficiary must be verified before payouts." };

  const source = accountId ? await ownedAccount(user.id, accountId) : await flexOf(user.id);
  const feeKobo = Math.max(PRODUCT.withdrawalFeeKobo, Math.round((amountKobo * PRODUCT.withdrawalFeeBps) / 10000));
  const total = amountKobo + feeKobo;

  if (source.balanceKobo < total)
    return { ok: false, field: "amount", error: `Available ${naira(source.balanceKobo)} — you need ${naira(total)} including fees.` };

  const limitInfo = await withdrawalLimitCheck(user.id);
  const riskFlags: string[] = [];
  if (amountKobo + feeKobo > limitInfo.remaining) riskFlags.push("daily_limit");
  if (user.kycStatus !== "verified") riskFlags.push("kyc_incomplete");
  const [acctRow] = await db.select({ createdAt: users.createdAt }).from(users).where(eq(users.id, user.id)).limit(1);
  if (acctRow && Date.now() - acctRow.createdAt.getTime() < 86_400_000) riskFlags.push("new_account");

  if (riskFlags.includes("daily_limit"))
    return { ok: false, field: "amount", error: `Over the daily limit. ${naira(limitInfo.remaining)} remains today.` };

  // Second factor for money leaving the platform.
  if (user.mfaEnabled) {
    const { verifyTotpWithUser } = await import("@/lib/second-factor").catch(() => ({ verifyTotpWithUser: null }));
    if (verifyTotpWithUser) {
      const ok = await verifyTotpWithUser(user.id, code);
      if (!ok) return { ok: false, field: "code", error: "Invalid authentication code." };
    }
  } else if (password) {
    const [row] = await db.select({ hash: users.passwordHash }).from(users).where(eq(users.id, user.id)).limit(1);
    if (!row || !(await verifyPassword(password, row.hash))) return { ok: false, field: "password", error: "Password does not match." };
  } else if (code) {
    return { ok: false, field: "code", error: "Two-factor is not enabled — confirm with your password instead." };
  } else {
    return { ok: false, field: "password", error: "Enter your password to authorise this payout." };
  }

  const reference = randomRef("WDR");
  const hold = await debit({
    userId: user.id,
    accountId: source.id,
    type: "withdrawal",
    direction: "debit",
    amountKobo: total,
    status: "pending",
    description: `Withdrawal request to ${bank.bankName} ${bank.accountNumber}`,
    reference,
    meta: { feeKobo, riskFlags, bankAccountId: bank.id },
  });
  if (!hold.ok) return { ok: false, field: "amount", error: hold.error };

  const [request] = await db
    .insert(withdrawalRequests)
    .values({
      userId: user.id,
      accountId: source.id,
      bankAccountId: bank.id,
      amountKobo,
      feeKobo,
      reference,
      status: riskFlags.length ? "pending" : "approved",
      riskFlags,
    })
    .returning();

  await notifyUser({
    userId: user.id,
    type: "withdrawal",
    severity: riskFlags.length ? "warning" : "info",
    title: `Withdrawal requested — ${naira(amountKobo)}`,
    body: riskFlags.length
      ? `Reference ${reference}. This payout is queued for a security check because: ${riskFlags.join(", ")}.`
      : `Reference ${reference}. Payout to ${bank.bankName} ••••${bank.accountNumber.slice(-4)} is being processed.`,
    link: "/wallet?tab=withdrawals",
    sms: `${naira(amountKobo)} withdrawal requested. Did not do this? Call support now.`,
  });
  revalidateAll();
  return {
    ok: true,
    notice: riskFlags.length
      ? "Request received and queued for review. Funds are on hold, not lost."
      : "Request approved and queued for payout.",
    data: { reference: request.reference },
  };
}

export async function cancelWithdrawalAction(id: string): Promise<ActionState> {
  const user = await requireUser();
  const [row] = await db.select().from(withdrawalRequests).where(and(eq(withdrawalRequests.id, id), eq(withdrawalRequests.userId, user.id))).limit(1);
  if (!row) return { ok: false, error: "Request not found." };
  if (row.status !== "pending" && row.status !== "approved") return { ok: false, error: "This payout already entered processing and cannot be cancelled." };
  await db.update(withdrawalRequests).set({ status: "rejected", rejectionReason: "Cancelled by customer", reviewedAt: new Date() }).where(eq(withdrawalRequests.id, id));
  const [txn] = await db.select().from(transactions).where(eq(transactions.reference, row.reference)).limit(1);
  if (txn && txn.status === "pending") {
    await db.update(transactions).set({ status: "reversed", settledAt: new Date(), description: "Withdrawal cancelled — funds returned" }).where(eq(transactions.id, txn.id));
    if (row.accountId) {
      await credit({
        userId: user.id,
        accountId: row.accountId,
        type: "reversal",
        direction: "credit",
        amountKobo: row.amountKobo + row.feeKobo,
        description: `Reversal of cancelled withdrawal ${row.reference}`,
      });
    }
  }
  revalidateAll();
  return { ok: true, notice: "Withdrawal cancelled and funds returned." };
}

/* ============================ BANK ACCOUNTS ========================= */

export async function addBankAccountAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  await guard(user.id, "bank", 6);
  const bankName = field(formData, "bankName");
  const accountNumber = field(formData, "accountNumber");
  if (!bankName) return { ok: false, field: "bankName", error: "Select your bank." };
  const resolved = await resolveBankAccount(accountNumber, bankName);
  if (!resolved.ok) return { ok: false, field: "accountNumber", error: resolved.error };
  const [existing] = await db
    .select()
    .from(bankAccounts)
    .where(and(eq(bankAccounts.userId, user.id), eq(bankAccounts.accountNumber, accountNumber)))
    .limit(1);
  if (existing) return { ok: false, field: "accountNumber", error: "This account is already saved." };
  const count = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(bankAccounts)
    .where(and(eq(bankAccounts.userId, user.id), eq(bankAccounts.status, "active")));
  const isDefault = Number(count[0]?.c ?? 0) === 0;
  await db.insert(bankAccounts).values({
    userId: user.id,
    bankName: resolved.bankName,
    accountNumber,
    accountName: resolved.accountName,
    verified: true,
    verificationSource: resolved.source,
    isDefault,
  });
  await notifyUser({
    userId: user.id,
    type: "security",
    severity: "warning",
    title: "New payout beneficiary added",
    body: `${resolved.bankName} ••••${accountNumber.slice(-4)} (${resolved.accountName}). If this wasn't you, remove it immediately.`,
    link: "/wallet?tab=beneficiaries",
  });
  revalidatePath("/wallet");
  return { ok: true, notice: `Beneficiary verified as ${resolved.accountName}.` };
}

export async function removeBankAccountAction(id: string): Promise<ActionState> {
  const user = await requireUser();
  await db.update(bankAccounts).set({ status: "removed" }).where(and(eq(bankAccounts.id, id), eq(bankAccounts.userId, user.id)));
  revalidatePath("/wallet");
  return { ok: true, notice: "Beneficiary removed." };
}

export async function setDefaultBankAction(id: string): Promise<ActionState> {
  const user = await requireUser();
  await db.update(bankAccounts).set({ isDefault: false }).where(eq(bankAccounts.userId, user.id));
  await db.update(bankAccounts).set({ isDefault: true }).where(and(eq(bankAccounts.id, id), eq(bankAccounts.userId, user.id)));
  revalidatePath("/wallet");
  return { ok: true, notice: "Default payout account updated." };
}

/* ============================== SAVINGS =============================== */

const CADENCE: Record<string, number> = { daily: 1, weekly: 7, monthly: 30 };

export async function createGoalAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  await guard(user.id, "goal", 20);
  const name = field(formData, "name");
  const targetKobo = toKobo(field(formData, "target"));
  const contributionKobo = toKobo(field(formData, "contribution"));
  const frequency = field(formData, "frequency") || "monthly";
  const purpose = field(formData, "purpose") || "general";
  const icon = field(formData, "icon") || "target";
  const color = field(formData, "color") || "#0f9d76";
  const deadline = field(formData, "deadline");
  const auto = checked(formData, "autoDebit");
  const consent = checked(formData, "consent");

  if (name.length < 3) return { ok: false, field: "name", error: "Give your goal a recognisable name." };
  if (targetKobo < PRODUCT.minGoalKobo) return { ok: false, field: "target", error: `Target must be at least ${naira(PRODUCT.minGoalKobo)}.` };
  if (auto && !consent) return { ok: false, field: "consent", error: "Automatic transfers need explicit consent before they can run." };
  if (auto && contributionKobo <= 0) return { ok: false, field: "contribution", error: "Set a contribution amount to automate this goal." };
  const kind = purpose === "regular" ? "regular" : "target";

  const [created] = await db
    .insert(accounts)
    .values({
      userId: user.id,
      kind,
      name,
      icon,
      color,
      purpose,
      targetKobo,
      contributionKobo,
      frequency,
      autoDebit: auto,
      interestBps: kind === "regular" ? PRODUCT.floatInterestBps : 0,
      startDate: new Date(),
      nextDueAt: auto ? addDays(new Date(), CADENCE[frequency] ?? 30) : null,
      status: "active",
    })
    .returning();

  if (auto) {
    await db.insert(savingsRules).values({
      userId: user.id,
      kind: "fixed",
      name: `AutoSave · ${name}`,
      accountId: created.id,
      amountKobo: contributionKobo,
      frequency,
      active: true,
      consentVersion: POLICY_VERSION,
      nextRunAt: addDays(new Date(), CADENCE[frequency] ?? 30),
    });
  }

  const opening = toKobo(field(formData, "opening"));
  if (opening > 0) {
    const flex = await flexOf(user.id);
    if (flex.balanceKobo >= opening) {
      await debit({ userId: user.id, accountId: flex.id, type: "transfer_out", direction: "debit", amountKobo: opening, description: `Seed ${name}` });
      await credit({ userId: user.id, accountId: created.id, type: "contribution", direction: "credit", amountKobo: opening, description: `Seed deposit to ${name}` });
    } else {
      const intent = await initiateDeposit({ userId: user.id, email: user.email, amountKobo: opening, accountId: created.id, channel: "card" });
      if (intent.ok) {
        return { ok: true, notice: "Goal created. Fund the seed deposit to finish setup.", data: { goalId: created.id, checkoutUrl: intent.checkoutUrl } };
      }
    }
  }
  await notifyUser({
    userId: user.id,
    type: "contribution",
    severity: "success",
    title: `Goal created — ${name}`,
    body: `Target ${naira(targetKobo)}${auto ? `, auto-saving ${naira(contributionKobo)} ${frequency}` : ""}.`,
    link: `/savings/${created.id}`,
  });
  revalidateAll();
  return { ok: true, notice: "Goal created.", data: { goalId: created.id } };
}

export async function updateGoalAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  const accountId = field(formData, "accountId");
  const account = await ownedAccount(user.id, accountId);
  if (account.kind === "safelock") {
    const months = num(formData, "months", account.lockMonths);
    const contributionKobo = toKobo(field(formData, "contribution"));
    await db.update(accounts).set({ contributionKobo, nextDueAt: addDays(new Date(), 30), updatedAt: new Date() }).where(eq(accounts.id, account.id));
    void months;
    revalidateAll();
    return { ok: true, notice: "Lock schedule updated. Locked principal and rate stay unchanged." };
  }
  const name = field(formData, "name") || account.name;
  const targetKobo = field(formData, "target") ? toKobo(field(formData, "target")) : account.targetKobo;
  const contributionKobo = toKobo(field(formData, "contribution"));
  const frequency = field(formData, "frequency") || account.frequency || "monthly";
  const auto = checked(formData, "autoDebit");
  if (targetKobo > 0 && targetKobo < account.balanceKobo)
    return { ok: false, field: "target", error: "Target cannot be below what you already saved." };

  await db
    .update(accounts)
    .set({ name, targetKobo, contributionKobo, frequency, autoDebit: auto, nextDueAt: auto ? addDays(new Date(), CADENCE[frequency] ?? 30) : null, updatedAt: new Date() })
    .where(eq(accounts.id, account.id));
  await db
    .update(savingsRules)
    .set({ active: auto, amountKobo: contributionKobo, frequency, accountId: account.id })
    .where(and(eq(savingsRules.userId, user.id), eq(savingsRules.accountId, account.id), eq(savingsRules.kind, "fixed")));
  revalidateAll();
  return { ok: true, notice: "Goal updated." };
}

export async function setAccountStatusAction(accountId: string, status: "active" | "paused" | "completed"): Promise<ActionState> {
  const user = await requireUser();
  const account = await ownedAccount(user.id, accountId);
  if (account.kind === "safelock" && status !== "active") return { ok: false, error: "Locked plans cannot be paused. Withdraw at maturity instead." };
  await db.update(accounts).set({ status, updatedAt: new Date() }).where(eq(accounts.id, accountId));
  if (status === "paused") {
    await db.update(savingsRules).set({ active: false }).where(and(eq(savingsRules.userId, user.id), eq(savingsRules.accountId, accountId)));
  } else {
    await db
      .update(accounts)
      .set({ nextDueAt: addDays(new Date(), CADENCE[account.frequency ?? "monthly"] ?? 30) })
      .where(eq(accounts.id, accountId));
  }
  revalidateAll();
  return { ok: true, notice: status === "paused" ? "Contributions paused." : "Plan resumed." };
}

export async function contributeAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  await guard(user.id, "contribute", 40);
  const accountId = field(formData, "accountId");
  const amountKobo = toKobo(field(formData, "amount"));
  const account = await ownedAccount(user.id, accountId);
  if (account.status === "paused") return { ok: false, error: "Resume this plan before adding money." };
  if (amountKobo < PRODUCT.minTransferKobo) return { ok: false, field: "amount", error: `Minimum is ${naira(PRODUCT.minTransferKobo)}.` };
  const external = checked(formData, "external");
  if (external) {
    const intent = await initiateDeposit({ userId: user.id, email: user.email, amountKobo, accountId, channel: "card", idempotencyKey: `c:${accountId}:${amountKobo}:${Date.now()}` });
    if (!intent.ok) return { ok: false, field: "amount", error: intent.error };
    return { ok: true, notice: "Checkout opened for this top-up.", data: { checkoutUrl: intent.checkoutUrl } };
  }
  const flex = await flexOf(user.id);
  if (flex.balanceKobo < amountKobo)
    return { ok: false, field: "amount", error: `Your Flex wallet holds ${naira(flex.balanceKobo)}. Fund it first.` };
  const out = await debit({ userId: user.id, accountId: flex.id, type: "transfer_out", direction: "debit", amountKobo, description: `Move to ${account.name}` });
  if (!out.ok) return { ok: false, field: "amount", error: out.error };
  const res = await credit({ userId: user.id, accountId, type: "contribution", direction: "credit", amountKobo, description: `Contribution to ${account.name}` });
  if (!res.ok) return { ok: false, error: res.error };
  await maybeMilestone(user.id, account.id);
  await notifyUser({
    userId: user.id,
    type: "contribution",
    severity: "success",
    title: `Saved ${naira(amountKobo)} into ${account.name}`,
    body: "Moved from your Flex wallet.",
    link: `/savings/${accountId}`,
  });
  revalidateAll();
  return { ok: true, notice: `${naira(amountKobo)} saved.`, data: { reference: res.transaction.reference } };
}

async function maybeMilestone(userId: string, accountId: string) {
  const [a] = await db.select().from(accounts).where(eq(accounts.id, accountId)).limit(1);
  if (!a || !a.targetKobo) return;
  const pct = (a.balanceKobo / a.targetKobo) * 100;
  if (pct >= 100) {
    await notifyUser({
      userId,
      type: "milestone",
      severity: "success",
      title: `Goal funded — ${a.name}`,
      body: "You reached 100% of this target. Consider locking it in SafeLock to protect it.",
      link: "/savings",
    });
  }
}

export async function withdrawFromAccountAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  await guard(user.id, "withdraw-plan", 12);
  const accountId = field(formData, "accountId");
  const amountKobo = toKobo(field(formData, "amount"));
  const account = await ownedAccount(user.id, accountId);
  const acknowledge = checked(formData, "acknowledge");
  if (amountKobo <= 0) return { ok: false, field: "amount", error: "Enter an amount." };
  if (amountKobo > account.balanceKobo) return { ok: false, field: "amount", error: `This plan holds ${naira(account.balanceKobo)}.` };

  let penaltyKobo = 0;
  if (account.kind === "safelock") {
    const mature = account.maturityDate ? account.maturityDate.getTime() <= Date.now() : false;
    if (!mature) {
      const quote = lockQuote({ amountKobo, months: account.lockMonths, annualBps: account.interestBps, penaltyBps: account.penaltyBps });
      penaltyKobo = Math.min(quote.earlyExitPenalty, Math.round((amountKobo * account.penaltyBps) / 10000) + Math.round(quote.gross / 100) * 100);
      if (!acknowledge)
        return {
          ok: false,
          field: "acknowledge",
          error: `Early exit before ${account.maturityDate?.toLocaleDateString("en-NG") || "maturity"} forfeits about ${naira(penaltyKobo)} of accrued interest. Tick the acknowledgement to continue.`,
        };
    }
  }

  const out = await debit({
    userId: user.id,
    accountId,
    type: "transfer_out",
    direction: "debit",
    amountKobo,
    description: account.kind === "safelock" && penaltyKobo > 0 ? `Early exit from ${account.name}` : `Move ${account.name} to Flex wallet`,
    meta: { penaltyKobo, early: penaltyKobo > 0 },
  });
  if (!out.ok) return { ok: false, error: out.error };
  const flex = await flexOf(user.id);
  const net = Math.max(0, amountKobo - penaltyKobo);
  await credit({ userId: user.id, accountId: flex.id, type: "transfer_in", direction: "credit", amountKobo: net, description: `Received from ${account.name}` });
  if (account.kind === "safelock" && net === 0) {
    await db.update(accounts).set({ status: "closed" }).where(eq(accounts.id, account.id));
  }
  await notifyUser({
    userId: user.id,
    type: "withdrawal",
    severity: penaltyKobo > 0 ? "warning" : "info",
    title: `${naira(net)} moved to your Flex wallet`,
    body: penaltyKobo > 0 ? `Early-exit cost ${naira(penaltyKobo)} per the plan terms.` : "Available for payout immediately.",
    link: "/wallet",
  });
  revalidateAll();
  return { ok: true, notice: `${naira(net)} moved to the Flex wallet.${penaltyKobo ? ` Penalty ${naira(penaltyKobo)}.` : ""}` };
}

/* ============================== SAFELOCK ============================= */

export async function createLockAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  await guard(user.id, "lock", 10);
  const amountKobo = toKobo(field(formData, "amount"));
  const months = num(formData, "months", 12);
  const tier = PRODUCT.safelockTiers.reduce((best, t) => (Math.abs(t.months - months) < Math.abs(best.months - months) ? t : best), PRODUCT.safelockTiers[0]);
  const name = field(formData, "name") || `SafeLock ${tier.months}M`;
  const consent = checked(formData, "consent");
  const autoTopUp = checked(formData, "autoTopUp");
  const topUpKobo = toKobo(field(formData, "topUp"));

  if (amountKobo < PRODUCT.safelockMinKobo) return { ok: false, field: "amount", error: `Minimum lock is ${naira(PRODUCT.safelockMinKobo)}.` };
  if (!consent) return { ok: false, field: "consent", error: "You must acknowledge the lock terms and early-exit penalty." };
  const flex = await flexOf(user.id);
  if (flex.balanceKobo < amountKobo)
    return { ok: false, field: "amount", error: `Flex wallet has ${naira(flex.balanceKobo)}. Fund ${naira(amountKobo - flex.balanceKobo)} more.` };

  const out = await debit({ userId: user.id, accountId: flex.id, type: "transfer_out", direction: "debit", amountKobo, description: `Locked into ${name}` });
  if (!out.ok) return { ok: false, error: out.error };

  const [lock] = await db
    .insert(accounts)
    .values({
      userId: user.id,
      kind: "safelock",
      name,
      icon: "lock",
      color: "#0b8a65",
      purpose: "safelock",
      balanceKobo: amountKobo,
      targetKobo: amountKobo,
      frequency: autoTopUp && topUpKobo > 0 ? "monthly" : null,
      contributionKobo: autoTopUp ? topUpKobo : 0,
      autoDebit: autoTopUp && topUpKobo > 0,
      interestBps: tier.bps,
      lockMonths: tier.months,
      penaltyBps: PRODUCT.safelockPenaltyBps,
      startDate: new Date(),
      maturityDate: addDays(new Date(), tier.months * 30),
      nextDueAt: autoTopUp && topUpKobo > 0 ? addDays(new Date(), 30) : null,
      status: "active",
    })
    .returning();

  await credit({
    userId: user.id,
    accountId: lock.id,
    type: "contribution",
    direction: "credit",
    amountKobo,
    description: `Locked for ${tier.months} months @ ${(tier.bps / 100).toFixed(2)}% p.a. (indicative)`,
    reference: out.transaction.reference,
  });

  const quote = lockQuote({ amountKobo, months: tier.months, annualBps: tier.bps, penaltyBps: PRODUCT.safelockPenaltyBps });
  await notifyUser({
    userId: user.id,
    type: "maturity",
    severity: "success",
    title: `SafeLock opened — ${name}`,
    body: `${naira(amountKobo)} locked until ${lock.maturityDate?.toLocaleDateString("en-NG", { day: "numeric", month: "long", year: "numeric" })}. Estimated net payout ${naira(quote.maturityValue)}.`,
    link: "/safelock",
  });
  revalidateAll();
  return { ok: true, notice: `Locked ${naira(amountKobo)} until maturity.`, data: { lockId: lock.id } };
}

/* ============================== INVESTMENTS =========================== */

export async function applyInvestmentAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  await guard(user.id, "invest", 10);
  const productId = field(formData, "productId");
  const amountKobo = toKobo(field(formData, "amount"));
  const consent = checked(formData, "consent");
  const confirm = checked(formData, "confirmSimulated");

  const [product] = await db.select().from(investmentProducts).where(eq(investmentProducts.id, productId)).limit(1);
  if (!product) return { ok: false, error: "Product not found." };
  if (product.status === "inactive") return { ok: false, error: "This product is closed for applications." };
  if (product.status === "waitlist") return { ok: false, error: "This product is not open yet — join the waitlist from the product page." };
  if (amountKobo < product.minKobo) return { ok: false, field: "amount", error: `Minimum investment is ${naira(product.minKobo)}.` };
  if (product.maxKobo > 0 && amountKobo > product.maxKobo) return { ok: false, field: "amount", error: `Maximum allocation is ${naira(product.maxKobo)}.` };
  if (!consent) return { ok: false, field: "consent", error: "Confirm you understand the risk disclosure." };
  if (product.status === "simulated" && !confirm)
    return { ok: false, field: "confirmSimulated", error: "This is a simulated instrument. Tick the simulation acknowledgement to continue." };
  if (product.status === "active" && user.kycStatus !== "verified")
    return { ok: false, error: "Real products require completed identity verification. Finish KYC in settings." };

  const flex = await flexOf(user.id);
  if (flex.balanceKobo < amountKobo)
    return { ok: false, field: "amount", error: `Fund your Flex wallet first. Available ${naira(flex.balanceKobo)}.` };

  const feeKobo = Math.round((amountKobo * product.feeBps) / 10000);
  const out = await debit({
    userId: user.id,
    accountId: flex.id,
    type: "investment",
    direction: "debit",
    amountKobo: amountKobo + feeKobo,
    description: `Subscription · ${product.name}`,
    meta: { productId, feeKobo, status: product.status },
  });
  if (!out.ok) return { ok: false, error: out.error };

  const startAt = new Date();
  const [holding] = await db
    .insert(investmentHoldings)
    .values({
      userId: user.id,
      productId: product.id,
      principalKobo: amountKobo,
      indicativeReturnBps: product.indicativeReturnBps,
      feeKobo,
      status: "active",
      startAt,
      maturityAt: addDays(startAt, product.tenorMonths * 30),
      applicationRef: randomRef("INV"),
      confirmedAt: startAt,
    })
    .returning();

  await notifyUser({
    userId: user.id,
    type: "maturity",
    severity: "info",
    title: `Application confirmed — ${product.name}`,
    body: `${naira(amountKobo)} allocated at an indicative ${(product.indicativeReturnBps / 100).toFixed(2)}% p.a. Matures ${holding.maturityAt?.toLocaleDateString("en-NG")}. ${
      product.status === "simulated" ? "Simulated instrument — no real securities purchased." : ""
    }`,
    link: "/invest",
  });
  revalidateAll();
  return { ok: true, notice: `Subscription confirmed. Reference ${holding.applicationRef}.`, data: { holdingId: holding.id } };
}

export async function redeemHoldingAction(holdingId: string): Promise<ActionState> {
  const user = await requireUser();
  const [holding] = await db.select().from(investmentHoldings).where(and(eq(investmentHoldings.id, holdingId), eq(investmentHoldings.userId, user.id))).limit(1);
  if (!holding) return { ok: false, error: "Holding not found." };
  const [product] = await db.select().from(investmentProducts).where(eq(investmentProducts.id, holding.productId)).limit(1);
  const mature = holding.maturityAt ? holding.maturityAt.getTime() <= Date.now() : false;
  if (!mature && holding.status !== "matured") {
    if (product?.liquidity === "locked") return { ok: false, error: "This instrument has no early redemption. Funds return to your wallet on maturity." };
  }
  const years = Math.max(0.25, ((Date.now() - (holding.startAt?.getTime() ?? Date.now())) / 31_536_000_000));
  const gross = Math.round(holding.principalKobo * (holding.indicativeReturnBps / 10000) * years);
  const net = Math.max(0, gross - Math.round(gross * 0.1));
  const flex = await flexOf(user.id);
  await credit({
    userId: user.id,
    accountId: flex.id,
    type: "payout",
    direction: "credit",
    amountKobo: holding.principalKobo + net - (mature ? 0 : Math.round(net * 0.15)),
    description: `Redemption · ${product?.name ?? "investment"}`,
    meta: { holdingId, early: !mature, gross, net },
  });
  await db.update(investmentHoldings).set({ status: "redeemed", accruedKobo: net, paidKobo: net }).where(eq(investmentHoldings.id, holding.id));
  await notifyUser({
    userId: user.id,
    type: "maturity",
    severity: "success",
    title: `Redemption processed — ${product?.name ?? "investment"}`,
    body: `Principal and estimated net return are in your Flex wallet${!mature ? " (early redemption discount applied)" : ""}.`,
    link: "/invest",
  });
  revalidateAll();
  return { ok: true, notice: "Redemption settled into your Flex wallet." };
}

/* ============================ GROUP SAVINGS ========================== */

export async function createGroupAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  if (!FEATURES.groupSavings) return { ok: false, error: "Group savings is disabled for this deployment." };
  const name = field(formData, "name");
  const perMemberKobo = toKobo(field(formData, "perMember"));
  const targetKobo = toKobo(field(formData, "target"));
  const frequency = field(formData, "frequency") || "monthly";
  const maxMembers = Math.min(50, Math.max(2, num(formData, "maxMembers", 8)));
  const requireApproval = checked(formData, "requireApproval");
  const minBeforeWithdraw = num(formData, "minBeforeWithdraw", 1);
  if (name.length < 3) return { ok: false, field: "name", error: "Name the group." };
  if (perMemberKobo <= 0) return { ok: false, field: "perMember", error: "Set the per-member contribution." };

  const [group] = await db
    .insert(savingsGroups)
    .values({
      name,
      joinCode: randomRef("GRP").replace(/[^A-Z0-9]/g, "").slice(0, 10),
      description: field(formData, "description"),
      ownerId: user.id,
      targetKobo,
      perMemberKobo,
      frequency,
      maxMembers,
      minContributionsBeforeWithdraw: Math.max(0, minBeforeWithdraw),
      requireOwnerApproval: requireApproval,
      disputePolicy: field(formData, "disputePolicy") || "Disputes are logged in writing and resolved by the group owner within 7 days.",
    })
    .returning();
  await db.insert(savingsGroupMembers).values({ groupId: group.id, userId: user.id, role: "owner", contributionKobo: 0 });
  await db.insert(accounts).values({
    userId: user.id,
    kind: "group",
    name: `Group · ${group.name}`,
    icon: "users",
    groupId: group.id,
    targetKobo,
    contributionKobo: perMemberKobo,
    frequency,
    status: "active",
  });
  revalidateAll();
  return { ok: true, notice: `Group created. Share join code ${group.joinCode}.`, data: { joinCode: group.joinCode } };
}

export async function joinGroupAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  const code = field(formData, "code").toUpperCase();
  const [group] = await db.select().from(savingsGroups).where(eq(savingsGroups.joinCode, code)).limit(1);
  if (!group) return { ok: false, field: "code", error: "That join code was not found." };
  if (group.status !== "active") return { ok: false, error: "This group is closed." };
  const [memberCount] = await db.select({ c: sql<number>`count(*)::int` }).from(savingsGroupMembers).where(and(eq(savingsGroupMembers.groupId, group.id), eq(savingsGroupMembers.status, "active")));
  if (Number(memberCount?.c ?? 0) >= group.maxMembers) return { ok: false, error: "This group is full." };
  const [existing] = await db.select().from(savingsGroupMembers).where(and(eq(savingsGroupMembers.groupId, group.id), eq(savingsGroupMembers.userId, user.id))).limit(1);
  if (existing && existing.status === "active") return { ok: false, error: "You are already a member." };
  if (existing) {
    await db.update(savingsGroupMembers).set({ status: "active", joinedAt: new Date() }).where(eq(savingsGroupMembers.id, existing.id));
  } else {
    await db.insert(savingsGroupMembers).values({ groupId: group.id, userId: user.id, role: "member" });
  }
  if (!existing || existing.status !== "active") {
    await db.insert(accounts).values({
      userId: user.id,
      kind: "group",
      name: `Group · ${group.name}`,
      icon: "users",
      groupId: group.id,
      targetKobo: group.perMemberKobo * 12,
      contributionKobo: group.perMemberKobo,
      frequency: group.frequency,
      status: "active",
    });
  }
  if (group.ownerId !== user.id) {
    await notifyUser({
      userId: group.ownerId,
      type: "general",
      title: "New member joined your group",
      body: `${user.fullName} joined ${group.name}.`,
      link: "/groups",
    });
  }
  revalidateAll();
  return { ok: true, notice: `You joined ${group.name}.` };
}

export async function leaveGroupAction(groupId: string): Promise<ActionState> {
  const user = await requireUser();
  const [group] = await db.select().from(savingsGroups).where(eq(savingsGroups.id, groupId)).limit(1);
  if (!group) return { ok: false, error: "Group not found." };
  if (group.ownerId === user.id) return { ok: false, error: "Owners cannot leave while members hold funds. Transfer ownership or close the group." };
  await db.update(savingsGroupMembers).set({ status: "left" }).where(and(eq(savingsGroupMembers.groupId, groupId), eq(savingsGroupMembers.userId, user.id)));
  await db.update(accounts).set({ status: "closed" }).where(and(eq(accounts.userId, user.id), eq(accounts.groupId, groupId)));
  revalidateAll();
  return { ok: true, notice: "You left the group. Your own remaining balance stays in your plan list." };
}

export async function contributeToGroupAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  await guard(user.id, "group-contribute", 20);
  const groupId = field(formData, "groupId");
  const amountKobo = toKobo(field(formData, "amount")) || undefined;
  const [membership] = await db
    .select()
    .from(savingsGroupMembers)
    .where(and(eq(savingsGroupMembers.groupId, groupId), eq(savingsGroupMembers.userId, user.id)))
    .limit(1);
  if (!membership || membership.status !== "active") return { ok: false, error: "You are not an active member of this group." };
  const [group] = await db.select().from(savingsGroups).where(eq(savingsGroups.id, groupId)).limit(1);
  const [account] = await db.select().from(accounts).where(and(eq(accounts.userId, user.id), eq(accounts.groupId, groupId))).limit(1);
  if (!account) return { ok: false, error: "Your group plan is missing. Reload and try again." };
  const amount = amountKobo ?? group?.perMemberKobo ?? 0;
  if (amount <= 0) return { ok: false, field: "amount", error: "Enter a contribution amount." };
  const flex = await flexOf(user.id);
  if (flex.balanceKobo < amount) return { ok: false, field: "amount", error: `Flex wallet has ${naira(flex.balanceKobo)}.` };
  const out = await debit({ userId: user.id, accountId: flex.id, type: "transfer_out", direction: "debit", amountKobo: amount, description: `Group contribution · ${group?.name}` });
  if (!out.ok) return { ok: false, error: out.error };
  await credit({ userId: user.id, accountId: account.id, type: "contribution", direction: "credit", amountKobo: amount, description: `Contribution to ${group?.name}`, meta: { groupId } });
  await db
    .update(savingsGroupMembers)
    .set({ contributionKobo: sql`${savingsGroupMembers.contributionKobo} + ${amount}` })
    .where(eq(savingsGroupMembers.id, membership.id));
  revalidateAll();
  return { ok: true, notice: `${naira(amount)} contributed to ${group?.name}.` };
}

export async function requestGroupWithdrawalAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  const groupId = field(formData, "groupId");
  const amountKobo = toKobo(field(formData, "amount"));
  const note = field(formData, "note");
  const [group] = await db.select().from(savingsGroups).where(eq(savingsGroups.id, groupId)).limit(1);
  const [membership] = await db.select().from(savingsGroupMembers).where(and(eq(savingsGroupMembers.groupId, groupId), eq(savingsGroupMembers.userId, user.id))).limit(1);
  if (!group || !membership) return { ok: false, error: "Group or membership not found." };
  const [account] = await db.select().from(accounts).where(and(eq(accounts.userId, user.id), eq(accounts.groupId, groupId))).limit(1);
  if (!account) return { ok: false, error: "No group balance found for you." };
  if (amountKobo <= 0 || amountKobo > account.balanceKobo) return { ok: false, field: "amount", error: `Your group balance is ${naira(account.balanceKobo)}.` };
  if (Number(membership.contributionKobo || 0) < group.minContributionsBeforeWithdraw * group.perMemberKobo)
    return { ok: false, error: `This group requires ${group.minContributionsBeforeWithdraw} contribution(s) before withdrawals.` };

  if (!group.requireOwnerApproval || group.ownerId === user.id) {
    await settleGroupWithdrawal(user.id, account.id, group, amountKobo);
    revalidateAll();
    return { ok: true, notice: "Withdrawn to your Flex wallet — group rules allowed a direct exit." };
  }
  await db.insert(groupActions).values({ groupId, requesterId: user.id, type: "withdraw", amountKobo, note, status: "pending" });
  await notifyUser({
    userId: group.ownerId,
    type: "general",
    severity: "warning",
    title: "Group withdrawal needs approval",
    body: `${user.fullName} requested ${naira(amountKobo)} from ${group.name}.`,
    link: "/groups",
  });
  revalidateAll();
  return { ok: true, notice: "Request sent to the group owner for approval." };
}

async function settleGroupWithdrawal(userId: string, accountId: string, group: typeof savingsGroups.$inferSelect, amountKobo: number) {
  const out = await debit({ userId, accountId, type: "transfer_out", direction: "debit", amountKobo, description: `Group withdrawal · ${group.name}` });
  if (!out.ok) return out;
  const flex = await flexOf(userId);
  await credit({ userId, accountId: flex.id, type: "transfer_in", direction: "credit", amountKobo, description: `Group withdrawal from ${group.name}` });
  return out;
}

export async function decideGroupAction(actionId: string, approve: boolean): Promise<ActionState> {
  const user = await requireUser();
  const [action] = await db.select().from(groupActions).where(eq(groupActions.id, actionId)).limit(1);
  if (!action || action.status !== "pending") return { ok: false, error: "Request not found or already decided." };
  const [group] = await db.select().from(savingsGroups).where(eq(savingsGroups.id, action.groupId)).limit(1);
  if (!group) return { ok: false, error: "Group missing." };
  if (group.ownerId !== user.id && user.role !== "admin") return { ok: false, error: "Only the group owner can decide this." };
  await db.update(groupActions).set({ status: approve ? "approved" : "rejected", decidedBy: user.id, decidedAt: new Date() }).where(eq(groupActions.id, actionId));
  if (approve) {
    const [account] = await db.select().from(accounts).where(and(eq(accounts.userId, action.requesterId), eq(accounts.groupId, action.groupId))).limit(1);
    if (account) await settleGroupWithdrawal(action.requesterId, account.id, group, action.amountKobo);
  }
  await notifyUser({
    userId: action.requesterId,
    type: "withdrawal",
    severity: approve ? "success" : "danger",
    title: approve ? `Group withdrawal approved` : "Group withdrawal rejected",
    body: `${group.name} · ${naira(action.amountKobo)}${approve ? " credited to your Flex wallet." : " was declined. Raise a dispute if you disagree."}`,
    link: "/groups",
  });
  revalidateAll();
  return { ok: true, notice: approve ? "Approved and paid out." : "Rejected." };
}

export async function raiseGroupDisputeAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  const groupId = field(formData, "groupId");
  const [group] = await db.select().from(savingsGroups).where(eq(savingsGroups.id, groupId)).limit(1);
  if (!group) return { ok: false, error: "Group not found." };
  await db.insert(groupActions).values({ groupId, requesterId: user.id, type: "dispute", amountKobo: 0, note: field(formData, "note").slice(0, 900), status: "pending" });
  const [staff] = await db.select({ id: users.id }).from(users).where(eq(users.role, "admin")).limit(1);
  await notifyUser({
    userId: group.ownerId,
    type: "general",
    severity: "danger",
    title: `Dispute raised on ${group.name}`,
    body: field(formData, "note").slice(0, 300),
    link: "/groups",
  });
  if (staff?.id) {
    await notifyUser({ userId: staff.id, type: "general", severity: "danger", title: "Group dispute needs review", body: `${user.fullName} disputed ${group.name}.`, link: "/admin?tab=groups" });
  }
  revalidateAll();
  return { ok: true, notice: "Dispute logged. Everyone in the group can see the record." };
}

/* ============================== AUTOMATION =========================== */

export async function saveRuleAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  const kind = field(formData, "kind") || "fixed";
  const name = field(formData, "name");
  const accountId = field(formData, "accountId");
  const amountKobo = toKobo(field(formData, "amount"));
  const percentageBps = Math.round(num(formData, "percentage", 0) * 100);
  const frequency = field(formData, "frequency") || "monthly";
  const capKobo = toKobo(field(formData, "cap"));
  const consent = checked(formData, "consent");
  if (!name) return { ok: false, field: "name", error: "Name the rule so you recognise it in statements." };
  if (!consent) return { ok: false, field: "consent", error: "Automatic money movement requires explicit consent." };
  if (!FEATURES.autoSavings && kind !== "reminder") return { ok: false, error: "Automated savings is disabled in this deployment." };
  if (kind !== "reminder" && amountKobo <= 0 && percentageBps <= 0) return { ok: false, field: "amount", error: "Set an amount or percentage." };
  if (kind === "roundup" && !FEATURES.roundups)
    return { ok: false, error: "Round-ups need a card-rail integration that reports settled purchases. Enable it once that partner is live." };
  const existingId = field(formData, "ruleId");
  const values = {
    kind,
    name,
    accountId: accountId || null,
    amountKobo,
    percentageBps,
    frequency,
    capKobo,
    active: true,
    consentVersion: POLICY_VERSION,
    nextRunAt: addDays(new Date(), CADENCE[frequency] ?? 30),
  };
  if (existingId) {
    await db.update(savingsRules).set(values).where(and(eq(savingsRules.id, existingId), eq(savingsRules.userId, user.id)));
  } else {
    await db.insert(savingsRules).values({ userId: user.id, ...values });
  }
  revalidateAll();
  return { ok: true, notice: "Rule saved." };
}

export async function toggleRuleAction(id: string, active: boolean): Promise<ActionState> {
  const user = await requireUser();
  await db.update(savingsRules).set({ active }).where(and(eq(savingsRules.id, id), eq(savingsRules.userId, user.id)));
  revalidateAll();
  return { ok: true, notice: active ? "Rule re-enabled." : "Rule paused." };
}

export async function deleteRuleAction(id: string): Promise<ActionState> {
  const user = await requireUser();
  await db.delete(savingsRules).where(and(eq(savingsRules.id, id), eq(savingsRules.userId, user.id)));
  revalidateAll();
  return { ok: true, notice: "Rule deleted." };
}

export async function runAutomationAction(): Promise<ActionState> {
  const user = await requireUser();
  const [maturity, automation] = await Promise.all([processMaturities(user.id), runDueContributions(user.id)]);
  revalidateAll();
  return {
    ok: true,
    notice: `${automation.processed} scheduled transfer(s) processed · ${maturity.locksCredited} lock(s) matured${
      automation.notes.length ? ` · ${automation.notes[0]}` : ""
    }`,
  };
}

export async function setLockTopUpAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  const accountId = field(formData, "accountId");
  const account = await ownedAccount(user.id, accountId);
  const contributionKobo = toKobo(field(formData, "topUp"));
  const auto = checked(formData, "autoTopUp");
  if (account.maturityDate && account.maturityDate.getTime() <= Date.now())
    return { ok: false, error: "This lock has matured — withdraw or re-lock at today's rate." };
  await db
    .update(accounts)
    .set({ contributionKobo, autoDebit: auto && contributionKobo > 0, nextDueAt: auto ? addDays(new Date(), 30) : null, updatedAt: new Date() })
    .where(eq(accounts.id, account.id));
  revalidateAll();
  return { ok: true, notice: auto ? `Monthly top-up of ${naira(contributionKobo)} scheduled.` : "Top-up schedule cleared." };
}

export async function balancesSnapshotAction() {
  const user = await requireUser();
  const balances = await accountBalances(user.id);
  const pending = await db
    .select({ reference: paymentIntents.reference, amountKobo: paymentIntents.amountKobo, status: paymentIntents.status })
    .from(paymentIntents)
    .where(and(eq(paymentIntents.userId, user.id), inArray(paymentIntents.status, ["pending"])))
    .limit(10);
  return { ok: true as const, notice: "ok", data: { ...balances, pending: pending.length } as unknown as Record<string, string | number> };
}
