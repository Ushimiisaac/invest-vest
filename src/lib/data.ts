import { and, asc, desc, eq, gte, ilike, inArray, lte, or, sql, sum } from "drizzle-orm";
import { db } from "@/db";
import {
  accounts,
  appSettings,
  auditLogs,
  authTokens,
  bankAccounts,
  consents,
  investmentHoldings,
  investmentProducts,
  kycRecords,
  loginHistory,
  notifications,
  paymentIntents,
  rewards,
  savingsGroupMembers,
  savingsGroups,
  savingsRules,
  supportTickets,
  transactions,
  users,
  withdrawalRequests,
} from "@/db/schema";
import { PRODUCT } from "@/lib/config";
import { accountBalances, credit, debit } from "@/lib/ledger";
import { lockQuote } from "@/lib/calculators";
import { addDays, csv, fmtDate, monthKey, monthLabel } from "@/lib/utils";

/* ----------------------------- app settings -------------------------- */

let settingsCache: Record<string, unknown> | null = null;

export async function getSettings(force = false) {
  if (settingsCache && !force) return settingsCache;
  try {
    const rows = await db.select().from(appSettings);
    const map: Record<string, unknown> = {};
    for (const row of rows) map[row.key] = row.value;
    settingsCache = map;
    return map;
  } catch {
    return {};
  }
}

export async function setSetting(key: string, value: unknown) {
  await db
    .insert(appSettings)
    .values({ key, value, updatedAt: new Date() })
    .onConflictDoUpdate({ target: appSettings.key, set: { value, updatedAt: new Date() } });
  settingsCache = null;
}

export async function audit(actorId: string, action: string, target?: string, meta?: Record<string, unknown>) {
  const { requestMeta } = await import("@/lib/auth");
  const { ip } = await requestMeta();
  await db.insert(auditLogs).values({ actorId, action, target: target ?? null, ip, meta: meta ?? {} });
}

/* ------------------------------ dashboard ---------------------------- */

export async function getDashboard(userId: string) {
  const [balances, goalRows, recent, upcoming, invested, matured] = await Promise.all([
    accountBalances(userId),
    listSavingsAccounts(userId),
    recentTransactions(userId, 8),
    dueContributions(userId),
    db
      .select({
        value: sql<number>`coalesce(sum(${investmentHoldings.principalKobo} + ${investmentHoldings.accruedKobo}), 0)::int`,
        principal: sql<number>`coalesce(sum(${investmentHoldings.principalKobo}), 0)::int`,
      })
      .from(investmentHoldings)
      .where(and(eq(investmentHoldings.userId, userId), inArray(investmentHoldings.status, ["active", "matured"]))),
    db
      .select({ id: investmentHoldings.id })
      .from(investmentHoldings)
      .where(and(eq(investmentHoldings.userId, userId), eq(investmentHoldings.status, "active"), lte(investmentHoldings.maturityAt, new Date()))),
  ]);

  const monthly = await monthlySavings(userId, 6);
  return {
    balances,
    accounts: goalRows,
    recent,
    upcoming,
    investment: {
      value: Number(invested[0]?.value ?? 0),
      principal: Number(invested[0]?.principal ?? 0),
      count: matured.length,
    },
    monthly,
  };
}

export async function listSavingsAccounts(userId: string) {
  const rows = await db.select().from(accounts).where(and(eq(accounts.userId, userId), sql`${accounts.status} <> 'closed'`)).orderBy(desc(accounts.updatedAt));
  return rows.map((row) => ({
    ...row,
    progressPct: row.targetKobo > 0 ? Math.min(100, Math.round((row.balanceKobo / row.targetKobo) * 1000) / 10) : 0,
  }));
}

export async function getAccountById(userId: string, accountId: string) {
  const [row] = await db.select().from(accounts).where(and(eq(accounts.id, accountId), eq(accounts.userId, userId))).limit(1);
  return row ?? null;
}

