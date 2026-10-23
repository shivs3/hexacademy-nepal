"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Alert } from "@/components/ui/feedback";
import { Field } from "@/components/ui/field";
import { Checkbox, Label, Select } from "@/components/ui/input";
import { api } from "@/lib/api/client";
import { errorMessage, isApiError } from "@/lib/api/errors";
import type { CertificateCourseOption, CertificateRule, CertificateTemplate } from "@/types/certificates";

interface Props {
  rule: CertificateRule | null;
  courses: CertificateCourseOption[];
  templates: CertificateTemplate[];
  onClose: () => void;
  onSaved: (rule: CertificateRule) => void;
}

/** Which course, which template and what the learner must achieve. The server re-validates every choice. */
export function RuleDialog({ rule, courses, templates, onClose, onSaved }: Props) {
  const available = rule ? courses : courses.filter((c) => !c.has_rule);
  const [course, setCourse] = useState(rule ? String(rule.course.id) : "");
  const [template, setTemplate] = useState(rule ? String(rule.template) : templates.length === 1 ? String(templates[0].id) : "");
  const [enabled, setEnabled] = useState(rule?.is_enabled ?? true);
  const [lessons, setLessons] = useState(rule?.require_lessons ?? true);
  const [exam, setExam] = useState(rule?.required_exam ? String(rule.required_exam.id) : "");
  const [assignments, setAssignments] = useState(rule?.require_assignments ?? false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const exams = courses.find((c) => String(c.id) === course)?.exams ?? [];

  async function save() {
    const e: Record<string, string> = {};
    if (!course) e.course = "Choose a course.";
    if (!template) e.template = "Choose a template.";
    if (enabled && !lessons && !exam && !assignments) e.is_enabled = "Choose at least one requirement before enabling certificates.";
    setErrors(e);
    setFormError(null);
    if (Object.keys(e).length) return;
    const body = {
      template: Number(template),
      is_enabled: enabled,
      require_lessons: lessons,
      required_exam: exam ? Number(exam) : null,
      require_assignments: assignments,
    };
    setSaving(true);
    try {
      const saved = rule
        ? await api.patch<CertificateRule>(`/admin/certificates/rules/${rule.id}/`, body)
        : await api.post<CertificateRule>("/admin/certificates/rules/", {
            ...body,
            course: Number(course),
          });
      onSaved(saved);
    } catch (err) {
      const fields = isApiError(err) ? err.fieldErrors() : {};
      setErrors(fields);
      setFormError(Object.keys(fields).length ? null : errorMessage(err));
      setSaving(false);
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && !saving && onClose()}
      title={rule ? `Certificate rule: ${rule.course.title}` : "Offer a certificate for a course"}
      description="Certificates are issued automatically once the server sees every requirement met."
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={save} loading={saving}>
            Save rule
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {formError && <Alert tone="danger">{formError}</Alert>}
        {!rule && (
          <Field label="Course" htmlFor="rule-course" error={errors.course} required>
            <Select
              value={course}
              onChange={(e) => {
                setCourse(e.target.value);
                setExam("");
              }}
            >
              <option value="">Choose a course</option>
              {available.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title}
                  {c.status === "draft" ? " (draft)" : ""}
                </option>
              ))}
            </Select>
          </Field>
        )}
        <Field label="Template" htmlFor="rule-template" error={errors.template} required>
          <Select value={template} onChange={(e) => setTemplate(e.target.value)}>
            <option value="">Choose a template</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </Select>
        </Field>
        <fieldset className="flex flex-col gap-3">
          <legend className="mb-1 text-sm font-medium text-navy">Requirements</legend>
          <div className="flex items-center gap-2">
            <Checkbox id="rule-lessons" checked={lessons} onChange={(e) => setLessons(e.target.checked)} />
            <Label htmlFor="rule-lessons" className="font-normal">
              Complete every published lesson
            </Label>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox id="rule-assignments" checked={assignments} onChange={(e) => setAssignments(e.target.checked)} />
            <Label htmlFor="rule-assignments" className="font-normal">
              Have every published assignment graded
            </Label>
          </div>
          <Field
            label="Pass an exam"
            htmlFor="rule-exam"
            error={errors.required_exam}
            hint={
              course && exams.length === 0
                ? "This course has no published exam with a pass mark."
                : "Counts once the result is released to the learner."
            }
          >
            <Select value={exam} onChange={(e) => setExam(e.target.value)} disabled={!course}>
              <option value="">No exam required</option>
              {exams.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.title} (pass mark {x.pass_marks})
                </option>
              ))}
            </Select>
          </Field>
        </fieldset>
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <Checkbox id="rule-enabled" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
            <Label htmlFor="rule-enabled" className="font-normal">
              Issue certificates for this course
            </Label>
          </div>
          {errors.is_enabled && <p className="text-xs text-danger">{errors.is_enabled}</p>}
        </div>
      </div>
    </Dialog>
  );
}
