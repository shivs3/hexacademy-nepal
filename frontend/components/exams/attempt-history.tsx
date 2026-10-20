"use client";

import Link from "next/link";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { Card, CardBody } from "@/components/ui/card";
import { Badge } from "@/components/ui/feedback";
import { ATTEMPT_STATUS, formatMarks } from "@/lib/assessments";
import { formatDate, formatDateTime } from "@/lib/utils";
import type { HistoryItem } from "@/types/assessments";

const AXIS = { fontSize: 12, fill: "var(--color-muted)" };

/** Attempt list with a percentage trend of released results (oldest to newest). */
export function AttemptHistory({ items, chart = true }: { items: HistoryItem[]; chart?: boolean }) {
  const trend = items
    .filter((i) => i.percent !== null)
    .reverse()
    .map((i) => ({ label: formatDate(i.started_at, { day: "numeric", month: "short" }), percent: Number(i.percent), exam: i.exam.title }));

  return (
    <div className="flex flex-col gap-4">
      {chart && trend.length >= 2 && (
        <Card>
          <CardBody>
            <p className="mb-2 text-sm font-medium text-navy">Your scores over time (%)</p>
            <div className="h-48" role="img" aria-label={`Score trend: ${trend.map((t) => `${t.exam} ${t.percent}%`).join(", ")}`}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trend} margin={{ left: -20, right: 8, top: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-line)" />
                  <XAxis dataKey="label" tick={AXIS} />
                  <YAxis domain={[0, 100]} tick={AXIS} />
                  <Tooltip formatter={(v) => [`${v}%`, "Score"]} labelFormatter={(_, p) => p?.[0]?.payload?.exam ?? ""} />
                  <Line type="monotone" dataKey="percent" stroke="var(--color-teal)" strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardBody>
        </Card>
      )}
      <Card className="overflow-hidden">
        <ul className="divide-y divide-line">
          {items.map((item) => {
            const status = ATTEMPT_STATUS[item.status];
            const href = item.status === "in_progress" ? `/exam/${item.id}` : `/dashboard/exams/results/${item.id}`;
            return (
              <li key={item.id}>
                <Link href={href} className="flex flex-col gap-1 px-5 py-3 hover:bg-page sm:flex-row sm:items-center sm:justify-between">
                  <span>
                    <span className="font-medium text-navy">{item.exam.title}</span>
                    <span className="block text-xs text-muted">
                      Attempt {item.number} · {formatDateTime(item.started_at)}
                    </span>
                  </span>
                  <span className="flex items-center gap-2 text-sm">
                    <Badge tone={status.tone}>{item.status === "in_progress" ? "Resume" : status.label}</Badge>
                    {item.status !== "in_progress" &&
                      (item.score !== null ? (
                        <span className="tabular-nums text-navy">
                          {formatMarks(item.score)} / {formatMarks(item.max_score)}
                          {item.percent !== null && <span className="text-muted"> · {item.percent}%</span>}
                        </span>
                      ) : (
                        <span className="text-muted">Result not released yet</span>
                      ))}
                    {item.passed !== null && <Badge tone={item.passed ? "success" : "danger"}>{item.passed ? "Passed" : "Not passed"}</Badge>}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </Card>
    </div>
  );
}
