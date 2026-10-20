"use client";

import { ArrowLeft, ArrowRight, CloudOff, Loader2, Check, Clock, ListOrdered } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Alert } from "@/components/ui/feedback";
import { useToast } from "@/components/ui/toast";
import { useUnsavedWarning } from "@/hooks/use-unsaved-warning";
import { api } from "@/lib/api/client";
import { errorMessage, isApiError } from "@/lib/api/errors";
import { clockOffset, formatClock, remainingMs, toggleSelection } from "@/lib/assessments";
import { cn } from "@/lib/utils";
import type { Attempt, SavedAnswer } from "@/types/assessments";

import { QuestionNavigator } from "./question-navigator";
import { QuestionView } from "./question-view";
import { type AnswerPayload, useAnswerQueue } from "./use-answer-queue";

const WARN_AT_MS = 5 * 60 * 1000;

const noopSubscribe = () => () => {};

function answerMap(answers: SavedAnswer[]): Record<number, AnswerPayload> {
  return Object.fromEntries(answers.map((a) => [a.question, { selected: a.selected, flagged: a.flagged }]));
}

/**
 * Full-screen attempt UI. Everything that matters is decided by the server:
 * the deadline, which answers were recorded, whether going back is allowed
 * and the grade. The countdown is only a display corrected by the server clock.
 */
