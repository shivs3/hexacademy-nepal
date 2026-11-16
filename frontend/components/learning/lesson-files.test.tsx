import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

import type { LessonResource } from "@/types/learning";

import { LessonFiles } from "./lesson-files";

const pdf = (over: Partial<LessonResource> = {}): LessonResource => ({
  id: 7,
  title: "Week 1 notes",
  kind: "file",
  url: "",
  viewer: "pdf",
  status: "ready",
  pages: [1, 2, 3].map((number) => ({ number, width: 1600, height: 2263 })),
  ...over,
});

describe("LessonFiles", () => {
  it("shows one PDF page at a time and turns pages", async () => {
    render(<LessonFiles lessonId={3} files={[pdf()]} />);
    const page = () => screen.getByRole("img", { name: /Week 1 notes, page/ });
    expect(page()).toHaveAttribute("src", "/api/v1/lessons/3/resources/7/pages/1/");
    expect(screen.getAllByText("1")[0].parentElement).toHaveTextContent("Page 1 of 3");
    expect(screen.getAllByRole("button", { name: /previous/i })[0]).toBeDisabled();

    await userEvent.click(screen.getAllByRole("button", { name: /next/i })[0]);
    expect(page()).toHaveAttribute("src", "/api/v1/lessons/3/resources/7/pages/2/");

    fireEvent.keyDown(screen.getByLabelText(/Use the left and right arrow keys/), { key: "ArrowRight" });
    expect(page()).toHaveAttribute("src", "/api/v1/lessons/3/resources/7/pages/3/");
    expect(screen.getAllByRole("button", { name: /next/i })[0]).toBeDisabled();
  });

  it("offers no download and blocks the context menu", () => {
    render(<LessonFiles lessonId={3} files={[pdf()]} />);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    const img = screen.getByRole("img", { name: /page 1/ });
    expect(img).toHaveAttribute("draggable", "false");
    expect(fireEvent.contextMenu(img)).toBe(false); // default prevented
  });

  it("says the file is being prepared while pages are rendered", () => {
    render(<LessonFiles lessonId={3} files={[pdf({ status: "pending", pages: [] })]} />);
    expect(screen.getByRole("status")).toHaveTextContent(/Preparing the pages/);
  });

  it("switches between several files", async () => {
    const code: LessonResource = { ...pdf({ id: 8, title: "Example code", viewer: "text", pages: [] }) };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("print('hi')", { headers: { "X-Truncated": "0" } })));
    render(<LessonFiles lessonId={3} files={[pdf(), code]} />);
    await userEvent.click(screen.getByRole("tab", { name: /Example code/ }));
    expect(await screen.findByText("print('hi')")).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith("/api/v1/lessons/3/resources/8/view/", expect.objectContaining({ credentials: "same-origin" }));
    vi.unstubAllGlobals();
  });
});
