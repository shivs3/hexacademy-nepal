import { NextResponse, type NextRequest } from "next/server";

import { buildCsp, newNonce } from "@/lib/csp";

const SESSION_COOKIE = "hx_session";
const PROTECTED = /^\/(dashboard|admin|preview|exam)(\/|$)/;

/**
 * Runs before every page:
 * - Sets a per-request nonce-based Content-Security-Policy (lib/csp.ts).
 * - Optimistic redirect only: on protected paths with no session cookie at
 *   all, skip the round-trip and send the visitor to sign in. Real
 *   authentication and authorisation happen in the server layouts and in Django.
 */
export function proxy(request: NextRequest) {
  if (PROTECTED.test(request.nextUrl.pathname) && !request.cookies.has(SESSION_COOKIE)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = `?next=${encodeURIComponent(request.nextUrl.pathname + request.nextUrl.search)}`;
    return NextResponse.redirect(url);
  }

  const nonce = newNonce();
  const csp = buildCsp({
    nonce,
    isDev: process.env.NODE_ENV === "development",
    https: request.headers.get("x-forwarded-proto") === "https" || request.nextUrl.protocol === "https:",
    mediaOrigins: process.env.CSP_MEDIA_ORIGINS,
    formActionOrigins: process.env.CSP_FORM_ACTION_ORIGINS,
    reportUri: process.env.CSP_REPORT_URI,
  });

  // Next.js reads the nonce from the request's CSP header and applies it to its scripts.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  // Every page, but not the API and media rewrites (Django sets their headers) or static files.
  matcher: ["/((?!api/|media/|_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)"],
};
