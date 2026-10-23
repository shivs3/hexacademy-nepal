import type { BadgeTone } from "@/components/ui/feedback";
import type { LearnerAssignment, SubmissionStatus } from "@/types/assignments";

/** File types the server accepts (it re-checks the content; this only filters the picker). */
export const SUBMISSION_ACCEPT =
  ".pdf,.png,.jpg,.jpeg,.gif,.zip,.docx,.pptx,.xlsx,.odt,.odp,.ods,.txt,.md,.csv,.json,.ipynb,.py,.r,.m,.c,.h,.cpp,.java,.js,.ts,.go,.rs,.sql,.tex";

export const SUBMISSION_BADGE: Record<SubmissionStatus, { label: string; tone: BadgeTone }> = {
  submitted: { label: "Awaiting review", tone: "teal" },
  returned: { label: "Revision requested", tone: "warning" },
  graded: { label: "Graded", tone: "success" },
};

/** One status line for a learner's row: what they should do next. */
export function learnerState(a: Pick<LearnerAssignment, "submission" | "can_submit" | "due_at">, now = Date.now()): {
  label: string;
  tone: BadgeTone;
} {
  const sub = a.submission;
  if (sub) return SUBMISSION_BADGE[sub.status];
  if (!a.can_submit) return { label: "Closed", tone: "neutral" };
  if (a.due_at && new Date(a.due_at).getTime() < now) return { label: "Overdue", tone: "danger" };
  return { label: "To do", tone: "navy" };
}
