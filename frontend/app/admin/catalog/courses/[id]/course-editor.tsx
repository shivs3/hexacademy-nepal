"use client";

import { Archive, ArrowLeft, ExternalLink, MoreHorizontal, Trash2, Undo2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState } from "react";

import { LoadError, StatusBadge } from "@/components/cms/admin/list-parts";
import { ImageInput } from "@/components/cms/admin/media-picker";
import { RichTextEditor } from "@/components/cms/admin/rich-text-editor";
import { SeoFields, type SeoValues } from "@/components/cms/admin/seo-fields";
import { CurriculumBuilder } from "@/components/courses/admin/curriculum-builder";
import { TeamEditor } from "@/components/courses/admin/team-editor";
import { TextListInput } from "@/components/courses/admin/text-list-input";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Alert, Badge, Skeleton } from "@/components/ui/feedback";
import { Field } from "@/components/ui/field";
import { Checkbox, Input, Label, Select } from "@/components/ui/input";
import { Menu, MenuItem, MenuSeparator } from "@/components/ui/menu";
import { useToast } from "@/components/ui/toast";
import { useApiResource } from "@/hooks/use-api-resource";
import { useSaveShortcut, useUnsavedWarning } from "@/hooks/use-unsaved-warning";
import { api } from "@/lib/api/client";
import { errorMessage, isApiError } from "@/lib/api/errors";
import { cn, formatDateTime, toLocalInput } from "@/lib/utils";
import { LANGUAGE_LABELS, LEVEL_LABELS, type CourseLevel } from "@/types/catalog";
import { TEAM_ROLE_LABELS, type AdminCategory, type AdminCourse, type CourseStatus } from "@/types/catalog-admin";
import type { MediaRef } from "@/types/cms";

type Draft = SeoValues & {
  title: string;
  slug: string;
  subtitle: string;
  description: string;
  category: number | null;
  thumbnail: number | null;
  thumbnail_detail: MediaRef | null;
  level: CourseLevel;
  language: string;
  duration_text: string;
  learning_outcomes: string[];
  prerequisites: string[];
  sequential: boolean;
  price: string;
  sale_price: string;
  sale_ends_at: string; // datetime-local value in the browser's zone
  is_featured: boolean;
};
type Tab = "details" | "curriculum" | "team";

function toDraft(c: AdminCourse): Draft {
  return {
    title: c.title,
    slug: c.slug,
    subtitle: c.subtitle,
    description: c.description,
    category: c.category,
    thumbnail: c.thumbnail,
    thumbnail_detail: c.thumbnail_detail,
    level: c.level,
    language: c.language,
    duration_text: c.duration_text,
    learning_outcomes: c.learning_outcomes,
    prerequisites: c.prerequisites,
    sequential: c.sequential,
    price: c.price,
    sale_price: c.sale_price ?? "",
    sale_ends_at: c.sale_ends_at ? toLocalInput(new Date(c.sale_ends_at)) : "",
    is_featured: c.is_featured,
    meta_title: c.meta_title,
    meta_description: c.meta_description,
    canonical_url: c.canonical_url,
    og_image: c.og_image,
    og_image_detail: c.og_image_detail,
    noindex: c.noindex,
  };
}

/** The fields the API accepts (image details are display-only). */
function payload(d: Draft): Record<string, unknown> {
  const saleEnds = d.sale_ends_at ? new Date(d.sale_ends_at) : null;
  return {
    title: d.title,
    slug: d.slug,
    subtitle: d.subtitle,
    description: d.description,
    category: d.category,
    thumbnail: d.thumbnail,
    level: d.level,
    language: d.language,
    duration_text: d.duration_text,
    learning_outcomes: d.learning_outcomes.map((v) => v.trim()).filter(Boolean),
    prerequisites: d.prerequisites.map((v) => v.trim()).filter(Boolean),
    sequential: d.sequential,
    price: d.price.trim(),
    sale_price: d.sale_price.trim() || null,
    sale_ends_at: saleEnds && !Number.isNaN(saleEnds.getTime()) ? saleEnds.toISOString() : null,
    is_featured: d.is_featured,
    meta_title: d.meta_title,
    meta_description: d.meta_description,
    canonical_url: d.canonical_url,
    og_image: d.og_image,
    noindex: d.noindex,
  };
}

