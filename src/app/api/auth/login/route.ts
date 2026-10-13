import { NextResponse } from "next/server";
import { performLogin, readTokenFromRequest } from "@/lib/auth-service";
import { rateLimit } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * Iframe-safe login. Server Actions are blocked or hard to observe when the app is
 * embedded cross-site and third-party cookies are disabled, so this REST path is the
 * primary one: it returns the session token in the body and the client keeps it.
 */
export async function POST(request: Request) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "127.0.0.1";
  const gate = rateLimit(`api-login:${ip}`, 12, 60_000);
  if (!gate.allowed) {
    return NextResponse.json({ ok: false, error: `Too many attempts. Retry in ${Math.max(1, Math.ceil(gate.retryAfter / 60))} minute(s).` }, { status: 429 });
  }
  let body: { identifier?: string; email?: string; password?: string; remember?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Send a JSON body with email and password." }, { status: 400 });
  }
  const result = await performLogin({
    identifier: body.identifier ?? body.email ?? "",
    password: body.password ?? "",
    ip,
    remember: body.remember ?? true,
  });
  if (!result.ok) return NextResponse.json({ ok: false, error: result.error, code: result.code }, { status: 401 });
  if (result.needsMfa) return NextResponse.json({ ok: true, needsMfa: true, mfaToken: result.mfaToken, redirectTo: result.redirectTo });
  return NextResponse.json({ ok: true, token: result.token, redirectTo: result.redirectTo });
}

/** Convenience for diagnostics: which token does this request present? */
export async function GET(request: Request) {
  const token = readTokenFromRequest(request);
  return NextResponse.json({ presented: Boolean(token), length: token?.length ?? 0 });
}
