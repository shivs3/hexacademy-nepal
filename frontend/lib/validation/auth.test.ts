import { describe, expect, it } from "vitest";

import { registerSchema } from "./auth";

const valid = {
  full_name: "Sita Sharma",
  email: "sita@example.com",
  phone: "",
  password: "Correct-Horse-42",
  confirm_password: "Correct-Horse-42",
  accept_terms: true,
};

describe("registerSchema", () => {
  it("accepts a valid registration", () => {
    expect(registerSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects mismatched passwords on the confirm field", () => {
    const res = registerSchema.safeParse({ ...valid, confirm_password: "Different-Horse-42" });
    expect(res.success).toBe(false);
    expect(res.error?.issues[0].path).toEqual(["confirm_password"]);
  });

  it("requires terms and a 10+ character password", () => {
    const res = registerSchema.safeParse({ ...valid, password: "short", confirm_password: "short", accept_terms: false });
    const paths = res.error?.issues.map((i) => i.path[0]);
    expect(paths).toContain("password");
    expect(paths).toContain("accept_terms");
  });
});
