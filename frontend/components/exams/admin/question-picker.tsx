"use client";

import { useState } from "react";

import { LoadError, Pager, SearchBox, TableSkeleton } from "@/components/cms/admin/list-parts";
import { RichText } from "@/components/cms/rich-text";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/feedback";
import { Checkbox, Select } from "@/components/ui/input";
import { useApiResource, useDebounced } from "@/hooks/use-api-resource";
import { DIFFICULTY_LABEL, KIND_LABEL, formatMarks } from "@/lib/assessments";
import type { Paginated } from "@/types/accounts";
import type { AdminQuestionSummary, AdminSubject } from "@/types/assessments";

/** Choose questions from the bank. Only active questions are offered: drafts and retired ones cannot be published. */
export function QuestionPicker({ exclude, onClose, onAdd }: { exclude: number[]; onClose: () => void; onAdd: (questions: AdminQuestionSummary[]) => void }) {
  const [search, setSearch] = useState("");
  const [subject, setSubject] = useState("");
  const [topic, setTopic] = useState("");
  const [difficulty, setDifficulty] = useState("");
  const [page, setPage] = useState(1);
  const [chosen, setChosen] = useState<Map<number, AdminQuestionSummary>>(new Map());
  const q = useDebounced(search);
  const { data, error, reload } = useApiResource<Paginated<AdminQuestionSummary>>("/admin/assessments/questions/", {
    status: "active",
    search: q,
    subject,
    topic,
    difficulty,
    page,
  });
  const subjects = useApiResource<AdminSubject[]>("/admin/assessments/subjects/");
  const current = subjects.data?.find((s) => String(s.id) === subject);

  function toggle(question: AdminQuestionSummary) {
    setChosen((m) => {
      const next = new Map(m);
      if (next.has(question.id)) next.delete(question.id);
      else next.set(question.id, question);
      return next;
    });
  }

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title="Add questions"
      description="Active questions you may use. Marks default to each question's own and can be changed for this exam."
      className="max-w-3xl"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={chosen.size === 0} onClick={() => onAdd([...chosen.values()])}>
            Add {chosen.size || ""} question{chosen.size === 1 ? "" : "s"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <SearchBox
          value={search}
          onChange={(v) => {
            setSearch(v);
            setPage(1);
          }}
          label="Search questions"
          placeholder="Search text, tag or #id"
        />
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <Select
            aria-label="Subject"
            value={subject}
            onChange={(e) => {
              setSubject(e.target.value);
              setTopic("");
              setPage(1);
            }}
          >
            <option value="">Any subject</option>
            {subjects.data?.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
          <Select
            aria-label="Topic"
            value={topic}
            disabled={!current?.topics.length}
            onChange={(e) => {
              setTopic(e.target.value);
              setPage(1);
            }}
          >
            <option value="">Any topic</option>
            {current?.topics.map((t) => (
              <option key={t.id} value={t.id}>
                {t.parent ? `— ${t.name}` : t.name}
              </option>
            ))}
          </Select>
          <Select
            aria-label="Difficulty"
            value={difficulty}
            onChange={(e) => {
              setDifficulty(e.target.value);
              setPage(1);
            }}
          >
            <option value="">Any difficulty</option>
            {Object.entries(DIFFICULTY_LABEL).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </div>

        {error && <LoadError message={error} onRetry={reload} />}
        {!data && !error && <TableSkeleton rows={4} />}
        {data && data.results.length === 0 && <p className="py-6 text-center text-sm text-muted">No active questions match. Questions must be marked active before they can be added.</p>}
        {data && data.results.length > 0 && (
          <div className="rounded-md border border-line">
            <ul className="divide-y divide-line">
              {data.results.map((question) => {
                const added = exclude.includes(question.id);
                return (
                  <li key={question.id}>
                    <label className="flex cursor-pointer gap-3 px-3 py-2.5 hover:bg-page has-[:disabled]:cursor-default has-[:disabled]:opacity-60">
                      <Checkbox checked={added || chosen.has(question.id)} disabled={added} onChange={() => toggle(question)} className="mt-1" aria-label={`Select question ${question.id}`} />
                      <span className="min-w-0 flex-1">
                        <RichText html={question.prompt} className="prose-sm line-clamp-2 prose-p:my-0" />
                        <span className="mt-1 flex flex-wrap items-center gap-1 text-xs text-muted">
                          #{question.id} · {KIND_LABEL[question.kind]} · {DIFFICULTY_LABEL[question.difficulty]} · {question.subject_name}
                          {question.topic_name && ` / ${question.topic_name}`} · {formatMarks(question.default_marks)} marks
                          {question.course ? <Badge tone="teal">{question.course_title}</Badge> : <Badge>Shared</Badge>}
                          {added && <Badge tone="success">Added</Badge>}
                        </span>
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
            <Pager data={data} onPage={setPage} />
          </div>
        )}
      </div>
    </Dialog>
  );
}
