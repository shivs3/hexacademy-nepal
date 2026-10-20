import { Check, X } from "lucide-react";

import { RichText } from "@/components/cms/rich-text";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/feedback";
import { formatMarks, optionLetter } from "@/lib/assessments";
import { cn } from "@/lib/utils";
import type { ReviewItem } from "@/types/assessments";

type Props = { items: ReviewItem[]; showAnswers: boolean; showExplanations: boolean };

export function AnswerReview({ items, showAnswers, showExplanations }: Props) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Review</CardTitle>
        {!showAnswers && <p className="text-sm text-muted">This exam does not show the correct answers.</p>}
      </CardHeader>
      <CardBody>
        <ol className="flex flex-col gap-8">
          {items.map((item, n) => {
            const verdict = item.is_correct === null ? { label: "Not answered", tone: "neutral" as const } : item.is_correct ? { label: "Correct", tone: "success" as const } : { label: "Incorrect", tone: "danger" as const };
            return (
              <li key={item.id} className="flex flex-col gap-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-muted">
                    Question {n + 1}
                    {item.topic && <span className="font-normal normal-case"> · {item.topic}</span>}
                  </h3>
                  <span className="flex items-center gap-2 text-sm">
                    <Badge tone={verdict.tone}>{verdict.label}</Badge>
                    <span className="tabular-nums">
                      {formatMarks(item.awarded_marks)} / {formatMarks(item.marks)}
                    </span>
                  </span>
                </div>
                <RichText html={item.content.prompt} />
                <ul className="flex flex-col gap-2">
                  {item.content.options.map((option, i) => {
                    const chosen = item.selected.includes(option.id);
                    const correct = item.correct_options?.includes(option.id) ?? false;
                    return (
                      <li
                        key={option.id}
                        className={cn(
                          "flex items-start gap-3 rounded-lg border p-3",
                          showAnswers && correct ? "border-success bg-success-50" : chosen ? (showAnswers ? "border-danger bg-danger-50" : "border-teal bg-teal-50") : "border-line",
                        )}
                      >
                        <span className="w-5 shrink-0 font-semibold text-muted">{optionLetter(i)}</span>
                        <span className="min-w-0 flex-1">
                          <RichText html={option.text} className="prose-p:my-0" />
                        </span>
                        <span className="flex shrink-0 items-center gap-2 text-xs font-medium">
                          {chosen && <span className="text-navy">Your answer</span>}
                          {showAnswers && correct && <Check className="h-4 w-4 text-success" aria-label="Correct answer" />}
                          {showAnswers && chosen && !correct && <X className="h-4 w-4 text-danger" aria-label="Incorrect" />}
                        </span>
                      </li>
                    );
                  })}
                </ul>
                {showExplanations && item.explanation && (
                  <div className="rounded-lg bg-page p-4 text-sm">
                    <p className="mb-1 font-medium text-navy">Explanation</p>
                    <RichText html={item.explanation} className="prose-sm" />
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      </CardBody>
    </Card>
  );
}
