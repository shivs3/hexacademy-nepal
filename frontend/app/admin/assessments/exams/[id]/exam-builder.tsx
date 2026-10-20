"use client";

import { ArrowLeft, ExternalLink, MoreHorizontal, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";

import { LoadError } from "@/components/cms/admin/list-parts";
import { ExamQuestions } from "@/components/exams/admin/exam-questions";
import { ExamResults } from "@/components/exams/admin/exam-results";
import { ExamSettings } from "@/components/exams/admin/exam-settings";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Alert, Badge, PageHeader, Skeleton } from "@/components/ui/feedback";
import { Menu, MenuItem } from "@/components/ui/menu";
import { useToast } from "@/components/ui/toast";
import { useApiResource } from "@/hooks/use-api-resource";
import { api } from "@/lib/api/client";
import { errorMessage } from "@/lib/api/errors";
import { EXAM_KIND_LABEL, EXAM_STATUS, formatMarks } from "@/lib/assessments";
import { cn } from "@/lib/utils";
import type { AdminExam, ExamStatus } from "@/types/assessments";

type Tab = "settings" | "questions" | "results";
type Pending = ExamStatus | "delete" | "publish_results";

const CONFIRM: Record<Pending, { title: string; description: string; label: string; done: string }> = {
  published: {
    title: "Publish this exam?",
    description: "Eligible learners can start it within its window. Scoring settings and the question list lock once it is published.",
    label: "Publish",
    done: "Exam published.",
  },
  closed: {
    title: "Close this exam?",
    description: "No new attempts can start. Attempts already running keep their time and are graded when they end.",
    label: "Close exam",
    done: "Exam closed.",
  },
  draft: {
    title: "Move back to draft?",
    description: "Learners will no longer see the exam. This is only possible while nobody has taken it.",
    label: "Move to draft",
    done: "Exam moved to drafts.",
  },
  delete: {
    title: "Delete this exam?",
    description: "The exam and its question list are removed. Questions stay in the bank.",
    label: "Delete exam",
    done: "Exam deleted.",
  },
  publish_results: {
    title: "Publish results?",
    description: "Every learner who has finished can see their score, and the review if this exam shows one. This cannot be undone.",
    label: "Publish results",
    done: "Results published.",
  },
};

