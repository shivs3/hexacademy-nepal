import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const push = vi.fn();
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh }) }));

const get = vi.fn();
const post = vi.fn();
vi.mock("@/lib/api/client", () => ({
  api: { get: (...args: unknown[]) => get(...args), post: (...args: unknown[]) => post(...args) },
}));

const goToProvider = vi.fn();
vi.mock("@/lib/commerce", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/commerce")>()),
  goToProvider: (...args: unknown[]) => goToProvider(...args),
}));

import { ApiError } from "@/lib/api/errors";
import type { PaymentMethods, Quote } from "@/types/commerce";

import { Checkout } from "./checkout";

const line = { course_slug: "intro-python", title: "Intro to Python", list_price: "2000.00", unit_price: "1500.00", discount: "0.00", total: "1500.00" };
const quote = (over: Partial<Quote> = {}): Quote => ({
  items: [line],
  subtotal: "1500.00",
  discount: "0.00",
  total: "1500.00",
  coupon_code: "",
  currency: "NPR",
  ...over,
});
const methods: PaymentMethods = {
  methods: [
    { key: "khalti", label: "Khalti", kind: "gateway", min_amount: "10.00" },
    { key: "bank_transfer", label: "Bank transfer", kind: "manual", min_amount: "0.00" },
  ],
  bank_transfer_instructions: "<p>Account 123</p>",
  sandbox: false,
};

function routes(handlers: Record<string, (body: unknown) => unknown>) {
  post.mockImplementation((path: string, body: unknown) => {
    const handler = handlers[path];
    if (!handler) return Promise.reject(new Error(`unexpected POST ${path}`));
    try {
      return Promise.resolve(handler(body));
    } catch (err) {
      return Promise.reject(err);
    }
  });
}

describe("Checkout", () => {
  beforeEach(() => {
    get.mockReset().mockResolvedValue(methods);
    post.mockReset();
    push.mockReset();
    goToProvider.mockReset();
  });

  it("shows the server's prices and sends the learner to the gateway", async () => {
    const calls: unknown[] = [];
    routes({
      "/orders/quote/": () => quote(),
      "/orders/": (body) => {
        calls.push(body);
        return { number: "HX-1", status: "pending" };
      },
      "/payments/initiate/": (body) => {
        calls.push(body);
        return { payment: {}, action: { kind: "redirect", url: "https://khalti.example.test/pay", fields: {} } };
      },
    });
    render(<Checkout courseSlug="intro-python" />);
    expect(await screen.findByText("Intro to Python")).toBeInTheDocument();
    expect(screen.getByText("sale price")).toBeInTheDocument();
    await userEvent.click(await screen.findByRole("button", { name: /continue to payment/i }));
    await waitFor(() => expect(goToProvider).toHaveBeenCalledOnce());
    // Only identifiers go to the server; prices are never sent from the browser.
    expect(calls).toEqual([
      { courses: ["intro-python"], coupon_code: "" },
      { order: "HX-1", provider: "khalti" },
    ]);
  });

  it("opens the order page for a bank transfer", async () => {
    routes({
      "/orders/quote/": () => quote(),
      "/orders/": () => ({ number: "HX-2", status: "pending" }),
      "/payments/initiate/": () => ({ payment: {}, action: { kind: "none", url: "", fields: {} } }),
    });
    render(<Checkout courseSlug="intro-python" />);
    await userEvent.click(await screen.findByRole("radio", { name: /bank transfer/i }));
    expect(screen.getByText("Account 123")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /continue to bank transfer/i }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/dashboard/orders/HX-2?new=1"));
    expect(goToProvider).not.toHaveBeenCalled();
  });

  it("applies a coupon and shows the coupon error from the server", async () => {
    routes({
      "/orders/quote/": (body) => {
        const code = (body as { coupon_code?: string }).coupon_code;
        if (code === "BAD") throw new ApiError(400, "coupon_invalid", "This coupon code is not valid.");
        return code ? quote({ discount: "1500.00", total: "0.00", coupon_code: "FULL" }) : quote();
      },
      "/orders/": () => ({ number: "HX-3", status: "paid" }),
    });
    render(<Checkout courseSlug="intro-python" />);
    const box = await screen.findByLabelText("Coupon code");
    await userEvent.type(box, "BAD");
    await userEvent.click(screen.getByRole("button", { name: "Apply" }));
    expect(await screen.findByText("This coupon code is not valid.")).toBeInTheDocument();

    await userEvent.clear(box);
    await userEvent.type(box, "full");
    await userEvent.click(screen.getByRole("button", { name: "Apply" }));
    expect(await screen.findByText("FULL applied")).toBeInTheDocument();
    expect(screen.getByText("Nothing to pay")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /confirm enrollment/i }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/learn/intro-python"));
  });

  it("explains when the course cannot be bought", async () => {
    routes({
      "/orders/quote/": () => {
        throw new ApiError(409, "already_enrolled", "You are already enrolled in Intro to Python.");
      },
    });
    render(<Checkout courseSlug="intro-python" />);
    expect(await screen.findByText(/already enrolled/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to the course" })).toHaveAttribute("href", "/courses/intro-python");
  });

  it("disables gateways below their minimum amount", async () => {
    routes({ "/orders/quote/": () => quote({ subtotal: "5.00", total: "5.00", items: [{ ...line, list_price: "5.00", unit_price: "5.00", total: "5.00" }] }) });
    render(<Checkout courseSlug="intro-python" />);
    expect(await screen.findByRole("radio", { name: /khalti/i })).toBeDisabled();
    expect(screen.getByRole("radio", { name: /bank transfer/i })).toBeChecked();
  });
});
