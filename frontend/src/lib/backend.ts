/**
 * backend.ts — single gateway for ALL calls from the browser to FastAPI.
 *
 * Auth model: the session_token HttpOnly cookie (set by the backend after
 * Google OAuth) is attached automatically via `credentials: "include"`.
 * No Supabase token or localStorage is needed.
 */

export const getBackendUrl = (): string => {
  const envUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
  if (envUrl && !envUrl.includes("koyeb")) {
    return envUrl;
  }
  if (typeof window !== "undefined") {
    if (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") {
      return "http://localhost:8000";
    }
  }
  return "https://aitutor-backend-4dll.onrender.com";
};

export const BACKEND_URL = getBackendUrl();

export async function authedFetch(
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const headers = new Headers(init.headers || {});

  // Only set JSON content-type for string bodies (never for FormData).
  if (!headers.has("Content-Type") && typeof init.body === "string") {
    headers.set("Content-Type", "application/json");
  }

  const baseUrl = getBackendUrl();
  return fetch(`${baseUrl}${path}`, {
    ...init,
    headers,
    credentials: "include", // sends the session_token HttpOnly cookie automatically
  });
}
