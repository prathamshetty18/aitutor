/**
 * backend.ts — single gateway for ALL calls from the browser to FastAPI.
 *
 * Auth model: the session_token HttpOnly cookie (set by the backend after
 * Google OAuth) is attached automatically via `credentials: "include"`.
 * No Supabase token or localStorage is needed.
 */

export const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000";

export async function authedFetch(
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const headers = new Headers(init.headers || {});

  // Only set JSON content-type for string bodies (never for FormData).
  if (!headers.has("Content-Type") && typeof init.body === "string") {
    headers.set("Content-Type", "application/json");
  }

  return fetch(`${BACKEND_URL}${path}`, {
    ...init,
    headers,
    credentials: "include", // sends the session_token HttpOnly cookie automatically
  });
}
