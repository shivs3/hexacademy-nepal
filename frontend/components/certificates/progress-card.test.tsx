import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const post = vi.fn();
vi.mock("@/lib/api/client", () => ({ api: { post: (...args: unknown[]) => post(...args) } }));
const toast = { success: vi.fn(), error: vi.fn() };
vi.mock("@/components/ui/toast", () => ({ useToast: () => toast }));

import type { CertificateEligibility } from "@/types/certificates";

import { ProgressCard } from "./my-certificates";

const row: CertificateEligibility = {
  course: { id: 1, title: "Python Basics", slug: "python-basics" },
  offered: true,
  eligible: false,
  requirements: [
    { key: "enrolled", label: "Active enrollment in the course", met: true },
    { key: "lessons", label: "Complete every lesson", met: false },
  ],
  certificate: null,
};

describe("ProgressCard", () => {
  beforeEach(() => {
    post.mockReset();
    toast.success.mockReset();
    toast.error.mockReset();
  });

  it("lists requirements and offers no claim until every one is met", () => {
    render(<ProgressCard row={row} onIssued={() => {}} />);
    expect(screen.getByText("1 of 2 requirements met")).toBeInTheDocument();
    expect(screen.getByText("(not yet)")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Get my certificate" })).not.toBeInTheDocument();
  });

  it("claims through the server and only celebrates when a certificate comes back", async () => {
    const onIssued = vi.fn();
    post.mockResolvedValueOnce({ ...row, eligible: false, certificate: null });
    render(<ProgressCard row={{ ...row, eligible: true }} onIssued={onIssued} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Get my certificate" }));
    expect(post).toHaveBeenCalledWith("/me/courses/python-basics/certificate/");
    expect(toast.error).toHaveBeenCalledWith("Not all requirements are met yet.");
    expect(onIssued).not.toHaveBeenCalled();

    post.mockResolvedValueOnce({ ...row, certificate: { number: "HXN-2026-AAAAAAAA" } });
    await user.click(screen.getByRole("button", { name: "Get my certificate" }));
    expect(toast.success).toHaveBeenCalled();
    expect(onIssued).toHaveBeenCalled();
  });
});
