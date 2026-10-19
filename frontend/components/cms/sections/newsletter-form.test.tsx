import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ usePathname: () => "/about" }));

const post = vi.fn();
vi.mock("@/lib/api/client", () => ({ api: { post: (...args: unknown[]) => post(...args) } }));

import { ApiError } from "@/lib/api/errors";

import { NewsletterForm } from "./newsletter-form";

function setup() {
  render(<NewsletterForm buttonLabel="Subscribe" consentText="I agree to receive emails." />);
  return userEvent.setup();
}

describe("NewsletterForm", () => {
  beforeEach(() => {
    post.mockReset();
  });

  it("requires a valid email and consent before calling the API", async () => {
    const user = setup();
    await user.type(screen.getByLabelText("Email address"), "not-an-email");
    await user.click(screen.getByRole("button", { name: "Subscribe" }));
    expect(await screen.findByText("Enter a valid email address.")).toBeInTheDocument();
    expect(screen.getByText("Please confirm that you want to receive our emails.")).toBeInTheDocument();
    expect(post).not.toHaveBeenCalled();
  });

  it("subscribes with the current page as the source", async () => {
    post.mockResolvedValue({});
    const user = setup();
    await user.type(screen.getByLabelText("Email address"), "sita@example.com");
    await user.click(screen.getByLabelText("I agree to receive emails."));
    await user.click(screen.getByRole("button", { name: "Subscribe" }));
    expect(await screen.findByRole("status")).toHaveTextContent("you are subscribed");
    expect(post).toHaveBeenCalledWith("/newsletter/subscribe/", { email: "sita@example.com", consent: true, source: "/about" });
  });

  it("shows server errors", async () => {
    post.mockImplementation(async () => {
      throw new ApiError(429, "throttled", "Too many requests. Try again later.");
    });
    const user = setup();
    await user.type(screen.getByLabelText("Email address"), "sita@example.com");
    await user.click(screen.getByLabelText("I agree to receive emails."));
    await user.click(screen.getByRole("button", { name: "Subscribe" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Too many requests");
  });
});
