import { NextResponse, type NextRequest } from "next/server";

const SESSION_COOKIE = "hx_session";

/**
 * Optimistic redirect only: if there is no session cookie at all, skip the
 * round-trip and send the visitor to sign in. Real authentication and
 * authorisation happen in the server layouts and in Django.
 */
export function proxy(request: NextRequest) {
  if (request.cookies.has(SESSION_COOKIE)) return NextResponse.next();
  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.search = `?next=${encodeURIComponent(request.nextUrl.pathname + request.nextUrl.search)}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/dashboard/:path*", "/admin/:path*", "/preview/:path*", "/exam/:path*"],
};
