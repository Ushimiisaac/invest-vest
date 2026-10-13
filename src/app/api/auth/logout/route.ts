import { NextResponse } from "next/server";
import { performLogout, readTokenFromRequest } from "@/lib/auth-service";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  await performLogout(readTokenFromRequest(request));
  return NextResponse.json({ ok: true });
}