export async function recentTransactions(userId: string, limit = 25) {
  return db
    .select()
    .from(transactions)
    .where(eq(transactions.userId, userId))
    .orderBy(desc(transactions.createdAt))
    .limit(limit);
}

export type TxnFilter = { from?: string; to?: string; type?: string; q?: string; limit?: number };

export async function searchTransactions(userId: string, filter: TxnFilter) {
  const clauses = [eq(transactions.userId, userId)];
  if (filter.from) clauses.push(gte(transactions.createdAt, new Date(`${filter.from}T00:00:00`)));
  if (filter.to) clauses.push(lte(transactions.createdAt, new Date(`${filter.to}T23:59:59`)));
  if (filter.type && filter.type !== "all") clauses.push(eq(transactions.type, filter.type));
  if (filter.q) clauses.push(or(ilike(transactions.description, `%${filter.q}%`), ilike(transactions.reference, `%${filter.q}%`))!);
  return db
    .select()
    .from(transactions)
    .where(and(...clauses))
    .orderBy(desc(transactions.createdAt))
    .limit(filter.limit ?? 250);
}

export async function transactionByReference(userId: string, reference: string) {
  const [row] = await db
    .select()
    .from(transactions)
    .where(and(eq(transactions.userId, userId), eq(transactions.reference, reference)))
    .limit(1);
  return row ?? null;
}

