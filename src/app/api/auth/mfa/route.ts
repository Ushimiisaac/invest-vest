import { NextResponse } from "next/server";
import { performMfa } from "@/lib/auth-service";
import { rateLimit } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "127.0.0.1";
  const gate = rateLimit(`api-mfa:${ip}`, 8, 300_000);
  if (!gate.allowed) return NextResponse.json({ ok: false, error: "Too many code attempts. Wait a few minutes." }, { status: 429 });
  let body: { mfaToken?: string; code?: string; recovery?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Send a JSON body." }, { status: 400 });
  }
  const result = await performMfa({ mfaToken: body.mfaToken ?? "", code: body.code ?? "", recovery: body.recovery ?? "" });
  if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: 401 });
  return NextResponse.json({ ok: true, token: result.token, redirectTo: result.redirectTo });
}
