import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const post = vi.fn();
vi.mock("@/lib/api/client", () => ({ api: { post: (...args: unknown[]) => post(...args) } }));

import { ApiError } from "@/lib/api/errors";
import type { LearnerAssignmentDetail, MySubmission } from "@/types/assignments";

import { SubmitForm } from "./submit-form";

const base: LearnerAssignmentDetail = {
  id: 4,
  title: "Essay",
  course: { id: 1, title: "Course", slug: "course" },
  lesson: null,
  due_at: null,
  allow_late: false,
  accepts_text: true,
  accepts_file: true,
  max_points: 10,
  submission: null,
  can_submit: true,
  closed_reason: "",
  instructions: "",
};

describe("SubmitForm", () => {
  beforeEach(() => {
    post.mockReset();
  });

  it("refuses an empty submission without calling the API", async () => {
    render(<SubmitForm assignment={base} onSaved={() => {}} />);
    await userEvent.setup().click(screen.getByRole("button", { name: "Submit" }));
    expect(screen.getByText("Write an answer or attach a file.")).toBeInTheDocument();
    expect(post).not.toHaveBeenCalled();
  });

  it("sends text and file as multipart form data", async () => {
    post.mockResolvedValue({ attempt: 1 });
    const onSaved = vi.fn();
    render(<SubmitForm assignment={base} onSaved={onSaved} />);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/^Your answer/), "My answer");
    const file = new File(["%PDF-1.4"], "work.pdf", { type: "application/pdf" });
    await user.upload(screen.getByLabelText(/^File/), file);
    await user.click(screen.getByRole("button", { name: "Submit" }));

    expect(post).toHaveBeenCalledTimes(1);
    const [path, form] = post.mock.calls[0] as [string, FormData];
    expect(path).toBe("/assignments/4/submission/");
    expect(form.get("text")).toBe("My answer");
    expect((form.get("file") as File).name).toBe("work.pdf");
    expect(form.has("remove_file")).toBe(false);
    expect(onSaved).toHaveBeenCalled();
  });

  it("can drop a previously submitted file when resubmitting", async () => {
    post.mockResolvedValue({ attempt: 2 });
    const submission = { status: "returned", text: "old", has_file: true, original_name: "a.pdf", size_bytes: 10, attempt: 1 } as MySubmission;
    render(<SubmitForm assignment={{ ...base, submission }} onSaved={() => {}} />);
    const user = userEvent.setup();
    expect(screen.getByRole("link", { name: "a.pdf" })).toHaveAttribute("href", "/api/v1/assignments/4/submission/file/");
    await user.click(screen.getByLabelText("Remove the current file"));
    await user.click(screen.getByRole("button", { name: "Submit again" }));
    const form = post.mock.calls[0][1] as FormData;
    expect(form.get("remove_file")).toBe("true");
    expect(form.get("text")).toBe("old");
  });

  it("shows the server's field errors", async () => {
    post.mockRejectedValue(new ApiError(400, "validation_error", "Invalid input.", { file: ["This file type is not allowed."] }));
    render(<SubmitForm assignment={{ ...base, accepts_text: false }} onSaved={() => {}} />);
    const user = userEvent.setup();
    await user.upload(screen.getByLabelText(/^File/), new File(["MZ"], "x.pdf", { type: "application/pdf" }));
    await user.click(screen.getByRole("button", { name: "Submit" }));
    expect(await screen.findByText("This file type is not allowed.")).toBeInTheDocument();
  });
});
