import "server-only";

import { cookies } from "next/headers";

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

/**
 * Server Component fetch. Forwards the visitor's cookies so Django evaluates
 * the request as that user; the backend remains the authority on access.
 */
export async function serverGet<T>(path: string, query?: Query): Promise<T> {
  const cookieHeader = (await cookies()).toString();
  const response = await fetch(url(path, query), {
    headers: { Accept: "application/json", ...(cookieHeader ? { Cookie: cookieHeader } : {}) },
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
