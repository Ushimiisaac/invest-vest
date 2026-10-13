import { eq } from "drizzle-orm";
import { db } from "@/db";
import { notificationPreferences, notifications, outboxMessages } from "@/db/schema";
import { BRAND, PROVIDERS } from "@/lib/config";

export type NotifyType =
  | "deposit"
  | "withdrawal"
  | "contribution"
  | "missed"
  | "milestone"
  | "maturity"
  | "security"
  | "verification"
  | "product"
  | "general";

const DEFAULTS: Record<string, { in_app: boolean; email: boolean; sms: boolean }> = {
  deposit: { in_app: true, email: true, sms: false },
  withdrawal: { in_app: true, email: true, sms: true },
  contribution: { in_app: true, email: false, sms: false },
  missed: { in_app: true, email: true, sms: true },
  milestone: { in_app: true, email: true, sms: false },
  maturity: { in_app: true, email: true, sms: false },
  security: { in_app: true, email: true, sms: true },
  verification: { in_app: true, email: true, sms: false },
  product: { in_app: true, email: false, sms: false },
  general: { in_app: true, email: false, sms: false },
};

export async function notifyUser(input: {
  userId: string;
  type: NotifyType;
  title: string;
  body: string;
  severity?: "info" | "success" | "warning" | "danger";
  link?: string;
  email?: { subject: string; html: string };
  sms?: string;
}) {
  const prefs = await getPreferences(input.userId);
  const routing = prefs[input.type] ?? DEFAULTS[input.type] ?? DEFAULTS.general;
  const channels: string[] = [];

  const [row] = await db
    .insert(notifications)
    .values({
      userId: input.userId,
      type: input.type,
      title: input.title,
      body: input.body,
      severity: input.severity ?? "info",
      link: input.link ?? null,
      channels: routing.in_app ? ["in_app"] : [],
      readAt: null,
    })
    .returning();
  if (routing.in_app) channels.push("in_app");

  if (routing.email && input.email) {
    channels.push("email");
    await deliverEmail(input.userId, input.email.subject, input.email.html);
  }
  if (routing.sms && input.sms) {
    channels.push("sms");
    await deliverSms(input.userId, input.sms);
  }
  if (channels.length === 0) channels.push("in_app");
  await db.update(notifications).set({ channels }).where(eq(notifications.id, row.id));
  return row;
}

async function getPreferences(userId: string) {
  const [row] = await db.select().from(notificationPreferences).where(eq(notificationPreferences.userId, userId)).limit(1);
  return (row?.channels ?? DEFAULTS) as Record<string, { in_app: boolean; email: boolean; sms: boolean }>;
}

export async function getDefaultPreferences() {
  return DEFAULTS;
}

async function deliverEmail(userId: string, subject: string, html: string) {
  const { users } = await import("@/db/schema");
  const [user] = await db.select({ email: users.email, name: users.fullName }).from(users).where(eq(users.id, userId)).limit(1);
  const to = user?.email ?? "unknown@example.com";
  if (PROVIDERS.resendKey) {
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${PROVIDERS.resendKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ from: `${BRAND.name} <notifications@increasevest.ng>`, to, subject, html }),
      });
      await db.insert(outboxMessages).values({
        channel: "email",
        to,
        subject,
        body: html,
        status: res.ok ? "sent" : "failed",
        provider: "resend",
      });
      return;
    } catch {
      /* fall through to outbox */
    }
  }
  await db.insert(outboxMessages).values({
    channel: "email",
    to,
    subject,
    body: html,
    status: "skipped",
    provider: "console",
  });
  if (process.env.NODE_ENV !== "production") console.log(`[email:demo] to=${to} subject=${subject}`);
}

async function deliverSms(userId: string, body: string) {
  const { users } = await import("@/db/schema");
  const [user] = await db.select({ phone: users.phone }).from(users).where(eq(users.id, userId)).limit(1);
  const to = user?.phone ?? "";
  await db.insert(outboxMessages).values({
    channel: "sms",
    to: to || "unknown",
    subject: "SMS",
    body,
    status: PROVIDERS.twilioSid ? "sent" : "skipped",
    provider: PROVIDERS.twilioSid ? "twilio" : "console",
  });
}

export async function recordOutbox(channel: "email" | "sms" | "push", to: string, subject: string, body: string) {
  await db.insert(outboxMessages).values({ channel, to, subject, body, status: "skipped", provider: "console" });
}

export function emailTemplate(input: { title: string; intro: string; ctaLabel?: string; ctaUrl?: string; note?: string }) {
  return `<div style="font-family:Inter,Arial,sans-serif;background:#0b1220;padding:32px">
  <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:16px;padding:28px">
    <p style="letter-spacing:.2em;text-transform:uppercase;font-size:11px;color:#0f9d76;font-weight:700;margin:0">${BRAND.name}</p>
    <h1 style="font-size:21px;margin:14px 0 8px;color:#0b1220">${input.title}</h1>
    <p style="color:#3f4a5c;line-height:1.6;font-size:14px">${input.intro}</p>
    ${input.ctaUrl ? `<p style="margin:22px 0"><a href="${input.ctaUrl}" style="background:#0f9d76;color:#fff;text-decoration:none;padding:12px 18px;border-radius:10px;font-weight:600;font-size:14px">${input.ctaLabel ?? "Continue"}</a></p>` : ""}
    ${input.note ? `<p style="font-size:12px;color:#6b7688;border-top:1px solid #eef1f5;padding-top:14px">${input.note}</p>` : ""}
  </div></div>`;
}