export async function monthlySavings(userId: string, months = 6) {
  const since = addDays(new Date(), -(months + 1) * 31);
  const rows = await db
    .select({
      month: sql<string>`to_char(${transactions.createdAt}, 'YYYY-MM')`,
      credited: sql<number>`coalesce(sum(case when ${transactions.direction}='credit' and ${transactions.status}='successful' then ${transactions.amountKobo} else 0 end),0)::int`,
      debited: sql<number>`coalesce(sum(case when ${transactions.direction}='debit' and ${transactions.status}='successful' then ${transactions.amountKobo} else 0 end),0)::int`,
    })
    .from(transactions)
    .where(and(eq(transactions.userId, userId), gte(transactions.createdAt, since)))
    .groupBy(sql`1`)
    .orderBy(asc(sql`1`));
  const map = new Map(rows.map((r) => [r.month, r]));
  const out: { month: string; label: string; credited: number; debited: number }[] = [];
  const cursor = new Date(since.getFullYear(), since.getMonth(), 1);
  for (let i = 0; i < months; i += 1) {
    const key = monthKey(cursor);
    const row = map.get(key);
    out.push({
      month: key,
      label: monthLabel(key),
      credited: Number(row?.credited ?? 0),
      debited: Number(row?.debited ?? 0),
    });
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return out;
}

export async function dueContributions(userId: string) {
  const rows = await db
    .select()
    .from(accounts)
    .where(and(eq(accounts.userId, userId), eq(accounts.status, "active"), sql`${accounts.nextDueAt} is not null`))
    .orderBy(asc(accounts.nextDueAt));
  return rows.filter((r) => r.contributionKobo > 0);
}

/* ---------------------------- group queries -------------------------- */

export async function groupsFor(userId: string) {
  const memberships = await db
    .select({ member: savingsGroupMembers, group: savingsGroups })
    .from(savingsGroupMembers)
    .innerJoin(savingsGroups, eq(savingsGroups.id, savingsGroupMembers.groupId))
    .where(eq(savingsGroupMembers.userId, userId));

  return Promise.all(
    memberships.map(async ({ member, group }) => {
      const members = await db
        .select({ id: savingsGroupMembers.id, role: savingsGroupMembers.role, contribution: savingsGroupMembers.contributionKobo, name: users.fullName, email: users.email, status: savingsGroupMembers.status, userId: savingsGroupMembers.userId })
        .from(savingsGroupMembers)
        .innerJoin(users, eq(users.id, savingsGroupMembers.userId))
        .where(eq(savingsGroupMembers.groupId, group.id));
      const [agg] = await db
        .select({ total: sql<number>`coalesce(sum(${accounts.balanceKobo}),0)::int` })
        .from(accounts)
        .where(eq(accounts.groupId, group.id));
      return {
        ...group,
        myRole: member.role,
        myStatus: member.status,
        totalKobo: Number(agg?.total ?? 0),
        members: members.sort((a, b) => b.contribution - a.contribution),
      };
    }),
  );
}

/* ---------------------------- investment views ----------------------- */

export async function listProducts(includeInactive = false) {
  return db
    .select()
    .from(investmentProducts)
    .where(includeInactive ? undefined : sql`${investmentProducts.status} <> 'inactive'`)
    .orderBy(asc(investmentProducts.sortOrder));
}

export async function portfolio(userId: string) {
  const holdings = await db
    .select({ holding: investmentHoldings, product: investmentProducts })
    .from(investmentHoldings)
    .innerJoin(investmentProducts, eq(investmentProducts.id, investmentHoldings.productId))
    .where(eq(investmentHoldings.userId, userId))
    .orderBy(desc(investmentHoldings.createdAt));

  return holdings.map(({ holding, product }) => {
    const now = Date.now();
    const start = holding.startAt?.getTime() ?? now;
    const maturity = holding.maturityAt?.getTime() ?? now;
    const elapsed = Math.max(0, Math.min(1, (now - start) / Math.max(1, maturity - start)));
    const projected = Math.round((holding.principalKobo * (holding.indicativeReturnBps / 10000) * (product.tenorMonths / 12)));
    const accrued = Math.round(projected * elapsed);
    return {
      ...holding,
      productName: product.name,
      category: product.category,
      riskLevel: product.riskLevel,
      tenorMonths: product.tenorMonths,
      status_: product.status,
      maturityLabel: fmtDate(holding.maturityAt),
      progressPct: Math.round(elapsed * 100),
      accrued,
      projected,
      redeemable: holding.status === "matured" || now >= maturity,
    };
  });
}

/* ------------------------- automation / crons ------------------------ */

const cadence: Record<string, number> = { daily: 1, weekly: 7, monthly: 30 };

/** Pulls scheduled contributions out of the Flex wallet into target accounts. */
export async function runDueContributions(userId: string) {
  const now = new Date();
  const rows = await db
    .select()
    .from(accounts)
    .where(and(eq(accounts.userId, userId), eq(accounts.status, "active"), eq(accounts.autoDebit, true), lte(accounts.nextDueAt, now)));
  let processed = 0;
  const notes: string[] = [];
  for (const account of rows) {
    if (!account.contributionKobo || account.contributionKobo <= 0) continue;
    const [flex] = await db
      .select()
      .from(accounts)
      .where(and(eq(accounts.userId, userId), eq(accounts.kind, "flex")))
      .limit(1);
    if (!flex) {
      notes.push(`${account.name}: no Flex wallet to debit.`);
      continue;
    }
    const out = await debit({
      userId,
      accountId: flex.id,
      type: "transfer_out",
      direction: "debit",
      amountKobo: account.contributionKobo,
      description: `Automated transfer to ${account.name}`,
      meta: { automation: true, toAccountId: account.id },
    });
    if (!out.ok) {
      notes.push(`${account.name}: skipped — ${out.error}`);
      const days = cadence[account.frequency ?? "monthly"] ?? 30;
      await db.update(accounts).set({ nextDueAt: addDays(now, days) }).where(eq(accounts.id, account.id));
      await notifyMissed(userId, account.name);
      continue;
    }
    await credit({
      userId,
      accountId: account.id,
      type: "contribution",
      direction: "credit",
      amountKobo: account.contributionKobo,
      description: `Automated contribution to ${account.name}`,
      meta: { automation: true, fromAccountId: flex.id },
    });
    const days = cadence[account.frequency ?? "monthly"] ?? 30;
    await db
      .update(accounts)
      .set({ nextDueAt: addDays(now, days), lastTopUpAt: now, updatedAt: now, contributionKobo: account.contributionKobo })
      .where(eq(accounts.id, account.id));
    await bumpGroupMember(account, account.contributionKobo);
    processed += 1;
    await milestoneCheck(userId, account.id);
  }

  // Savings rules: percentage-of-income and roundup rules accrue at month end.
  const rules = await db.select().from(savingsRules).where(and(eq(savingsRules.userId, userId), eq(savingsRules.active, true)));
  for (const rule of rules) {
    if (rule.kind === "percentage_income" || rule.kind === "roundup") {
      const due = !rule.nextRunAt || rule.nextRunAt.getTime() <= now.getTime();
      if (!due || !rule.accountId) continue;
      const amount =
        rule.kind === "roundup"
          ? Math.min(rule.capKobo || rule.amountKobo, Math.max(rule.amountKobo, 0))
          : Math.round(((rule.percentageBps / 10000) * (rule.amountKobo || 0)));
      if (amount > 0) {
        await credit({
          userId,
          accountId: rule.accountId,
          type: "contribution",
          direction: "credit",
          amountKobo: amount,
          description: `${rule.name} · simulated trigger`,
          meta: { ruleId: rule.id, simulated: true },
        });
        processed += 1;
      }
      await db.update(savingsRules).set({ lastRunAt: now, nextRunAt: addDays(now, cadence[rule.frequency] ?? 30) }).where(eq(savingsRules.id, rule.id));
    }
  }
  return { processed, notes };
}

async function bumpGroupMember(account: typeof accounts.$inferSelect, amount: number) {
  if (!account.groupId) return;
  await db
    .update(savingsGroupMembers)
    .set({ contributionKobo: sql`${savingsGroupMembers.contributionKobo} + ${amount}` })
    .where(and(eq(savingsGroupMembers.groupId, account.groupId), eq(savingsGroupMembers.userId, account.userId)));
}

async function notifyMissed(userId: string, name: string) {
  const { notifyUser } = await import("@/lib/notify");
  await notifyUser({
    userId,
    type: "missed",
    severity: "warning",
    title: `Missed contribution — ${name}`,
    body: "Your scheduled transfer could not be funded from the Flex wallet. Add funds or lower the amount.",
    link: `/savings`,
  });
}

async function milestoneCheck(userId: string, accountId: string) {
  const [acct] = await db.select().from(accounts).where(eq(accounts.id, accountId)).limit(1);
  if (!acct || !acct.targetKobo) return;
  const pct = (acct.balanceKobo / acct.targetKobo) * 100;
  for (const milestone of [25, 50, 75, 100]) {
    const flagKey = `milestone_${milestone}_${acct.id}`;
    const [flagRow] = await db.select().from(appSettings).where(eq(appSettings.key, flagKey)).limit(1);
    if (pct >= milestone && !flagRow) {
      await db.insert(appSettings).values({ key: flagKey, value: { userId, accountId: acct.id, milestone } });
      const { notifyUser } = await import("@/lib/notify");
      await notifyUser({
        userId,
        type: "milestone",
        severity: "success",
        title: `${milestone}% of "${acct.name}" reached`,
        body: "Nice work. Keep the streak going — consistency beats intensity.",
        link: "/savings",
      });
    }
  }
}

/** Credits SafeLock interest at maturity and opens the funds for withdrawal. */
export async function processMaturities(userId: string) {
  const now = new Date();
  const locks = await db
    .select()
    .from(accounts)
    .where(and(eq(accounts.userId, userId), eq(accounts.kind, "safelock"), eq(accounts.status, "active"), lte(accounts.maturityDate ?? now, now)));
  let credited = 0;
  for (const lock of locks) {
    const quote = lockQuote({ amountKobo: lock.balanceKobo, months: lock.lockMonths, annualBps: lock.interestBps, penaltyBps: lock.penaltyBps });
    if (quote.netReturn > 0) {
      await credit({
        userId,
        accountId: lock.id,
        type: "interest",
        direction: "credit",
        amountKobo: quote.netReturn,
        description: `Interest on ${lock.name} (net of 10% WHT)`,
        meta: { gross: quote.gross, withholdingTax: quote.withholdingTax, indicative: true },
      });
      credited += 1;
    }
    await db.update(accounts).set({ status: "matured", updatedAt: now }).where(eq(accounts.id, lock.id));
  }

  const holdings = await db
    .select()
    .from(investmentHoldings)
    .where(and(eq(investmentHoldings.userId, userId), eq(investmentHoldings.status, "active"), lte(investmentHoldings.maturityAt, now)));
  for (const holding of holdings) {
    if (holding.accruedKobo > 0) continue;
    await db.update(investmentHoldings).set({ status: "matured", accruedKobo: Math.round(holding.principalKobo * (holding.indicativeReturnBps / 10000) / 1) }).where(eq(investmentHoldings.id, holding.id));
  }
  return { locksCredited: credited, maturedHoldings: holdings.length };
}

/* ------------------------------- profiles ---------------------------- */

export async function profileOf(userId: string) {
  const [row] = await db
    .select({
      id: users.id,
      email: users.email,
      fullName: users.fullName,
      phone: users.phone,
      role: users.role,
      status: users.status,
      emailVerified: users.emailVerified,
      phoneVerified: users.phoneVerified,
      mfaEnabled: users.mfaEnabled,
      kycStatus: users.kycStatus,
      referralCode: users.referralCode,
      createdAt: users.createdAt,
      lastLoginAt: users.lastLoginAt,
      avatarColor: users.avatarColor,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return row ?? null;
}

export async function consentsOf(userId: string) {
  return db.select().from(consents).where(eq(consents.userId, userId)).orderBy(desc(consents.createdAt));
}

export async function loginEvents(userId: string) {
  return db.select().from(loginHistory).where(eq(loginHistory.userId, userId)).orderBy(desc(loginHistory.createdAt)).limit(15);
}

export async function bankAccountsOf(userId: string) {
  return db.select().from(bankAccounts).where(and(eq(bankAccounts.userId, userId), eq(bankAccounts.status, "active"))).orderBy(desc(bankAccounts.isDefault));
}

export async function kycOf(userId: string) {
  const [row] = await db.select().from(kycRecords).where(eq(kycRecords.userId, userId)).limit(1);
  return row ?? null;
}

export async function withdrawalsFor(userId: string) {
  return db
    .select({ w: withdrawalRequests, bank: bankAccounts })
    .from(withdrawalRequests)
    .leftJoin(bankAccounts, eq(bankAccounts.id, withdrawalRequests.bankAccountId))
    .where(eq(withdrawalRequests.userId, userId))
    .orderBy(desc(withdrawalRequests.createdAt))
    .limit(30);
}

export async function depositsFor(userId: string) {
  return db.select().from(paymentIntents).where(eq(paymentIntents.userId, userId)).orderBy(desc(paymentIntents.createdAt)).limit(30);
}

export async function rulesFor(userId: string) {
  return db.select().from(savingsRules).where(eq(savingsRules.userId, userId)).orderBy(desc(savingsRules.createdAt));
}

export async function notificationsFor(userId: string, unreadOnly = false) {
  return db
    .select()
    .from(notifications)
    .where(unreadOnly ? and(eq(notifications.userId, userId), sql`${notifications.readAt} is null`) : eq(notifications.userId, userId))
    .orderBy(desc(notifications.createdAt))
    .limit(60);
}

export async function unreadCount(userId: string) {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(notifications)
    .where(and(eq(notifications.userId, userId), sql`${notifications.readAt} is null`));
  return Number(row?.count ?? 0);
}

/* ------------------------------- exports ----------------------------- */

export function statementCsv(rows: typeof transactions.$inferSelect[]) {
  return csv([
    ["Date", "Reference", "Type", "Direction", "Amount (NGN)", "Status", "Description", "Provider"],
    ...rows.map((t) => [
      t.createdAt.toISOString(),
      t.reference,
      t.type,
      t.direction,
      (t.amountKobo / 100).toFixed(2),
      t.status,
      t.description ?? "",
      t.provider ?? "",
    ]),
  ]);
}

export function receiptText(txn: typeof transactions.$inferSelect, accountName: string, userName: string) {
  return [
    "INCREASEVEST RECEIPT",
    `Reference: ${txn.reference}`,
    `Date: ${fmtDate(txn.createdAt, "long")}`,
    `Account: ${accountName}`,
    `Holder: ${userName}`,
    `Type: ${txn.type.replace(/_/g, " ")}`,
    `Amount: ₦${(txn.amountKobo / 100).toLocaleString("en-NG", { minimumFractionDigits: 2 })}`,
    `Status: ${txn.status}`,
    `Provider: ${txn.provider ?? "internal"}`,
    "",
    "Keep this reference for reconciliation queries.",
  ].join("\n");
}

export async function withdrawalLimitCheck(userId: string) {
  const [user] = await db.select({ kycStatus: users.kycStatus }).from(users).where(eq(users.id, userId)).limit(1);
  const limit = user?.kycStatus === "verified" ? PRODUCT.dailyWithdrawalLimitKobo : PRODUCT.withdrawalLimitUnverifiedKobo;
  const [today] = await db
    .select({ total: sql<number>`coalesce(sum(${withdrawalRequests.amountKobo}),0)::int` })
    .from(withdrawalRequests)
    .where(and(eq(withdrawalRequests.userId, userId), gte(withdrawalRequests.createdAt, new Date(new Date().setHours(0, 0, 0, 0))), inArray(withdrawalRequests.status, ["pending", "approved", "processing", "paid"])));
  return { limit, used: Number(today?.total ?? 0), remaining: Math.max(0, limit - Number(today?.total ?? 0)) };
}

export async function referralOverview(userId: string) {
  const [user] = await db.select({ code: users.referralCode, email: users.email, name: users.fullName, createdAt: users.createdAt }).from(users).where(eq(users.id, userId)).limit(1);
  const links = await db
    .select({ id: users.id, name: users.fullName, email: users.email, status: users.status, kyc: users.kycStatus, createdAt: users.createdAt })
    .from(users)
    .where(eq(users.referredBy, userId));
  const rewardsRows = await db.select().from(rewards).where(eq(rewards.userId, userId)).orderBy(desc(rewards.createdAt));
  return {
    code: user?.code ?? "",
    link: user?.code ? `/register?ref=${user.code}` : "",
    invited: links.length,
    qualified: links.filter((l) => l.kyc === "verified").length,
    rewards: rewardsRows,
    totalEarnedKobo: rewardsRows.filter((r) => r.status === "credited").reduce((a, r) => a + r.amountKobo, 0),
  };
}

export async function openTickets(userId: string) {
  return db
    .select()
    .from(supportTickets)
    .where(eq(supportTickets.userId, userId))
    .orderBy(desc(supportTickets.updatedAt))
    .limit(20);
}

export async function tokenExpirySummary(userId: string) {
  const [pending] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(authTokens)
    .where(and(eq(authTokens.userId, userId), sql`${authTokens.usedAt} is null`));
  return Number(pending?.count ?? 0);
}

export async function sumInterest(userId: string) {
  const [row] = await db
    .select({ total: sum(transactions.amountKobo) })
    .from(transactions)
    .where(and(eq(transactions.userId, userId), inArray(transactions.type, ["interest", "payout", "reward"]), eq(transactions.status, "successful")));
  return Number(row?.total ?? 0);
}
