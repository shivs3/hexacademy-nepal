import { ClipboardCheck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { PublicExamCard } from "@/components/exams/public-exam-card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/feedback";
import { serverGet } from "@/lib/api/server";
import { EXAM_KIND_LABEL, EXAM_OFFER_LABEL } from "@/lib/assessments";
import { buildMetadata, getSiteSettings } from "@/lib/cms";
import { cn } from "@/lib/utils";
import type { Paginated } from "@/types/accounts";
import type { PublicExam, PublicExamCategory } from "@/types/assessments";

type Filters = { search?: string; category?: string; kind?: string; offer?: string; ordering?: string; page?: string };
type Props = { searchParams: Promise<Filters> };

const ORDERINGS = { newest: "Newest", title: "Title (A–Z)", price_low: "Price: low to high", price_high: "Price: high to low" };
const PAGE_SIZE = 12;

function pageNumber(value: string | undefined): number {
  const n = Number.parseInt(value ?? "1", 10);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

function href(filters: Filters, changes: Partial<Filters> = {}) {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...filters, ...changes })) if (v && !(k === "page" && v === "1")) params.set(k, v);
  const qs = params.toString();
  return qs ? `/exams?${qs}` : "/exams";
}

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const filters = await searchParams;
  const settings = await getSiteSettings();
  const meta = buildMetadata(settings, { title: "Exams and practice tests", path: "/exams" });
  if (Object.values(filters).some(Boolean)) meta.robots = { index: false, follow: true };
  return meta;
}

const selectClass =
  "h-10 rounded-[var(--radius-control)] border border-line bg-white px-3 text-sm text-body focus-visible:outline-2 focus-visible:outline-teal";

export default async function ExamsPage({ searchParams }: Props) {
  const filters = await searchParams;
  const page = pageNumber(filters.page);
  const [exams, categories] = await Promise.all([
    serverGet<Paginated<PublicExam>>("/exam-catalog/", {
      search: filters.search,
      category: filters.category,
      kind: filters.kind,
      offer: filters.offer,
      ordering: filters.ordering,
      page,
      page_size: PAGE_SIZE,
    }).catch((err: { status?: number }) => {
      if (err.status === 404) return null; // page number beyond the last page
      throw err;
    }),
    serverGet<PublicExamCategory[]>("/exam-catalog/categories/").catch(() => []),
  ]);
  const filtered = Boolean(filters.search || filters.category || filters.kind || filters.offer);
  const active = categories.find((c) => c.slug === filters.category);

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-14 sm:px-6">
      <header className="max-w-2xl">
        <h1 className="text-4xl font-bold">{active ? `${active.name} exams` : "Exams"}</h1>
        <p className="mt-3 text-lg text-muted">
          {active?.description || "Practice tests and formal exams. Take them on their own, without enrolling in a course."}
        </p>
      </header>

      {categories.length > 0 && (
        <nav aria-label="Exam categories" className="mt-8 flex flex-wrap gap-2">
          {[{ name: "All", slug: "" }, ...categories].map((c) => {
            const current = (filters.category ?? "") === c.slug;
            return (
              <Link
                key={c.slug || "all"}
                href={href(filters, { category: c.slug || undefined, page: undefined })}
                aria-current={current ? "page" : undefined}
                className={cn(
                  "rounded-full border px-4 py-1.5 text-sm font-medium transition-colors",
                  current ? "border-navy bg-navy text-white" : "border-line bg-white text-body hover:border-teal hover:text-teal-700",
                )}
              >
                {c.name}
              </Link>
            );
          })}
        </nav>
      )}

      <form method="get" action="/exams" className="mt-6 grid gap-3 rounded-[var(--radius-card)] border border-line bg-white p-4 sm:grid-cols-2 lg:grid-cols-[2fr_repeat(3,1fr)_auto]">
        {filters.category && <input type="hidden" name="category" value={filters.category} />}
        <label className="flex flex-col gap-1 text-sm font-medium text-navy sm:col-span-2 lg:col-span-1">
          Search
          <input
            type="search"
            name="search"
            defaultValue={filters.search}
            placeholder="Exam, subject or course"
            maxLength={100}
            className={`${selectClass} placeholder:text-muted`}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium text-navy">
          Type
          <select name="kind" defaultValue={filters.kind ?? ""} className={selectClass}>
            <option value="">All types</option>
            {Object.entries(EXAM_KIND_LABEL).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium text-navy">
          Access
          <select name="offer" defaultValue={filters.offer ?? ""} className={selectClass}>
            <option value="">Any</option>
            {Object.entries(EXAM_OFFER_LABEL).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium text-navy">
          Sort by
          <select name="ordering" defaultValue={filters.ordering ?? "newest"} className={selectClass}>
            {Object.entries(ORDERINGS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <div className="flex items-end gap-2">
          <Button type="submit">Apply</Button>
          {filtered && (
            <Button asChild variant="ghost">
              <Link href="/exams">Clear</Link>
            </Button>
          )}
        </div>
      </form>

      {!exams || exams.results.length === 0 ? (
        <EmptyState
          className="mt-10"
          icon={ClipboardCheck}
          title={filtered ? "No exams match these filters" : "No exams published yet"}
          description={filtered ? "Try a different search or clear the filters." : "Published exams will appear here."}
          action={
            filtered ? (
              <Button asChild variant="outline">
                <Link href="/exams">Clear filters</Link>
              </Button>
            ) : undefined
          }
        />
      ) : (
        <>
          <p className="mt-8 text-sm text-muted" aria-live="polite">
            {exams.count} {exams.count === 1 ? "exam" : "exams"}
          </p>
          <ul className="mt-4 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {exams.results.map((exam) => (
              <li key={exam.slug}>
                <PublicExamCard exam={exam} headingLevel="h2" />
              </li>
            ))}
          </ul>
          {exams.total_pages > 1 && (
            <nav aria-label="Pagination" className="mt-12 flex items-center justify-center gap-4 text-sm">
              {page > 1 ? (
                <Link href={href(filters, { page: String(page - 1) })} rel="prev" className="font-medium text-teal-700 hover:underline">
                  ← Previous
                </Link>
              ) : (
                <span aria-disabled="true" className="cursor-default text-muted">← Previous</span>
              )}
              <span className="text-muted">
                Page {exams.page} of {exams.total_pages}
              </span>
              {exams.next ? (
                <Link href={href(filters, { page: String(page + 1) })} rel="next" className="font-medium text-teal-700 hover:underline">
                  Next →
                </Link>
              ) : (
                <span aria-disabled="true" className="cursor-default text-muted">Next →</span>
              )}
            </nav>
          )}
        </>
      )}
    </div>
  );
}
