"use client";

import { Download, Users } from "lucide-react";
import { useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { LoadError, Pager, SearchBox, TableSkeleton, th, theadClass } from "@/components/cms/admin/list-parts";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge, EmptyState, Skeleton } from "@/components/ui/feedback";
import { Select } from "@/components/ui/input";
import { useApiResource, useDebounced } from "@/hooks/use-api-resource";
import { ATTEMPT_STATUS, formatDuration, formatMarks } from "@/lib/assessments";
import { formatDateTime } from "@/lib/utils";
import type { Paginated } from "@/types/accounts";
import type { AdminAttempt, AdminExam, ExamAnalytics } from "@/types/assessments";

const AXIS = { fontSize: 12, fill: "var(--color-muted)" };

export function ExamResults({ exam }: { exam: AdminExam }) {
  const analytics = useApiResource<ExamAnalytics>(`/admin/assessments/exams/${exam.id}/analytics/`);
  const a = analytics.data;

  return (
    <div className="flex flex-col gap-6">
      {analytics.error && <LoadError message={analytics.error} onRetry={analytics.reload} />}
      {!a && !analytics.error && <Skeleton className="h-28" />}
      {a && (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label="Finished attempts" value={String(a.attempts)} detail={`${a.learners} learner${a.learners === 1 ? "" : "s"} · ${a.in_progress} in progress`} />
            <Stat label="Average score" value={a.average_score ? formatMarks(a.average_score) : "—"} detail={`out of ${formatMarks(exam.total_marks)}`} />
            <Stat label="Highest / lowest" value={a.highest_score ? `${formatMarks(a.highest_score)} / ${formatMarks(a.lowest_score)}` : "—"} />
            <Stat label="Pass rate" value={a.pass_rate ? `${a.pass_rate}%` : "—"} detail={exam.pass_marks ? `pass mark ${formatMarks(exam.pass_marks)}` : "no pass mark set"} />
          </div>
          {a.attempts > 0 && (
            <div className="grid gap-6 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Score distribution</CardTitle>
                  <p className="text-sm text-muted">Finished attempts by percentage scored.</p>
                </CardHeader>
                <CardBody>
                  <div className="h-64" role="img" aria-label={`Score distribution: ${a.distribution.map((d) => `${d.range}: ${d.count}`).join(", ")}`}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={a.distribution} margin={{ left: -20, right: 8 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-line)" />
                        <XAxis dataKey="range" tick={AXIS} interval={1} />
                        <YAxis allowDecimals={false} tick={AXIS} />
                        <Tooltip cursor={{ fill: "var(--color-teal-50)" }} />
                        <Bar dataKey="count" name="Attempts" fill="var(--color-teal)" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </CardBody>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>Questions</CardTitle>
                  <p className="text-sm text-muted">Share of learners who answered each question correctly. Low rates can mean a hard or unclear question.</p>
                </CardHeader>
                <CardBody>
                  <div className="max-h-64 overflow-y-auto">
                    <table className="w-full text-left text-sm">
                      <thead className="sticky top-0 bg-white text-xs uppercase text-muted">
                        <tr>
                          <th scope="col" className="py-1.5 font-medium">Question</th>
                          <th scope="col" className="py-1.5 text-right font-medium">Seen</th>
                          <th scope="col" className="py-1.5 text-right font-medium">Skipped</th>
                          <th scope="col" className="w-1/2 py-1.5 pl-3 font-medium">Correct</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[...a.questions]
                          .sort((x, y) => Number(x.correct_rate) - Number(y.correct_rate))
                          .map((row) => (
                            <tr key={row.question_id}>
                              <td className="py-1.5">
                                <a href={`/admin/assessments/questions/${row.question_id}`} className="text-teal-700 hover:underline">
                                  #{row.question_id}
                                </a>
                              </td>
                              <td className="py-1.5 text-right tabular-nums">{row.seen}</td>
                              <td className="py-1.5 text-right tabular-nums">{row.unanswered}</td>
                              <td className="py-1.5 pl-3">
                                <div className="flex items-center gap-2">
                                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-page" aria-hidden="true">
                                    <div className="h-full rounded-full bg-mint" style={{ width: `${Math.min(100, Number(row.correct_rate))}%` }} />
                                  </div>
                                  <span className="w-12 text-right tabular-nums">{row.correct_rate}%</span>
                                </div>
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                </CardBody>
              </Card>
            </div>
          )}
        </>
      )}
      <AttemptsTable exam={exam} />
    </div>
  );
}

function Stat({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <Card>
      <CardBody>
        <p className="text-xs font-medium uppercase tracking-wide text-muted">{label}</p>
        <p className="mt-1 text-2xl font-semibold tabular-nums text-navy">{value}</p>
        {detail && <p className="text-xs text-muted">{detail}</p>}
      </CardBody>
    </Card>
  );
}

function AttemptsTable({ exam }: { exam: AdminExam }) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const q = useDebounced(search);
  const { data, error, reload } = useApiResource<Paginated<AdminAttempt>>(`/admin/assessments/exams/${exam.id}/attempts/`, { search: q, status, page });

  return (
    <Card className="overflow-hidden">
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <CardTitle>Attempts</CardTitle>
        <Button variant="outline" size="sm" asChild>
          <a href={`/api/v1/admin/assessments/exams/${exam.id}/results-export/`} download>
            <Download className="h-4 w-4" aria-hidden="true" />
            Export CSV
          </a>
        </Button>
      </CardHeader>
      <div className="flex flex-col gap-3 border-b border-line px-5 pb-4 sm:flex-row">
        <SearchBox
          value={search}
          onChange={(v) => {
            setSearch(v);
            setPage(1);
          }}
          label="Search learners"
          placeholder="Search name or email"
        />
        <Select
          aria-label="Filter by status"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
          className="sm:w-44"
        >
          <option value="">Any status</option>
          {Object.entries(ATTEMPT_STATUS).map(([value, s]) => (
            <option key={value} value={value}>
              {s.label}
            </option>
          ))}
        </Select>
      </div>
      {error && <LoadError message={error} onRetry={reload} />}
      {!data && !error ? (
        <TableSkeleton />
      ) : data && data.results.length === 0 ? (
        <EmptyState icon={Users} title={q || status ? "No attempts match" : "Nobody has taken this exam yet"} />
      ) : data ? (
        <>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[48rem] text-left text-sm">
              <thead className={theadClass}>
                <tr>
                  <th scope="col" className={th}>Learner</th>
                  <th scope="col" className={th}>Status</th>
                  <th scope="col" className={`${th} text-right`}>Score</th>
                  <th scope="col" className={`${th} text-right`}>Right / wrong / blank</th>
                  <th scope="col" className={`${th} text-right`}>Time</th>
                  <th scope="col" className={th}>Started</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {data.results.map((attempt) => (
                  <tr key={attempt.id}>
                    <td className="px-4 py-3">
                      <span className="font-medium text-navy">{attempt.learner.full_name || attempt.learner.email}</span>
                      <p className="text-xs text-muted">
                        {attempt.learner.email} · attempt {attempt.number}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={ATTEMPT_STATUS[attempt.status].tone}>{ATTEMPT_STATUS[attempt.status].label}</Badge>
                      {attempt.passed !== null && (
                        <Badge tone={attempt.passed ? "success" : "danger"} className="ml-1">
                          {attempt.passed ? "Passed" : "Not passed"}
                        </Badge>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {attempt.score === null ? "—" : `${formatMarks(attempt.score)} / ${formatMarks(attempt.max_score)}`}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {attempt.status === "in_progress" ? "—" : `${attempt.correct_count} / ${attempt.incorrect_count} / ${attempt.unanswered_count}`}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">{formatDuration(attempt.time_spent_seconds)}</td>
                    <td className="px-4 py-3 text-xs text-muted">{formatDateTime(attempt.started_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pager data={data} onPage={setPage} />
        </>
      ) : null}
    </Card>
  );
}
