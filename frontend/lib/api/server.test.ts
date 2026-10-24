import { describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => ({ cookies: vi.fn(), headers: vi.fn() }));

import { forwardedHeaders } from "./server";

describe("forwardedHeaders", () => {
  it("passes on the client address Nginx set and the request id", () => {
    const incoming = new Headers({ "x-forwarded-for": "203.0.113.7", "x-request-id": "a1b2-c3" });
    expect(forwardedHeaders(incoming)).toEqual({ "X-Forwarded-For": "203.0.113.7", "X-Request-ID": "a1b2-c3" });
  });

  it("keeps only the last hop and accepts IPv6", () => {
    expect(forwardedHeaders(new Headers({ "x-forwarded-for": "1.1.1.1, 2001:db8::1" }))).toEqual({ "X-Forwarded-For": "2001:db8::1" });
  });

  it("drops malformed values and sends nothing when absent", () => {
    expect(forwardedHeaders(new Headers({ "x-forwarded-for": "unknown; drop table", "x-request-id": "x".repeat(200) }))).toEqual({});
    expect(forwardedHeaders(new Headers())).toEqual({});
  });
});
