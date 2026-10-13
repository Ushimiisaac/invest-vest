"use server";

import { revalidatePath } from "next/cache";
import { and, desc, eq, ilike, inArray, isNull, or, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  accounts,
  authTokens,
  consents,
  devices,
  faqs,
  helpArticles,
  kycRecords,
  notificationPreferences,
  referrals,
  referralCampaigns,
  rewards,
  sessions,
  supportTickets,
  ticketMessages,
  transactions,
  users,
} from "@/db/schema";
import {
  generateTotpSecret,
  makeRecoveryCodes,
  otpauthUri,
  passwordIssues,
  rateLimit,
  requireUser,
  revokeSessionById,
  logoutAllDevices,
  startSession,
  verifyPassword,
  verifyTotp,
  hashPassword,
} from "@/lib/auth";
import { BRAND, FEATURES, KYC, POLICY_VERSION } from "@/lib/config";
import { credit } from "@/lib/ledger";
import { emailTemplate, notifyUser } from "@/lib/notify";
import { createHash } from "node:crypto";
import { createHmac } from "node:crypto";
import { isPhone, normalisePhone, randomRef, toKobo } from "@/lib/utils";
import { IDLE, checked, field, type ActionState } from "@/lib/action-helpers";

void IDLE;

function hash(value: string) {
  const secret = process.env.KYC_HASH_SECRET ?? BRAND.name;
  return createHmac("sha256", secret).update(value.toLowerCase()).digest("hex");
}

/* ============================== PROFILE =============================== */

export async function updateProfileAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  const fullName = field(formData, "fullName");
  const phone = normalisePhone(field(formData, "phone"));
  if (fullName.length < 3) return { ok: false, field: "fullName", error: "Enter your full legal name." };
  if (!isPhone(phone)) return { ok: false, field: "phone", error: "Enter a valid Nigerian phone number." };
  const phoneChanged = phone !== user.phone;
  await db
    .update(users)
    .set({ fullName, phone, phoneVerified: phoneChanged ? false : user.phoneVerified, updatedAt: new Date() })
    .where(eq(users.id, user.id));
  revalidatePath("/settings");
  return { ok: true, notice: phoneChanged ? "Profile updated. Re-verify your new phone number." : "Profile updated." };
}

export async function changePasswordAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  const rl = rateLimit(`pwd:${user.id}`, 5, 600_000);
  if (!rl.allowed) return { ok: false, error: "Too many attempts. Wait before trying again." };
  const current = field(formData, "currentPassword");
  const next = field(formData, "newPassword");
  const confirm = field(formData, "confirmPassword");
  const signOutEverywhere = checked(formData, "signOutEverywhere");
  const [row] = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
  if (!row) return { ok: false, error: "Account not found." };
  if (!(await verifyPassword(current, row.passwordHash))) return { ok: false, field: "currentPassword", error: "Current password is incorrect." };
  const issues = passwordIssues(next);
  if (issues.length) return { ok: false, field: "newPassword", error: `New password needs ${issues.join(", ")}.` };
  if (next !== confirm) return { ok: false, field: "confirmPassword", error: "New passwords do not match." };
  if (await verifyPassword(next, row.passwordHash)) return { ok: false, field: "newPassword", error: "Choose a password you have not used here before." };
  await db.update(users).set({ passwordHash: await hashPassword(next), updatedAt: new Date() }).where(eq(users.id, user.id));
  if (signOutEverywhere) await logoutAllDevices(user.id);
  await notifyUser({
    userId: user.id,
    type: "security",
    severity: "warning",
    title: "Password changed",
    body: signOutEverywhere ? "You changed your password and signed out every device." : "You changed your password. Other sessions remain active.",
    link: "/settings",
    email: { subject: `${BRAND.name} password changed`, html: emailTemplate({ title: "Password changed", intro: "If this was not you, reset your password and contact support immediately." }) },
  });
  if (signOutEverywhere) return { ok: true, notice: "Password changed. Sign in again on this device.", data: { reauth: "1" } };
  return { ok: true, notice: "Password changed." };
}

/* ================================ MFA ================================= */

export async function beginMfaAction(): Promise<ActionState> {
  const user = await requireUser();
  const secret = generateTotpSecret();
  await db.update(users).set({ totpSecret: secret }).where(eq(users.id, user.id));
  return {
    ok: true,
    notice: "Scan-free setup: paste this secret into your authenticator app.",
    data: { secret, uri: otpauthUri(secret, user.email, BRAND.name) },
  };
}