export function ExamBuilder({ examId, manager }: { examId: number; manager: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const { data: exam, error, reload, setData } = useApiResource<AdminExam>(`/admin/assessments/exams/${examId}/`);
  const [tab, setTab] = useState<Tab>("settings");
  const [pending, setPending] = useState<Pending | null>(null);
  const [busy, setBusy] = useState(false);

  const adopt = useCallback((next: AdminExam) => setData(next), [setData]);

  async function run(action: Pending) {
    if (!exam) return;
    setBusy(true);
    try {
      if (action === "delete") {
        await api.delete(`/admin/assessments/exams/${exam.id}/`);
        toast.success(CONFIRM.delete.done);
        router.push("/admin/assessments/exams");
        return;
      }
      const next =
        action === "publish_results"
          ? await api.post<AdminExam>(`/admin/assessments/exams/${exam.id}/publish-results/`)
          : await api.post<AdminExam>(`/admin/assessments/exams/${exam.id}/status/`, { status: action });
      setData(next);
      toast.success(CONFIRM[action].done);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
      setPending(null);
    }
  }

  if (error) return <LoadError message={error} onRetry={reload} />;
  if (!exam) return <Skeleton className="h-96" />;

  const status = EXAM_STATUS[exam.status];
  const canEdit = exam.abilities.edit;
  const tabs: { id: Tab; label: string }[] = [
    { id: "settings", label: "Settings" },
    { id: "questions", label: `Questions (${exam.question_total})` },
    { id: "results", label: `Results (${exam.attempt_total})` },
  ];

  return (
    <div className="flex flex-col gap-6">
      <Link href="/admin/assessments/exams" className="inline-flex items-center gap-1 text-sm text-teal-700 hover:underline">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Exams
      </Link>
      <PageHeader
        title={exam.title}
        description={`${EXAM_KIND_LABEL[exam.kind]} · ${exam.duration_minutes} min · ${exam.drawn_questions} question${exam.drawn_questions === 1 ? "" : "s"} · ${formatMarks(exam.total_marks)} marks${exam.course_title ? ` · ${exam.course_title}` : ""}`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={status.tone}>{status.label}</Badge>
            {exam.status === "published" && (
              <Button variant="outline" asChild>
                <a href={`/dashboard/exams/${exam.slug}`} target="_blank" rel="noreferrer">
                  <ExternalLink className="h-4 w-4" aria-hidden="true" />
                  Learner view
                </a>
              </Button>
            )}
            {canEdit && exam.result_release === "manual" && !exam.results_released && exam.status !== "draft" && (
              <Button variant="outline" onClick={() => setPending("publish_results")}>
                Publish results
              </Button>
            )}
            {canEdit && exam.status === "draft" && (
              <Button onClick={() => setPending("published")} disabled={exam.publish_problems.length > 0} title={exam.publish_problems.length ? "Fix the problems listed below first." : undefined}>
                Publish
              </Button>
            )}
            {canEdit && exam.status === "published" && (
              <Button variant="outline" onClick={() => setPending("closed")}>
                Close exam
              </Button>
            )}
            {canEdit && exam.status === "closed" && <Button onClick={() => setPending("published")}>Reopen</Button>}
            {canEdit && (exam.status !== "draft" ? exam.attempt_total === 0 : exam.abilities.delete) && (
              <Menu
                trigger={
                  <Button variant="ghost" size="icon" aria-label="More actions">
                    <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
                  </Button>
                }
              >
                {exam.status !== "draft" && exam.attempt_total === 0 && <MenuItem onSelect={() => setPending("draft")}>Move back to draft</MenuItem>}
                {exam.abilities.delete && (
                  <MenuItem onSelect={() => setPending("delete")} danger>
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                    Delete exam
                  </MenuItem>
                )}
              </Menu>
            )}
          </div>
        }
      />

      {!canEdit && <Alert tone="info">You can review this exam and its results but not change it.</Alert>}
      {canEdit && exam.status !== "draft" && (
        <Alert tone="info">
          This exam is {exam.status}. You can change its title, instructions, window, attempt limit and review settings. Questions and scoring are locked
          {exam.attempt_total === 0 ? " until you move it back to draft." : " because learners have taken it."}
        </Alert>
      )}
      {exam.status === "draft" && exam.publish_problems.length > 0 && (
        <Alert tone="warning" title="Before you can publish">
          <ul className="list-disc pl-5">
            {exam.publish_problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </Alert>
      )}

      <div role="tablist" aria-label="Exam sections" className="flex gap-1 overflow-x-auto border-b border-line">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`tab-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls={`panel-${t.id}`}
            onClick={() => setTab(t.id)}
            className={cn(
              "-mb-px whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal",
              tab === t.id ? "border-teal text-navy" : "border-transparent text-muted hover:text-navy",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
        {tab === "settings" ? (
          <ExamSettings exam={exam} manager={manager} onSaved={adopt} />
        ) : tab === "questions" ? (
          <ExamQuestions exam={exam} onChanged={reload} />
        ) : (
          <ExamResults exam={exam} />
        )}
      </div>

      {pending && (
        <ConfirmDialog
          open
          onOpenChange={(o) => !o && setPending(null)}
          title={CONFIRM[pending].title}
          description={CONFIRM[pending].description}
          confirmLabel={CONFIRM[pending].label}
          tone={pending === "delete" ? "danger" : "primary"}
          loading={busy}
          onConfirm={() => run(pending)}
        />
      )}
    </div>
  );
}
