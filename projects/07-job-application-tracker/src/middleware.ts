import { NextRequest, NextResponse } from "next/server";
import { verifySessionToken } from "@/lib/auth/jwt";
import { SESSION_COOKIE_NAME } from "@/lib/auth/session";

/**
 * Page-level redirect only — a UX nicety, not the security boundary. The
 * actual access control lives in each API route handler (see
 * applications/[id]/status/route.ts for the ownership check, and
 * admin/applications/route.ts for the role check): a determined caller
 * hitting the API directly, bypassing this middleware entirely, still
 * can't get past those checks.
 */
export async function middleware(request: NextRequest) {
  if (!request.nextUrl.pathname.startsWith("/dashboard")) {
    return NextResponse.next();
  }

  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const session = token ? await verifySessionToken(token) : null;

  if (!session) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*"],
};
