import { describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => ({ cookies: vi.fn(), headers: vi.fn() }));

import { apiUrl, forwardedHeaders } from "./server";

describe("forwardedHeaders", () => {
  it("passes on the client address Nginx set and the request id", () => {
    const incoming = new Headers({ "x-forwarded-for": "203.0.113.7", "x-request-id": "a1b2-c3" });
    expect(forwardedHeaders(incoming)).toEqual({ "X-Forwarded-For": "203.0.113.7", "X-Request-ID": "a1b2-c3" });
  });

  it("keeps only the last hop and accepts IPv6", () => {
    expect(forwardedHeaders(new Headers({ "x-forwarded-for": "1.1.1.1, 2001:db8::1" }))).toEqual({ "X-Forwarded-For": "2001:db8::1" });
  });

  it("passes on the scheme so Django does not redirect the internal hop to HTTPS", () => {
    expect(forwardedHeaders(new Headers({ "x-forwarded-proto": "https" }))).toEqual({ "X-Forwarded-Proto": "https" });
  });

  it("drops malformed values and sends nothing when absent", () => {
    expect(forwardedHeaders(new Headers({ "x-forwarded-for": "unknown; drop table", "x-request-id": "x".repeat(200), "x-forwarded-proto": "gopher" }))).toEqual({});
    expect(forwardedHeaders(new Headers())).toEqual({});
  });
});

describe("apiUrl", () => {
  it("adds the trailing slash to the path, not to a query", () => {
    expect(apiUrl("/checkout/item/?course=nrb-it")).toBe("http://127.0.0.1:8000/api/v1/checkout/item/?course=nrb-it");
    expect(apiUrl("/checkout/item?course=nrb-it")).toBe("http://127.0.0.1:8000/api/v1/checkout/item/?course=nrb-it");
  });

  it("encodes query values and skips empty ones", () => {
    expect(apiUrl("/courses", { search: "a b", page: 2, level: "" })).toBe("http://127.0.0.1:8000/api/v1/courses/?search=a+b&page=2");
  });
});
