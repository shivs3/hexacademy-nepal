import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

import { VerifyForm } from "./verify-form";

describe("VerifyForm", () => {
  it("rejects a malformed number and opens the result page for a valid one", async () => {
    render(<VerifyForm />);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Certificate number"), "12345");
    await user.click(screen.getByRole("button", { name: "Verify" }));
    expect(screen.getByText(/Enter the number exactly as printed/)).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();

    await user.clear(screen.getByLabelText("Certificate number"));
    await user.type(screen.getByLabelText("Certificate number"), " hxn-2026-7k3qz9ma ");
    await user.click(screen.getByRole("button", { name: "Verify" }));
    expect(push).toHaveBeenCalledWith("/certificates/verify/HXN-2026-7K3QZ9MA");
  });
});
