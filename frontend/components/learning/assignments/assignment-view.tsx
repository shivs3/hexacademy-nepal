"use client";

import { ArrowLeft, Paperclip } from "lucide-react";
import Link from "next/link";

import { RichText } from "@/components/cms/rich-text";
import { LoadError } from "@/components/cms/admin/list-parts";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, Badge, Skeleton } from "@/components/ui/feedback";
import { useToast } from "@/components/ui/toast";
import { useApiResource } from "@/hooks/use-api-resource";
import { learnerState } from "@/lib/assignments";
import { formatBytes, formatDateTime } from "@/lib/utils";
import type { LearnerAssignmentDetail } from "@/types/assignments";

import { SubmitForm } from "./submit-form";

export function AssignmentView({ assignmentId }: { assignmentId: number }) {
  const toast = useToast();
  const { data: a, error, reload } = useApiResource<LearnerAssignmentDetail>(`/assignments/${assignmentId}/`);

  if (error) return <LoadError message={error} onRetry={reload} />;
  if (!a) return <Skeleton className="h-64 w-full" />;
  const state = learnerState(a);
  const sub = a.submission;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/dashboard/assignments" className="inline-flex items-center gap-1 text-sm text-muted hover:text-navy">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          All assignments
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold">{a.title}</h1>
          <Badge tone={state.tone}>{state.label}</Badge>
        </div>
        <p className="mt-1 text-sm text-muted">
          <Link href={`/learn/${a.course.slug}`} className="hover:text-navy">
            {a.course.title}
          </Link>
          {a.lesson && (
            <>
              {" · "}
              <Link href={`/learn/${a.course.slug}/${a.lesson.id}`} className="hover:text-navy">
                {a.lesson.title}
              </Link>
            </>
          )}
          {" · "}
          {a.due_at ? `Due ${formatDateTime(a.due_at)} (Nepal time)` : "No due date"}
          {a.due_at && a.allow_late && " · late work accepted"}
          {" · "}
          {a.max_points} points
        </p>
      </div>

      {a.instructions && (
        <Card>
          <CardHeader>
            <CardTitle>Instructions</CardTitle>
          </CardHeader>
          <CardBody>
            <RichText html={a.instructions} />
          </CardBody>
        </Card>
      )}

      {sub && (
        <Card>
          <CardHeader>
            <CardTitle>Your submission</CardTitle>
          </CardHeader>
          <CardBody className="flex flex-col gap-3 text-sm">
            <p className="text-muted">
              Attempt {sub.attempt}, submitted {formatDateTime(sub.submitted_at)}
              {sub.is_late && <Badge tone="warning" className="ml-2">Late</Badge>}
            </p>
            {sub.status === "graded" && (
              <p className="text-lg font-semibold tabular-nums">
                {sub.points} / {a.max_points} points
              </p>
            )}
            {sub.feedback && (
              <Alert tone={sub.status === "returned" ? "warning" : "info"} title={sub.status === "returned" ? "Revision requested" : "Feedback"}>
                <p className="whitespace-pre-line">{sub.feedback}</p>
              </Alert>
            )}
            {sub.text && <p className="whitespace-pre-wrap rounded-md border border-line bg-page p-3">{sub.text}</p>}
            {sub.has_file && (
              <p className="flex items-center gap-2">
                <Paperclip className="h-4 w-4 text-muted" aria-hidden="true" />
                <a className="text-teal-700 underline" href={`/api/v1/assignments/${a.id}/submission/file/`}>
                  {sub.original_name || "Submitted file"}
                </a>
                <span className="text-muted">({formatBytes(sub.size_bytes)})</span>
              </p>
            )}
          </CardBody>
        </Card>
      )}

      {a.can_submit ? (
        <Card>
          <CardHeader>
            <CardTitle>{sub ? (sub.status === "returned" ? "Revise your work" : "Replace your submission") : "Submit your work"}</CardTitle>
          </CardHeader>
          <CardBody>
            {sub?.status === "submitted" && (
              <p className="mb-4 text-sm text-muted">You can change your work until your instructor grades it.</p>
            )}
            <SubmitForm
              key={sub?.attempt ?? 0}
              assignment={a}
              onSaved={() => {
                toast.success("Submitted.");
                reload();
              }}
            />
          </CardBody>
        </Card>
      ) : (
        sub?.status !== "graded" && <Alert tone="info">{a.closed_reason || "Submissions are closed."}</Alert>
      )}
    </div>
  );
}
