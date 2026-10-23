"use client";

import { Paperclip } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Alert, Badge } from "@/components/ui/feedback";
import { Field } from "@/components/ui/field";
import { Input, Textarea } from "@/components/ui/input";
import { api } from "@/lib/api/client";
import { errorMessage, isApiError } from "@/lib/api/errors";
import { SUBMISSION_BADGE } from "@/lib/assignments";
import { formatBytes, formatDateTime } from "@/lib/utils";
import type { AdminSubmission } from "@/types/assignments";

type Outcome = "graded" | "returned";

/** Review one learner's work: award points, or return it with feedback so they can resubmit. */
export function GradeDialog({
  submission,
  maxPoints,
  onClose,
  onSaved,
}: {
  submission: AdminSubmission;
  maxPoints: number;
  onClose: () => void;
  onSaved: (s: AdminSubmission, outcome: Outcome) => void;
}) {
  const [points, setPoints] = useState(submission.points != null ? String(submission.points) : "");
  const [feedback, setFeedback] = useState(submission.feedback);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState<Outcome | null>(null);
  const badge = SUBMISSION_BADGE[submission.status];

  async function send(outcome: Outcome) {
    const e: Record<string, string> = {};
    if (outcome === "graded") {
      if (!/^\d+$/.test(points)) e.points = "Enter the points awarded.";
      else if (Number(points) > maxPoints) e.points = `At most ${maxPoints}.`;
    } else if (!feedback.trim()) {
      e.feedback = "Tell the learner what to change.";
    }
    setErrors(e);
    setFormError(null);
    if (Object.keys(e).length) return;
    setSaving(outcome);
    try {
      const saved = await api.post<AdminSubmission>(`/admin/learning/submissions/${submission.id}/grade/`, {
        outcome,
        points: outcome === "graded" ? Number(points) : null,
        feedback: feedback.trim(),
      });
      onSaved(saved, outcome);
    } catch (err) {
      const fields = isApiError(err) ? err.fieldErrors() : {};
      setErrors(fields);
      setFormError(Object.keys(fields).length ? null : errorMessage(err));
      setSaving(null);
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && !saving && onClose()}
      title={submission.user.full_name || submission.user.email}
      description={`Attempt ${submission.attempt}, submitted ${formatDateTime(submission.submitted_at)}`}
      className="max-w-2xl"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={Boolean(saving)}>
            Close
          </Button>
          <Button variant="outline" onClick={() => send("returned")} loading={saving === "returned"} disabled={Boolean(saving)}>
            Return for revision
          </Button>
          <Button onClick={() => send("graded")} loading={saving === "graded"} disabled={Boolean(saving)}>
            {submission.status === "graded" ? "Update grade" : "Save grade"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4 text-sm">
        {formError && <Alert tone="danger">{formError}</Alert>}
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={badge.tone}>{badge.label}</Badge>
          {submission.is_late && <Badge tone="warning">Late</Badge>}
          <span className="text-muted">{submission.user.email}</span>
        </div>
        {submission.text ? (
          <div className="max-h-80 overflow-y-auto whitespace-pre-wrap rounded-md border border-line bg-page p-3">{submission.text}</div>
        ) : (
          <p className="text-muted">No written answer.</p>
        )}
        {submission.has_file && (
          <p className="flex items-center gap-2">
            <Paperclip className="h-4 w-4 text-muted" aria-hidden="true" />
            <a className="text-teal-700 underline" href={`/api/v1/admin/learning/submissions/${submission.id}/file/`}>
              {submission.original_name || "Download file"}
            </a>
            <span className="text-muted">({formatBytes(submission.size_bytes)})</span>
          </p>
        )}
        <div className="grid gap-4 sm:grid-cols-[10rem_1fr]">
          <Field label={`Points (of ${maxPoints})`} htmlFor="grade-points" error={errors.points}>
            <Input inputMode="numeric" value={points} onChange={(e) => setPoints(e.target.value.trim())} />
          </Field>
          <Field label="Feedback" htmlFor="grade-feedback" error={errors.feedback} hint="The learner sees this. Required when returning work.">
            <Textarea rows={4} maxLength={5000} value={feedback} onChange={(e) => setFeedback(e.target.value)} />
          </Field>
        </div>
      </div>
    </Dialog>
  );
}
