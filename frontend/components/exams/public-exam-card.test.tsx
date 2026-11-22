import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { PublicExam } from "@/types/assessments";

import { ExamPrice, PublicExamCard } from "./public-exam-card";

const exam: PublicExam = {
  slug: "loksewa-mock", title: "Loksewa mock", summary: "", kind: "formal", kind_label: "Formal assessment", category: null,
  course: null, offer: "paid", price: "500.00", current_price: "350.00", sale_ends_at: "2026-12-01T00:00:00Z", is_free: false,
  duration_minutes: 60, question_total: 50, total_marks: "50.00", opens_at: null, closes_at: null, max_attempts: null,
  negative_marking: true,
}; // prettier-ignore

describe("ExamPrice", () => {
  it("shows the offer price with the actual price struck through", () => {
    render(<ExamPrice exam={exam} size="lg" />);
    expect(screen.getByText(/350/)).toBeInTheDocument();
    expect(screen.getByText(/500/)).toHaveClass("line-through");
    expect(screen.getByText(/Offer ends/)).toBeInTheDocument();
  });

  it("shows one price without an offer, and course exams as included", () => {
    const { rerender } = render(<ExamPrice exam={{ ...exam, current_price: "500.00", sale_ends_at: null }} />);
    expect(screen.getByText(/500/)).not.toHaveClass("line-through");
    rerender(<ExamPrice exam={{ ...exam, offer: "course" }} />);
    expect(screen.getByText("Included with the course")).toBeInTheDocument();
  });
});

describe("PublicExamCard", () => {
  it("labels an exam in a section with its category and section", () => {
    const category = { name: "Paper I", slug: "nrb-paper-1", parent: { name: "NRB", slug: "nrb" } };
    render(<PublicExamCard exam={{ ...exam, category }} />);
    expect(screen.getByText("NRB › Paper I")).toBeInTheDocument();
  });
});
