import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Edge route protection.
 * Auth check: looks for the `session_token` HttpOnly cookie set by the
 * FastAPI backend after Google OAuth. Supabase cookies are no longer used.
 */

const PROTECTED_PREFIXES = ["/dashboard", "/onboarding"];
const DEFERRED_PREFIXES = ["/teacher", "/admin", "/demo", "/staff-login"];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Only check session_token (set by FastAPI backend after Google OAuth)
  const isAuthenticated = Boolean(request.cookies.get("session_token")?.value);

  // Deferred role portals — redirect to dashboard
  if (DEFERRED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  const isProtected = PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );

  if (isProtected && !isAuthenticated) {
    const loginUrl = new URL("/", request.url);
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (pathname === "/" && isAuthenticated) {
    const isOnboarded = request.cookies.get("onboarding_completed")?.value === "true";
    return NextResponse.redirect(new URL(isOnboarded ? "/dashboard" : "/onboarding", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
