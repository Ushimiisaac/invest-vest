"use server";

import { revalidatePath } from "next/cache";
import { and, eq, gte, sql } from "drizzle-orm";
import { revalidatePath as rp } from "next/cache";
import { db } from "@/db";
import {
  accounts,
  appSettings,
  auditLogs,
  investmentProducts,
  kycRecords,
  referralCampaigns,
  referrals,
  rewards,
  supportTickets,
  ticketMessages,
  transactions,
  users,
  withdrawalRequests,
} from "@/db/schema";
import { requireAdmin, requireStaff } from "@/lib/auth";
import { credit, debit } from "@/lib/ledger";
import { initiatePayout, verifyAndSettle } from "@/lib/payments";
import { notifyUser } from "@/lib/notify";
import { randomRef, slugify, toKobo } from "@/lib/utils";

void rp;

async function actor(action: string, target?: string, meta?: Record<string, unknown>) {
  const user = await requireStaff();
  const { requestMeta } = await import("@/lib/auth");
  const { ip } = await requestMeta();
  await db.insert(auditLogs).values({ actorId: user.id, action, target: target ?? null, ip, meta: meta ?? {} });
  return user;
}

function refreshAll() {
  for (const p of ["/admin", "/dashboard", "/wallet", "/savings", "/settings", "/referrals"]) revalidatePath(p);
}

/* ------------------------------ withdrawals --------------------------- */

export async function approveWithdrawalAction(id: string, _formData: FormData) {
  await requireAdmin();
  const [row] = await db.select().from(withdrawalRequests).where(eq(withdrawalRequests.id, id)).limit(1);
  if (!row) return;
  await db.update(withdrawalRequests).set({ status: "processing", reviewedAt: new Date() }).where(eq(withdrawalRequests.id, id));
  await actor("withdrawal.approve", row.reference, { amountKobo: row.amountKobo });
  await notifyUser({
    userId: row.userId,
    type: "withdrawal",
    severity: "info",
    title: "Withdrawal approved",
    body: `Reference ${row.reference} is being sent to ${row.bankAccountId ? "your verified bank" : "your bank"}.`,
    link: "/wallet?tab=history",
  });
  refreshAll();
}

export async function settlePayoutAction(id: string, _formData: FormData) {
  await requireAdmin();
  const [row] = await db.select().from(withdrawalRequests).where(eq(withdrawalRequests.id, id)).limit(1);
  if (!row) return;
  const payout = await initiatePayout({ amountKobo: row.amountKobo, bankAccountId: row.bankAccountId ?? "", narration: row.reference });
  if (!payout.ok) {
    await notifyUser({ userId: (await db.select({ id: users.id }).from(users).limit(1))[0]?.id ?? row.userId, type: "withdrawal", severity: "danger", title: "Payout failed", body: payout.error, link: "/admin?tab=withdrawals" });
    return;
  }
  // Convert the pending ledger row to a settled debit.
  const [txn] = await db.select().from(transactions).where(eq(transactions.reference, row.reference)).limit(1);
  if (txn && txn.status === "pending") {
    await db.update(transactions).set({ status: "successful", settledAt: new Date(), provider: payout.provider, providerRef: payout.transferCode }).where(eq(transactions.id, txn.id));
  }
  await db
    .update(withdrawalRequests)
    .set({ status: "paid", reviewedAt: new Date(), riskFlags: { transferCode: payout.transferCode, provider: payout.provider } })
    .where(eq(withdrawalRequests.id, id));
  await actor("withdrawal.settle", row.reference, { transferCode: payout.transferCode });
  await notifyUser({
    userId: row.userId,
    type: "withdrawal",
    severity: "success",
    title: `Payout sent — ${row.reference}`,
    body: `${(row.amountKobo / 100).toLocaleString("en-NG")} transferred. Bank credit time is usually under 30 minutes.`,
    link: "/wallet?tab=history",
    sms: "Your payout has been sent to your bank.",
  });
  refreshAll();
}

