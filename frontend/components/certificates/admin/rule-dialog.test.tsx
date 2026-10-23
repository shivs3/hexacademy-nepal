import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const post = vi.fn();
const patch = vi.fn();
vi.mock("@/lib/api/client", () => ({
  api: { post: (...args: unknown[]) => post(...args), patch: (...args: unknown[]) => patch(...args) },
}));

import type { CertificateCourseOption, CertificateTemplate } from "@/types/certificates";

import { RuleDialog } from "./rule-dialog";

const templates = [{ id: 5, name: "Standard" }] as CertificateTemplate[];
const courses: CertificateCourseOption[] = [
  {
    id: 1,
    title: "Python",
    slug: "python",
    status: "published",
    has_rule: false,
    exams: [{ id: 9, title: "Final", status: "published", pass_marks: "40.00" }],
  },
  { id: 2, title: "Taken", slug: "taken", status: "published", has_rule: true, exams: [] },
];

describe("RuleDialog", () => {
  beforeEach(() => {
    post.mockReset();
    patch.mockReset();
  });

  it("offers only courses without a rule and that course's exams", async () => {
    post.mockResolvedValue({ id: 1 });
    const onSaved = vi.fn();
    render(<RuleDialog rule={null} courses={courses} templates={templates} onClose={() => {}} onSaved={onSaved} />);
    const user = userEvent.setup();
    expect(screen.queryByRole("option", { name: "Taken" })).not.toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText(/^Course/), "1");
    await user.selectOptions(screen.getByLabelText(/^Pass an exam/), "9");
    await user.click(screen.getByRole("button", { name: "Save rule" }));
    expect(post).toHaveBeenCalledWith("/admin/certificates/rules/", {
      course: 1,
      template: 5,
      is_enabled: true,
      require_lessons: true,
      required_exam: 9,
      require_assignments: false,
    });
    expect(onSaved).toHaveBeenCalled();
  });

  it("refuses to enable a rule with no requirements", async () => {
    render(<RuleDialog rule={null} courses={courses} templates={templates} onClose={() => {}} onSaved={() => {}} />);
    const user = userEvent.setup();
    await user.selectOptions(screen.getByLabelText(/^Course/), "1");
    await user.click(screen.getByLabelText("Complete every published lesson"));
    await user.click(screen.getByRole("button", { name: "Save rule" }));
    expect(screen.getByText("Choose at least one requirement before enabling certificates.")).toBeInTheDocument();
    expect(post).not.toHaveBeenCalled();
  });
});
