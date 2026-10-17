import { afterEach, describe, expect, it, vi } from "vitest";

import { api, buildPath } from "./client";
import { ApiError } from "./errors";

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

describe("buildPath", () => {
  it("adds the trailing slash Django expects and drops empty query values", () => {
    expect(buildPath("/admin/users")).toBe("/admin/users/");
    expect(buildPath("admin/users/", { search: "sita", role: "", page: 2, x: null })).toBe("/admin/users/?search=sita&page=2");
  });
});

describe("api client", () => {
  afterEach(() => {
    document.cookie = "hx_csrftoken=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/";
  });

  it("sends the CSRF cookie value on unsafe requests", async () => {
    document.cookie = "hx_csrftoken=abc123; path=/";
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse(200, { ok: true }));
    await api.post("/auth/login/", { email: "a@b.co" });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/v1/auth/login/");
    expect((init?.headers as Record<string, string>)["X-CSRFToken"]).toBe("abc123");
    expect(init?.credentials).toBe("same-origin");
  });

  it("fetches a CSRF token when the cookie is missing", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(jsonResponse(200, { csrf_token: "fresh" }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    await expect(api.post("/auth/logout/")).resolves.toBeUndefined();
    expect(fetchMock.mock.calls[0][0]).toBe("/api/v1/auth/csrf/");
    expect((fetchMock.mock.calls[1][1]?.headers as Record<string, string>)["X-CSRFToken"]).toBe("fresh");
  });

  it("does not send a CSRF header on GET", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse(200, {}));
    await api.get("/users/me");
    expect((fetchMock.mock.calls[0][1]?.headers as Record<string, string>)["X-CSRFToken"]).toBeUndefined();
  });

  it("maps the backend error envelope to ApiError with field errors", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse(400, {
        error: { code: "validation_error", message: "Invalid input.", details: { email: ["Already registered."] } },
      }),
    );
    const err = await api.get("/x").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).code).toBe("validation_error");
    expect((err as ApiError).fieldErrors()).toEqual({ email: "Already registered." });
  });

  it("produces a friendly message for non-JSON server errors", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("<html>bad gateway</html>", { status: 502 }));
    const err = (await api.get("/x").catch((e: unknown) => e)) as ApiError;
    expect(err.status).toBe(502);
    expect(err.message).toMatch(/unavailable/);
  });
});