/**
 * Only changed fields are sent: the API refuses manager-only fields (price, featured flag)
 * from instructors even when unchanged, and a PATCH of the diff keeps concurrent edits to
 * other fields intact.
 */
function changes(d: Draft, server: AdminCourse): Record<string, unknown> {
  const now = payload(d);
  const before = payload(toDraft(server));
  return Object.fromEntries(Object.entries(now).filter(([k, v]) => JSON.stringify(v) !== JSON.stringify(before[k])));
}

const STATUS_COPY: Record<CourseStatus, { done: string }> = {
  published: { done: "Course published." },
  draft: { done: "Course moved back to drafts." },
  archived: { done: "Course archived." },
};

export function CourseEditor({ courseId, canPickMedia, canUpload }: { courseId: number; canPickMedia: boolean; canUpload: boolean }) {
  const toast = useToast();
  const router = useRouter();
  const courseRes = useApiResource<AdminCourse>(`/admin/catalog/courses/${courseId}/`);
  const categoriesRes = useApiResource<AdminCategory[]>("/admin/catalog/categories/");
  const [course, setCourse] = useState<AdminCourse | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<CourseStatus | "delete" | null>(null);
  const [tab, setTab] = useState<Tab>("details");

  if (courseRes.data && course === null) {
    setCourse(courseRes.data);
    setDraft(toDraft(courseRes.data));
  }

  const diff = useMemo(() => (course && draft ? changes(draft, course) : {}), [course, draft]);
  const dirty = Object.keys(diff).length > 0;
  useUnsavedWarning(dirty);

  const adopt = useCallback((c: AdminCourse) => {
    setCourse(c);
    setDraft(toDraft(c));
  }, []);

  const save = useCallback(async (): Promise<AdminCourse | null> => {
    if (!course) return null;
    if (!dirty) return course;
    setSaving(true);
    setFormError(null);
    try {
      const saved = await api.patch<AdminCourse>(`/admin/catalog/courses/${courseId}/`, diff);
      adopt(saved);
      setErrors({});
      return saved;
    } catch (err) {
      const fields = isApiError(err) ? err.fieldErrors() : {};
      setErrors(fields);
      setFormError(Object.keys(fields).length ? "Some fields need attention." : errorMessage(err));
      return null;
    } finally {
      setSaving(false);
    }
  }, [adopt, course, courseId, diff, dirty]);

  const canEdit = Boolean(course?.abilities.edit);
  const onSave = useCallback(() => {
    void save().then((c) => c && toast.success(c.status === "published" ? "Course updated. The changes are live." : "Draft saved."));
  }, [save, toast]);
  useSaveShortcut(onSave, dirty && canEdit);

  async function setStatus(status: CourseStatus) {
    setBusy(status);
    try {
      if (dirty && canEdit && !(await save())) return;
      const updated = await api.post<AdminCourse>(`/admin/catalog/courses/${courseId}/status/`, { status });
      adopt(updated);
      setConfirm(null);
      toast.success(STATUS_COPY[status].done);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    setBusy("delete");
    try {
      await api.delete(`/admin/catalog/courses/${courseId}/`);
      toast.success("Course deleted.");
      router.push("/admin/catalog");
    } catch (err) {
      toast.error(errorMessage(err));
      setBusy(null);
    }
  }

  // Lesson counts and publish checks change with the curriculum; refresh them without touching the draft.
  const refreshSummary = useCallback(async () => {
    try {
      const fresh = await api.get<AdminCourse>(`/admin/catalog/courses/${courseId}/`);
      setCourse((c) => (c ? { ...c, lesson_count: fresh.lesson_count, published_lesson_count: fresh.published_lesson_count, publish_problems: fresh.publish_problems } : fresh));
    } catch {
      // The summary is advisory; the publish endpoint re-checks.
    }
  }, [courseId]);

  if (courseRes.error && !course) return <LoadError message={courseRes.error} onRetry={courseRes.reload} />;
  if (!course || !draft) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  const update = (patch: Partial<Draft>) => setDraft((d) => (d ? { ...d, ...patch } : d));
  const { abilities } = course;
  const isLive = course.status === "published";
  const isArchived = course.status === "archived";
  const slugLocked = !abilities.manage && course.status !== "draft";
  const tabs: { id: Tab; label: string }[] = [
    { id: "details", label: "Details" },
    { id: "curriculum", label: `Curriculum (${course.lesson_count})` },
    ...(abilities.manage ? [{ id: "team" as const, label: `Teaching team (${course.team.length})` }] : []),
  ];

  return (
    <div className="flex flex-col gap-5">
      <div>
        <Link href="/admin/catalog" className="inline-flex items-center gap-1 text-sm text-muted hover:text-navy">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          All courses
        </Link>
      </div>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-semibold">{draft.title || "Untitled course"}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted">
            <StatusBadge status={course.status} />
            {dirty && <Badge tone="warning">Unsaved edits</Badge>}
            <span>
              {course.published_lesson_count} of {course.lesson_count} lessons published · {course.enrollment_count} learners
            </span>
            {isLive && (
              <a href={`/courses/${course.slug}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:text-teal-700">
                /courses/{course.slug}
                <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
              </a>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {canEdit && tab === "details" && (
            <Button variant={abilities.publish && !isLive ? "outline" : "primary"} onClick={onSave} disabled={!dirty} loading={saving && !busy}>
              {isLive ? "Update course" : "Save draft"}
            </Button>
          )}
          {abilities.publish && !isLive && !isArchived && (
            <Button onClick={() => setConfirm("published")} loading={busy === "published"} disabled={course.publish_problems.length > 0}>
              Publish
            </Button>
          )}
          {(abilities.publish || abilities.delete) && (
            <Menu
              trigger={
                <Button variant="outline" size="icon" aria-label="More course actions">
                  <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
                </Button>
              }
            >
              {abilities.publish && isLive && course.enrollment_count === 0 && (
                <MenuItem onSelect={() => setConfirm("draft")}>
                  <Undo2 className="h-4 w-4" aria-hidden="true" />
                  Unpublish
                </MenuItem>
              )}
              {abilities.publish && isArchived && (
                <MenuItem onSelect={() => setStatus("draft")}>
                  <Undo2 className="h-4 w-4" aria-hidden="true" />
                  Restore as draft
                </MenuItem>
              )}
              {abilities.publish && !isArchived && (
                <MenuItem onSelect={() => setConfirm("archived")}>
                  <Archive className="h-4 w-4" aria-hidden="true" />
                  Archive
                </MenuItem>
              )}
              {abilities.delete && (
                <>
                  <MenuSeparator />
                  <MenuItem danger onSelect={() => setConfirm("delete")} disabled={course.enrollment_count > 0}>
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                    Delete course
                  </MenuItem>
                </>
              )}
            </Menu>
          )}
        </div>
      </div>

      {!canEdit && <Alert tone="info">You can view this course. Only its instructors and catalog managers can change it.</Alert>}
      {canEdit && isLive && <Alert tone="info">This course is live: saved changes are visible to visitors and learners immediately.</Alert>}
      {canEdit && !abilities.publish && !isLive && (
        <Alert tone="info">You can build and save this course. Someone with publishing rights makes it live.</Alert>
      )}
      {!isLive && !isArchived && course.publish_problems.length > 0 && (
        <Alert tone="warning">
          <p className="font-medium">Before this course can be published:</p>
          <ul className="mt-1 list-disc pl-5">
            {course.publish_problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </Alert>
      )}
      {formError && <Alert tone="danger">{formError}</Alert>}

      <div role="tablist" aria-label="Course sections" className="flex gap-1 overflow-x-auto border-b border-line">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`tab-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls={`panel-${t.id}`}
            onClick={() => setTab(t.id)}
            className={cn(
              "-mb-px whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal",
              tab === t.id ? "border-teal text-navy" : "border-transparent text-muted hover:text-navy",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
        {tab === "curriculum" ? (
          <CurriculumBuilder courseId={courseId} canEdit={canEdit} onChanged={refreshSummary} />
        ) : tab === "team" ? (
          <TeamEditor courseId={courseId} team={course.team} onSaved={(c) => setCourse((prev) => (prev ? { ...prev, team: c.team } : c))} />
        ) : (
          <fieldset disabled={!canEdit} className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
            <div className="flex min-w-0 flex-col gap-5">
              <Card>
                <CardBody className="flex flex-col gap-4">
                  <Field label="Title" htmlFor="course-title" error={errors.title} required>
                    <Input value={draft.title} maxLength={160} onChange={(e) => update({ title: e.target.value })} />
                  </Field>
                  <Field label="Subtitle" htmlFor="course-subtitle" error={errors.subtitle} hint="One sentence shown on course cards and under the title.">
                    <Input value={draft.subtitle} maxLength={220} onChange={(e) => update({ subtitle: e.target.value })} />
                  </Field>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="course-description">About this course</Label>
                    <RichTextEditor
                      id="course-description"
                      value={draft.description}
                      invalid={!!errors.description}
                      onChange={(description) => update({ description })}
                      placeholderLabel="Describe what the course covers and who it is for…"
                    />
                    {errors.description && <p className="text-xs text-danger">{errors.description}</p>}
                  </div>
                </CardBody>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>What learners will get</CardTitle>
                </CardHeader>
                <CardBody className="flex flex-col gap-5">
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="course-outcomes">Learning outcomes</Label>
                    <TextListInput
                      id="course-outcomes"
                      value={draft.learning_outcomes}
                      onChange={(learning_outcomes) => update({ learning_outcomes })}
                      max={12}
                      placeholder="e.g. Build a REST API with Django"
                      disabled={!canEdit}
                    />
                    {errors.learning_outcomes && <p className="text-xs text-danger">{errors.learning_outcomes}</p>}
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="course-prerequisites">Prerequisites</Label>
                    <TextListInput
                      id="course-prerequisites"
                      value={draft.prerequisites}
                      onChange={(prerequisites) => update({ prerequisites })}
                      max={10}
                      placeholder="e.g. Basic Python"
                      disabled={!canEdit}
                    />
                    {errors.prerequisites && <p className="text-xs text-danger">{errors.prerequisites}</p>}
                  </div>
                </CardBody>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>Search and sharing</CardTitle>
                </CardHeader>
                <CardBody>
                  <SeoFields value={draft} onChange={update} errors={errors} fallbackTitle={draft.title} canPickImage={canPickMedia} />
                </CardBody>
              </Card>
            </div>

            <div className="flex flex-col gap-5">
              <Card>
                <CardHeader>
                  <CardTitle>Details</CardTitle>
                </CardHeader>
                <CardBody className="flex flex-col gap-4">
                  <Field
                    label="Address"
                    htmlFor="course-slug"
                    error={errors.slug}
                    hint={slugLocked ? "Only catalog managers can change the address of a live course." : `/courses/${draft.slug}`}
                    required
                  >
                    <Input value={draft.slug} maxLength={160} disabled={slugLocked} onChange={(e) => update({ slug: e.target.value.toLowerCase() })} />
                  </Field>
                  {course.status !== "draft" && draft.slug !== course.slug && <Alert tone="warning">Changing the address of a live course breaks existing links to it.</Alert>}
                  <Field label="Category" htmlFor="course-category" error={errors.category}>
                    <Select value={draft.category ?? ""} disabled={!categoriesRes.data} onChange={(e) => update({ category: e.target.value ? Number(e.target.value) : null })}>
                      <option value="">No category</option>
                      {categoriesRes.data?.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.parent ? `— ${c.name}` : c.name}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Level" htmlFor="course-level" error={errors.level}>
                      <Select value={draft.level} onChange={(e) => update({ level: e.target.value as CourseLevel })}>
                        {Object.entries(LEVEL_LABELS).map(([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <Field label="Language" htmlFor="course-language" error={errors.language}>
                      <Select value={draft.language} onChange={(e) => update({ language: e.target.value })}>
                        {Object.entries(LANGUAGE_LABELS).map(([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ))}
                      </Select>
                    </Field>
                  </div>
                  <Field label="Duration" htmlFor="course-duration" error={errors.duration_text} hint="Shown as written, e.g. “8 weeks, 4 hours a week”.">
                    <Input value={draft.duration_text} maxLength={60} onChange={(e) => update({ duration_text: e.target.value })} />
                  </Field>
                  <Label className="flex items-start gap-2 font-normal">
                    <Checkbox checked={draft.sequential} onChange={(e) => update({ sequential: e.target.checked })} className="mt-0.5" />
                    <span>
                      Lessons unlock in order
                      <span className="block text-xs text-muted">Learners must complete each lesson before opening the next.</span>
                    </span>
                  </Label>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="course-thumbnail">Thumbnail</Label>
                    <ImageInput
                      id="course-thumbnail"
                      value={draft.thumbnail}
                      detail={draft.thumbnail_detail}
                      canUpload={canUpload}
                      readOnly={!canPickMedia}
                      invalid={!!errors.thumbnail}
                      onChange={(thumbnail, ref) => update({ thumbnail, thumbnail_detail: ref })}
                    />
                    {errors.thumbnail && <p className="text-xs text-danger">{errors.thumbnail}</p>}
                  </div>
                </CardBody>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Pricing</CardTitle>
                </CardHeader>
                <CardBody className="flex flex-col gap-4">
                  {!abilities.manage && <p className="text-xs text-muted">Prices and featuring are set by catalog managers.</p>}
                  <Field label="Price (NPR)" htmlFor="course-price" error={errors.price} hint="0 makes the course free.">
                    <Input type="number" inputMode="decimal" min={0} step="0.01" value={draft.price} disabled={!abilities.manage} onChange={(e) => update({ price: e.target.value })} />
                  </Field>
                  <Field label="Sale price (NPR)" htmlFor="course-sale" error={errors.sale_price} hint="Optional. Must be lower than the price.">
                    <Input type="number" inputMode="decimal" min={0} step="0.01" value={draft.sale_price} disabled={!abilities.manage} onChange={(e) => update({ sale_price: e.target.value })} />
                  </Field>
                  {draft.sale_price.trim() !== "" && (
                    <Field label="Sale ends" htmlFor="course-sale-ends" error={errors.sale_ends_at} hint="Optional. In your time zone; leave blank to keep the sale running.">
                      <Input type="datetime-local" value={draft.sale_ends_at} disabled={!abilities.manage} onChange={(e) => update({ sale_ends_at: e.target.value })} />
                    </Field>
                  )}
                  <Label className="flex items-center gap-2 font-normal">
                    <Checkbox checked={draft.is_featured} disabled={!abilities.manage} onChange={(e) => update({ is_featured: e.target.checked })} />
                    Feature this course
                  </Label>
                </CardBody>
              </Card>

              {!abilities.manage && (
                <Card>
                  <CardHeader>
                    <CardTitle>Teaching team</CardTitle>
                  </CardHeader>
                  <CardBody>
                    <ul className="flex flex-col gap-2 text-sm">
                      {course.team.map((m) => (
                        <li key={m.user_id}>
                          <span className="font-medium text-navy">{m.full_name || m.email}</span>
                          <span className="block text-xs text-muted">{TEAM_ROLE_LABELS[m.role]}</span>
                        </li>
                      ))}
                    </ul>
                  </CardBody>
                </Card>
              )}
              <p className="text-xs text-muted">
                Created {formatDateTime(course.created_at)} · Last updated {formatDateTime(course.updated_at)}
                {course.published_at && <> · First published {formatDateTime(course.published_at)}</>}
              </p>
            </div>
          </fieldset>
        )}
      </div>

      <ConfirmDialog
        open={confirm === "published"}
        onOpenChange={(o) => !o && setConfirm(null)}
        title="Publish this course?"
        description={
          dirty
            ? "Your edits will be saved and the course will appear in the catalog immediately. Only published lessons are shown."
            : "The course will appear in the catalog immediately. Only published lessons are shown."
        }
        confirmLabel="Publish"
        loading={busy === "published"}
        onConfirm={() => setStatus("published")}
      />
      <ConfirmDialog
        open={confirm === "draft"}
        onOpenChange={(o) => !o && setConfirm(null)}
        title="Unpublish this course?"
        description="It disappears from the catalog and returns to drafts. Courses with learners are archived instead."
        confirmLabel="Unpublish"
        tone="danger"
        loading={busy === "draft"}
        onConfirm={() => setStatus("draft")}
      />
      <ConfirmDialog
        open={confirm === "archived"}
        onOpenChange={(o) => !o && setConfirm(null)}
        title="Archive this course?"
        description="It is removed from the catalog and closed to new enrollments. Enrolled learners keep access to review it."
        confirmLabel="Archive"
        tone="danger"
        loading={busy === "archived"}
        onConfirm={() => setStatus("archived")}
      />
      <ConfirmDialog
        open={confirm === "delete"}
        onOpenChange={(o) => !o && setConfirm(null)}
        title="Delete this course permanently?"
        description="Its modules, lessons and files are deleted too. This cannot be undone."
        confirmLabel="Delete"
        tone="danger"
        loading={busy === "delete"}
        onConfirm={remove}
      />
    </div>
  );
}