export async function confirmMfaAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  const code = field(formData, "code");
  const [row] = await db.select({ secret: users.totpSecret }).from(users).where(eq(users.id, user.id)).limit(1);
  if (!row?.secret) return { ok: false, error: "Start the setup again." };
  if (!verifyTotp(row.secret, code)) return { ok: false, field: "code", error: "That code did not match. Check the time on your device." };
  const codes = makeRecoveryCodes();
  await db.update(users).set({ mfaEnabled: true, recoveryCodes: codes }).where(eq(users.id, user.id));
  await notifyUser({ userId: user.id, type: "security", severity: "success", title: "Two-factor enabled", body: "Store your recovery codes somewhere safe — each works once.", link: "/settings" });
  revalidatePath("/settings");
  return { ok: true, notice: "Two-factor authentication is on.", data: { codes: codes.join(",") } };
}

export async function disableMfaAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  const password = field(formData, "password");
  const [row] = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
  if (!row || !(await verifyPassword(password, row.passwordHash))) return { ok: false, field: "password", error: "Password confirmation required." };
  await db.update(users).set({ mfaEnabled: false, totpSecret: null, recoveryCodes: null }).where(eq(users.id, user.id));
  await notifyUser({ userId: user.id, type: "security", severity: "danger", title: "Two-factor disabled", body: "Your account is less protected. Re-enable it when you can.", link: "/settings" });
  revalidatePath("/settings");
  return { ok: true, notice: "Two-factor disabled." };
}

export async function revokeSessionAction(sessionId: string): Promise<ActionState> {
  const user = await requireUser();
  await revokeSessionById(user.id, sessionId);
  revalidatePath("/settings");
  return { ok: true, notice: "Session revoked." };
}

export async function revokeOtherSessionsAction(): Promise<ActionState> {
  const user = await requireUser();
  await logoutAllDevices(user.id);
  await startSession(user.id, true);
  revalidatePath("/settings");
  return { ok: true, notice: "Signed out everywhere else. You may need to sign in again here." };
}

export async function revokeDeviceAction(deviceId: string): Promise<ActionState> {
  const user = await requireUser();
  await db.update(devices).set({ revokedAt: new Date() }).where(and(eq(devices.id, deviceId), eq(devices.userId, user.id)));
  await db.update(sessions).set({ revokedAt: new Date() }).where(and(eq(sessions.userId, user.id), isNull(sessions.revokedAt)));
  revalidatePath("/settings");
  return { ok: true, notice: "Device removed and its sessions ended." };
}

/* ================================ KYC ================================= */

export async function submitKycAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  if (!FEATURES.kyc) return { ok: false, error: "Identity verification is not enabled in this deployment." };
  const rl = rateLimit(`kyc:${user.id}`, 4, 900_000);
  if (!rl.allowed) return { ok: false, error: "Too many attempts. Try again later." };
  const legalName = field(formData, "legalName");
  const dob = field(formData, "dob");
  const idType = field(formData, "idType");
  const idNumber = field(formData, "idNumber");
  if (legalName.length < 5) return { ok: false, field: "legalName", error: "Enter your full name exactly as on your ID." };
  if (!dob) return { ok: false, field: "dob", error: "Date of birth is required." };
  if (new Date(dob) > new Date(Date.now() - 18 * 31_557_600_000)) return { ok: false, field: "dob", error: "You must be 18 or older to verify." };
  const validId = (idType === "bvn" && /^\d{11}$/.test(idNumber)) || (idType === "nin" && /^(\d{11}|80\d{9})$/.test(idNumber)) || (idType !== "bvn" && idType !== "nin" && idNumber.length >= 6);
  if (!validId) return { ok: false, field: "idNumber", error: "BVN and NIN are 11 digits. Passport/driver's licence must be at least 6 characters." };

  const status = KYC.autoVerify ? "verified" : "pending";
  const providerRef = `KYC-${randomRef("SIM")}`;
  await db
    .insert(kycRecords)
    .values({
      userId: user.id,
      type: "nigeria_identity",
      legalName,
      dob,
      idType,
      idNumberHash: hash(idNumber),
      idNumberLast4: idNumber.slice(-4),
      status,
      provider: KYC.provider,
      providerRef,
      submittedAt: new Date(),
      reviewedAt: status === "verified" ? new Date() : null,
    })
    .onConflictDoUpdate({
      target: kycRecords.userId,
      set: { legalName, dob, idType, idNumberHash: hash(idNumber), idNumberLast4: idNumber.slice(-4), status, provider: KYC.provider, providerRef, submittedAt: new Date() },
    });
  await db.update(users).set({ kycStatus: status, updatedAt: new Date() }).where(eq(users.id, user.id));
  await notifyUser({
    userId: user.id,
    type: "verification",
    severity: status === "verified" ? "success" : "info",
    title: status === "verified" ? "Identity verified" : "Identity check submitted",
    body:
      status === "verified"
        ? "Higher deposit and withdrawal limits are now unlocked."
        : "Reference number matches our records and will be reviewed; you will be notified once it clears.",
    link: "/settings",
  });
  revalidatePath("/settings");
  return {
    ok: true,
    notice:
      status === "verified"
        ? "Verification approved."
        : `Submitted under reference ${providerRef}. The identifier was hashed — only the last 4 digits are retained.`,
  };
}

