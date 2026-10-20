import { StrictMode } from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const replace = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace, refresh: vi.fn() }) }));

const toast = { success: vi.fn(), error: vi.fn() };
vi.mock("@/components/ui/toast", () => ({ useToast: () => toast }));

const get = vi.fn();
const put = vi.fn();
const post = vi.fn();
vi.mock("@/lib/api/client", () => ({
  api: {
    get: (...args: unknown[]) => get(...args),
    put: (...args: unknown[]) => put(...args),
    post: (...args: unknown[]) => post(...args),
  },
}));

import { ApiError } from "@/lib/api/errors";
import type { Attempt } from "@/types/assessments";

import { ExamPlayer } from "./exam-player";

function makeAttempt(overrides: Partial<Attempt> = {}, exam: Partial<Attempt["exam"]> = {}): Attempt {
  const serverNow = Date.parse("2030-01-01T10:00:00Z");
  return {
    id: 7,
    exam: { id: 1, slug: "algebra", title: "Algebra check", allow_revisit: true, negative_marking: false, ...exam },
    number: 1,
    status: "in_progress",
    started_at: new Date(serverNow).toISOString(),
    deadline: new Date(serverNow + 10 * 60 * 1000).toISOString(),
    ended_at: null,
    server_time: new Date(serverNow).toISOString(),
    furthest_position: 0,
    max_score: "2.00",
    results_released: false,
    questions: [
      {
        id: 11,
        position: 0,
        marks: "1.00",
        negative_marks: "0.00",
        content: { kind: "single", prompt: "<p>2 + 2 = ?</p>", image: null, options: [
          { id: 101, text: "<p>3</p>", image: null },
          { id: 102, text: "<p>4</p>", image: null },
        ] },
      },
      {
        id: 12,
        position: 1,
        marks: "1.00",
        negative_marks: "0.00",
        content: { kind: "multiple", prompt: "<p>Primes</p>", image: null, options: [
          { id: 201, text: "<p>2</p>", image: null },
          { id: 202, text: "<p>9</p>", image: null },
        ] },
      },
    ],
    answers: [],
    ...overrides,
  };
}

const savedEcho = (_path: string, body: { selected: number[]; flagged: boolean }) =>
  Promise.resolve({ question: 11, selected: body.selected, flagged: body.flagged, saved_at: new Date().toISOString() });

describe("ExamPlayer", () => {
  beforeEach(() => {
    for (const fn of [get, put, post, replace, toast.success, toast.error]) fn.mockReset();
    get.mockImplementation(() => new Promise(() => {}));
  });

  it("shows the time left from the server clock, not the device clock", () => {
    // The device clock is a year ahead; the countdown must still show ten minutes.
    vi.useFakeTimers({ now: Date.parse("2031-01-01T00:00:00Z"), toFake: ["Date"] });
    render(<ExamPlayer initial={makeAttempt()} />);
    expect(screen.getByRole("timer")).toHaveTextContent("10:00");
    vi.useRealTimers();
  });

  it("saves the selected option and reports it as saved", async () => {
    put.mockImplementation(savedEcho);
    render(<ExamPlayer initial={makeAttempt()} />);
    await userEvent.setup().click(screen.getByRole("radio", { name: /Option B/ }));
    await waitFor(() => expect(put).toHaveBeenCalledWith("/attempts/7/answers/11/", { selected: [102], flagged: false }));
    expect(await screen.findByText("All answers saved")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /Option B/ })).toBeChecked();
  });

  it("still saves under Strict Mode's double-mounted effects", async () => {
    put.mockImplementation(savedEcho);
    render(<StrictMode><ExamPlayer initial={makeAttempt()} /></StrictMode>);
    await userEvent.setup().click(screen.getByRole("radio", { name: /Option B/ }));
    await waitFor(() => expect(put).toHaveBeenCalledWith("/attempts/7/answers/11/", { selected: [102], flagged: false }));
  });

  it("keeps answers queued and says so when the network is down", async () => {
    put.mockRejectedValue(new TypeError("Failed to fetch"));
    render(<ExamPlayer initial={makeAttempt()} />);
    await userEvent.setup().click(screen.getByRole("radio", { name: /Option A/ }));
    expect(await screen.findByText(/Offline: 1 answer waiting to save/)).toBeInTheDocument();
  });

  it("goes to the result page when the server says the attempt has ended", async () => {
    put.mockRejectedValue(new ApiError(409, "attempt_closed", "Time is up. Your saved answers have been submitted."));
    render(<ExamPlayer initial={makeAttempt()} />);
    await userEvent.setup().click(screen.getByRole("radio", { name: /Option A/ }));
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/dashboard/exams/results/7"));
  });

  it("restores the saved answer when the server refuses a change", async () => {
    put.mockRejectedValue(new ApiError(409, "no_revisit", "This exam does not allow going back to earlier questions."));
    const user = userEvent.setup();
    render(<ExamPlayer initial={makeAttempt({ answers: [{ question: 11, selected: [101], flagged: false, saved_at: "" }] })} />);
    await user.click(screen.getByRole("button", { name: "Question 1, answered" }));
    await user.click(screen.getByRole("radio", { name: /Option B/ }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("This exam does not allow going back to earlier questions."));
    expect(screen.getByRole("radio", { name: /Option A/ })).toBeChecked();
  });

  it("submits after confirmation, listing unanswered questions", async () => {
    post.mockResolvedValue({ id: 7, status: "submitted" });
    const user = userEvent.setup();
    render(<ExamPlayer initial={makeAttempt()} />);
    await user.click(screen.getByRole("button", { name: "Submit" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("2 not answered")).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Submit now" }));
    await waitFor(() => expect(post).toHaveBeenCalledWith("/attempts/7/submit/"));
    expect(replace).toHaveBeenCalledWith("/dashboard/exams/results/7");
  });

  it("records moving on and hides Previous when going back is not allowed", async () => {
    post.mockResolvedValue({});
    const user = userEvent.setup();
    render(<ExamPlayer initial={makeAttempt({}, { allow_revisit: false })} />);
    expect(screen.queryByRole("button", { name: /Previous/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Save and continue/ }));
    await waitFor(() => expect(post).toHaveBeenCalledWith("/attempts/7/advance/", { position: 1 }));
    expect(await screen.findByText("Question 2 of 2")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Question 1,/ })).toBeDisabled();
  });

  it("toggles several options for a multiple-select question", async () => {
    put.mockImplementation(savedEcho);
    const user = userEvent.setup();
    render(<ExamPlayer initial={makeAttempt({ answers: [{ question: 11, selected: [102], flagged: false, saved_at: "" }] })} />);
    // The first unanswered question opens on load.
    expect(screen.getByText("Question 2 of 2")).toBeInTheDocument();
    await user.click(screen.getByRole("checkbox", { name: /Option A/ }));
    await user.click(screen.getByRole("checkbox", { name: /Option B/ }));
    await waitFor(() => expect(put).toHaveBeenLastCalledWith("/attempts/7/answers/12/", { selected: [201, 202], flagged: false }));
  });
});
