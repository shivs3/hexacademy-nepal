import { describe, expect, it } from "vitest";

import { safeNextPath } from "./navigation";
import { hasAnyPerm, hasPerm } from "./permissions";
import { formatMoney, initials } from "./utils";

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
  it("builds initials", () => {
    expect(initials("Sita Sharma")).toBe("SS");
    expect(initials("ram")).toBe("R");
  });
});
