"use client";

import { Download, FileQuestionMark, Plus, Upload } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { LoadError, Pager, SearchBox, TableSkeleton, th, theadClass } from "@/components/cms/admin/list-parts";
import { RichText } from "@/components/cms/rich-text";
import { ImportDialog } from "@/components/exams/admin/import-dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge, EmptyState } from "@/components/ui/feedback";
import { Select } from "@/components/ui/input";
import { useApiResource, useDebounced } from "@/hooks/use-api-resource";
import { buildPath } from "@/lib/api/client";
import { DIFFICULTY_LABEL, KIND_LABEL, QUESTION_STATUS, formatMarks } from "@/lib/assessments";
import { formatDateTime } from "@/lib/utils";
import type { Paginated } from "@/types/accounts";
import type { AdminQuestionSummary, AdminSubject, CourseOption } from "@/types/assessments";

export function QuestionsList({ manager, canAuthor, initialSubject }: { manager: boolean; canAuthor: boolean; initialSubject: string }) {
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState({ subject: initialSubject, topic: "", kind: "", status: "", difficulty: "", course: "" });
  const [page, setPage] = useState(1);
  const [importing, setImporting] = useState(false);
  const q = useDebounced(search);
  const query = { ...filters, search: q };
  const { data, error, reload } = useApiResource<Paginated<AdminQuestionSummary>>("/admin/assessments/questions/", { ...query, page });
  const subjects = useApiResource<AdminSubject[]>("/admin/assessments/subjects/");
  const courses = useApiResource<CourseOption[]>("/admin/assessments/course-options/");
  const subject = subjects.data?.find((s) => String(s.id) === filters.subject);
  const filtered = Boolean(q || Object.values(filters).some(Boolean));

  function set(key: keyof typeof filters, value: string) {
    setFilters((f) => ({ ...f, [key]: value, ...(key === "subject" ? { topic: "" } : {}) }));
    setPage(1);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 lg:flex-row">
        <SearchBox
          value={search}
          onChange={(v) => {
            setSearch(v);
            setPage(1);
          }}
          label="Search questions"
          placeholder="Search text, tag or #id"
        />
        <div className="flex flex-wrap gap-2">
          {canAuthor && (
            <Button variant="outline" onClick={() => setImporting(true)}>
              <Upload className="h-4 w-4" aria-hidden="true" />
              Import
            </Button>
          )}
          {canAuthor && (
            <Button variant="outline" asChild>
              {/* Same-origin download; the session cookie authorises it and the export only includes questions you can edit. */}
              <a href={`/api/v1${buildPath("/admin/assessments/questions/export/", query)}`} download>
                <Download className="h-4 w-4" aria-hidden="true" />
                Export CSV
              </a>
            </Button>
          )}
          {canAuthor && (
            <Button asChild>
              <Link href="/admin/assessments/questions/new">
                <Plus className="h-4 w-4" aria-hidden="true" />
                New question
              </Link>
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <Select aria-label="Filter by subject" value={filters.subject} onChange={(e) => set("subject", e.target.value)}>
          <option value="">Any subject</option>
          {subjects.data?.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </Select>
        <Select aria-label="Filter by topic" value={filters.topic} onChange={(e) => set("topic", e.target.value)} disabled={!subject || subject.topics.length === 0}>
          <option value="">Any topic</option>
          {subject?.topics.map((t) => (
            <option key={t.id} value={t.id}>
              {t.parent ? `— ${t.name}` : t.name}
            </option>
          ))}
        </Select>
        <Select aria-label="Filter by type" value={filters.kind} onChange={(e) => set("kind", e.target.value)}>
          <option value="">Any type</option>
          {Object.entries(KIND_LABEL).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </Select>
        <Select aria-label="Filter by status" value={filters.status} onChange={(e) => set("status", e.target.value)}>
          <option value="">Any status</option>
          {Object.entries(QUESTION_STATUS).map(([value, s]) => (
            <option key={value} value={value}>
              {s.label}
            </option>
          ))}
        </Select>
        <Select aria-label="Filter by difficulty" value={filters.difficulty} onChange={(e) => set("difficulty", e.target.value)}>
          <option value="">Any difficulty</option>
          {Object.entries(DIFFICULTY_LABEL).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </Select>
        <Select aria-label="Filter by course" value={filters.course} onChange={(e) => set("course", e.target.value)}>
          <option value="">{manager ? "Any course" : "Shared and my courses"}</option>
          <option value="shared">Shared bank only</option>
          {courses.data?.map((c) => (
            <option key={c.id} value={c.id}>
              {c.title}
            </option>
          ))}
        </Select>
      </div>

      {error && <LoadError message={error} onRetry={reload} />}

      {!data && !error ? (
        <TableSkeleton />
      ) : data && data.results.length === 0 ? (
        <EmptyState
          icon={FileQuestionMark}
          title={filtered ? "No questions match these filters" : "The question bank is empty"}
          description={filtered ? undefined : canAuthor ? "Write questions one by one, or import a CSV or Excel file." : undefined}
        />
      ) : data ? (
        <Card className="overflow-hidden">
          <div className="relative overflow-x-auto">
            <table className="w-full min-w-[56rem] text-left text-sm">
              <thead className={theadClass}>
                <tr>
                  <th scope="col" className={th}>Question</th>
                  <th scope="col" className={th}>Subject</th>
                  <th scope="col" className={th}>Type</th>
                  <th scope="col" className={th}>Status</th>
                  <th scope="col" className={`${th} text-right`}>Marks</th>
                  <th scope="col" className={`${th} text-right`}>Exams</th>
                  <th scope="col" className={th}>Updated</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {data.results.map((question) => (
                  <tr key={question.id} className="align-top">
                    <td className="max-w-md px-4 py-3">
                      <Link href={`/admin/assessments/questions/${question.id}`} className="group block">
                        <span className="text-xs text-muted">#{question.id}</span>
                        <RichText html={question.prompt} className="prose-sm line-clamp-2 text-navy group-hover:text-teal-700 prose-p:my-0" />
                      </Link>
                      <p className="mt-1 flex flex-wrap gap-1">
                        {question.course ? <Badge tone="teal">{question.course_title}</Badge> : <Badge>Shared</Badge>}
                        {question.tags.slice(0, 4).map((t) => (
                          <Badge key={t}>{t}</Badge>
                        ))}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      {question.subject_name}
                      {question.topic_name && <p className="text-xs text-muted">{question.topic_name}</p>}
                    </td>
                    <td className="px-4 py-3">
                      {KIND_LABEL[question.kind]}
                      <p className="text-xs text-muted">{DIFFICULTY_LABEL[question.difficulty]}</p>
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={QUESTION_STATUS[question.status].tone}>{QUESTION_STATUS[question.status].label}</Badge>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {formatMarks(question.default_marks)}
                      {question.default_negative_marks !== "0.00" && <span className="text-xs text-danger"> −{formatMarks(question.default_negative_marks)}</span>}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">{question.used_in_exams}</td>
                    <td className="px-4 py-3 text-xs text-muted">
                      {formatDateTime(question.updated_at)}
                      <p>v{question.version}</p>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pager data={data} onPage={setPage} />
        </Card>
      ) : null}

      {importing && (
        <ImportDialog
          manager={manager}
          courses={courses.data ?? []}
          onClose={() => setImporting(false)}
          onImported={() => {
            setImporting(false);
            reload();
            subjects.reload();
          }}
        />
      )}
    </div>
  );
}
