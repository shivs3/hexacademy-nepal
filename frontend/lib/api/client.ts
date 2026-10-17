"use client";

import { toApiError } from "./errors";

/**
 * Browser API client. Requests go to the same origin (`/api/v1`), so the
 * HttpOnly session cookie is sent automatically; unsafe methods carry the
 * CSRF token Django issues in the `hx_csrftoken` cookie.
 */
const BASE = "/api/v1";
const CSRF_COOKIE = "hx_csrftoken";

function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.split("; ").find((c) => c.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : null;
}

let csrfPromise: Promise<string> | null = null;

async function csrfToken(): Promise<string> {
  const existing = readCookie(CSRF_COOKIE);
  if (existing) return existing;
  csrfPromise ??= fetch(`${BASE}/auth/csrf/`, { credentials: "same-origin" })
    .then((r) => r.json())
    .then((d: { csrf_token: string }) => d.csrf_token)
    .finally(() => {
      csrfPromise = null;
    });
  return csrfPromise;
}

type Query = Record<string, string | number | boolean | undefined | null>;

export function buildPath(path: string, query?: Query): string {
  const clean = path.startsWith("/") ? path : `/${path}`;
  const withSlash = clean.endsWith("/") || clean.includes("?") ? clean : `${clean}/`;
  if (!query) return withSlash;
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined && v !== null && v !== "") params.set(k, String(v));
  }
  const qs = params.toString();
  return qs ? `${withSlash}?${qs}` : withSlash;
}

type RequestOptions = {
  query?: Query;
  body?: unknown;
  signal?: AbortSignal;
  headers?: Record<string, string>;
};

async function request<T>(method: string, path: string, opts: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json", ...opts.headers };
  let body: BodyInit | undefined;
  if (opts.body instanceof FormData) {
    body = opts.body;
  } else if (opts.body !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(opts.body);
  }
  if (!["GET", "HEAD", "OPTIONS"].includes(method)) {
    headers["X-CSRFToken"] = await csrfToken();
  }
  const response = await fetch(`${BASE}${buildPath(path, opts.query)}`, {
    method,
    headers,
    body,
    credentials: "same-origin",
    signal: opts.signal,
  });
  if (!response.ok) throw await toApiError(response);
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export const api = {
  get: <T>(path: string, opts?: RequestOptions) => request<T>("GET", path, opts),
  post: <T>(path: string, body?: unknown, opts?: RequestOptions) => request<T>("POST", path, { ...opts, body }),
  put: <T>(path: string, body?: unknown, opts?: RequestOptions) => request<T>("PUT", path, { ...opts, body }),
  patch: <T>(path: string, body?: unknown, opts?: RequestOptions) => request<T>("PATCH", path, { ...opts, body }),
  delete: <T>(path: string, opts?: RequestOptions) => request<T>("DELETE", path, opts),
};