export async function rejectWithdrawalAction(id: string, formData: FormData) {
  await requireAdmin();
  const reason = (formData.get("reason") as string) || "Rejected by risk review";
  const [row] = await db.select().from(withdrawalRequests).where(eq(withdrawalRequests.id, id)).limit(1);
  if (!row) return;
  await db.update(withdrawalRequests).set({ status: "rejected", rejectionReason: reason, reviewedAt: new Date() }).where(eq(withdrawalRequests.id, id));
  const [txn] = await db.select().from(transactions).where(eq(transactions.reference, row.reference)).limit(1);
  if (txn && txn.status === "pending") {
    await db.update(transactions).set({ status: "reversed", settledAt: new Date(), description: "Withdrawal rejected — funds returned" }).where(eq(transactions.id, txn.id));
    if (row.accountId) {
      await credit({
        userId: row.userId,
        accountId: row.accountId,
        type: "reversal",
        direction: "credit",
        amountKobo: row.amountKobo + row.feeKobo,
        description: `Refund of rejected withdrawal ${row.reference}`,
      });
    }
  }
  await actor("withdrawal.reject", row.reference, { reason });
  await notifyUser({
    userId: row.userId,
    type: "withdrawal",
    severity: "danger",
    title: "Withdrawal rejected",
    body: `${row.reference}: ${reason}. Funds have been returned to your balance.`,
    link: "/support?tab=tickets",
  });
  refreshAll();
}

/* -------------------------------- deposits ---------------------------- */

export async function verifyDepositAction(reference: string, _formData: FormData) {
  await requireStaff();
  const result = await verifyAndSettle(reference);
  await actor("payment.force_verify", reference, { ok: result.ok });
  refreshAll();
}

/* ---------------------------------- KYC ------------------------------- */

export async function approveKycAction(recordId: string, userId: string, _formData: FormData) {
  await requireAdmin();
  await db.update(kycRecords).set({ status: "verified", reviewedAt: new Date() }).where(eq(kycRecords.id, recordId));
  await db.update(users).set({ kycStatus: "verified", status: "active" }).where(eq(users.id, userId));
  await actor("kyc.approve", userId);
  await notifyUser({
    userId,
    type: "verification",
    severity: "success",
    title: "Identity verified",
    body: "Your limits are now raised and real investment products are unlocked.",
    link: "/settings?tab=kyc",
  });
  refreshAll();
}

export async function rejectKycAction(recordId: string, userId: string, _formData: FormData) {
  await requireAdmin();
  await db.update(kycRecords).set({ status: "rejected", reviewedAt: new Date(), rejectionReason: "Details did not match the identifier record" }).where(eq(kycRecords.id, recordId));
  await db.update(users).set({ kycStatus: "rejected" }).where(eq(users.id, userId));
  await actor("kyc.reject", userId);
  await notifyUser({
    userId,
    type: "verification",
    severity: "danger",
    title: "Verification could not be completed",
    body: "The name or date of birth did not match the identifier you supplied. Resubmit from settings.",
    link: "/settings?tab=kyc",
  });
  refreshAll();
}

/* --------------------------------- users ------------------------------ */

export async function setUserStatusAction(userId: string, status: string, _formData: FormData) {
  await requireAdmin();
  const next = status === "suspended" ? "active" : "suspended";
  await db
    .update(users)
    .set({
      status: next,
      suspensionReason: next === "suspended" ? "Suspended by compliance review" : null,
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId));
  await actor("user.status", userId, { next });
  await notifyUser({
    userId,
    type: "security",
    severity: next === "suspended" ? "danger" : "success",
    title: next === "suspended" ? "Account suspended" : "Account reinstated",
    body: next === "suspended" ? "Money remains safe. Raise a support ticket or use account recovery to request reinstatement." : "Full access restored. Thank you for completing the review.",
    link: "/support",
  });
  refreshAll();
}

