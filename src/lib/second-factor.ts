import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { verifyTotp } from "@/lib/auth";

/**
 * Second-factor check used for sensitive operations (payouts, beneficiary changes).
 * Falls back to recovery codes, which are single-use.
 */
export async function verifyTotpWithUser(userId: string, code: string): Promise<boolean> {
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user?.mfaEnabled || !user.totpSecret) return false;
  const clean = (code ?? "").trim();
  if (verifyTotp(user.totpSecret, clean)) return true;

  const codes = (user.recoveryCodes as string[] | null) ?? [];
  const index = codes.indexOf(clean.toUpperCase());
  if (index === -1) return false;
  codes.splice(index, 1);
  await db.update(users).set({ recoveryCodes: codes }).where(eq(users.id, userId));
  return true;
}
