"use client";

import { cn } from "@/lib/utils";
import type { AnswerPayload } from "./use-answer-queue";

type Props = {
  questionIds: number[];
  answers: Record<number, AnswerPayload>;
  current: number;
  /** Positions before this cannot be opened (revisits off). */
  minIndex: number;
  /** Positions after this cannot be opened yet (revisits off). */
  maxIndex: number;
  onJump: (index: number) => void;
};

export function QuestionNavigator({ questionIds, answers, current, minIndex, maxIndex, onJump }: Props) {
  const answered = questionIds.filter((id) => (answers[id]?.selected.length ?? 0) > 0).length;
  const flagged = questionIds.filter((id) => answers[id]?.flagged).length;

  return (
    <nav aria-label="Questions" className="flex flex-col gap-3">
      <p className="text-sm text-muted">
        <span className="font-medium text-navy">{answered}</span> of {questionIds.length} answered
        {flagged > 0 && <span> · {flagged} flagged</span>}
      </p>
      <ol className="grid grid-cols-6 gap-2 sm:grid-cols-8 lg:grid-cols-5">
        {questionIds.map((id, i) => {
          const a = answers[id];
          const isAnswered = (a?.selected.length ?? 0) > 0;
          const locked = i < minIndex || i > maxIndex;
          return (
            <li key={id}>
              <button
                type="button"
                onClick={() => onJump(i)}
                disabled={locked}
                aria-current={i === current ? "step" : undefined}
                aria-label={`Question ${i + 1}${isAnswered ? ", answered" : ", not answered"}${a?.flagged ? ", flagged" : ""}`}
                className={cn(
                  "relative flex h-10 w-full items-center justify-center rounded-md border text-sm font-medium tabular-nums transition-colors disabled:cursor-not-allowed disabled:opacity-40",
                  isAnswered ? "border-teal bg-teal text-white" : "border-line bg-white text-navy hover:border-teal",
                  i === current && "ring-2 ring-navy ring-offset-1",
                )}
              >
                {i + 1}
                {a?.flagged && <span aria-hidden="true" className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-warning ring-2 ring-white" />}
              </button>
            </li>
          );
        })}
      </ol>
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted" aria-hidden="true">
        <li className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-sm bg-teal" /> Answered
        </li>
        <li className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-sm border border-line bg-white" /> Not answered
        </li>
        <li className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-warning" /> Flagged
        </li>
      </ul>
    </nav>
  );
}
