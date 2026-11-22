import { examCheckoutHref } from "@/lib/commerce";
import type {
  Availability,
  AttemptStatus,
  Difficulty,
  ExamKind,
  ExamOffer,
  ExamStatus,
  LearnerExam,
  PublicExam,
  QuestionKind,
  QuestionStatus,
  ResultRelease,
} from "@/types/assessments";

export const KIND_LABEL: Record<QuestionKind, string> = {
  single: "Single choice",
  multiple: "Multiple select",
  true_false: "True / false",
};

export const DIFFICULTY_LABEL: Record<Difficulty, string> = { easy: "Easy", medium: "Medium", hard: "Hard" };

export const QUESTION_STATUS: Record<QuestionStatus, { label: string; tone: "success" | "neutral" | "warning" }> = {
  active: { label: "Active", tone: "success" },
  draft: { label: "Draft", tone: "neutral" },
  retired: { label: "Retired", tone: "warning" },
};

export const EXAM_STATUS: Record<ExamStatus, { label: string; tone: "success" | "neutral" | "warning" }> = {
  published: { label: "Published", tone: "success" },
  draft: { label: "Draft", tone: "neutral" },
  closed: { label: "Closed", tone: "warning" },
};

export const EXAM_KIND_LABEL: Record<ExamKind, string> = { practice: "Practice test", formal: "Formal exam" };

export const RELEASE_LABEL: Record<ResultRelease, string> = {
  immediate: "As soon as the attempt ends",
  after_close: "When the exam closes",
  manual: "When staff publish them",
};

export const ATTEMPT_STATUS: Record<AttemptStatus, { label: string; tone: "teal" | "success" | "warning" }> = {
  in_progress: { label: "In progress", tone: "teal" },
  submitted: { label: "Submitted", tone: "success" },
  expired: { label: "Time ran out", tone: "warning" },
};

export const AVAILABILITY_TEXT: Record<Availability, string> = {
  available: "Ready to start",
  in_progress: "Attempt in progress",
  not_open: "Not open yet",
  closed: "Closed",
  not_enrolled: "Enroll in the course to take this exam",
  not_purchased: "Paid exam: request access to take it",
  email_unverified: "Verify your email to take this exam",
  no_attempts_left: "No attempts left",
};

/** A, B, C… for option labels. */
export function optionLetter(index: number): string {
  return String.fromCharCode(65 + index);
}

/** Next selection after clicking an option. Single-answer kinds replace; multiple-select toggles. */
export function toggleSelection(kind: QuestionKind, selected: number[], optionId: number): number[] {
  if (kind !== "multiple") return [optionId];
  const next = selected.includes(optionId) ? selected.filter((id) => id !== optionId) : [...selected, optionId];
  return next.sort((a, b) => a - b);
}

export function sameSelection(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false;
  const sa = [...a].sort((x, y) => x - y);
  const sb = [...b].sort((x, y) => x - y);
  return sa.every((v, i) => v === sb[i]);
}

/**
 * Difference between the server clock and this device's clock, in ms. The
 * countdown uses the server deadline shifted by this offset, so a wrong device
 * clock changes nothing; the backend enforces the deadline regardless.
 */
export function clockOffset(serverTime: string, receivedAt: number = Date.now()): number {
  const server = Date.parse(serverTime);
  return Number.isNaN(server) ? 0 : server - receivedAt;
}

export function remainingMs(deadline: string, offset: number, now: number = Date.now()): number {
  return Math.max(0, Date.parse(deadline) - (now + offset));
}

/** 1:05:09 or 05:09. */
export function formatClock(ms: number): string {
  const total = Math.ceil(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

/** "1 h 5 min", "12 min 30 s", "45 s". */
export function formatDuration(seconds: number | null | undefined): string {
  if (seconds == null) return "—";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return m ? `${h} h ${m} min` : `${h} h`;
  if (m > 0) return s ? `${m} min ${s} s` : `${m} min`;
  return `${s} s`;
}

/** Marks without trailing zeros: "1.00" → "1", "0.50" → "0.5", "-1.25" → "-1.25". */
export function formatMarks(value: string | null | undefined): string {
  if (value == null || value === "") return "—";
  if (!/^-?\d+(\.\d+)?$/.test(value)) return value;
  return value.includes(".") ? value.replace(/\.?0+$/, "") : value;
}

export function attemptsLeftText(maxAttempts: number | null, used: number): string {
  if (maxAttempts == null) return "Unlimited attempts";
  const left = Math.max(0, maxAttempts - used);
  return `${left} of ${maxAttempts} attempt${maxAttempts === 1 ? "" : "s"} left`;
}

export const EXAM_OFFER_LABEL: Record<ExamOffer, string> = {
  free: "Free",
  paid: "Paid",
  course: "With a course",
};

export type ExamAction = { label: string; href: string; note?: string; secondary?: { label: string; href: string } };

function signIn(next: string): string {
  return `/login?next=${encodeURIComponent(next)}`;
}

/**
 * The one call to action on a public exam page. `learner` is the signed-in
 * learner's view of the exam (null when signed out or not offered to them).
 * The backend still decides whether an attempt may start.
 */
export function publicExamAction(exam: PublicExam, signedIn: boolean, learner: LearnerExam | null): ExamAction {
  const page = `/dashboard/exams/${encodeURIComponent(exam.slug)}`;
  const course = exam.course ? { label: exam.course.title, href: `/courses/${encodeURIComponent(exam.course.slug)}` } : undefined;
  if (exam.offer === "course" && !learner) {
    return { label: "View the course", href: course?.href ?? "/courses", note: "This exam is included with its course. Enroll in the course to take it." };
  }
  if (!signedIn) {
    if (exam.offer === "paid") {
      return { label: "Request access", href: signIn(examCheckoutHref(exam.slug)), note: "Sign in, then send a request. We add the exam to your account once your payment is confirmed.", secondary: course };
    }
    return { label: "Sign in to start", href: signIn(page), note: "Free to take with a Hexacademy account." };
  }
  if (!learner) return { label: "Open in your dashboard", href: page };
  switch (learner.availability) {
    case "available":
      return { label: "Start exam", href: page, note: "You'll see the rules before the timer starts." };
    case "in_progress":
      return { label: "Resume exam", href: learner.open_attempt_id ? `/exam/${learner.open_attempt_id}` : page };
    case "not_purchased":
      return { label: "Request access", href: examCheckoutHref(exam.slug), note: "We add the exam to your account once your payment is confirmed.", secondary: course };
    case "not_enrolled":
      return { label: "View the course", href: course?.href ?? "/courses", note: AVAILABILITY_TEXT.not_enrolled + "." };
    default:
      return { label: "Open in your dashboard", href: page, note: AVAILABILITY_TEXT[learner.availability] + "." };
  }
}
