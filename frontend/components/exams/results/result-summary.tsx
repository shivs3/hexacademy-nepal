import { Card, CardBody } from "@/components/ui/card";
import { Badge } from "@/components/ui/feedback";
import { formatDuration, formatMarks } from "@/lib/assessments";
import type { ResultSummary } from "@/types/assessments";

export function ResultSummaryCards({ summary }: { summary: ResultSummary }) {
  const stats = [
    { label: "Correct", value: summary.correct },
    { label: "Incorrect", value: summary.incorrect },
    { label: "Unanswered", value: summary.unanswered },
    { label: "Accuracy", value: `${formatMarks(summary.accuracy)}%`, hint: "of answered questions" },
    { label: "Time spent", value: formatDuration(summary.time_spent_seconds) },
  ];
  return (
    <section aria-label="Score" className="grid gap-4 lg:grid-cols-[18rem_1fr]">
      <Card>
        <CardBody className="flex flex-col items-start gap-2">
          <p className="text-sm text-muted">Your score</p>
          <p className="font-display text-4xl font-semibold tabular-nums text-navy">
            {formatMarks(summary.score)}
            <span className="text-xl text-muted"> / {formatMarks(summary.max_score)}</span>
          </p>
          <p className="text-sm tabular-nums text-muted">{formatMarks(summary.percent)}%</p>
          {summary.passed !== null && (
            <Badge tone={summary.passed ? "success" : "danger"}>
              {summary.passed ? "Passed" : "Not passed"}
              {summary.pass_marks && ` · pass mark ${formatMarks(summary.pass_marks)}`}
            </Badge>
          )}
        </CardBody>
      </Card>
      <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-5">
        {stats.map((s) => (
          <Card key={s.label}>
            <CardBody>
              <dt className="text-sm text-muted">{s.label}</dt>
              <dd className="mt-1 text-2xl font-semibold tabular-nums text-navy">{s.value}</dd>
              {s.hint && <dd className="text-xs text-muted">{s.hint}</dd>}
            </CardBody>
          </Card>
        ))}
      </dl>
    </section>
  );
}
