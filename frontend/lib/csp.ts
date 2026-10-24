/**
 * Content-Security-Policy for every page, built per request by `proxy.ts`
 * (ADR-044).
 *
 * Scripts are locked to a per-request nonce plus 'strict-dynamic': Next.js
 * reads the nonce from this header and attaches it to its own scripts, and
 * nothing else can execute. Styles allow 'unsafe-inline' because Radix's
 * scroll lock, Tiptap and KaTeX inject style tags and attributes at runtime.
 */

/** Hosts produced by `apps/cms/sanitize.video_embed_url`; keep the two in step. */
export const VIDEO_FRAME_ORIGINS = ["https://www.youtube-nocookie.com", "https://player.vimeo.com"];

/** Default public media host (Cloudflare R2 custom domain, as in next.config.ts). */
const DEFAULT_MEDIA_ORIGINS = "https://media.hexacademynepal.com";
/** eSewa's UAT form host, matching the backend's ESEWA_FORM_URL default. */
const DEFAULT_FORM_ACTION_ORIGINS = "https://rc-epay.esewa.com.np";

export interface CspOptions {
  nonce: string;
  isDev: boolean;
  /** The request arrived over HTTPS (directly or via the proxy). */
  https: boolean;
  /** Space-separated origins for images and media (CSP_MEDIA_ORIGINS). */
  mediaOrigins?: string;
  /** Space-separated origins pages may post forms to (CSP_FORM_ACTION_ORIGINS). */
  formActionOrigins?: string;
  /** Endpoint for violation reports (CSP_REPORT_URI). */
  reportUri?: string;
}

/** Keep only well-formed origins so a bad env value can't inject directives. */
export function parseOrigins(value: string | undefined): string[] {
  return (value ?? "")
    .split(/\s+/)
    .filter((origin) => /^https?:\/\/[a-z0-9.-]+(:\d+)?$/i.test(origin));
}

export function buildCsp(options: CspOptions): string {
  const media = parseOrigins(options.mediaOrigins ?? DEFAULT_MEDIA_ORIGINS);
  const forms = parseOrigins(options.formActionOrigins ?? DEFAULT_FORM_ACTION_ORIGINS);
  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    // 'unsafe-eval' only in development, where React uses eval for error overlays.
    "script-src": ["'self'", `'nonce-${options.nonce}'`, "'strict-dynamic'", ...(options.isDev ? ["'unsafe-eval'"] : [])],
    "style-src": ["'self'", "'unsafe-inline'"],
    "img-src": ["'self'", "data:", "blob:", ...media],
    "media-src": ["'self'", ...media],
    "font-src": ["'self'", "data:"],
    "connect-src": ["'self'"],
    "frame-src": VIDEO_FRAME_ORIGINS,
    "form-action": ["'self'", ...forms],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "frame-ancestors": ["'none'"],
    "manifest-src": ["'self'"],
  };
  const parts = Object.entries(directives).map(([name, values]) => `${name} ${values.join(" ")}`);
  if (options.https) parts.push("upgrade-insecure-requests");
  if (options.reportUri && /^(https:\/\/|\/)[^\s;,]*$/.test(options.reportUri)) parts.push(`report-uri ${options.reportUri}`);
  return parts.join("; ");
}

/** 128 random bits, base64-encoded, from the Web Crypto API (Edge and Node). */
export function newNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes));
}
