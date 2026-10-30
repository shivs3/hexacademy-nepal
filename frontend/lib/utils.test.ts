import { describe, expect, it } from "vitest";

import { safeNextPath } from "./navigation";
import { hasAnyPerm, hasPerm } from "./permissions";
import { formatDate, formatMoney, initials } from "./utils";

describe("safeNextPath", () => {
  it.each([
    ["/dashboard/profile", "/dashboard/profile"],
    ["/admin?tab=1", "/admin?tab=1"],
    ["//evil.example", "/dashboard"],
    ["/\\evil.example", "/dashboard"],
    ["https://evil.example", "/dashboard"],
    ["javascript:alert(1)", "/dashboard"],
    [null, "/dashboard"],
  ])("%s -> %s", (input, expected) => {
    expect(safeNextPath(input)).toBe(expected);
  });
});

describe("permissions", () => {
  const user = { permissions: ["accounts.view_user_directory"], is_superuser: false };
  it("checks explicit permissions", () => {
    expect(hasPerm(user, "accounts.view_user_directory")).toBe(true);
    expect(hasPerm(user, "accounts.assign_roles")).toBe(false);
    expect(hasAnyPerm(user, ["accounts.assign_roles", "accounts.view_user_directory"])).toBe(true);
    expect(hasPerm(null, "accounts.view_user_directory")).toBe(false);
  });
  it("treats superusers as holding every permission", () => {
    expect(hasPerm({ permissions: [], is_superuser: true }, "anything.at_all")).toBe(true);
  });
});

describe("formatting", () => {
  it("formats paisa as NPR without float drift", () => {
    expect(formatMoney(150000)).toContain("1,500");
    expect(formatMoney(150050)).toContain("1,500.50");
    expect(formatMoney(-2500)).toMatch(/^-/);
  });
  it("formats dates in Nepal time with the default style or with chosen fields", () => {
    expect(formatDate("2026-10-29T20:00:00Z")).toBe("30 Oct 2026"); // 01:45 next day in Kathmandu
    expect(formatDate("2026-10-29T20:00:00Z", { dateStyle: "long" })).toBe("30 October 2026");
    // Individual fields must not be combined with the default dateStyle (Intl throws).
    expect(formatDate("2026-10-29T20:00:00Z", { day: "numeric", month: "short" })).toBe("30 Oct");
    expect(formatDate("2026-10-29T20:00:00Z", { month: "short", year: "numeric" })).toBe("Oct 2026");
    expect(formatDate(null)).toBe("—");
  });
  it("builds initials", () => {
    expect(initials("Sita Sharma")).toBe("SS");
    expect(initials("ram")).toBe("R");
  });
});
