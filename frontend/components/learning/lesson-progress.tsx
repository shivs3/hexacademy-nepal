"use client";

import { CheckCircle2, Circle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { api } from "@/lib/api/client";
import { errorMessage } from "@/lib/api/errors";
import type { ProgressResult } from "@/types/learning";

type Props = { lessonId: number; initialCompleted: boolean; nextHref: string | null };

/**
 * Records the visit once and lets the learner mark the lesson complete.
 * The server stores progress and derives course completion; this component
 * only reports what the learner did. Render it with `key={lessonId}`.
 */
export function LessonProgress({ lessonId, initialCompleted, nextHref }: Props) {
  const router = useRouter();
  const toast = useToast();
  const [completed, setCompleted] = useState(initialCompleted);
  const [busy, setBusy] = useState(false);
  const recorded = useRef<number | null>(null);

  useEffect(() => {
    if (recorded.current === lessonId) return;
    recorded.current = lessonId;
    // A visit (no completion change) updates "continue learning"; failures are not worth interrupting the lesson.
    api.post(`/lessons/${lessonId}/progress/`, {}).catch(() => undefined);
  }, [lessonId]);

  async function update(next: boolean) {
    setBusy(true);
    try {
      const result = await api.post<ProgressResult>(`/lessons/${lessonId}/progress/`, { completed: next });
      setCompleted(result.completed);
      if (result.course_completed && next) toast.success("Course completed. Well done!");
      if (next && nextHref) router.push(nextHref);
      router.refresh();
    } catch (err) {
      toast.error(`Progress was not saved. ${errorMessage(err)}`);
    } finally {
      setBusy(false);
    }
  }

  return completed ? (
    <Button variant="outline" loading={busy} onClick={() => update(false)} aria-pressed="true">
      <CheckCircle2 className="h-4 w-4 text-success" aria-hidden="true" />
      Completed
      <span className="sr-only"> (select to mark as not completed)</span>
    </Button>
  ) : (
    <Button loading={busy} onClick={() => update(true)}>
      <Circle className="h-4 w-4" aria-hidden="true" />
      {nextHref ? "Mark complete and continue" : "Mark complete"}
    </Button>
  );
}
