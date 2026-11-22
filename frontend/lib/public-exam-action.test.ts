import { describe, expect, it } from "vitest";

import type { LearnerExam, PublicExam } from "@/types/assessments";

import { publicExamAction } from "./assessments";

const base: PublicExam = {
  slug: "loksewa-mock",
  title: "Loksewa mock",
  summary: "",
  kind: "practice",
  kind_label: "Practice test",
  category: null,
  course: null,
  offer: "free",
  price: "0.00",
  current_price: "0.00",
  sale_ends_at: null,
  is_free: true,
  duration_minutes: 30,
  question_total: 20,
  total_marks: "20.00",
  opens_at: null,
  closes_at: null,
  max_attempts: null,
  negative_marking: false,
};
const course = { title: "Python basics", slug: "python-basics" };

function learner(availability: LearnerExam["availability"], extra: Partial<LearnerExam> = {}): LearnerExam {
  return {
    id: 1, slug: base.slug, title: base.title, kind: "practice", course: null, duration_minutes: 30, opens_at: null, closes_at: null,
    max_attempts: null, total_marks: "20.00", question_total: 20, availability, attempts_used: 0, open_attempt_id: null,
    price: "0.00", current_price: "0.00", sale_ends_at: null, is_free: true, has_access: true, ...extra,
  };
}

describe("publicExamAction", () => {
  it("asks visitors to sign in, keeping where they were going", () => {
    expect(publicExamAction(base, false, null)).toMatchObject({ label: "Sign in to start", href: "/login?next=%2Fdashboard%2Fexams%2Floksewa-mock" });
    const paid = publicExamAction({ ...base, offer: "paid", is_free: false, price: "300.00" }, false, null);
    expect(paid).toMatchObject({ label: "Request access", href: "/login?next=%2Fcheckout%3Fexam%3Dloksewa-mock" });
  });

  it("sends course-only exams to the course", () => {
    const exam = { ...base, offer: "course" as const, course };
    expect(publicExamAction(exam, false, null)).toMatchObject({ label: "View the course", href: "/courses/python-basics" });
    expect(publicExamAction(exam, true, null).href).toBe("/courses/python-basics");
    // Enrolled learners see it in their dashboard instead.
    expect(publicExamAction(exam, true, learner("available")).label).toBe("Start exam");
  });

  it("follows the learner's availability once signed in", () => {
    expect(publicExamAction(base, true, learner("available"))).toMatchObject({ label: "Start exam", href: "/dashboard/exams/loksewa-mock" });
    expect(publicExamAction(base, true, learner("in_progress", { open_attempt_id: 9 }))).toMatchObject({ label: "Resume exam", href: "/exam/9" });
    expect(publicExamAction(base, true, learner("no_attempts_left"))).toMatchObject({ label: "Open in your dashboard", note: "No attempts left." });
  });

  it("offers a request, and the course, for a paid exam sold separately", () => {
    const exam = { ...base, offer: "paid" as const, is_free: false, price: "150.00", course };
    const action = publicExamAction(exam, true, learner("not_purchased", { has_access: false, is_free: false }));
    expect(action).toMatchObject({ label: "Request access", href: "/checkout?exam=loksewa-mock", secondary: { label: "Python basics", href: "/courses/python-basics" } });
  });
});
