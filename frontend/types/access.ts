/** Access requests (the checkout form) and staff control of each learner's access. */

export type AccessRequestStatus = "pending" | "approved" | "rejected" | "cancelled";
export type AccessRequestKind = "course" | "exam";

export type MyAccessRequest = {
  number: string;
  kind: AccessRequestKind;
  item_title: string;
  item_slug: string;
  price: string;
  full_name: string;
  phone: string;
  payment_reference: string;
  message: string;
  status: AccessRequestStatus;
  status_label: string;
  staff_note: string;
  created_at: string;
  handled_at: string | null;
};

export type CheckoutItem = {
  kind: AccessRequestKind;
  slug: string;
  title: string;
  price: string;
  pending_request: MyAccessRequest | null;
  /** Sanitised rich text set by staff: how to pay. */
  instructions: string;
};

export type AdminAccessRequest = {
  id: number;
  number: string;
  user: { id: number; full_name: string; email: string };
  kind: AccessRequestKind;
  item_id: number | null;
  item_title: string;
  price: string;
  full_name: string;
  phone: string;
  payment_reference: string;
  message: string;
  status: AccessRequestStatus;
  status_label: string;
  staff_note: string;
  handled_by_name: string;
  handled_at: string | null;
  created_at: string;
};

export type AccessEnrollment = {
  id: number;
  course_id: number;
  course_title: string;
  course_slug: string;
  status: "active" | "revoked";
  source: "free" | "purchase" | "admin";
  enrolled_at: string;
  revoked_at: string | null;
  completed_at: string | null;
  granted_by_name: string;
};

export type AccessExam = {
  id: number;
  exam_id: number;
  exam_title: string;
  exam_price: string;
  status: "active" | "revoked";
  source: "request" | "staff";
  granted_at: string;
  revoked_at: string | null;
  granted_by_name: string;
};

export type AccessBatch = { id: number; batch_id: number; batch_name: string; course_title: string; created_at: string };

export type UserAccess = {
  user: { id: number; full_name: string; email: string; is_active: boolean; email_verified: boolean; date_joined: string };
  enrollments: AccessEnrollment[];
  exam_access: AccessExam[];
  batches: AccessBatch[];
  requests: AdminAccessRequest[];
};

export type AccessOption = { id: number; title: string; price: string; detail: string };
export type AccessOptions = { courses: AccessOption[]; exams: AccessOption[]; batches: AccessOption[] };
