import { describe, expect, it, vi } from "vitest";

import type { MyPayment } from "@/types/commerce";

import { checkoutHref, compareMoney, goToProvider, isUnsettled, openTransfer, transferUnderReview } from "./commerce";

const payment = (over: Partial<MyPayment>): MyPayment => ({
  reference: "PAY-1",
  provider: "bank_transfer",
  provider_label: "Bank transfer",
  status: "pending",
  status_label: "Pending",
  amount: "1500.00",
  created_at: "2026-10-20T10:00:00Z",
  verified_at: null,
  bank_reference: "",
  transferred_on: null,
  submitted_at: null,
  review_note: "",
  ...over,
});

describe("commerce helpers", () => {
  it("compares money exactly without floats", () => {
    expect(compareMoney("10.00", "10")).toBe(0);
    expect(compareMoney("1500.00", "999.99")).toBeGreaterThan(0);
    expect(compareMoney("0.10", "0.2")).toBeLessThan(0);
  });

  it("treats only initiated and pending payments as unsettled", () => {
    expect(isUnsettled("initiated")).toBe(true);
    expect(isUnsettled("pending")).toBe(true);
    expect(isUnsettled("completed")).toBe(false);
    expect(isUnsettled("mismatch")).toBe(false);
  });

  it("separates a transfer still to report from one under review", () => {
    const open = { payments: [payment({})] };
    const sent = { payments: [payment({ submitted_at: "2026-10-20T11:00:00Z", bank_reference: "TXN-1" })] };
    expect(openTransfer(open)?.reference).toBe("PAY-1");
    expect(transferUnderReview(open)).toBeNull();
    expect(openTransfer(sent)).toBeNull();
    expect(transferUnderReview(sent)?.bank_reference).toBe("TXN-1");
    expect(openTransfer({ payments: [payment({ provider: "khalti" })] })).toBeNull();
  });

  it("encodes the course in the checkout link", () => {
    expect(checkoutHref("a b&c")).toBe("/checkout?course=a%20b%26c");
  });

  it("posts form providers with the server-signed fields as hidden inputs", () => {
    const submit = vi.spyOn(HTMLFormElement.prototype, "submit").mockImplementation(() => {});
    goToProvider({ kind: "form", url: "https://pay.example.test/form", fields: { amount: "1500", signature: "abc=" } });
    const form = document.body.querySelector("form");
    expect(form?.method).toBe("post");
    expect(form?.action).toBe("https://pay.example.test/form");
    const inputs = Array.from(form?.querySelectorAll("input") ?? []).map((i) => [i.name, i.value, i.type]);
    expect(inputs).toEqual([
      ["amount", "1500", "hidden"],
      ["signature", "abc=", "hidden"],
    ]);
    expect(submit).toHaveBeenCalledOnce();
    form?.remove();
    submit.mockRestore();
  });

  it("does nothing for manual methods", () => {
    goToProvider({ kind: "none", url: "", fields: {} });
    expect(document.body.querySelector("form")).toBeNull();
  });
});
