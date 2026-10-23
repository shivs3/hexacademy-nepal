import { describe, expect, it } from "vitest";

import { NUMBER_PATTERN, myPdfUrl, normalizeNumber, progressLabel } from "./certificates";

describe("certificate helpers", () => {
  it("normalises typed numbers and validates the printed format", () => {
    expect(normalizeNumber("  hxn-2026-7k3q z9ma ")).toBe("HXN-2026-7K3QZ9MA");
    expect(NUMBER_PATTERN.test("HXN-2026-7K3QZ9MA")).toBe(true);
    // Crockford base32 never uses I, L, O or U.
    expect(NUMBER_PATTERN.test("HXN-2026-7K3QZ9MO")).toBe(false);
    expect(NUMBER_PATTERN.test("HXN-26-7K3QZ9MA")).toBe(false);
  });

  it("builds the owner's PDF path and a progress summary", () => {
    expect(myPdfUrl("HXN-2026-AAAAAAAA")).toBe("/api/v1/me/certificates/HXN-2026-AAAAAAAA/pdf/");
    expect(
      progressLabel([
        { key: "enrolled", label: "Enrolled", met: true },
        { key: "lessons", label: "Lessons", met: false },
      ]),
    ).toBe("1 of 2 requirements met");
  });
});
