/** Money fields are decimal strings ("1500.00"), never floats. */
export type Money = string;

export type OrderStatus = "pending" | "paid" | "cancelled" | "expired" | "partially_refunded" | "refunded";
export type PaymentProvider = "khalti" | "esewa" | "bank_transfer" | "sandbox";
export type PaymentStatus =
  | "initiated"
  | "pending"
  | "completed"
  | "failed"
  | "cancelled"
  | "expired"
  | "refunded"
  | "duplicate"
  | "mismatch";

export type PaymentMethod = { key: PaymentProvider; label: string; kind: "gateway" | "manual"; min_amount: Money };

export type PaymentMethods = { methods: PaymentMethod[]; bank_transfer_instructions: string; sandbox: boolean };

export type QuoteLine = { course_slug: string; title: string; list_price: Money; unit_price: Money; discount: Money; total: Money };

export type Quote = { items: QuoteLine[]; subtotal: Money; discount: Money; total: Money; coupon_code: string; currency: string };

export type MyPayment = {
  reference: string;
  provider: PaymentProvider;
  provider_label: string;
  status: PaymentStatus;
  status_label: string;
  amount: Money;
  created_at: string;
  verified_at: string | null;
  bank_reference: string;
  transferred_on: string | null;
  submitted_at: string | null;
  review_note: string;
};

export type MyOrder = {
  number: string;
  status: OrderStatus;
  status_label: string;
  currency: string;
  subtotal: Money;
  discount: Money;
  total: Money;
  refunded_amount: Money;
  coupon_code: string;
  created_at: string;
  expires_at: string | null;
  paid_at: string | null;
  can_pay: boolean;
  buyer_name: string;
  buyer_email: string;
  items: QuoteLine[];
  payments: MyPayment[];
};

export type PaymentAction = { kind: "redirect" | "form" | "none"; url: string; fields: Record<string, string> };

export type InitiateResult = { payment: MyPayment; action: PaymentAction };

export type VerifyResult = { payment: MyPayment; order: MyOrder };

export type SandboxCharge = { reference: string; order_number: string; amount: Money; status: string; items: string[] };

// --- Staff ---------------------------------------------------------------------------

export type Buyer = { id: number; full_name: string; email: string };

export type AdminOrder = {
  id: number;
  number: string;
  user: Buyer;
  status: OrderStatus;
  status_label: string;
  total: Money;
  refunded_amount: Money;
  coupon_code: string;
  created_at: string;
  paid_at: string | null;
  needs_review: boolean;
  review_reason: string;
  item_titles: string[];
  providers: PaymentProvider[];
};

export type PaymentEvent = {
  id: number;
  kind: string;
  kind_label: string;
  source: string;
  status_after: string;
  data: Record<string, unknown>;
  created_at: string;
};

export type AdminPayment = {
  id: number;
  reference: string;
  provider: PaymentProvider;
  provider_label: string;
  status: PaymentStatus;
  status_label: string;
  amount: Money;
  provider_reference: string;
  provider_transaction_id: string;
  provider_status: string;
  created_at: string;
  verified_at: string | null;
  last_checked_at: string | null;
  payer_name: string;
  bank_reference: string;
  transferred_on: string | null;
  payer_note: string;
  submitted_at: string | null;
  reviewed_by_name: string;
  reviewed_at: string | null;
  review_note: string;
  events: PaymentEvent[];
};

export type Refund = {
  id: number;
  amount: Money;
  reason: string;
  provider_reference: string;
  revoked_access: boolean;
  processed_by_name: string;
  created_at: string;
};

export type AdminOrderDetail = AdminOrder & {
  currency: string;
  subtotal: Money;
  discount: Money;
  expires_at: string | null;
  cancelled_at: string | null;
  refundable_amount: Money;
  items: QuoteLine[];
  payments: AdminPayment[];
  refunds: Refund[];
};

export type CouponKind = "percent" | "fixed";

export type Coupon = {
  id: number;
  code: string;
  description: string;
  kind: CouponKind;
  value: Money;
  max_discount: Money | null;
  min_subtotal: Money;
  starts_at: string | null;
  ends_at: string | null;
  max_redemptions: number | null;
  per_user_limit: number;
  is_active: boolean;
  courses: number[];
  course_details: { id: number; title: string; slug: string }[];
  redemption_count: number;
  created_at: string;
};

export type GatewayStatus = { key: string; label: string; configured: boolean };

export type PaymentSettings = {
  khalti_enabled: boolean;
  esewa_enabled: boolean;
  bank_transfer_enabled: boolean;
  bank_transfer_instructions: string;
  order_ttl_minutes: number;
  updated_at: string;
  gateways: GatewayStatus[];
};

export type RevenueBucket = { period: string; orders: number; gross: Money; refunds: Money; net: Money };
export type RevenueBreakdown = { key: string; label: string; orders: number; amount: Money };

export type RevenueReport = {
  start: string;
  end: string;
  group: "day" | "month";
  orders: number;
  gross: Money;
  refunds: Money;
  net: Money;
  series: RevenueBucket[];
  by_provider: RevenueBreakdown[];
  by_course: RevenueBreakdown[];
  needs_review: number;
  transfers_awaiting_review: number;
};
