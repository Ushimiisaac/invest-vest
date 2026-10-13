import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { accounts, paymentIntents, transactions, withdrawalRequests, bankAccounts } from "@/db/schema";
import { LIVE_PAYMENTS, PRODUCT, PROVIDERS } from "@/lib/config";
import { credit } from "@/lib/ledger";
import { notifyUser } from "@/lib/notify";
import { randomRef } from "@/lib/utils";

import { BANKS, bankName } from "@/lib/banks";
export { BANKS, bankName };


/* ------------------------- account number lookup -------------------- */

const SIMULATED_NAMES = [
  "CHUKWUEMERIKA O",
  "ADEBAYO J OLUFEMI",
  "FATIMA SANI BELLO",
  "IFEANYI C NWOSU",
  "GRACE TOBI AMADI",
];

export async function resolveBankAccount(accountNumber: string, bankNameInput: string) {
  if (!/^\d{10}$/.test(accountNumber)) {
    return { ok: false as const, error: "Nigerian account numbers are 10 digits." };
  }
  if (LIVE_PAYMENTS && PROVIDERS.paystackSecret) {
    try {
      const res = await fetch(
        `https://api.paystack.co/bank/resolve?account_number=${accountNumber}&bank_code=${bankCodeFor(bankNameInput)}`,
        { headers: { Authorization: `Bearer ${PROVIDERS.paystackSecret}` } },
      );
      const json = (await res.json()) as { status: boolean; data?: { account_name: string; bank_code: string } };
      if (json.status && json.data) {
        return {
          ok: true as const,
          accountName: json.data.account_name,
          bankName: bankName(bankNameInput),
          source: "paystack" as const,
        };
      }
      return { ok: false as const, error: "The bank could not verify this account number." };
    } catch {
      return { ok: false as const, error: "Account verification service unavailable. Try again shortly." };
    }
  }
  const idx = Number(accountNumber.slice(-1)) % SIMULATED_NAMES.length;
  return {
    ok: true as const,
    accountName: `${SIMULATED_NAMES[idx]} (simulated)`,
    bankName: bankName(bankNameInput),
    source: "simulated" as const,
  };
}

function bankCodeFor(name: string) {
  return BANKS.find((b) => b.name === name || b.code === name)?.code ?? "044";
}

/* ------------------------------ deposits ---------------------------- */

export type InitiateDepositInput = {
  userId: string;
  email: string;
  amountKobo: number;
  accountId: string;
  channel?: "card" | "bank" | "ussd" | "transfer";
  idempotencyKey?: string;
  description?: string;
};

export async function initiateDeposit(input: InitiateDepositInput) {
  if (input.amountKobo < PRODUCT.minDepositKobo)
    return { ok: false as const, error: `Minimum deposit is ₦${PRODUCT.minDepositKobo / 100}.` };
  if (input.amountKobo > PRODUCT.maxDepositKobo)
    return { ok: false as const, error: "Amount exceeds the single-deposit ceiling." };

  if (input.idempotencyKey) {
    const [existing] = await db
      .select()
      .from(paymentIntents)
      .where(eq(paymentIntents.idempotencyKey, input.idempotencyKey))
      .limit(1);
    if (existing) {
      return {
        ok: true as const,
        reference: existing.reference,
        checkoutUrl: existing.checkoutUrl ?? `/pay?ref=${existing.reference}`,
        status: existing.status,
        live: existing.provider !== "demo",
      };
    }
  }

  const reference = randomRef("DEP");
  const provider = LIVE_PAYMENTS && PROVIDERS.paystackSecret ? "paystack" : "demo";
  let checkoutUrl = `/pay?ref=${reference}`;
  let providerRef: string | null = null;

  if (provider === "paystack") {
    try {
      const res = await fetch("https://api.paystack.co/transaction/initialize", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${PROVIDERS.paystackSecret}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: input.email,
          amount: input.amountKobo,
          reference,
          callback_url: `/api/payments/webhook?done=1&ref=${reference}`,
          metadata: { userId: input.userId, accountId: input.accountId, purpose: "savings_deposit" },
          channels: [input.channel ?? "card", "bank", "ussd"],
        }),
      });
      const json = (await res.json()) as { status: boolean; data?: { authorization_url: string; access_code: string } };
      if (!json.status || !json.data) return { ok: false as const, error: "Payment provider could not start the session." };
      checkoutUrl = json.data.authorization_url;
      providerRef = json.data.access_code;
    } catch {
      return { ok: false as const, error: "Could not reach the payment provider." };
    }
  }

  const [intent] = await db
    .insert(paymentIntents)
    .values({
      userId: input.userId,
      accountId: input.accountId,
      provider,
      channel: input.channel ?? "card",
      reference,
      idempotencyKey: input.idempotencyKey ?? null,
      amountKobo: input.amountKobo,
      status: "pending",
      purpose: "deposit",
      checkoutUrl,
      providerRef,
    })
    .returning();

  return {
    ok: true as const,
    reference: intent.reference,
    checkoutUrl,
    status: intent.status,
    live: provider !== "demo",
  };
}

/**
 * Server-side verification. This is the ONLY place a deposit becomes real.
 * Never trust a browser callback alone: for live providers we re-query the API.
 */