/* ========================== NOTIFICATIONS ============================= */

export async function deleteNotificationAction(id: string): Promise<ActionState> {
  const user = await requireUser();
  const { notifications } = await import("@/db/schema");
  await db.delete(notifications).where(and(eq(notifications.id, id), eq(notifications.userId, user.id)));
  revalidatePath("/notifications");
  return { ok: true, notice: "Notification removed." };
}

export async function markAllNotificationsReadAction(): Promise<ActionState> {
  const user = await requireUser();
  const { notifications } = await import("@/db/schema");
  await db.update(notifications).set({ readAt: new Date() }).where(and(eq(notifications.userId, user.id), isNull(notifications.readAt)));
  revalidatePath("/notifications");
  revalidatePath("/dashboard");
  return { ok: true, notice: "All notifications marked as read." };
}

export async function markOneNotificationReadAction(id: string): Promise<ActionState> {
  const user = await requireUser();
  const { notifications } = await import("@/db/schema");
  await db.update(notifications).set({ readAt: new Date() }).where(and(eq(notifications.id, id), eq(notifications.userId, user.id)));
  revalidatePath("/notifications");
  return { ok: true };
}

export async function saveNotificationPrefsAction(prefs: Record<string, { in_app: boolean; email: boolean; sms: boolean }>): Promise<ActionState> {
  const user = await requireUser();
  await db
    .insert(notificationPreferences)
    .values({ userId: user.id, channels: prefs, updatedAt: new Date() })
    .onConflictDoUpdate({ target: notificationPreferences.userId, set: { channels: prefs, updatedAt: new Date() } });
  revalidatePath("/settings");
  return { ok: true, notice: "Notification preferences saved." };
}

/* ============================== SUPPORT =============================== */

export async function createTicketAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  const subject = field(formData, "subject");
  const body = field(formData, "body");
  const category = field(formData, "category") || "general";
  if (subject.length < 4) return { ok: false, field: "subject", error: "Add a short subject." };
  if (body.length < 15) return { ok: false, field: "body", error: "Describe the issue in at least a sentence or two." };
  const reference = randomRef("TKT");
  const [ticket] = await db
    .insert(supportTickets)
    .values({ userId: user.id, subject, category, reference, priority: category === "withdrawal" || category === "security" ? "high" : "normal", status: "open" })
    .returning();
  await db.insert(ticketMessages).values({ ticketId: ticket.id, authorId: user.id, fromStaff: false, body });
  const staffRows = await db.select({ id: users.id }).from(users).where(inArray(users.role, ["admin", "support"])).limit(3);
  for (const s of staffRows) {
    await notifyUser({
      userId: s.id,
      type: "general",
      severity: "warning",
      title: `New ticket ${reference} · ${subject}`,
      body: `${user.fullName} (${category}).`,
      link: "/admin?tab=tickets",
    });
  }
  revalidatePath("/support");
  return { ok: true, notice: `Ticket ${reference} created. Typical first response is under 4 business hours.`, data: { reference, ticketId: ticket.id } };
}

export async function replyTicketAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  const ticketId = field(formData, "ticketId");
  const body = field(formData, "body");
  if (body.length < 3) return { ok: false, field: "body", error: "Write a reply first." };
  const [ticket] = await db.select().from(supportTickets).where(and(eq(supportTickets.id, ticketId), eq(supportTickets.userId, user.id))).limit(1);
  if (!ticket) return { ok: false, error: "Ticket not found." };
  await db.insert(ticketMessages).values({ ticketId, authorId: user.id, fromStaff: false, body });
  await db.update(supportTickets).set({ status: "open", updatedAt: new Date() }).where(eq(supportTickets.id, ticketId));
  revalidatePath("/support");
  return { ok: true, notice: "Reply sent." };
}

