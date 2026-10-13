import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { readTokenFromRequest, userFromBearerToken } from "@/lib/auth-service";
import { SESSION_COOKIE } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * Lets the client learn whether its token/cookie is actually being honoured, so the
 * login screen can explain a blocked session instead of showing a blank failure.
 */
export async function GET(request: Request) {
  const bearer = readTokenFromRequest(request);
  const bearerUser = bearer ? await userFromBearerToken(bearer) : null;
  const cookieUser = await getCurrentUser().catch(() => null);
  const user = bearerUser ?? cookieUser;
  const cookieHeader = request.headers.get("cookie") ?? "";
  return NextResponse.json({
    signedIn: Boolean(user),
    user: user ? { email: user.email, role: user.role, kycStatus: user.kycStatus, emailVerified: user.emailVerified } : null,
    cookiePresent: cookieHeader.includes(`${SESSION_COOKIE}=`),
    bearerPresent: Boolean(bearer),
  });
}
