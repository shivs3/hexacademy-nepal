import Link from "next/link";

import { formatDate } from "@/lib/utils";
import type { BlogPostSummary } from "@/types/cms";

import { MediaImage } from "./media-image";

export function BlogCard({ post }: { post: BlogPostSummary }) {
  return (
    <article className="group relative flex h-full flex-col overflow-hidden rounded-[var(--radius-card)] border border-line bg-white transition-shadow hover:shadow-md">
      {post.cover ? (
        <div className="aspect-[16/9] overflow-hidden bg-page">
          <MediaImage image={post.cover} alt="" className="h-full object-cover" sizes="(min-width: 1024px) 33vw, 100vw" />
        </div>
      ) : (
        <div className="aspect-[16/9] bg-gradient-to-br from-teal-50 to-mint-50" aria-hidden="true" />
      )}
      <div className="flex flex-1 flex-col p-5">
        {post.categories.length > 0 && (
          <p className="text-xs font-semibold uppercase tracking-wide text-teal-700">
            {post.categories.map((c) => c.name).join(" · ")}
          </p>
        )}
        <h2 className="mt-2 text-lg font-semibold leading-snug">
          <Link href={`/blog/${post.slug}`} className="after:absolute after:inset-0 group-hover:text-teal-700">
            {post.title}
          </Link>
        </h2>
        {post.excerpt && <p className="mt-2 line-clamp-3 text-sm text-muted">{post.excerpt}</p>}
        <p className="mt-auto pt-4 text-xs text-muted">
          <time dateTime={post.published_at}>{formatDate(post.published_at)}</time> · {post.reading_minutes} min read
          {post.author && <> · {post.author.name}</>}
        </p>
      </div>
    </article>
  );
}
