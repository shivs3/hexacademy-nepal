import { describe, expect, it } from "vitest";

import { attemptsLeftText, clockOffset, formatClock, formatDuration, formatMarks, optionLetter, remainingMs, sameSelection, toggleSelection } from "./assessments";

describe("toggleSelection", () => {
  it("replaces the choice for single-answer questions", () => {
    expect(toggleSelection("single", [3], 5)).toEqual([5]);
    expect(toggleSelection("true_false", [], 2)).toEqual([2]);
  });

  it("toggles and sorts for multiple-select questions", () => {
    expect(toggleSelection("multiple", [7], 3)).toEqual([3, 7]);
    expect(toggleSelection("multiple", [3, 7], 7)).toEqual([3]);
  });
});

describe("sameSelection", () => {
  it("ignores order", () => {
    expect(sameSelection([2, 1], [1, 2])).toBe(true);
    expect(sameSelection([1], [1, 2])).toBe(false);
  });
});

describe("countdown", () => {
  it("corrects for a device clock that is wrong", () => {
    // Device is 10 minutes slow compared with the server.
    const deviceNow = Date.parse("2026-01-01T10:00:00Z");
    const offset = clockOffset("2026-01-01T10:10:00Z", deviceNow);
    expect(offset).toBe(10 * 60 * 1000);
    expect(remainingMs("2026-01-01T10:30:00Z", offset, deviceNow)).toBe(20 * 60 * 1000);
  });

  it("never goes negative and tolerates a malformed server time", () => {
    expect(remainingMs("2026-01-01T10:00:00Z", 0, Date.parse("2026-01-01T11:00:00Z"))).toBe(0);
    expect(clockOffset("not a date", 123)).toBe(0);
  });

  it("formats the clock", () => {
    expect(formatClock(65_000)).toBe("01:05");
    expect(formatClock(3_909_000)).toBe("1:05:09");
    expect(formatClock(400)).toBe("00:01");
    expect(formatClock(0)).toBe("00:00");
  });
});

describe("formatting", () => {
  it("formats durations", () => {
    expect(formatDuration(45)).toBe("45 s");
    expect(formatDuration(750)).toBe("12 min 30 s");
    expect(formatDuration(3900)).toBe("1 h 5 min");
    expect(formatDuration(null)).toBe("—");
  });

  it("trims marks", () => {
    expect(formatMarks("1.00")).toBe("1");
    expect(formatMarks("0.50")).toBe("0.5");
    expect(formatMarks("-1.25")).toBe("-1.25");
    expect(formatMarks("10")).toBe("10");
    expect(formatMarks(null)).toBe("—");
  });

  it("labels options and attempts", () => {
    expect(optionLetter(0)).toBe("A");
    expect(optionLetter(7)).toBe("H");
    expect(attemptsLeftText(null, 4)).toBe("Unlimited attempts");
    expect(attemptsLeftText(3, 1)).toBe("2 of 3 attempts left");
    expect(attemptsLeftText(1, 2)).toBe("0 of 1 attempt left");
  });
});
