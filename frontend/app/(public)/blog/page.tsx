import { Newspaper } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { BlogCard } from "@/components/cms/blog-card";
import { EmptyState } from "@/components/ui/feedback";
import { serverGet } from "@/lib/api/server";
import { buildMetadata, getSiteSettings } from "@/lib/cms";
import { cn } from "@/lib/utils";
import type { Paginated } from "@/types/accounts";
import type { BlogCategory, BlogPostSummary } from "@/types/cms";

type Props = { searchParams: Promise<{ category?: string; page?: string }> };

function pageNumber(value: string | undefined): number {
  const n = Number.parseInt(value ?? "1", 10);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const { category, page } = await searchParams;
  const settings = await getSiteSettings();
  const meta = buildMetadata(settings, { title: "Blog", path: "/blog" });
  // Filtered and paginated listings are not separate documents for search engines.
  if (category || pageNumber(page) > 1) meta.robots = { index: false, follow: true };
  return meta;
}

function href(category: string | undefined, page: number) {
  const params = new URLSearchParams();
  if (category) params.set("category", category);
  if (page > 1) params.set("page", String(page));
  const qs = params.toString();
  return qs ? `/blog?${qs}` : "/blog";
}

export default async function BlogIndex({ searchParams }: Props) {
  const { category, page: rawPage } = await searchParams;
  const page = pageNumber(rawPage);
  const [posts, categories] = await Promise.all([
    serverGet<Paginated<BlogPostSummary>>("/blog/posts/", { category, page }).catch((err: { status?: number }) => {
      if (err.status === 404) return null; // page number beyond the last page
      throw err;
    }),
    serverGet<BlogCategory[]>("/blog/categories/"),
  ]);
  const active = categories.find((c) => c.slug === category);

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-14 sm:px-6">
      <header className="max-w-2xl">
        <h1 className="text-4xl font-bold">{active ? active.name : "Blog"}</h1>
        <p className="mt-3 text-lg text-muted">
          {active?.description || "Articles, guides and updates from the Hexacademy team."}
        </p>
      </header>

      {categories.length > 0 && (
        <nav aria-label="Blog categories" className="mt-8 flex flex-wrap gap-2">
          {[{ name: "All", slug: "" }, ...categories].map((c) => {
            const current = (c.slug || undefined) === category;
            return (
              <Link
                key={c.slug || "all"}
                href={href(c.slug || undefined, 1)}
                aria-current={current ? "page" : undefined}
                className={cn(
                  "rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors",
                  current ? "border-navy bg-navy text-white" : "border-line bg-white text-navy hover:border-teal/40 hover:bg-teal-50",
                )}
              >
                {c.name}
              </Link>
            );
          })}
        </nav>
      )}

      {!posts || posts.results.length === 0 ? (
        <EmptyState
          className="mt-10"
          icon={Newspaper}
          title="No articles yet"
          description={category ? "There are no published articles in this category." : "Published articles will appear here."}
        />
      ) : (
        <>
          <ul className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {posts.results.map((post) => (
              <li key={post.slug}>
                <BlogCard post={post} />
              </li>
            ))}
          </ul>
          {posts.total_pages > 1 && (
            <nav aria-label="Pagination" className="mt-12 flex items-center justify-center gap-4 text-sm">
              {page > 1 ? (
                <Link href={href(category, page - 1)} rel="prev" className="font-medium text-teal-700 hover:underline">
                  ← Newer
                </Link>
              ) : (
                <span aria-disabled="true" className="cursor-default text-muted">← Newer</span>
              )}
              <span className="text-muted">
                Page {posts.page} of {posts.total_pages}
              </span>
              {posts.next ? (
                <Link href={href(category, page + 1)} rel="next" className="font-medium text-teal-700 hover:underline">
                  Older →
                </Link>
              ) : (
                <span aria-disabled="true" className="cursor-default text-muted">Older →</span>
              )}
            </nav>
          )}
        </>
      )}
    </div>
  );
}
