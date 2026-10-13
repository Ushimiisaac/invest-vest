import { NextResponse } from "next/server";
import { performRegister } from "@/lib/auth-service";
import { rateLimit } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "127.0.0.1";
  const gate = rateLimit(`api-register:${ip}`, 6, 300_000);
  if (!gate.allowed) {
    return NextResponse.json({ ok: false, error: `Too many attempts. Try again in ${Math.max(1, Math.ceil(gate.retryAfter / 60))} minute(s).` }, { status: 429 });
  }
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Send a JSON body." }, { status: 400 });
  }
  const result = await performRegister({
    fullName: String(body.fullName ?? "").trim(),
    email: String(body.email ?? "").trim().toLowerCase(),
    phone: String(body.phone ?? "").trim(),
    password: String(body.password ?? ""),
    confirmPassword: String(body.confirmPassword ?? body.password ?? ""),
    refCode: String(body.ref ?? "").trim().toUpperCase() || undefined,
    termsAccepted: body.terms === true || body.terms === "on",
    ip,
  });
  if (!result.ok) return NextResponse.json({ ok: false, error: result.error, code: result.code }, { status: 400 });
  return NextResponse.json({ ok: true, token: result.token, redirectTo: result.redirectTo });
}
