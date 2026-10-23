"use client";

import { Paperclip, X } from "lucide-react";
import { useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/feedback";
import { Field } from "@/components/ui/field";
import { Checkbox, Label, Textarea } from "@/components/ui/input";
import { api } from "@/lib/api/client";
import { errorMessage, isApiError } from "@/lib/api/errors";
import { SUBMISSION_ACCEPT } from "@/lib/assignments";
import { formatBytes } from "@/lib/utils";
import type { LearnerAssignmentDetail, MySubmission } from "@/types/assignments";

const MAX_TEXT = 20000;

/** Create or replace the learner's submission (multipart, so a file can travel with the text). */
export function SubmitForm({ assignment, onSaved }: { assignment: LearnerAssignmentDetail; onSaved: (s: MySubmission) => void }) {
  const current = assignment.submission;
  const [text, setText] = useState(current?.text ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [removeFile, setRemoveFile] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const keepsFile = Boolean(current?.has_file) && !removeFile && !file;
  const empty = !text.trim() && !file && !keepsFile;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (empty) {
      setErrors({ [assignment.accepts_text ? "text" : "file"]: "Write an answer or attach a file." });
      return;
    }
    setErrors({});
    const form = new FormData();
    if (assignment.accepts_text) form.append("text", text);
    if (file) form.append("file", file);
    if (removeFile && !file) form.append("remove_file", "true");
    setSaving(true);
    try {
      const saved = await api.post<MySubmission>(`/assignments/${assignment.id}/submission/`, form);
      setFile(null);
      setRemoveFile(false);
      if (fileInput.current) fileInput.current.value = "";
      onSaved(saved);
    } catch (err) {
      const fields = isApiError(err) ? err.fieldErrors() : {};
      setErrors(fields);
      setFormError(Object.keys(fields).length ? null : errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      {formError && <Alert tone="danger">{formError}</Alert>}
      {assignment.accepts_text && (
        <Field label="Your answer" htmlFor="submission-text" error={errors.text} hint={`${text.length.toLocaleString()} / ${MAX_TEXT.toLocaleString()} characters`}>
          <Textarea rows={8} maxLength={MAX_TEXT} value={text} onChange={(e) => setText(e.target.value)} />
        </Field>
      )}
      {assignment.accepts_file && (
        <div className="flex flex-col gap-2">
          {keepsFile && current && (
            <p className="flex items-center gap-2 text-sm">
              <Paperclip className="h-4 w-4 text-muted" aria-hidden="true" />
              <span className="text-muted">Current file:</span>
              <a className="text-teal-700 underline" href={`/api/v1/assignments/${assignment.id}/submission/file/`}>
                {current.original_name || "Submitted file"}
              </a>
              <span className="text-muted">({formatBytes(current.size_bytes)})</span>
            </p>
          )}
          <Field
            label={current?.has_file ? "Replace file" : "File"}
            htmlFor="submission-file"
            error={errors.file}
            hint="PDF, images, Office documents, ZIP or source code. The size limit is set by the academy."
          >
            <input
              ref={fileInput}
              type="file"
              accept={SUBMISSION_ACCEPT}
              className="text-sm file:mr-3 file:rounded-md file:border file:border-line file:bg-white file:px-3 file:py-1.5 file:text-sm file:font-medium"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </Field>
          {file && (
            <p className="flex items-center gap-2 text-sm text-muted">
              Selected: {file.name} ({formatBytes(file.size)})
              <button
                type="button"
                className="rounded p-0.5 hover:bg-page"
                aria-label="Clear selected file"
                onClick={() => {
                  setFile(null);
                  if (fileInput.current) fileInput.current.value = "";
                }}
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </p>
          )}
          {current?.has_file && !file && assignment.accepts_text && (
            <div className="flex items-center gap-2">
              <Checkbox id="submission-remove-file" checked={removeFile} onChange={(e) => setRemoveFile(e.target.checked)} />
              <Label htmlFor="submission-remove-file" className="font-normal">
                Remove the current file
              </Label>
            </div>
          )}
        </div>
      )}
      <div>
        <Button type="submit" loading={saving}>
          {current ? "Submit again" : "Submit"}
        </Button>
      </div>
    </form>
  );
}
