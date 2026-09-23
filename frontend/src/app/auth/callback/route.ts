/**
 * auth/callback/route.ts
 *
 * Minimal redirect handler. The backend now handles the full Google OAuth
 * flow at /api/auth/google/callback and sets the session_token HttpOnly cookie.
 * This route is only visited after the backend redirects here — it reads the
 * onboarding_completed cookie and sends the user to the right page.
 */

import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const origin = new URL(request.url).origin;

  // Backend sets an onboarding_completed=true|false cookie (short-lived, not HttpOnly)
  const cookieHeader = request.headers.get("cookie") || "";
  const isOnboarded = cookieHeader.includes("onboarding_completed=true");

  return NextResponse.redirect(
    new URL(isOnboarded ? "/dashboard" : "/onboarding", origin)
  );
}
