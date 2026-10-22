"use client";

import { api } from "@/lib/api/client";
import { goToProvider } from "@/lib/commerce";
import type { InitiateResult, PaymentProvider } from "@/types/commerce";

/**
 * Starts a payment for an existing order. Gateways take the browser away;
 * a bank transfer returns so the caller can show the order page. The server
 * decides the amount; the browser only says which order and which method.
 */
export async function startPayment(orderNumber: string, provider: PaymentProvider): Promise<"left" | "manual"> {
  const result = await api.post<InitiateResult>("/payments/initiate/", { order: orderNumber, provider });
  if (result.action.kind === "none") return "manual";
  goToProvider(result.action);
  return "left";
}