export async function processReferralsAction(userId: string, _formData: FormData) {
  await requireAdmin();
  const [campaign] = await db.select().from(referralCampaigns).where(eq(referralCampaigns.active, true)).limit(1);
  if (!campaign) return;
  const pending = await db
    .select()
    .from(referrals)
    .where(and(eq(referrals.referrerId, userId), eq(referrals.status, "verified")));
  let credited = 0;
  for (const r of pending) {
    const [referee] = await db.select({ createdAt: users.createdAt, kyc: users.kycStatus }).from(users).where(eq(users.id, r.refereeId)).limit(1);
    const [deposit] = await db
      .select({ amountKobo: transactions.amountKobo })
      .from(transactions)
      .where(and(eq(transactions.userId, r.refereeId), eq(transactions.type, "deposit"), eq(transactions.status, "successful")))
      .limit(1);
    const ok =
      referee?.kyc === "verified" &&
      Number(deposit?.amountKobo ?? 0) >= campaign.minFirstDepositKobo &&
      Date.now() - (referee?.createdAt.getTime() ?? 0) > campaign.fraudWindowDays * 86_400_000;
    if (!ok) continue;
    await db.update(referrals).set({ status: "rewarded", qualifiedAt: new Date() }).where(eq(referrals.id, r.id));
    const [flex] = await db.select().from(accounts).where(and(eq(accounts.userId, userId), eq(accounts.kind, "flex"))).limit(1);
    if (flex && campaign.referrerRewardKobo > 0) {
      await credit({
        userId,
        accountId: flex.id,
        type: "reward",
        direction: "credit",
        amountKobo: campaign.referrerRewardKobo,
        description: `Referral reward · ${campaign.name}`,
        meta: { referralId: r.id, creditedBy: "admin" },
      });
      await db.insert(rewards).values({ userId, kind: "referral", label: `Referral reward · ${campaign.name}`, amountKobo: campaign.referrerRewardKobo, status: "credited", referralId: r.id, creditedAt: new Date() });
    }
    credited += 1;
  }
  await actor("referrals.process", userId, { credited });
  revalidatePath("/admin?tab=campaigns");
}

/* ------------------------------ products ------------------------------ */

export async function createProductAction(formData: FormData) {
  await requireAdmin();
  const get = (k: string) => String(formData.get(k) ?? "").trim();
  const name = get("name");
  if (!name) return;
  const rate = Number(get("ratePct") || 0);
  const fee = Number(get("feePct") || 0);
  const months = Math.max(1, Number(get("months") || 12));
  const [created] = await db
    .insert(investmentProducts)
    .values({
      slug: slugify(name) || `product-${Date.now()}`,
      name,
      category: get("category") || "fixed_income",
      summary: get("summary") || `${months}-month tenor with an indicative ${rate}% annual return.`,
      description: get("description") || "Issued through a partner; capital at risk.",
      riskLevel: get("risk") || "low",
      indicativeReturnBps: Math.round(rate * 100),
      feeBps: Math.round(fee * 100),
      minKobo: toKobo(get("minNaira") || "10000"),
      maxKobo: toKobo(get("maxNaira") || "0"),
      tenorMonths: months,
      status: get("status") || "simulated",
      partnerName: get("partner") || null,
      licenceRef: get("licence") || null,
      regulatoryNote:
        get("status") === "active"
          ? `Partner ${get("partner") || "unnamed"} under licence ${get("licence") || "unspecified"}.`
          : "Not yet available for real subscriptions. Simulated for demonstration.",
      disclaimer: "Projected returns are estimates based on the indicative rate. Capital is at risk and returns are not guaranteed.",
      liquidity: get("liquidity") || "at_maturity",
    })
    .returning();
  await actor("product.create", created.slug, { status: created.status });
  revalidatePath("/admin?tab=products");
  revalidatePath("/invest");
}

