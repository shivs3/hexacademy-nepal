"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { th, theadClass } from "@/components/cms/admin/list-parts";
import { formatMarks } from "@/lib/assessments";
import type { TopicRow } from "@/types/assessments";

const AXIS = { fontSize: 12, fill: "var(--color-muted)" };

export function TopicBreakdown({ topics }: { topics: TopicRow[] }) {
  const data = topics.map((t) => ({ topic: t.topic || "General", percent: Number(t.percent) }));
  return (
    <Card className="overflow-hidden">
      <CardHeader>
        <CardTitle>By topic</CardTitle>
      </CardHeader>
      {topics.length > 1 && (
        <CardBody>
          <div className="h-56" role="img" aria-label={`Score by topic: ${data.map((d) => `${d.topic} ${d.percent}%`).join(", ")}`}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} margin={{ left: -20, right: 8, top: 4 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-line)" />
                <XAxis dataKey="topic" tick={AXIS} interval={0} />
                <YAxis domain={[0, 100]} tick={AXIS} />
                <Tooltip formatter={(v) => [`${v}%`, "Score"]} />
                <Bar dataKey="percent" fill="var(--color-teal)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardBody>
      )}
      <div className="relative overflow-x-auto">
        <table className="w-full text-sm">
          <thead className={theadClass}>
            <tr>
              <th className={th}>Topic</th>
              <th className={th}>Correct</th>
              <th className={th}>Incorrect</th>
              <th className={th}>Unanswered</th>
              <th className={th}>Marks</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {topics.map((t) => (
              <tr key={t.topic}>
                <td className="px-4 py-3 font-medium text-navy">{t.topic || "General"}</td>
                <td className="px-4 py-3 tabular-nums">
                  {t.correct} / {t.questions}
                </td>
                <td className="px-4 py-3 tabular-nums">{t.incorrect}</td>
                <td className="px-4 py-3 tabular-nums">{t.unanswered}</td>
                <td className="px-4 py-3 tabular-nums">
                  {formatMarks(t.marks)} / {formatMarks(t.max_marks)} <span className="text-muted">({formatMarks(t.percent)}%)</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