export function ExamPlayer({ initial }: { initial: Attempt }) {
  const router = useRouter();
  const toast = useToast();
  const attemptId = initial.id;
  const resultsHref = `/dashboard/exams/results/${attemptId}`;
  const revisit = initial.exam.allow_revisit;
  const questions = useMemo(() => [...initial.questions].sort((a, b) => a.position - b.position), [initial.questions]);
  const questionIds = useMemo(() => questions.map((q) => q.id), [questions]);

  const [answers, setAnswers] = useState(() => answerMap(initial.answers));
  const saved = useRef(answerMap(initial.answers));
  const [furthest, setFurthest] = useState(initial.furthest_position);
  const [index, setIndex] = useState(() => {
    if (!revisit) return Math.min(initial.furthest_position, questions.length - 1);
    const firstOpen = questions.findIndex((q) => !initial.answers.some((a) => a.question === q.id && a.selected.length > 0));
    return firstOpen === -1 ? 0 : firstOpen;
  });
  const [deadline, setDeadline] = useState(initial.deadline);
  const [offset, setOffset] = useState(() => clockOffset(initial.server_time));
  const [now, setNow] = useState(() => Date.now());
  const [confirming, setConfirming] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [finishError, setFinishError] = useState<string | null>(null);
  const [moving, setMoving] = useState(false);
  const [showNav, setShowNav] = useState(false);
  const finished = useRef(false);
  // Inputs stay disabled until hydration so an early click cannot change a box without saving it.
  const hydrated = useSyncExternalStore(noopSubscribe, () => true, () => false);

  const goToResults = useCallback(() => {
    finished.current = true;
    router.replace(resultsHref);
    router.refresh();
  }, [router, resultsHref]);

  const queue = useAnswerQueue(attemptId, {
    onSaved: (a) => {
      saved.current[a.question] = { selected: a.selected, flagged: a.flagged };
    },
    onRejected: (questionId, message) => {
      const fallback = saved.current[questionId] ?? { selected: [], flagged: false };
      setAnswers((prev) => ({ ...prev, [questionId]: fallback }));
      toast.error(message);
    },
    onClosed: () => {
      toast.error("Time is up. Your saved answers have been submitted.");
      goToResults();
    },
  });
  const { enqueue, flush } = queue;
  useUnsavedWarning(queue.pendingCount > 0 && !finishing);

  const finish = useCallback(
    async (auto: boolean) => {
      if (finished.current) return;
      finished.current = true;
      setFinishing(true);
      setFinishError(null);
      await flush();
      try {
        await api.post(`/attempts/${attemptId}/submit/`);
        if (auto) toast.success("Time is up. Your answers have been submitted.");
        goToResults();
      } catch (err) {
        if (isApiError(err) && err.status === 404) {
          goToResults();
          return;
        }
        finished.current = false;
        setFinishing(false);
        setConfirming(false);
        setFinishError(
          auto
            ? "Time is up, but we could not reach the server. Your saved answers will still be graded. Check your connection and try again."
            : `Could not submit: ${errorMessage(err)}`,
        );
      }
    },
    [attemptId, flush, goToResults, toast],
  );

  const left = remainingMs(deadline, offset, now);

  // The clock: ticks every second and submits once the server deadline passes.
  const finishRef = useRef(finish);
  useEffect(() => {
    finishRef.current = finish;
  });
  useEffect(() => {
    const timer = setInterval(() => {
      const t = Date.now();
      setNow(t);
      if (remainingMs(deadline, offset, t) <= 0 && !finished.current) void finishRef.current(true);
    }, 1000);
    return () => clearInterval(timer);
  }, [deadline, offset]);

  // Re-read the server clock when the tab becomes visible again (sleep, backgrounding).
  useEffect(() => {
    async function resync() {
      if (document.visibilityState !== "visible" || finished.current) return;
      try {
        const fresh = await api.get<Attempt>(`/attempts/${attemptId}/`);
        if (fresh.status !== "in_progress") {
          goToResults();
          return;
        }
        setOffset(clockOffset(fresh.server_time));
        setDeadline(fresh.deadline);
      } catch {
        // Keep the current estimate; saving will surface connectivity problems.
      }
    }
    void resync();
    document.addEventListener("visibilitychange", resync);
    return () => document.removeEventListener("visibilitychange", resync);
  }, [attemptId, goToResults]);

  const question = questions[index];
  const current = answers[question.id] ?? { selected: [], flagged: false };
  const locked = !hydrated || finishing || left <= 0;

  function update(next: AnswerPayload) {
    setAnswers((prev) => ({ ...prev, [question.id]: next }));
    enqueue(question.id, next);
  }

  async function goTo(target: number) {
    if (target === index || target < 0 || target >= questions.length) return;
    setShowNav(false);
    if (revisit) {
      setIndex(target);
      return;
    }
    // Moving on is final when revisits are off: save this answer before the server locks it.
    setMoving(true);
    const drained = await flush();
    if (!drained) {
      setMoving(false);
      toast.error("Your answer has not been saved yet. Check your connection and try again.");
      return;
    }
    try {
      await api.post(`/attempts/${attemptId}/advance/`, { position: target });
      setFurthest((f) => Math.max(f, target));
      setIndex(target);
    } catch (err) {
      if (isApiError(err) && err.code === "attempt_closed") goToResults();
      else toast.error(errorMessage(err));
    } finally {
      setMoving(false);
    }
  }

  const unanswered = questionIds.filter((id) => (answers[id]?.selected.length ?? 0) === 0).length;
  const flaggedCount = questionIds.filter((id) => answers[id]?.flagged).length;
  const isLast = index === questions.length - 1;

  return (
    <div className="flex flex-1 flex-col">
      <div className="sticky top-14 z-20 border-b border-line bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-2 sm:px-6">
          <div className="min-w-0">
            <h1 className="truncate text-base font-semibold text-navy">{initial.exam.title}</h1>
            <SaveIndicator status={queue.status} pending={queue.pendingCount} saved={queue.savedOnce || initial.answers.length > 0} />
          </div>
          <div className="flex items-center gap-2">
            <p
              role="timer"
              aria-label={`Time left ${formatClock(left)}`}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-3 py-1.5 font-mono text-lg font-semibold tabular-nums",
                left <= WARN_AT_MS ? "bg-danger-50 text-danger" : "bg-page text-navy",
              )}
            >
              <Clock className="h-4 w-4" aria-hidden="true" />
              {formatClock(left)}
            </p>
            <Button variant="outline" size="sm" className="lg:hidden" onClick={() => setShowNav((v) => !v)} aria-expanded={showNav} aria-controls="question-nav">
              <ListOrdered className="h-4 w-4" aria-hidden="true" />
              <span className="sr-only sm:not-sr-only">Questions</span>
            </Button>
            <Button size="sm" onClick={() => setConfirming(true)} disabled={finishing}>
              Submit
            </Button>
          </div>
        </div>
        {/* Announces the five-minute mark once, without reading every tick. */}
        <p className="sr-only" aria-live="polite">
          {left <= WARN_AT_MS && left > WARN_AT_MS - 2000 ? "Five minutes left." : ""}
        </p>
      </div>

      <div className="mx-auto grid w-full max-w-6xl flex-1 gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[1fr_17rem]">
        <div className="flex flex-col gap-6">
          {finishError && (
            <Alert tone="danger">
              <span className="flex flex-wrap items-center justify-between gap-3">
                {finishError}
                <Button size="sm" variant="outline" onClick={() => void finish(left <= 0)}>
                  Try again
                </Button>
              </span>
            </Alert>
          )}
          <div className="rounded-xl border border-line bg-white p-5 sm:p-8">
            <QuestionView
              key={question.id}
              question={question}
              number={index + 1}
              total={questions.length}
              selected={current.selected}
              flagged={current.flagged}
              negativeMarking={initial.exam.negative_marking}
              disabled={locked}
              onSelect={(optionId) => update({ ...current, selected: toggleSelection(question.content.kind, current.selected, optionId) })}
              onClear={() => update({ ...current, selected: [] })}
              onToggleFlag={() => update({ ...current, flagged: !current.flagged })}
            />
          </div>
          <div className="flex items-center justify-between gap-3">
            {revisit ? (
              <Button variant="outline" onClick={() => void goTo(index - 1)} disabled={index === 0}>
                <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                Previous
              </Button>
            ) : (
              <p className="text-sm text-muted">You cannot return to a question after moving on.</p>
            )}
            {isLast ? (
              <Button onClick={() => setConfirming(true)} disabled={finishing}>
                Review and submit
              </Button>
            ) : (
              <Button onClick={() => void goTo(index + 1)} disabled={moving || locked}>
                {moving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                {revisit ? "Next" : "Save and continue"}
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Button>
            )}
          </div>
        </div>

        <aside id="question-nav" className={cn("rounded-xl border border-line bg-white p-4 lg:sticky lg:top-32 lg:block lg:self-start", showNav ? "block" : "hidden")}>
          <QuestionNavigator
            questionIds={questionIds}
            answers={answers}
            current={index}
            minIndex={revisit ? 0 : furthest}
            maxIndex={revisit ? questions.length - 1 : furthest}
            onJump={(i) => void goTo(i)}
          />
        </aside>
      </div>

      <Dialog
        open={confirming}
        onOpenChange={(open) => !finishing && setConfirming(open)}
        title="Submit your answers?"
        description="You cannot change your answers after submitting."
        footer={
          <>
            <Button variant="outline" onClick={() => setConfirming(false)} disabled={finishing}>
              Keep working
            </Button>
            <Button onClick={() => void finish(false)} disabled={finishing}>
              {finishing && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
              Submit now
            </Button>
          </>
        }
      >
        <ul className="flex flex-col gap-1 text-sm">
          <li>
            {questions.length - unanswered} of {questions.length} questions answered
          </li>
          {unanswered > 0 && <li className="text-danger">{unanswered} not answered</li>}
          {flaggedCount > 0 && <li className="text-warning">{flaggedCount} flagged for review</li>}
          {queue.status === "offline" && <li className="text-danger">Some answers are not saved yet. We will try to save them before submitting.</li>}
        </ul>
      </Dialog>
    </div>
  );
}

function SaveIndicator({ status, pending, saved }: { status: "idle" | "saving" | "offline"; pending: number; saved: boolean }) {
  return (
    <p className="flex items-center gap-1 text-xs text-muted" aria-live="polite">
      {status === "offline" ? (
        <>
          <CloudOff className="h-3.5 w-3.5 text-danger" aria-hidden="true" />
          <span className="text-danger">
            Offline: {pending} answer{pending === 1 ? "" : "s"} waiting to save. Retrying…
          </span>
        </>
      ) : status === "saving" ? (
        <>
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
          Saving…
        </>
      ) : saved ? (
        <>
          <Check className="h-3.5 w-3.5 text-success" aria-hidden="true" />
          All answers saved
        </>
      ) : (
        "Answers save automatically"
      )}
    </p>
  );
}
