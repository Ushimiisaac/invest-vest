import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { paymentIntents } from "@/db/schema";
import { verifyFlutterwaveSignature, verifyPaystackSignature, verifyAndSettle } from "@/lib/payments";
import { rateLimit } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * Provider webhooks. Signature verified against the raw body before anything is trusted.
 * Processing is idempotent: settle() refuses to credit a reference twice.
 */
async function handle(request: Request, providerHint: string) {
  const raw = await request.text();
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (!rateLimit(`webhook:${ip}`, 240, 60_000).allowed) return NextResponse.json({ ok: false }, { status: 429 });
  const signature =
    request.headers.get("x-paystack-signature") ?? request.headers.get("verif-hash") ?? request.headers.get("x-flutterwave-signature") ?? "";

  const provider = providerHint === "flutterwave" ? "flutterwave" : "paystack";
  const valid = provider === "paystack" ? verifyPaystackSignature(raw, signature) : verifyFlutterwaveSignature(raw, signature);
  if (!valid) return NextResponse.json({ ok: false, error: "invalid signature" }, { status: 401 });

  let payload: { event?: string; data?: { reference?: string; status?: string; gateway_reference?: string; id?: string } };
  try {
    payload = JSON.parse(raw);
  } catch {
    return NextResponse.json({ ok: false, error: "bad json" }, { status: 400 });
  }
  const reference = payload.data?.reference ?? payload.data?.id?.toString();
  if (!reference) return NextResponse.json({ ok: true, ignored: true });

  const event = payload.event ?? "";
  if (event === "charge.complete" || event === "payment.completed" || event === "charge.failed" || event === "") {
    const failed = payload.data?.status === "failed" || event === "charge.failed";
    if (failed) {
      await db.update(paymentIntents).set({ status: "failed", verifiedAt: new Date() }).where(eq(paymentIntents.reference, reference));
      return NextResponse.json({ ok: true, status: "failed" });
    }
    const result = await verifyAndSettle(reference);
    return NextResponse.json({ ok: Boolean(result.ok), reference, credited: result.ok && !result.alreadySettled });
  }
  return NextResponse.json({ ok: true, ignored: event });
}

export async function POST(request: Request) {
  const url = new URL(request.url);
  return handle(request, url.searchParams.get("provider") ?? "paystack");
}

/** Browser landing target after a hosted checkout: we still verify server-side. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const reference = url.searchParams.get("ref");
  if (!reference) return NextResponse.redirect(new URL("/wallet?tab=deposit", request.url));
  const result = await verifyAndSettle(reference);
  return NextResponse.redirect(new URL(result.ok ? `/pay?ref=${reference}` : `/wallet?tab=deposit&error=unverified`, request.url));
}
