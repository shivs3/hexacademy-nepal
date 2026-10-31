"use client";

import { FileDown } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Alert } from "@/components/ui/feedback";
import { Field } from "@/components/ui/field";
import { Select } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { api } from "@/lib/api/client";
import { errorMessage } from "@/lib/api/errors";
import type { CourseOption, ImportReport } from "@/types/assessments";

const TEMPLATE_COLUMNS = [
  "subject",
  "topic",
  "kind",
  "difficulty",
  "question",
  "option_a",
  "option_b",
  "option_c",
  "option_d",
  "option_e",
  "option_f",
  "option_g",
  "option_h",
  "correct",
  "explanation",
  "marks",
  "negative_marks",
  "tags",
  "status",
];

const TEMPLATE_ROWS = [
  ["Physics", "Kinematics", "single", "easy", "A car covers 100 m in 5 s. What is its average speed?", "10 m/s", "20 m/s", "25 m/s", "50 m/s", "", "", "", "", "B", "Speed = distance / time = 100 / 5.", "1", "0.25", "demo;speed", "draft"],
  ["Mathematics", "", "true_false", "medium", "The derivative of \\(x^2\\) is \\(2x\\).", "", "", "", "", "", "", "", "", "true", "", "1", "0", "demo", "draft"],
];

function csvCell(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function downloadTemplate() {
  const lines = [TEMPLATE_COLUMNS, ...TEMPLATE_ROWS].map((row) => row.map(csvCell).join(","));
  const blob = new Blob([lines.join("\n") + "\n"], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "question-import-template.csv";
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Bank import. With `examId`, the questions also go straight into that draft exam
 * (and its course), so a whole model test can be loaded from one file.
 */
export function ImportDialog({
  manager = false,
  courses = [],
  examId,
  onClose,
  onImported,
}: {
  manager?: boolean;
  courses?: CourseOption[];
  examId?: number;
  onClose: () => void;
  onImported: () => void;
}) {
  const forExam = examId !== undefined;
  const toast = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [course, setCourse] = useState("");
  const [report, setReport] = useState<ImportReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const needsCourse = !forExam && !manager && !course;

  async function send(dryRun: boolean) {
    if (!file) return;
    setBusy(true);
    setError(null);
    const body = new FormData();
    body.append("file", file);
    body.append("dry_run", dryRun ? "true" : "false");
    if (course && !forExam) body.append("course", course);
    try {
      const endpoint = forExam ? `/admin/assessments/exams/${examId}/import-questions/` : "/admin/assessments/questions/import/";
      const result = await api.post<ImportReport>(endpoint, body);
      setReport(result);
      if (!dryRun && result.created > 0) {
        toast.success(`Imported ${result.created} question${result.created === 1 ? "" : "s"}${forExam ? " into the exam" : ""}.`);
        onImported();
      }
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const ready = report?.dry_run && report.errors.length === 0 && report.valid > 0;

  return (
    <Dialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={forExam ? "Import questions into this exam" : "Import questions"}
      description={
        forExam
          ? "CSV or Excel (.xlsx). Each question is saved to the question bank and added to the end of this exam. Nothing is saved until you confirm the checked file."
          : "CSV or Excel (.xlsx), up to 2,000 rows. Nothing is saved until you confirm the checked file."
      }
      className="max-w-2xl"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          {ready ? (
            <Button loading={busy} onClick={() => send(false)}>
              Import {report.valid} question{report.valid === 1 ? "" : "s"}
            </Button>
          ) : (
            <Button loading={busy} disabled={!file || needsCourse} onClick={() => send(true)}>
              Check file
            </Button>
          )}
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <p className="text-sm text-muted">
          Columns: subject, topic, kind (single, multiple or true_false), difficulty, question, option_a–option_h, correct (letters such as B or A,C; true/false for true/false
          questions), explanation, marks, negative_marks, tags (separated by ;) and status. Write maths as \( … \) or $$ … $$.
          {forExam && " Leave status blank to mark questions ready; the exam uses each row’s marks and negative marks."}
        </p>
        <Button variant="outline" size="sm" className="self-start" onClick={downloadTemplate}>
          <FileDown className="h-4 w-4" aria-hidden="true" />
          Download template
        </Button>
        <Field label="File" htmlFor="import-file" required>
          <input
            id="import-file"
            type="file"
            accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="block w-full text-sm file:mr-3 file:rounded-md file:border file:border-line file:bg-white file:px-3 file:py-1.5 file:text-sm"
            onChange={(e) => {
              setFile(e.target.files?.[0] ?? null);
              setReport(null);
            }}
          />
        </Field>
        {!forExam && (
          <Field label="Course" htmlFor="import-course" required={!manager} hint={manager ? "Leave as shared to add to the bank every course can use." : "Imported questions belong to this course."}>
            <Select
              id="import-course"
              value={course}
              onChange={(e) => {
                setCourse(e.target.value);
                setReport(null);
              }}
            >
              <option value="">{manager ? "Shared bank" : "Choose a course"}</option>
              {courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title}
                </option>
              ))}
            </Select>
          </Field>
        )}

        {error && <Alert tone="danger">{error}</Alert>}

        {report && (
          <div className="flex flex-col gap-2" aria-live="polite">
            {report.dry_run ? (
              report.errors.length === 0 ? (
                <Alert tone="success" title="File checked">
                  {report.valid} of {report.rows} rows are ready to import.
                </Alert>
              ) : (
                <Alert tone="warning" title={`${report.errors.length} problem${report.errors.length === 1 ? "" : "s"} found`}>
                  Fix these rows and check the file again. Nothing has been saved.
                </Alert>
              )
            ) : (
              <Alert tone="success" title="Import complete">
                {report.created} question{report.created === 1 ? "" : "s"} saved{forExam ? " to the bank and added to the exam" : ""}.
              </Alert>
            )}
            {report.errors.length > 0 && (
              <div className="max-h-60 overflow-auto rounded-md border border-line">
                <table className="w-full text-left text-sm">
                  <thead className="sticky top-0 bg-page text-xs uppercase text-muted">
                    <tr>
                      <th scope="col" className="px-3 py-2">Row</th>
                      <th scope="col" className="px-3 py-2">Column</th>
                      <th scope="col" className="px-3 py-2">Problem</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {report.errors.map((e, i) => (
                      <tr key={i}>
                        <td className="px-3 py-2 tabular-nums">{e.row}</td>
                        <td className="px-3 py-2">{e.field || "—"}</td>
                        <td className="px-3 py-2">{e.message}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </Dialog>
  );
}