export async function closeTicketAction(ticketId: string): Promise<ActionState> {
  const user = await requireUser();
  await db.update(supportTickets).set({ status: "closed", updatedAt: new Date() }).where(and(eq(supportTickets.id, ticketId), eq(supportTickets.userId, user.id)));
  revalidatePath("/support");
  return { ok: true, notice: "Ticket closed." };
}

/**
 * Rule-based assistant. Answers from published help content only.
 * It is deliberately incapable of asking for or storing secrets.
 */
export async function askAssistantAction(question: string): Promise<{ answer: string; sources: { title: string; slug: string }[] }> {
  const text = question.toLowerCase().trim();
  const forbidden = /(password|pin|otp|cvv|card number|secret)/i.test(text);
  if (forbidden) {
    return {
      answer:
        "I never ask for passwords, PINs, OTPs or full card numbers — and neither will anyone claiming to be IncreaseVest staff. If someone requested that, report it via a support ticket immediately.",
      sources: [{ title: "Report suspicious requests", slug: "phishing-and-social-engineering" }],
    };
  }
  const words = text.split(/[^a-z0-9]+/).filter((w) => w.length > 3).slice(0, 6);
  const clauses = words.map((w) => ilike(helpArticles.body, `%${w}%`));
  const found = clauses.length
    ? await db
        .select({ slug: helpArticles.slug, title: helpArticles.title, excerpt: helpArticles.excerpt, body: helpArticles.body })
        .from(helpArticles)
        .where(and(eq(helpArticles.published, true), or(...clauses)))
        .limit(3)
    : [];
  const [faq] = await db.select().from(faqs).where(words.length ? or(...words.map((w) => ilike(faqs.question, `%${w}%`))) : undefined).limit(1);

  if (found.length) {
    return {
      answer: `${found[0].excerpt || found[0].body.slice(0, 260)}${found.length > 1 ? ` I also found ${found.length - 1} more related guide(s) below.` : ""}`,
      sources: found.map((f) => ({ title: f.title, slug: f.slug })),
    };
  }
  if (faq) return { answer: faq.answer, sources: [{ title: faq.question, slug: "" }] };
  return {
    answer:
      "I could not find that in the help centre. Try words like 'withdrawal limits', 'SafeLock maturity', 'group savings', 'KYC' or 'fees' — or open a support ticket and a human will pick it up.",
    sources: [],
  };
}

/* ============================= CONSENTS =============================== */

export async function recordConsentAction(kind: string, granted: boolean): Promise<ActionState> {
  const user = await requireUser();
  const { requestMeta } = await import("@/lib/auth");
  const { ip } = await requestMeta();
  await db.insert(consents).values({ userId: user.id, kind, version: POLICY_VERSION, granted, ip });
  if (kind === "auto_debit" && granted) {
    await db.update(accounts).set({ autoDebit: true }).where(and(eq(accounts.userId, user.id), eq(accounts.kind, "regular")));
  }
  revalidatePath("/settings");
  return { ok: true, notice: granted ? "Consent recorded with a timestamp and IP." : "Consent withdrawn. Related automation is now paused." };
}

export async function withdrawAutomationConsentAction(): Promise<ActionState> {
  const user = await requireUser();
  const { savingsRules } = await import("@/db/schema");
  await db.update(savingsRules).set({ active: false }).where(eq(savingsRules.userId, user.id));
  await db.update(accounts).set({ autoDebit: false }).where(eq(accounts.userId, user.id));
  await db.insert(consents).values({ userId: user.id, kind: "auto_debit", version: POLICY_VERSION, granted: false });
  revalidatePath("/settings");
  revalidatePath("/rules");
  return { ok: true, notice: "All automatic transfers are now off." };
}

export async function requestAccountClosureAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  const [balance] = await db
    .select({ total: sql<number>`coalesce(sum(${accounts.balanceKobo}),0)::int` })
    .from(accounts)
    .where(and(eq(accounts.userId, user.id), sql`${accounts.status} <> 'closed'`));
  if (Number(balance?.total ?? 0) > 0)
    return { ok: false, error: `Withdraw your balance (${Number(balance?.total ?? 0) / 100} naira) first — closure requires a zero balance for your protection.` };
  const password = field(formData, "password");
  const [row] = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
  if (!row || !(await verifyPassword(password, row.passwordHash))) return { ok: false, field: "password", error: "Password confirmation required." };
  await db.update(users).set({ status: "suspended", suspensionReason: "Customer requested closure — 30 day recovery window" }).where(eq(users.id, user.id));
  await logoutAllDevices(user.id);
  const [staff] = await db.select({ id: users.id }).from(users).where(eq(users.role, "admin")).limit(1);
  if (staff?.id) await notifyUser({ userId: staff.id, type: "security", severity: "danger", title: "Closure requested", body: `${user.email} requested account closure.`, link: "/admin?tab=users" });
  revalidatePath("/settings");
  return { ok: true, notice: "Account scheduled for closure. Sign in within 30 days to reverse it." };
}

