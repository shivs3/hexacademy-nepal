import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const post = vi.fn();
vi.mock("@/lib/api/client", () => ({ api: { post: (...args: unknown[]) => post(...args) } }));

import type { AdminSubmission } from "@/types/assignments";

import { GradeDialog } from "./grade-dialog";

const submission: AdminSubmission = {
  id: 12,
  user: { id: 3, full_name: "Sita Learner", email: "sita@example.com" },
  status: "submitted",
  text: "My essay",
  has_file: true,
  original_name: "essay.pdf",
  mime_type: "application/pdf",
  size_bytes: 2048,
  attempt: 1,
  submitted_at: "2026-11-02T06:00:00Z",
  is_late: false,
  points: null,
  feedback: "",
  graded_by_name: "",
  graded_at: null,
};

describe("GradeDialog", () => {
  beforeEach(() => {
    post.mockReset();
  });

  it("validates points against the maximum before saving a grade", async () => {
    post.mockResolvedValue({ ...submission, status: "graded", points: 8 });
    const onSaved = vi.fn();
    render(<GradeDialog submission={submission} maxPoints={10} onClose={() => {}} onSaved={onSaved} />);
    const user = userEvent.setup();
    expect(screen.getByRole("link", { name: "essay.pdf" })).toHaveAttribute("href", "/api/v1/admin/learning/submissions/12/file/");
    await user.type(screen.getByLabelText(/^Points/), "11");
    await user.click(screen.getByRole("button", { name: "Save grade" }));
    expect(screen.getByText("At most 10.")).toBeInTheDocument();
    expect(post).not.toHaveBeenCalled();

    await user.clear(screen.getByLabelText(/^Points/));
    await user.type(screen.getByLabelText(/^Points/), "8");
    await user.click(screen.getByRole("button", { name: "Save grade" }));
    expect(post).toHaveBeenCalledWith("/admin/learning/submissions/12/grade/", { outcome: "graded", points: 8, feedback: "" });
    expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({ points: 8 }), "graded");
  });

  it("requires feedback to return work", async () => {
    post.mockResolvedValue({ ...submission, status: "returned" });
    render(<GradeDialog submission={submission} maxPoints={10} onClose={() => {}} onSaved={() => {}} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Return for revision" }));
    expect(screen.getByText("Tell the learner what to change.")).toBeInTheDocument();
    await user.type(screen.getByLabelText(/^Feedback/), "Cite sources.");
    await user.click(screen.getByRole("button", { name: "Return for revision" }));
    expect(post).toHaveBeenCalledWith("/admin/learning/submissions/12/grade/", { outcome: "returned", points: null, feedback: "Cite sources." });
  });
});
