import { describe, expect, it } from "vitest";

import { fromNepalInput, joinOpen, minutesBetween, parseEmails, timeRange, toNepalInput } from "./live-classes";

describe("Nepal time inputs", () => {
  it("adds the fixed +05:45 offset", () => {
    expect(fromNepalInput("2026-11-02T18:30")).toBe("2026-11-02T18:30:00+05:45");
    expect(fromNepalInput("2026-11-02 18:30")).toBeNull();
    expect(fromNepalInput("")).toBeNull();
  });

  it("round-trips an instant through the Nepal wall clock", () => {
    expect(toNepalInput("2026-11-02T12:45:00Z")).toBe("2026-11-02T18:30");
    expect(toNepalInput("2026-11-02T20:00:00Z")).toBe("2026-11-03T01:45");
    expect(toNepalInput(fromNepalInput("2026-01-01T00:05")!)).toBe("2026-01-01T00:05");
  });

  it("measures durations", () => {
    expect(minutesBetween("2026-11-02T18:00", "2026-11-02T19:30")).toBe(90);
    expect(minutesBetween("2026-11-02T18:00", "bad")).toBeNull();
  });

  it("formats a range on one day in Nepal time", () => {
    expect(timeRange("2026-11-02T12:15:00Z", "2026-11-02T13:45:00Z")).toBe("Mon, 2 Nov 2026, 6:00 pm – 7:30 pm");
  });
});

describe("joinOpen", () => {
  const session = { state: "upcoming" as const, join_opens_at: "2026-11-02T12:00:00Z", ends_at: "2026-11-02T14:00:00Z" };

  it("opens at join_opens_at and closes at the end", () => {
    expect(joinOpen(session, Date.parse("2026-11-02T11:59:00Z"))).toBe(false);
    expect(joinOpen(session, Date.parse("2026-11-02T12:00:00Z"))).toBe(true);
    expect(joinOpen(session, Date.parse("2026-11-02T14:01:00Z"))).toBe(false);
  });

  it("never opens for a cancelled class", () => {
    expect(joinOpen({ ...session, state: "cancelled" }, Date.parse("2026-11-02T12:30:00Z"))).toBe(false);
  });
});

describe("parseEmails", () => {
  it("splits, lowercases and dedupes", () => {
    expect(parseEmails("A@x.com, b@x.com;\na@x.com  c@x.com")).toEqual(["a@x.com", "b@x.com", "c@x.com"]);
    expect(parseEmails("  ")).toEqual([]);
  });
});
