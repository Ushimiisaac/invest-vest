import { NextResponse } from "next/server";
import { SESSION_COOKIE, getCurrentUser } from "@/lib/auth";
import { LIVE_PAYMENTS } from "@/lib/config";

export const dynamic = "force-dynamic";

/** Diagnostics: lets us (and support) confirm the session cookie is being accepted. */
export async function GET(request: Request) {
  const user = await getCurrentUser();
  const cookieHeader = request.headers.get("cookie") ?? "";
  return NextResponse.json({
    signedIn: Boolean(user),
    user: user ? { email: user.email, role: user.role, kyc: user.kycStatus, emailVerified: user.emailVerified } : null,
    sessionCookiePresent: cookieHeader.includes(`${SESSION_COOKIE}=`),
    payments: LIVE_PAYMENTS ? "live provider" : "simulation",
  });
}
