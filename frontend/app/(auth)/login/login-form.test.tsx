import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ToastProvider } from "@/components/ui/toast";

const replace = vi.fn();
const refresh = vi.fn();
let search = new URLSearchParams();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, refresh, push: vi.fn() }),
  useSearchParams: () => search,
}));

const post = vi.fn();
vi.mock("@/lib/api/client", () => ({ api: { post: (...args: unknown[]) => post(...args) } }));

import { ApiError } from "@/lib/api/errors";

import { LoginForm } from "./login-form";

function setup() {
  render(
    <ToastProvider>
      <LoginForm />
    </ToastProvider>,
  );
  return userEvent.setup();
}

describe("LoginForm", () => {
  beforeEach(() => {
    replace.mockReset();
    post.mockReset();
    search = new URLSearchParams();
  });

  it("validates before calling the API", async () => {
    const user = setup();
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByText("Email is required.")).toBeInTheDocument();
    expect(screen.getByText("Password is required.")).toBeInTheDocument();
    expect(post).not.toHaveBeenCalled();
  });

  it("signs in and follows a safe next parameter", async () => {
    search = new URLSearchParams("next=/dashboard/profile");
    post.mockResolvedValue({ is_staff_member: false });
    const user = setup();
    await user.type(screen.getByLabelText(/Email/), "sita@example.com");
    await user.type(screen.getByLabelText(/Password/), "Correct-Horse-42");
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/dashboard/profile"));
    expect(post).toHaveBeenCalledWith("/auth/login/", { email: "sita@example.com", password: "Correct-Horse-42" });
  });

  it("ignores an open-redirect next parameter", async () => {
    search = new URLSearchParams("next=//evil.example");
    post.mockResolvedValue({ is_staff_member: true });
    const user = setup();
    await user.type(screen.getByLabelText(/Email/), "staff@example.com");
    await user.type(screen.getByLabelText(/Password/), "Correct-Horse-42");
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/admin"));
  });

  it("shows the server's generic credential error", async () => {
    post.mockRejectedValue(new ApiError(400, "invalid_credentials", "Email or password is incorrect."));
    const user = setup();
    await user.type(screen.getByLabelText(/Email/), "sita@example.com");
    await user.type(screen.getByLabelText(/Password/), "wrong-password");
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Email or password is incorrect.");
    expect(replace).not.toHaveBeenCalled();
  });
});
