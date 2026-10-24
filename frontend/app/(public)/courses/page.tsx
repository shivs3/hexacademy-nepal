import { BookOpen } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { CourseCard } from "@/components/courses/course-card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/feedback";
import { serverGet } from "@/lib/api/server";
import { buildMetadata, getSiteSettings } from "@/lib/cms";
import type { Paginated } from "@/types/accounts";
import { type CourseCard as CourseCardData, LEVEL_LABELS, type PublicCategory } from "@/types/catalog";

type Filters = { search?: string; category?: string; level?: string; price?: string; ordering?: string; page?: string };
type Props = { searchParams: Promise<Filters> };

const ORDERINGS = { newest: "Newest", title: "Title (A–Z)", price_low: "Price: low to high", price_high: "Price: high to low" };
const PAGE_SIZE = 12;

function pageNumber(value: string | undefined): number {
  const n = Number.parseInt(value ?? "1", 10);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

function href(filters: Filters, page: number) {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(filters)) if (v && k !== "page") params.set(k, v);
  if (page > 1) params.set("page", String(page));
  const qs = params.toString();
  return qs ? `/courses?${qs}` : "/courses";
}

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const filters = await searchParams;
  const settings = await getSiteSettings();
  const meta = buildMetadata(settings, { title: "Courses", path: "/courses" });
  // Filtered and paginated listings are not separate documents for search engines.
  if (Object.values(filters).some(Boolean)) meta.robots = { index: false, follow: true };
  return meta;
}

const selectClass =
  "h-10 rounded-[var(--radius-control)] border border-line bg-white px-3 text-sm text-body focus-visible:outline-2 focus-visible:outline-teal";

export default async function CoursesPage({ searchParams }: Props) {
  const filters = await searchParams;
  const page = pageNumber(filters.page);
  const [courses, categories] = await Promise.all([
    serverGet<Paginated<CourseCardData>>("/courses/", {
      search: filters.search,
      category: filters.category,
      level: filters.level,
      price: filters.price,
      ordering: filters.ordering,
      page,
      page_size: PAGE_SIZE,
    }).catch((err: { status?: number }) => {
      if (err.status === 404) return null; // page number beyond the last page
      throw err;
    }),
    serverGet<PublicCategory[]>("/course-categories/"),
  ]);
  const filtered = Boolean(filters.search || filters.category || filters.level || filters.price);
  const activeCategory = categories.flatMap((c) => [c, ...c.children]).find((c) => c.slug === filters.category);

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-14 sm:px-6">
      <header className="max-w-2xl">
        <h1 className="text-4xl font-bold">{activeCategory ? activeCategory.name : "Courses"}</h1>
        <p className="mt-3 text-lg text-muted">
          {activeCategory?.description || "Recorded courses you can study at your own pace."}
        </p>
      </header>

      <form method="get" action="/courses" className="mt-8 grid gap-3 rounded-[var(--radius-card)] border border-line bg-white p-4 sm:grid-cols-2 lg:grid-cols-[2fr_repeat(4,1fr)_auto]">
        <label className="flex flex-col gap-1 text-sm font-medium text-navy sm:col-span-2 lg:col-span-1">
          Search
          <input
            type="search"
            name="search"
            defaultValue={filters.search}
            placeholder="Course title or topic"
            maxLength={100}
            className={`${selectClass} placeholder:text-muted`}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium text-navy">
          Category
          <select name="category" defaultValue={filters.category ?? ""} className={selectClass}>
            <option value="">All categories</option>
            {categories.map((c) => (
              <optgroup key={c.id} label={c.name}>
                <option value={c.slug}>All {c.name}</option>
                {c.children.map((child) => (
                  <option key={child.id} value={child.slug}>
                    {child.name}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium text-navy">
          Level
          <select name="level" defaultValue={filters.level ?? ""} className={selectClass}>
            <option value="">Any level</option>
            {Object.entries(LEVEL_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium text-navy">
          Price
          <select name="price" defaultValue={filters.price ?? ""} className={selectClass}>
            <option value="">Free and paid</option>
            <option value="free">Free</option>
            <option value="paid">Paid</option>
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
              <Link href="/courses">Clear</Link>
            </Button>
          )}
        </div>
      </form>

      {!courses || courses.results.length === 0 ? (
        <EmptyState
          className="mt-10"
          icon={BookOpen}
          title={filtered ? "No courses match these filters" : "No courses published yet"}
          description={filtered ? "Try a different search or clear the filters." : "Published courses will appear here."}
          action={
            filtered ? (
              <Button asChild variant="outline">
                <Link href="/courses">Clear filters</Link>
              </Button>
            ) : undefined
          }
        />
      ) : (
        <>
          <p className="mt-8 text-sm text-muted" aria-live="polite">
            {courses.count} {courses.count === 1 ? "course" : "courses"}
          </p>
          <ul className="mt-4 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {courses.results.map((course) => (
              <li key={course.id}>
                <CourseCard course={course} headingLevel="h2" />
              </li>
            ))}
          </ul>
          {courses.total_pages > 1 && (
            <nav aria-label="Pagination" className="mt-12 flex items-center justify-center gap-4 text-sm">
              {page > 1 ? (
                <Link href={href(filters, page - 1)} rel="prev" className="font-medium text-teal-700 hover:underline">
                  ← Previous
                </Link>
              ) : (
                <span aria-disabled="true" className="cursor-default text-muted">← Previous</span>
              )}
              <span className="text-muted">
                Page {courses.page} of {courses.total_pages}
              </span>
              {courses.next ? (
                <Link href={href(filters, page + 1)} rel="next" className="font-medium text-teal-700 hover:underline">
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
