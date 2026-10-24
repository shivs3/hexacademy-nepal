import { describe, expect, it } from "vitest";

import { buildCsp, newNonce, parseOrigins } from "./csp";

function directive(csp: string, name: string): string | undefined {
  return csp
    .split("; ")
    .find((part) => part === name || part.startsWith(`${name} `));
}

describe("content security policy", () => {
  it("locks scripts to the nonce and never allows inline or eval scripts in production", () => {
    const csp = buildCsp({ nonce: "abc123", isDev: false, https: true });
    expect(directive(csp, "script-src")).toBe("script-src 'self' 'nonce-abc123' 'strict-dynamic'");
    expect(csp).not.toContain("unsafe-eval");
    expect(directive(csp, "object-src")).toBe("object-src 'none'");
    expect(directive(csp, "frame-ancestors")).toBe("frame-ancestors 'none'");
    expect(directive(csp, "upgrade-insecure-requests")).toBeDefined();
  });

  it("allows eval only in development and skips the HTTPS upgrade over plain HTTP", () => {
    const csp = buildCsp({ nonce: "n", isDev: true, https: false });
    expect(directive(csp, "script-src")).toContain("'unsafe-eval'");
    expect(directive(csp, "upgrade-insecure-requests")).toBeUndefined();
  });

  it("allows only the sanitised video hosts in frames", () => {
    const csp = buildCsp({ nonce: "n", isDev: false, https: true });
    expect(directive(csp, "frame-src")).toBe("frame-src https://www.youtube-nocookie.com https://player.vimeo.com");
  });

  it("adds configured media and payment-form origins and drops malformed values", () => {
    const csp = buildCsp({
      nonce: "n",
      isDev: false,
      https: true,
      mediaOrigins: "https://cdn.example.com  javascript:alert(1) https://x.example.com;script-src",
      formActionOrigins: "https://pay.example.com",
    });
    expect(directive(csp, "img-src")).toBe("img-src 'self' data: blob: https://cdn.example.com");
    expect(directive(csp, "form-action")).toBe("form-action 'self' https://pay.example.com");
    expect(csp.split("; ").filter((part) => part.startsWith("script-src"))).toHaveLength(1);
  });

  it("accepts only safe report URIs", () => {
    expect(buildCsp({ nonce: "n", isDev: false, https: true, reportUri: "/api/v1/csp-report/" })).toContain("report-uri /api/v1/csp-report/");
    expect(buildCsp({ nonce: "n", isDev: false, https: true, reportUri: "x; script-src *" })).not.toContain("report-uri");
  });

  it("parses origins and makes unpredictable nonces", () => {
    expect(parseOrigins(undefined)).toEqual([]);
    expect(parseOrigins("http://localhost:8000 ftp://x")).toEqual(["http://localhost:8000"]);
    const a = newNonce();
    expect(a).toMatch(/^[A-Za-z0-9+/]{22}==$/);
    expect(newNonce()).not.toBe(a);
  });
});
