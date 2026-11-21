import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

// A plain recorder rather than vi.fn(): the spy's own promise tracking reports
// a rejected response as unhandled even though the component catches it.
let calls: unknown[][] = [];
let respond: () => Promise<unknown> = () => Promise.resolve(undefined);
vi.mock("@/lib/api/client", () => ({
  api: {
    post: (...args: unknown[]) => {
      calls.push(args);
      return respond();
    },
    get: vi.fn(),
  },
}));

import { ApiError } from "@/lib/api/errors";
import type { CheckoutItem, MyAccessRequest } from "@/types/access";

import { AccessRequestForm } from "./access-request-form";

const item: CheckoutItem = {
  kind: "exam",
  slug: "loksewa-mock",
  title: "Loksewa mock",
  price: "200.00",
  pending_request: null,
  instructions: "<p>Pay to eSewa 98XXXXXXXX</p>",
};

const sent: MyAccessRequest = {
  number: "REQ-ABC123",
  kind: "exam",
  item_title: "Loksewa mock",
  item_slug: "loksewa-mock",
  price: "200.00",
  full_name: "Sita Sharma",
  phone: "9800000000",
  payment_reference: "",
  message: "",
  status: "pending",
  status_label: "Pending",
  staff_note: "",
  created_at: "2026-11-20T10:00:00Z",
  handled_at: null,
};

describe("AccessRequestForm", () => {
  beforeEach(() => {
    calls = [];
    respond = () => Promise.resolve(undefined);
  });

  it("shows the server price and instructions, and sends only the form and item slug", async () => {
    respond = () => Promise.resolve(sent);
    render(<AccessRequestForm item={item} defaultName="Sita Sharma" />);
    expect(screen.getByText("Pay to eSewa 98XXXXXXXX")).toBeInTheDocument();
    expect(screen.getByText(/200/)).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText(/Phone number/), "9800000000");
    await userEvent.click(screen.getByRole("button", { name: "Send request" }));

    await waitFor(() => expect(calls).toHaveLength(1));
    const [path, body] = calls[0] as [string, Record<string, unknown>];
    expect(path).toBe("/access-requests/");
    expect(body).toMatchObject({ exam: "loksewa-mock", full_name: "Sita Sharma", phone: "9800000000" });
    expect(body).not.toHaveProperty("price");
    expect(await screen.findByText("Request received")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "See my requests" })).toHaveAttribute("href", "/dashboard/requests");
  });

  it("validates the phone number before sending", async () => {
    render(<AccessRequestForm item={item} defaultName="Sita" />);
    await userEvent.type(screen.getByLabelText(/Phone number/), "call me");
    await userEvent.click(screen.getByRole("button", { name: "Send request" }));
    expect(await screen.findByText(/Enter a phone number/)).toBeInTheDocument();
    expect(calls).toHaveLength(0);
  });

  it("shows a server conflict", async () => {
    respond = () => Promise.reject(new ApiError(409, "already_has_access", "You can already take this exam."));
    render(<AccessRequestForm item={item} defaultName="Sita" />);
    await userEvent.type(screen.getByLabelText(/Phone number/), "9800000000");
    await userEvent.click(screen.getByRole("button", { name: "Send request" }));
    expect(await screen.findByText("You can already take this exam.")).toBeInTheDocument();
  });

  it("shows an existing pending request instead of the form", () => {
    render(<AccessRequestForm item={{ ...item, pending_request: sent }} defaultName="Sita" />);
    expect(screen.getByText("Request received")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Send request" })).not.toBeInTheDocument();
  });
});
