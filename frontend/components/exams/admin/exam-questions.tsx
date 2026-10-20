"use client";

import { ArrowDown, ArrowUp, FileQuestionMark, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { LoadError, TableSkeleton } from "@/components/cms/admin/list-parts";
import { RichText } from "@/components/cms/rich-text";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { Alert, Badge, EmptyState } from "@/components/ui/feedback";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { useApiResource } from "@/hooks/use-api-resource";
import { useUnsavedWarning } from "@/hooks/use-unsaved-warning";
import { api } from "@/lib/api/client";
import { errorMessage } from "@/lib/api/errors";
import { KIND_LABEL, QUESTION_STATUS, formatMarks } from "@/lib/assessments";
import type { AdminExam, AdminQuestionSummary, ExamQuestionLink } from "@/types/assessments";

import { QuestionPicker } from "./question-picker";

type Row = { question: AdminQuestionSummary; marks: string; negative_marks: string };

const toRows = (links: ExamQuestionLink[]): Row[] => links.map((l) => ({ question: l.question, marks: l.marks, negative_marks: l.negative_marks }));
const sameRows = (a: Row[], b: Row[]) =>
  a.length === b.length && a.every((r, i) => r.question.id === b[i].question.id && r.marks === b[i].marks && r.negative_marks === b[i].negative_marks);

export function ExamQuestions({ exam, onChanged }: { exam: AdminExam; onChanged: () => void }) {
  const toast = useToast();
  const { data, error, reload, setData } = useApiResource<ExamQuestionLink[]>(`/admin/assessments/exams/${exam.id}/questions/`);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [syncedFrom, setSyncedFrom] = useState<ExamQuestionLink[] | null>(null);
  const [picking, setPicking] = useState(false);
  const [saving, setSaving] = useState(false);

  if (data && data !== syncedFrom) {
    setSyncedFrom(data);
    setRows(toRows(data));
  }

  const editable = exam.abilities.structure;
  const dirty = Boolean(rows && data && !sameRows(rows, toRows(data)));
  useUnsavedWarning(dirty);

  if (error) return <LoadError message={error} onRetry={reload} />;
  if (!rows) return <TableSkeleton />;

  function move(index: number, delta: number) {
    if (!rows) return;
    const next = [...rows];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    setRows(next);
  }

  function patch(index: number, change: Partial<Row>) {
    setRows((r) => r && r.map((row, i) => (i === index ? { ...row, ...change } : row)));
  }

  async function save() {
    if (!rows) return;
    setSaving(true);
    try {
      const saved = await api.put<ExamQuestionLink[]>(`/admin/assessments/exams/${exam.id}/questions/`, {
        questions: rows.map((r) => ({ question: r.question.id, marks: r.marks.trim() || null, negative_marks: r.negative_marks.trim() || null })),
      });
      setData(saved);
      toast.success("Question list saved.");
      onChanged();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  const total = rows.reduce((sum, r) => sum + (Number(r.marks) || 0), 0);

  return (
    <div className="flex flex-col gap-4">
      {!editable && exam.abilities.edit && <Alert tone="info">The question list is locked because the exam is {exam.status}.</Alert>}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted">
          {rows.length} question{rows.length === 1 ? "" : "s"} · {formatMarks(total.toFixed(2))} marks in total
          {exam.question_count != null && exam.question_count < rows.length && ` · each learner gets ${exam.question_count} at random`}
        </p>
        {editable && (
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setPicking(true)}>
              <Plus className="h-4 w-4" aria-hidden="true" />
              Add questions
            </Button>
            <Button onClick={save} loading={saving} disabled={!dirty}>
              Save list
            </Button>
          </div>
        )}
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={FileQuestionMark}
          title="No questions yet"
          description={editable ? "Add questions from the bank. You can set marks for this exam without changing the question." : undefined}
          action={
            editable ? (
              <Button onClick={() => setPicking(true)}>
                <Plus className="h-4 w-4" aria-hidden="true" />
                Add questions
              </Button>
            ) : undefined
          }
        />
      ) : (
        <ol className="flex flex-col gap-3">
          {rows.map((row, i) => {
            const status = QUESTION_STATUS[row.question.status];
            return (
              <li key={row.question.id}>
                <Card>
                  <CardBody className="flex flex-col gap-3 sm:flex-row sm:items-start">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-teal-50 text-sm font-semibold text-teal-700">{i + 1}</span>
                    <div className="min-w-0 flex-1">
                      <RichText html={row.question.prompt} className="prose-sm line-clamp-3 prose-p:my-0" />
                      <p className="mt-1 flex flex-wrap items-center gap-1 text-xs text-muted">
                        <Link href={`/admin/assessments/questions/${row.question.id}`} className="text-teal-700 hover:underline">
                          #{row.question.id}
                        </Link>
                        · {KIND_LABEL[row.question.kind]} · {row.question.subject_name}
                        {row.question.topic_name && ` / ${row.question.topic_name}`}
                        {row.question.status !== "active" && <Badge tone={status.tone}>{status.label}</Badge>}
                      </p>
                    </div>
                    <div className="flex items-end gap-2">
                      <label className="flex w-20 flex-col gap-1 text-xs text-muted">
                        Marks
                        <Input value={row.marks} inputMode="decimal" disabled={!editable} onChange={(e) => patch(i, { marks: e.target.value })} aria-label={`Marks for question ${i + 1}`} />
                      </label>
                      <label className="flex w-20 flex-col gap-1 text-xs text-muted">
                        Negative
                        <Input
                          value={row.negative_marks}
                          inputMode="decimal"
                          disabled={!editable}
                          onChange={(e) => patch(i, { negative_marks: e.target.value })}
                          aria-label={`Negative marks for question ${i + 1}`}
                        />
                      </label>
                      {editable && (
                        <div className="flex">
                          <Button variant="ghost" size="icon" aria-label={`Move question ${i + 1} up`} disabled={i === 0} onClick={() => move(i, -1)}>
                            <ArrowUp className="h-4 w-4" aria-hidden="true" />
                          </Button>
                          <Button variant="ghost" size="icon" aria-label={`Move question ${i + 1} down`} disabled={i === rows.length - 1} onClick={() => move(i, 1)}>
                            <ArrowDown className="h-4 w-4" aria-hidden="true" />
                          </Button>
                          <Button variant="ghost" size="icon" aria-label={`Remove question ${i + 1}`} onClick={() => setRows(rows.filter((_, j) => j !== i))}>
                            <Trash2 className="h-4 w-4" aria-hidden="true" />
                          </Button>
                        </div>
                      )}
                    </div>
                  </CardBody>
                </Card>
              </li>
            );
          })}
        </ol>
      )}

      {picking && (
        <QuestionPicker
          exclude={rows.map((r) => r.question.id)}
          onClose={() => setPicking(false)}
          onAdd={(questions) => {
            setRows([...rows, ...questions.map((q) => ({ question: q, marks: q.default_marks, negative_marks: q.default_negative_marks }))]);
            setPicking(false);
          }}
        />
      )}
    </div>
  );
}
