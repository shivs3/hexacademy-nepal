import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const push = vi.fn();
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh }) }));

const post = vi.fn();
vi.mock("@/lib/api/client", () => ({ api: { post: (...args: unknown[]) => post(...args) } }));

import { ApiError } from "@/lib/api/errors";

import { EnrollPanel } from "./enroll-panel";

const base = { slug: "intro-python", isFree: true, signedIn: true, enrolled: false, contactEmail: "info@example.com" };

describe("EnrollPanel", () => {
  beforeEach(() => {
    post.mockReset();
    push.mockReset();
  });

  it("links enrolled learners straight to the course player", () => {
    render(<EnrollPanel {...base} enrolled />);
    expect(screen.getByRole("link", { name: "Continue learning" })).toHaveAttribute("href", "/learn/intro-python");
  });

  it("asks visitors to sign in and returns them to the course", () => {
    render(<EnrollPanel {...base} signedIn={false} />);
    expect(screen.getByRole("link", { name: "Sign in to enroll for free" })).toHaveAttribute("href", "/login?next=%2Fcourses%2Fintro-python");
  });

  it("sends paid courses to checkout instead of the free enroll button", () => {
    render(<EnrollPanel {...base} isFree={false} />);
    expect(screen.queryByRole("button", { name: /enroll/i })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Buy now" })).toHaveAttribute("href", "/checkout?course=intro-python");
  });

  it("asks visitors to sign in before checkout and returns them there", () => {
    render(<EnrollPanel {...base} isFree={false} signedIn={false} />);
    expect(screen.getByRole("link", { name: "Sign in to buy" })).toHaveAttribute(
      "href",
      `/login?next=${encodeURIComponent("/checkout?course=intro-python")}`,
    );
  });

  it("enrolls in a free course and opens the player", async () => {
    post.mockResolvedValue({});
    render(<EnrollPanel {...base} />);
    await userEvent.setup().click(screen.getByRole("button", { name: "Enroll for free" }));
    expect(post).toHaveBeenCalledWith("/courses/intro-python/enroll/");
    expect(push).toHaveBeenCalledWith("/learn/intro-python");
  });

  it("explains when the server says the course now needs payment", async () => {
    post.mockRejectedValue(new ApiError(402, "payment_required", "Payment required."));
    render(<EnrollPanel {...base} />);
    await userEvent.setup().click(screen.getByRole("button", { name: "Enroll for free" }));
    expect(await screen.findByText("This course now requires payment. Refresh the page.")).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });
});
