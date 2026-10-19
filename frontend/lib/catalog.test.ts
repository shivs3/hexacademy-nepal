import { describe, expect, it } from "vitest";

import { decimalToMinor, formatMinutes, formatPrice, lessonPath } from "./catalog";

describe("decimalToMinor", () => {
  it("converts API decimals to paisa without floating point", () => {
    expect(decimalToMinor("2500.00")).toBe(250000);
    expect(decimalToMinor("0.1")).toBe(10);
    expect(decimalToMinor("19.99")).toBe(1999);
    expect(decimalToMinor("0")).toBe(0);
  });

  it("rejects values that are not plain non-negative decimals", () => {
    for (const bad of ["", "-1.00", "1.234", "1e3", "abc", "1,000"]) expect(decimalToMinor(bad)).toBeNull();
  });
});

describe("formatPrice", () => {
  it("formats rupees with Indian digit grouping", () => {
    expect(formatPrice("125000.00")).toBe("Rs. 1,25,000");
    expect(formatPrice("99.50")).toBe("Rs. 99.50");
  });

  it("passes through values it cannot parse", () => {
    expect(formatPrice("n/a")).toBe("n/a");
  });
});

describe("formatMinutes and lessonPath", () => {
  it("formats durations", () => {
    expect(formatMinutes(0)).toBe("");
    expect(formatMinutes(45)).toBe("45 min");
    expect(formatMinutes(120)).toBe("2 h");
    expect(formatMinutes(95)).toBe("1 h 35 min");
  });

  it("encodes the course slug", () => {
    expect(lessonPath("intro-python", 7)).toBe("/learn/intro-python/7");
  });
});
