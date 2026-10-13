import { and, eq, gte, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { accounts, transactions } from "@/db/schema";
import { randomRef } from "@/lib/utils";

/**
 * Single write-path for every money movement in IncreaseVest.
 * Balances are only ever changed through here so the ledger stays reconcilable.
 */

export type TxnType =
  | "deposit"
  | "withdrawal"
  | "contribution"
  | "transfer_in"
  | "transfer_out"
  | "interest"
  | "penalty"
  | "reward"
  | "investment"
  | "payout"
  | "reversal";

export type PostInput = {
  userId: string;
  accountId?: string | null;
  type: TxnType;
  direction: "credit" | "debit";
  amountKobo: number;
  status?: "pending" | "successful" | "failed" | "reversed";
  description?: string;
  reference?: string;
  provider?: string;
  providerRef?: string;
  meta?: Record<string, unknown>;
};

export type LedgerResult =
  | { ok: true; transaction: typeof transactions.$inferSelect }
  | { ok: false; error: string };

function guard(amountKobo: number) {
  if (!Number.isFinite(amountKobo) || !Number.isInteger(amountKobo)) return "Invalid amount.";
  if (amountKobo <= 0) return "Amount must be greater than zero.";
  if (amountKobo > 10_000_000_000_00) return "Amount exceeds the maximum single transaction.";
  return null;
}

export async function credit(input: PostInput): Promise<LedgerResult> {
  const invalid = guard(input.amountKobo);
  if (invalid) return { ok: false, error: invalid };
  const reference = input.reference ?? randomRef("CR");
  const [txn] = await db
    .insert(transactions)
    .values({
      userId: input.userId,
      accountId: input.accountId ?? null,
      type: input.type,
      direction: "credit",
      amountKobo: input.amountKobo,
      status: input.status ?? "successful",
      reference,
      description: input.description ?? "",
      provider: input.provider ?? "internal",
      providerRef: input.providerRef ?? null,
      meta: input.meta ?? {},
      settledAt: (input.status ?? "successful") === "successful" ? new Date() : null,
    })
    .returning();

  if ((input.status ?? "successful") === "successful" && input.accountId) {
    await db
      .update(accounts)
      .set({
        balanceKobo: sql`${accounts.balanceKobo} + ${input.amountKobo}`,
        updatedAt: new Date(),
      })
      .where(eq(accounts.id, input.accountId));
  }
  return { ok: true, transaction: txn };
}

export async function debit(input: PostInput): Promise<LedgerResult> {
  const invalid = guard(input.amountKobo);
  if (invalid) return { ok: false, error: invalid };
  if (!input.accountId) return { ok: false, error: "A source account is required for debits." };
  const reference = input.reference ?? randomRef("DB");

  // Atomic conditional update: never allows a negative balance.
  const [updated] = await db
    .update(accounts)
    .set({
      balanceKobo: sql`${accounts.balanceKobo} - ${input.amountKobo}`,
      updatedAt: new Date(),
    })
    .where(and(eq(accounts.id, input.accountId), gte(accounts.balanceKobo, input.amountKobo)))
    .returning();

  if (!updated) {
    const [txn] = await db
      .insert(transactions)
      .values({
        userId: input.userId,
        accountId: input.accountId,
        type: input.type,
        direction: "debit",
        amountKobo: Math.max(0, Math.round(input.amountKobo)),
        status: "failed",
        reference,
        description: `${input.description ?? "Debit"} — insufficient available balance`,
        provider: input.provider ?? "internal",
        meta: input.meta ?? {},
      })
      .returning();
    return { ok: false, error: "Insufficient available balance for this action." + ` (ref ${txn.reference})` };
  }

  const [txn] = await db
    .insert(transactions)
    .values({
      userId: input.userId,
      accountId: input.accountId,
      type: input.type,
      direction: "debit",
      amountKobo: input.amountKobo,
      status: input.status ?? "successful",
      reference,
      description: input.description ?? "",
      provider: input.provider ?? "internal",
      providerRef: input.providerRef ?? null,
      meta: input.meta ?? {},
      settledAt: (input.status ?? "successful") === "successful" ? new Date() : null,
    })
    .returning();

  return { ok: true, transaction: txn };
}

export async function markTxnStatus(reference: string, status: "successful" | "failed" | "reversed", providerRef?: string) {
  const [txn] = await db.update(transactions).set({ status, settledAt: new Date(), providerRef: providerRef ?? null }).where(eq(transactions.reference, reference)).returning();
  return txn ?? null;
}

export async function accountBalances(userId: string) {
  const [rows] = await db
    .select({
      available: sql<number>`coalesce(sum(case when ${accounts.kind} = 'flex' then ${accounts.balanceKobo} else 0 end), 0)::int`,
      locked: sql<number>`coalesce(sum(case when ${accounts.kind} in ('safelock','target','regular','group') then ${accounts.balanceKobo} else 0 end), 0)::int`,
      totalKobo: sql<number>`coalesce(sum(${accounts.balanceKobo}), 0)::int`,
    })
    .from(accounts)
    .where(and(eq(accounts.userId, userId), sql`${accounts.status} <> 'closed'`));

  const [txAgg] = await db
    .select({
      contributions: sql<number>`coalesce(sum(case when ${transactions.direction} = 'credit' and ${transactions.type} in ('deposit','contribution','transfer_in','reward') and ${transactions.status} = 'successful' then ${transactions.amountKobo} else 0 end), 0)::int`,
      earnings: sql<number>`coalesce(sum(case when ${transactions.type} in ('interest','payout') and ${transactions.status} = 'successful' then ${transactions.amountKobo} else 0 end), 0)::int`,
      withdrawn: sql<number>`coalesce(sum(case when ${transactions.type} in ('withdrawal','transfer_out') and ${transactions.status} = 'successful' then ${transactions.amountKobo} else 0 end), 0)::int`,
      pendingOut: sql<number>`coalesce(sum(case when ${transactions.status} = 'pending' and ${transactions.direction} = 'debit' then ${transactions.amountKobo} else 0 end), 0)::int`,
    })
    .from(transactions)
    .where(eq(transactions.userId, userId));

  return {
    available: Number(rows?.available ?? 0),
    locked: Number(rows?.locked ?? 0),
    savingsTotal: Number(rows?.totalKobo ?? 0),
    totalContributions: Number(txAgg?.contributions ?? 0),
    totalReturns: Number(txAgg?.earnings ?? 0),
    totalWithdrawn: Number(txAgg?.withdrawn ?? 0),
    pendingDebits: Number(txAgg?.pendingOut ?? 0),
  };
}

export async function getOrCreateAccount(input: {
  userId: string;
  kind: string;
  name: string;
  id?: string | null;
}) {
  if (input.id) {
    const [existing] = await db.select().from(accounts).where(eq(accounts.id, input.id)).limit(1);
    if (existing) return existing;
  }
  const [found] = await db
    .select()
    .from(accounts)
    .where(and(eq(accounts.userId, input.userId), eq(accounts.kind, input.kind), isNull(accounts.groupId)))
    .limit(1);
  if (found) return found;
  const [created] = await db
    .insert(accounts)
    .values({
      userId: input.userId,
      kind: input.kind,
      name: input.name,
      icon: input.kind === "flex" ? "wallet" : "target",
      frequency: input.kind === "regular" ? "monthly" : null,
    })
    .returning();
  return created;
}
