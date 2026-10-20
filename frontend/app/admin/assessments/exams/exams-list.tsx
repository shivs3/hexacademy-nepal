"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ClipboardCheck, Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { LoadError, Pager, SearchBox, TableSkeleton, th, theadClass } from "@/components/cms/admin/list-parts";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Alert, Badge, EmptyState } from "@/components/ui/feedback";
import { Field } from "@/components/ui/field";
import { Input, Select } from "@/components/ui/input";
import { useApiResource, useDebounced } from "@/hooks/use-api-resource";
import { api } from "@/lib/api/client";
import { EXAM_KIND_LABEL, EXAM_STATUS } from "@/lib/assessments";
import { applyServerErrors } from "@/lib/forms";
import { formatDateTime } from "@/lib/utils";
import { slugField, slugify } from "@/lib/validation/cms";
import type { Paginated } from "@/types/accounts";
import type { AdminExam, AdminExamSummary, CourseOption } from "@/types/assessments";

export function ExamsList({ manager, canCreate }: { manager: boolean; canCreate: boolean }) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [course, setCourse] = useState("");
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const q = useDebounced(search);
  const { data, error, reload } = useApiResource<Paginated<AdminExamSummary>>("/admin/assessments/exams/", { search: q, status, course, page });
  const courses = useApiResource<CourseOption[]>("/admin/assessments/course-options/");
  const filtered = Boolean(q || status || course);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row">
        <SearchBox
          value={search}
          onChange={(v) => {
            setSearch(v);
            setPage(1);
          }}
          label="Search exams"
          placeholder="Search title or address"
        />
        <Select
          aria-label="Filter by status"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
          className="sm:w-40"
        >
          <option value="">Any status</option>
          {Object.entries(EXAM_STATUS).map(([value, s]) => (
            <option key={value} value={value}>
              {s.label}
            </option>
          ))}
        </Select>
        {courses.data && courses.data.length > 0 && (
          <Select
            aria-label="Filter by course"
            value={course}
            onChange={(e) => {
              setCourse(e.target.value);
              setPage(1);
            }}
            className="sm:w-56"
          >
            <option value="">Any course</option>
            {courses.data.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
              </option>
            ))}
          </Select>
        )}
        {canCreate && (
          <Button onClick={() => setCreating(true)} className="sm:ml-auto">
            <Plus className="h-4 w-4" aria-hidden="true" />
            New exam
          </Button>
        )}
      </div>

      {error && <LoadError message={error} onRetry={reload} />}

      {!data && !error ? (
        <TableSkeleton />
      ) : data && data.results.length === 0 ? (
        <EmptyState
          icon={ClipboardCheck}
          title={filtered ? "No exams match these filters" : "No exams yet"}
          description={filtered ? undefined : canCreate ? "Create an exam, add questions from the bank, then publish it." : undefined}
          action={
            !filtered && canCreate ? (
              <Button onClick={() => setCreating(true)}>
                <Plus className="h-4 w-4" aria-hidden="true" />
                New exam
              </Button>
            ) : undefined
          }
        />
      ) : data ? (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[48rem] text-left text-sm">
              <thead className={theadClass}>
                <tr>
                  <th scope="col" className={th}>Exam</th>
                  <th scope="col" className={th}>Status</th>
                  <th scope="col" className={`${th} text-right`}>Questions</th>
                  <th scope="col" className={`${th} text-right`}>Attempts</th>
                  <th scope="col" className={th}>Window</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {data.results.map((exam) => (
                  <tr key={exam.id}>
                    <td className="px-4 py-3">
                      <Link href={`/admin/assessments/exams/${exam.id}`} className="font-medium text-navy hover:text-teal-700">
                        {exam.title}
                      </Link>
                      <p className="text-xs text-muted">
                        {EXAM_KIND_LABEL[exam.kind]} · {exam.duration_minutes} min · {exam.course_title || "No course"}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={EXAM_STATUS[exam.status].tone}>{EXAM_STATUS[exam.status].label}</Badge>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">{exam.question_total}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{exam.attempt_total}</td>
                    <td className="px-4 py-3 text-xs text-muted">
                      {exam.opens_at || exam.closes_at ? (
                        <>
                          {exam.opens_at ? formatDateTime(exam.opens_at) : "Any time"}
                          {" → "}
                          {exam.closes_at ? formatDateTime(exam.closes_at) : "no end"}
                        </>
                      ) : (
                        "Always open"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pager data={data} onPage={setPage} />
        </Card>
      ) : null}

      {creating && <NewExamDialog manager={manager} courses={courses.data ?? []} onClose={() => setCreating(false)} />}
    </div>
  );
}

const newExamSchema = z.object({
  title: z.string().trim().min(1, "Give the exam a title.").max(200),
  slug: slugField(220),
  duration_minutes: z.coerce.number<string>().int("Whole minutes only.").min(1, "At least 1 minute.").max(600, "At most 600 minutes."),
  course: z.string(),
});
type NewExamValues = z.input<typeof newExamSchema>;
type NewExamOutput = z.output<typeof newExamSchema>;

function NewExamDialog({ manager, courses, onClose }: { manager: boolean; courses: CourseOption[]; onClose: () => void }) {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const [slugTouched, setSlugTouched] = useState(false);
  const form = useForm<NewExamValues, unknown, NewExamOutput>({
    resolver: zodResolver(
      newExamSchema.refine((v) => manager || v.course !== "", { path: ["course"], message: "Choose a course you teach." }),
    ),
    defaultValues: { title: "", slug: "", duration_minutes: "30", course: "" },
  });
  const { register, handleSubmit, setValue, setError, formState } = form;

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      const created = await api.post<AdminExam>("/admin/assessments/exams/", { ...values, course: values.course ? Number(values.course) : null });
      router.push(`/admin/assessments/exams/${created.id}`);
    } catch (err) {
      setFormError(applyServerErrors(err, setError, ["title", "slug", "duration_minutes", "course"]));
    }
  });

  const title = register("title");
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title="New exam"
      description="The exam starts as a draft. Add questions and settings, then publish it."
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="new-exam-form" loading={formState.isSubmitting}>
            Create draft
          </Button>
        </>
      }
    >
      <form id="new-exam-form" onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        {formError && <Alert tone="danger">{formError}</Alert>}
        <Field label="Title" htmlFor="new-exam-title" error={formState.errors.title?.message} required>
          <Input
            id="new-exam-title"
            {...title}
            autoFocus
            onChange={(e) => {
              void title.onChange(e);
              if (!slugTouched) setValue("slug", slugify(e.target.value, 220));
            }}
          />
        </Field>
        <Field label="Address" htmlFor="new-exam-slug" error={formState.errors.slug?.message} hint="Lowercase letters, numbers and hyphens." required>
          <Input id="new-exam-slug" {...register("slug", { onChange: () => setSlugTouched(true) })} />
        </Field>
        <Field label="Duration (minutes)" htmlFor="new-exam-duration" error={formState.errors.duration_minutes?.message} required>
          <Input id="new-exam-duration" inputMode="numeric" {...register("duration_minutes")} />
        </Field>
        <Field
          label="Course"
          htmlFor="new-exam-course"
          error={formState.errors.course?.message}
          hint={manager ? "Learners must be enrolled in the course to take its exams. Without a course, any signed-in learner can." : undefined}
          required={!manager}
        >
          <Select id="new-exam-course" {...register("course")}>
            <option value="">{manager ? "No course (open to all learners)" : "Choose a course"}</option>
            {courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
              </option>
            ))}
          </Select>
        </Field>
      </form>
    </Dialog>
  );
}
