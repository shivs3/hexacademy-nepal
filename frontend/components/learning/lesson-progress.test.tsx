import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh: vi.fn() }) }));

const toast = { success: vi.fn(), error: vi.fn() };
vi.mock("@/components/ui/toast", () => ({ useToast: () => toast }));

const post = vi.fn();
vi.mock("@/lib/api/client", () => ({ api: { post: (...args: unknown[]) => post(...args) } }));

import { ApiError } from "@/lib/api/errors";

import { LessonProgress } from "./lesson-progress";

describe("LessonProgress", () => {
  beforeEach(() => {
    post.mockReset();
    push.mockReset();
    toast.success.mockReset();
    toast.error.mockReset();
  });

  it("records the visit once on mount", async () => {
    post.mockResolvedValue({});
    const { rerender } = render(<LessonProgress lessonId={3} initialCompleted={false} nextHref={null} />);
    rerender(<LessonProgress lessonId={3} initialCompleted={false} nextHref={null} />);
    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    expect(post).toHaveBeenCalledWith("/lessons/3/progress/", {});
  });

  it("marks the lesson complete and moves on", async () => {
    post.mockResolvedValueOnce({}).mockResolvedValueOnce({ completed: true, course_completed: false });
    render(<LessonProgress lessonId={3} initialCompleted={false} nextHref="/learn/c/4" />);
    await userEvent.setup().click(screen.getByRole("button", { name: "Mark complete and continue" }));
    expect(post).toHaveBeenLastCalledWith("/lessons/3/progress/", { completed: true });
    expect(push).toHaveBeenCalledWith("/learn/c/4");
    expect(await screen.findByRole("button", { name: /Completed/ })).toHaveAttribute("aria-pressed", "true");
  });

  it("celebrates course completion reported by the server", async () => {
    post.mockResolvedValueOnce({}).mockResolvedValueOnce({ completed: true, course_completed: true });
    render(<LessonProgress lessonId={9} initialCompleted={false} nextHref={null} />);
    await userEvent.setup().click(screen.getByRole("button", { name: "Mark complete" }));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Course completed. Well done!"));
  });

  it("keeps the lesson incomplete when saving fails", async () => {
    post.mockResolvedValueOnce({}).mockRejectedValueOnce(new ApiError(403, "forbidden", "You are not enrolled."));
    render(<LessonProgress lessonId={3} initialCompleted={false} nextHref={null} />);
    await userEvent.setup().click(screen.getByRole("button", { name: "Mark complete" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(expect.stringContaining("Progress was not saved.")));
    expect(screen.getByRole("button", { name: "Mark complete" })).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });
});
