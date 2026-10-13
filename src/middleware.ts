import { NextResponse, type NextRequest } from "next/server";

/**
 * Last-resort session transport.
 *
 * Browsers can drop both the cookie (third-party blocking inside a frame) and any
 * custom header (a stripping proxy). A session token carried in the query string is
 * the one channel that always arrives, so we accept it here and inject it as a
 * request header server-side — the app then authenticates exactly as normal.
 *
 * The visible URL is cleaned up immediately on the client, so the token does not
 * linger in history, bookmarks or the Referer header.
 */
export function middleware(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const token = searchParams.get("ss_token");
  if (!token || token.length < 20) return NextResponse.next();

  const headers = new Headers(request.headers);
  headers.set("x-ss-session", token);

  const clean = request.nextUrl.clone();
  clean.searchParams.delete("ss_token");

  const response = NextResponse.rewrite(clean, { request: { headers } });
  // Belt and braces: also try to set the cookie for browsers that do allow it.
  response.cookies.set("ss_session", token, {
    path: "/",
    httpOnly: true,
    sameSite: "none",
    secure: true,
    partitioned: true,
  });
  return response;
}

export const config = {
  // API routes are included so downloads (/api/reports/statement) and auth probes can
  // also use the query-string transport; only static assets are skipped.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|robots.txt).*)"],
};