export async function setProductStatusAction(productId: string, status: string) {
  await requireAdmin();
  await db.update(investmentProducts).set({ status }).where(eq(investmentProducts.id, productId));
  await actor("product.status", productId, { status });
  revalidatePath("/admin?tab=products");
}

/* ------------------------------- settings ----------------------------- */

export async function setFeatureFlagAction(key: string, formData: FormData) {
  await requireAdmin();
  const raw = String(formData.get("value") ?? "").trim();
  const value = raw === "true" ? true : raw === "false" ? false : raw || null;
  await db
    .insert(appSettings)
    .values({ key, value, updatedAt: new Date() })
    .onConflictDoUpdate({ target: appSettings.key, set: { value, updatedAt: new Date() } });
  await actor("settings.set", key, { value });
  revalidatePath("/");
  refreshAll();
}

export async function runReferralSweepAction(_formData: FormData) {
  await requireAdmin();
  const [campaign] = await db.select().from(referralCampaigns).where(eq(referralCampaigns.active, true)).limit(1);
  if (!campaign) return;
  const since = new Date(Date.now() - 1 * 86_400_000);
  const rows = await db
    .select({ referrerId: referrals.referrerId, count: sql<number>`count(*)::int` })
    .from(referrals)
    .where(and(eq(referrals.status, "verified"), gte(referrals.createdAt, since)))
    .groupBy(referrals.referrerId);
  await actor("referrals.sweep", "campaign", { touched: rows.length });
  revalidatePath("/admin?tab=campaigns");
}

export async function replyTicketAsStaffAction(ticketId: string, body: string) {
  const user = await requireStaff();
  if (!body.trim()) return;
  await db.insert(ticketMessages).values({ ticketId, authorId: user.id, fromStaff: true, body });
  const [ticket] = await db.select().from(supportTickets).where(eq(supportTickets.id, ticketId)).limit(1);
  if (ticket) {
    await db.update(supportTickets).set({ status: "in_progress", updatedAt: new Date() }).where(eq(supportTickets.id, ticketId));
    await notifyUser({ userId: ticket.userId, type: "general", title: `Support replied to ${ticket.reference}`, body: body.slice(0, 160), link: "/support?tab=tickets" });
  }
  await actor("ticket.reply", ticketId);
  revalidatePath("/support");
}

export async function resolveTicketAction(ticketId: string) {
  const user = await requireStaff();
  const [ticket] = await db.select().from(supportTickets).where(eq(supportTickets.id, ticketId)).limit(1);
  if (!ticket) return;
  await db.update(supportTickets).set({ status: "resolved", updatedAt: new Date() }).where(eq(supportTickets.id, ticketId));
  await notifyUser({ userId: ticket.userId, type: "general", severity: "success", title: `Ticket ${ticket.reference} resolved`, body: "Mark the ticket helpful or reopen it any time.", link: "/support?tab=tickets" });
  await actor("ticket.resolve", ticket.reference, { by: user.id });
  revalidatePath("/support");
}

export async function forceSettlePendingDepositsAction(_formData: FormData) {
  await requireAdmin();
  const rows = await db
    .select({ reference: transactions.reference })
    .from(transactions)
    .where(and(eq(transactions.type, "deposit"), eq(transactions.status, "pending")))
    .limit(50);
  let settled = 0;
  for (const r of rows) {
    const res = await verifyAndSettle(r.reference);
    if (res.ok) settled += 1;
  }
  await actor("payments.sweep", "pending deposits", { settled, checked: rows.length });
  revalidatePath("/admin?tab=transactions");
}

export async function platformBalanceSnapshotAction() {
  await requireAdmin();
  const [row] = await db
    .select({ total: sql<number>`coalesce(sum(${accounts.balanceKobo}),0)::bigint` })
    .from(accounts)
    .where(sql`${accounts.status} <> 'closed'`);
  return Number(row?.total ?? 0);
}
