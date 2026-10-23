import { describe, expect, it } from "vitest";

import type { MySubmission } from "@/types/assignments";

import { learnerState } from "./assignments";

const now = Date.parse("2026-11-02T12:00:00Z");

describe("learnerState", () => {
  it("reports the submission's review state first", () => {
    const sub = { status: "returned" } as MySubmission;
    expect(learnerState({ submission: sub, can_submit: true, due_at: null }, now).label).toBe("Revision requested");
  });

  it("distinguishes to do, overdue and closed", () => {
    expect(learnerState({ submission: null, can_submit: true, due_at: "2026-11-03T00:00:00Z" }, now).label).toBe("To do");
    expect(learnerState({ submission: null, can_submit: true, due_at: "2026-11-01T00:00:00Z" }, now).label).toBe("Overdue");
    expect(learnerState({ submission: null, can_submit: false, due_at: "2026-11-01T00:00:00Z" }, now).label).toBe("Closed");
  });
});
