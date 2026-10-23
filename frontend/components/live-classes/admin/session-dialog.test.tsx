import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const post = vi.fn();
const patch = vi.fn();
vi.mock("@/lib/api/client", () => ({
  api: { post: (...args: unknown[]) => post(...args), patch: (...args: unknown[]) => patch(...args) },
}));
vi.mock("@/hooks/use-api-resource", () => ({
  useApiResource: () => ({ data: [{ id: 7, full_name: "Asha Instructor", email: "asha@example.com", role: "instructor" }], error: null }),
}));

import { ApiError } from "@/lib/api/errors";
import type { AdminSession } from "@/types/live-classes";

import { SessionDialog } from "./session-dialog";

function setDate(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(new RegExp(`^${label}`)), { target: { value } });
}

describe("SessionDialog", () => {
  beforeEach(() => {
    post.mockReset();
    patch.mockReset();
  });

  it("sends Nepal wall-clock times with the +05:45 offset and a weekly series", async () => {
    post.mockResolvedValue([{}, {}, {}]);
    const onSaved = vi.fn();
    render(<SessionDialog batchId={3} session={null} onClose={() => {}} onSaved={onSaved} />);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/^Title/), "Weekly review");
    setDate("Starts", "2026-11-02T18:00");
    // An empty end defaults to one hour after the start.
    expect(screen.getByLabelText(/^Ends/)).toHaveValue("2026-11-02T19:00");
    setDate("Ends", "2026-11-02T19:30");
    expect(screen.getByText("1 h 30 min")).toBeInTheDocument();
    await user.clear(screen.getByLabelText(/^Repeat weekly/));
    await user.type(screen.getByLabelText(/^Repeat weekly/), "3");
    await user.selectOptions(screen.getByLabelText(/^Instructor/), "7");
    await user.type(screen.getByLabelText(/^Meeting link/), "https://meet.google.com/abc-defg-hij");
    await user.click(screen.getByRole("button", { name: "Schedule 3 classes" }));

    expect(post).toHaveBeenCalledWith("/admin/live-classes/sessions/", {
      batch: 3,
      title: "Weekly review",
      description: "",
      starts_at: "2026-11-02T18:00:00+05:45",
      ends_at: "2026-11-02T19:30:00+05:45",
      instructor: 7,
      provider: "google_meet",
      join_url: "https://meet.google.com/abc-defg-hij",
      passcode: "",
      repeat_weeks: 3,
    });
    expect(onSaved).toHaveBeenCalledWith(3);
  });

  it("keeps the class length when the start moves", () => {
    render(<SessionDialog batchId={3} session={null} onClose={() => {}} onSaved={() => {}} />);
    setDate("Starts", "2026-11-02T18:00");
    setDate("Ends", "2026-11-02T18:45");
    setDate("Starts", "2026-11-02T23:30");
    expect(screen.getByLabelText(/^Ends/)).toHaveValue("2026-11-03T00:15");
  });

  it("refuses an end before the start without calling the API", async () => {
    render(<SessionDialog batchId={3} session={null} onClose={() => {}} onSaved={() => {}} />);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/^Title/), "Q&A");
    setDate("Starts", "2026-11-02T18:00");
    setDate("Ends", "2026-11-02T17:00");
    await user.type(screen.getByLabelText(/^Meeting link/), "https://meet.google.com/abc-defg-hij");
    await user.click(screen.getByRole("button", { name: "Schedule class" }));
    expect(screen.getByText("Must be after the start.")).toBeInTheDocument();
    expect(post).not.toHaveBeenCalled();
  });

  it("shows the server's field errors", async () => {
    post.mockRejectedValue(new ApiError(400, "validation_error", "Invalid input.", { join_url: ["Use a Google Meet link."] }));
    render(<SessionDialog batchId={3} session={null} onClose={() => {}} onSaved={() => {}} />);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/^Title/), "Q&A");
    setDate("Starts", "2026-11-02T18:00");
    await user.type(screen.getByLabelText(/^Meeting link/), "https://example.com/x");
    await user.click(screen.getByRole("button", { name: "Schedule class" }));
    expect(await screen.findByText("Use a Google Meet link.")).toBeInTheDocument();
  });

  it("does not send times for a class that has started", async () => {
    patch.mockResolvedValue({});
    const session = {
      id: 9,
      title: "Live now",
      description: "",
      starts_at: "2026-11-02T12:15:00Z",
      ends_at: "2026-11-02T13:15:00Z",
      instructor: null,
      provider: "zoom",
      join_url: "https://us02web.zoom.us/j/123",
      passcode: "",
      state: "live",
    } as unknown as AdminSession;
    render(<SessionDialog batchId={3} session={session} onClose={() => {}} onSaved={() => {}} />);
    expect(screen.getByLabelText(/^Starts/)).toHaveValue("2026-11-02T18:00");
    expect(screen.getByLabelText(/^Starts/)).toBeDisabled();
    await userEvent.setup().click(screen.getByRole("button", { name: "Save class" }));
    expect(patch).toHaveBeenCalledTimes(1);
    const body = patch.mock.calls[0][1] as Record<string, unknown>;
    expect(body).not.toHaveProperty("starts_at");
    expect(body).not.toHaveProperty("ends_at");
  });
});