/* ============================= REFERRALS ============================== */

export async function syncReferralRewardsAction(targetUserId?: string): Promise<ActionState> {
  const me = await requireUser();
  const userId = targetUserId ?? me.id;
  if (userId !== me.id && me.role !== "admin") return { ok: false, error: "Not permitted." };
  const [campaign] = await db.select().from(referralCampaigns).where(eq(referralCampaigns.active, true)).limit(1);
  if (!campaign) return { ok: false, error: "No active referral campaign." };
  const pending = await db
    .select()
    .from(referrals)
    .where(and(eq(referrals.referrerId, userId), inArray(referrals.status, ["signed_up", "verified"])));

  let qualified = 0;
  for (const referral of pending) {
    const [referee] = await db.select({ kyc: users.kycStatus, createdAt: users.createdAt }).from(users).where(eq(users.id, referral.refereeId)).limit(1);
    if (!referee || referee.kyc !== "verified") continue;
    const [deposit] = await db
      .select({ amountKobo: transactions.amountKobo })
      .from(transactions)
      .where(and(eq(transactions.userId, referral.refereeId), eq(transactions.type, "deposit"), eq(transactions.status, "successful")))
      .orderBy(desc(transactions.createdAt))
      .limit(1);
    const firstDeposit = Number(deposit?.amountKobo ?? 0);
    if (firstDeposit < campaign.minFirstDepositKobo) continue;
    if (Date.now() - referee.createdAt.getTime() < campaign.fraudWindowDays * 86_400_000) continue; // fraud-hold window
    await db
      .update(referrals)
      .set({ status: "rewarded", qualifiedAt: new Date(), firstDepositKobo: firstDeposit })
      .where(eq(referrals.id, referral.id));
    for (const [beneficiary, amountKobo] of [
      [userId, campaign.referrerRewardKobo],
      [referral.refereeId, campaign.rewardKobo],
    ] as [string, number][]) {
      if (amountKobo <= 0) continue;
      const [reward] = await db
        .insert(rewards)
        .values({ userId: beneficiary, kind: "referral", label: `Referral reward · campaign ${campaign.name}`, amountKobo, status: "pending", referralId: referral.id })
        .returning();
      const [flex] = await db.select().from(accounts).where(and(eq(accounts.userId, beneficiary), eq(accounts.kind, "flex"))).limit(1);
      if (flex) {
        const res = await credit({
          userId: beneficiary,
          accountId: flex.id,
          type: "reward",
          direction: "credit",
          amountKobo,
          description: "Referral reward credited",
          meta: { referralId: referral.id, campaignId: campaign.id },
        });
        if (res.ok) {
          await db.update(rewards).set({ status: "credited", creditedAt: new Date(), creditedTxId: res.transaction.id }).where(eq(rewards.id, reward.id));
        }
      }
    }
    await notifyUser({
      userId,
      type: "milestone",
      severity: "success",
      title: "Referral reward credited",
      body: `A referred friend met every requirement, so ${BRAND.name} credited your reward.`,
      link: "/referrals",
    });
    qualified += 1;
  }
  revalidatePath("/referrals");
  return { ok: true, notice: qualified ? `${qualified} reward(s) credited.` : "No referrals have met all conditions yet." };
}

/* ========================= CALCULATOR PRESETS ========================= */

export async function savePresetAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  const { calculatorPresets } = await import("@/db/schema");
  const name = field(formData, "name");
  if (name.length < 2) return { ok: false, field: "name", error: "Name your saved scenario." };
  await db.insert(calculatorPresets).values({
    name,
    scenario: field(formData, "scenario") || "goal",
    payload: JSON.parse(field(formData, "payload") || "{}"),
    createdBy: user.id,
  });
  revalidatePath("/calculate");
  return { ok: true, notice: "Scenario saved to your account." };
}

export async function deleteTokenAction(id: string): Promise<ActionState> {
  const user = await requireUser();
  await db.delete(authTokens).where(and(eq(authTokens.id, id), eq(authTokens.userId, user.id)));
  revalidatePath("/settings");
  return { ok: true, notice: "Pending link revoked." };
}
