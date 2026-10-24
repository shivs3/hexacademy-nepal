import "server-only";

import { cookies, headers } from "next/headers";

import { toApiError } from "./errors";

const INTERNAL_API_URL = process.env.INTERNAL_API_URL ?? "http://127.0.0.1:8000";

type Query = Record<string, string | number | boolean | undefined | null>;

function url(path: string, query?: Query): string {
  const clean = path.startsWith("/") ? path : `/${path}`;
  const withSlash = clean.endsWith("/") ? clean : `${clean}/`;
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query ?? {})) {
    if (v !== undefined && v !== null && v !== "") params.set(k, String(v));
  }
  const qs = params.toString();
  return `${INTERNAL_API_URL}/api/v1${withSlash}${qs ? `?${qs}` : ""}`;
}

const IP = /^(\d{1,3}(\.\d{1,3}){3}|[0-9a-f:]{2,39})$/i;
const REQUEST_ID = /^[A-Za-z0-9-]{1,64}$/;

/**
 * Headers that identify the visitor to Django. Nginx overwrites
 * X-Forwarded-For with the real client address before it reaches Next, so
 * passing it on gives each visitor their own anonymous throttle bucket and a
 * correct audit IP. Without it every server render would share the Next
 * server's address and one rate limit (ADR-045).
 */
export function forwardedHeaders(incoming: Headers): Record<string, string> {
  const out: Record<string, string> = {};
  const ip = incoming.get("x-forwarded-for")?.split(",").pop()?.trim();
  if (ip && IP.test(ip)) out["X-Forwarded-For"] = ip;
  const requestId = incoming.get("x-request-id");
  if (requestId && REQUEST_ID.test(requestId)) out["X-Request-ID"] = requestId;
  return out;
}

/**
 * Server Component fetch. Forwards the visitor's cookies so Django evaluates
 * the request as that user; the backend remains the authority on access.
 */
export async function serverGet<T>(path: string, query?: Query): Promise<T> {
  const cookieHeader = (await cookies()).toString();
  const response = await fetch(url(path, query), {
    headers: {
      Accept: "application/json",
      ...forwardedHeaders(await headers()),
      ...(cookieHeader ? { Cookie: cookieHeader } : {}),
    },
    cache: "no-store",
  });
  if (!response.ok) throw await toApiError(response);
  return (await response.json()) as T;
}

/** Like serverGet, but resolves to null for 401/403/404 instead of throwing. */
export async function serverGetOrNull<T>(path: string, query?: Query): Promise<T | null> {
  try {
    return await serverGet<T>(path, query);
  } catch (err) {
    const status = (err as { status?: number }).status;
    if (status === 401 || status === 403 || status === 404) return null;
    throw err;
  }
}