export async function verifyAndSettle(reference: string) {
  const [intent] = await db.select().from(paymentIntents).where(eq(paymentIntents.reference, reference)).limit(1);
  if (!intent) return { ok: false as const, error: "Unknown payment reference." };
  if (intent.status === "success") {
    return { ok: true as const, alreadySettled: true as const, reference, amountKobo: intent.amountKobo };
  }

  if (intent.provider === "paystack") {
    try {
      const res = await fetch(`https://api.paystack.co/transaction/verify/${reference}`, {
        headers: { Authorization: `Bearer ${PROVIDERS.paystackSecret}` },
        cache: "no-store",
      });
      const json = (await res.json()) as {
        status: boolean;
        data?: { status: string; amount: number; gateway_reference: string };
      };
      const data = json.data;
      if (!data || data.status !== "success") {
        await db.update(paymentIntents).set({ status: "failed", verifiedAt: new Date() }).where(eq(paymentIntents.reference, reference));
        await db
          .update(transactions)
          .set({ status: "failed" })
          .where(eq(transactions.reference, reference));
        return { ok: false as const, error: "Payment not completed on the provider. Nothing was credited." };
      }
      if (data.amount !== intent.amountKobo) {
        return { ok: false as const, error: "Amount mismatch between provider and our record. Manual review required." };
      }
      return await settle(intent, data.gateway_reference);
    } catch {
      return { ok: false as const, error: "Verification failed while contacting the provider." };
    }
  }

  // Simulation rail: nothing real moves, but the ledger behaves identically.
  return await settle(intent, `SIM-${reference}`);
}

async function settle(
  intent: typeof paymentIntents.$inferSelect,
  gatewayRef: string,
) {
  if (!intent.accountId) return { ok: false as const, error: "Payment intent has no destination account." };
  const [acct] = await db.select().from(accounts).where(eq(accounts.id, intent.accountId)).limit(1);
  const result = await credit({
    userId: intent.userId,
    accountId: intent.accountId,
    type: "deposit",
    direction: "credit",
    amountKobo: intent.amountKobo,
    description: `${intent.channel === "bank" ? "Bank transfer" : "Card"} deposit to ${acct?.name ?? "wallet"}`,
    reference: intent.reference,
    provider: intent.provider,
    providerRef: gatewayRef,
    meta: { channel: intent.channel, simulated: intent.provider === "demo" },
  });
  if (!result.ok) return { ok: false as const, error: result.error };

  await db
    .update(paymentIntents)
    .set({ status: "success", verifiedAt: new Date(), creditedTxId: result.transaction.id })
    .where(eq(paymentIntents.reference, intent.reference));

  await notifyUser({
    userId: intent.userId,
    type: "deposit",
    severity: "success",
    title: `Deposit successful — ₦${(intent.amountKobo / 100).toLocaleString("en-NG")}`,
    body: `Your ${acct?.name ?? "wallet"} has been credited. Reference ${intent.reference}.`,
    link: `/wallet?tx=${intent.reference}`,
    email: {
      subject: `Deposit received — ${intent.reference}`,
      html: `<p>We received ${"₦"}${(intent.amountKobo / 100).toLocaleString("en-NG")} and credited your ${acct?.name ?? "account"}.</p><p>Reference: <b>${intent.reference}</b></p>`,
    },
  });

  return { ok: true as const, reference: intent.reference, amountKobo: intent.amountKobo, alreadySettled: false as const };
}

/* ------------------------------ webhooks ---------------------------- */

export function verifyPaystackSignature(rawBody: string, signature: string) {
  if (!PROVIDERS.paystackWebhookSecret) return false;
  const expected = createHmac("sha512", PROVIDERS.paystackWebhookSecret).update(rawBody).digest("hex");
  try {
    return timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch {
    return false;
  }
}

export function verifyFlutterwaveSignature(rawBody: string, signature: string) {
  const secret = PROVIDERS.flutterwaveWebhookSecret || PROVIDERS.flutterwaveSecret;
  if (!secret) return false;
  const expected = createHash("md5").update(rawBody + secret).digest("hex");
  try {
    return timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch {
    return false;
  }
}

/** Latest withdrawals for the reconciliation widget on the admin desk. */
export async function recentPendingPayouts(limit = 20) {
  const rows = await db
    .select()
    .from(withdrawalRequests)
    .where(eq(withdrawalRequests.status, "pending"))
    .orderBy(desc(withdrawalRequests.createdAt))
    .limit(limit);
  return rows;
}

export async function initiatePayout(input: { amountKobo: number; bankAccountId: string; narration: string }) {
  const [bank] = await db.select().from(bankAccounts).where(eq(bankAccounts.id, input.bankAccountId)).limit(1);
  if (!bank) return { ok: false as const, error: "Beneficiary account not found." };
  if (LIVE_PAYMENTS && PROVIDERS.paystackSecret) {
    try {
      const recipient = await fetch("https://api.paystack.co/transferrecipient", {
        method: "POST",
        headers: { Authorization: `Bearer ${PROVIDERS.paystackSecret}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "nuban",
          name: bank.accountName,
          account_number: bank.accountNumber,
          bank_code: bank.bankCode ?? "044",
          currency: "NGN",
        }),
      });
      const recipientJson = (await recipient.json()) as { status: boolean; data?: { code: string } };
      if (!recipientJson.data?.code) return { ok: false as const, error: "Could not create transfer recipient." };
      const transfer = await fetch("https://api.paystack.co/transfer", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${PROVIDERS.paystackSecret}`,
          "Content-Type": "application/json",
          "X-Idempotency-Key": input.narration.slice(0, 40),
        },
        body: JSON.stringify({ amount: input.amountKobo, destination: recipientJson.data.code, narrative: input.narration }),
      });
      const json = (await transfer.json()) as { status: boolean; data?: { transfer_code: string; status: string } };
      if (!json.data) return { ok: false as const, error: "Payout could not be initiated with the provider." };
      return { ok: true as const, transferCode: json.data.transfer_code, status: json.data.status, provider: "paystack" as const };
    } catch {
      return { ok: false as const, error: "Provider unreachable for payout." };
    }
  }
  return {
    ok: true as const,
    transferCode: `SIM-${randomRef("TR")}`,
    status: "pending",
    provider: "simulated" as const,
  };
}
