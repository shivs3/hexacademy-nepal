import Link from "next/link";

import { MediaImage } from "@/components/cms/media-image";
import { RichText } from "@/components/cms/rich-text";
import { formatDate } from "@/lib/utils";
import type { BlogPostPreview } from "@/types/cms";

/** A blog post's article layout; shared by the public post page and the staff preview. */
export function BlogArticle({ post }: { post: BlogPostPreview }) {
  return (
    <article className="pb-20">
      <header className="border-b border-line bg-white">
        <div className="mx-auto w-full max-w-3xl px-4 py-12 sm:px-6">
          <nav aria-label="Breadcrumb" className="text-sm text-muted">
            <Link href="/blog" className="hover:text-teal-700 hover:underline">
              Blog
            </Link>
            {post.categories[0] && (
              <>
                {" / "}
                <Link
                  href={`/blog?category=${post.categories[0].slug}`}
                  className="hover:text-teal-700 hover:underline"
                >
                  {post.categories[0].name}
                </Link>
              </>
            )}
          </nav>
          <h1 className="mt-4 text-4xl font-bold leading-tight sm:text-5xl">
            {post.title}
          </h1>
          {post.excerpt && (
            <p className="mt-4 text-lg text-muted">{post.excerpt}</p>
          )}
          <p className="mt-6 text-sm text-muted">
            {post.author && (
              <span className="font-medium text-navy">
                {post.author.name} ·{" "}
              </span>
            )}
            {post.published_at ? (
              <time dateTime={post.published_at}>
                {formatDate(post.published_at)}
              </time>
            ) : (
              "Not yet published"
            )}{" "}
            · {post.reading_minutes} min read
          </p>
        </div>
      </header>
      {post.cover && (
        <div className="mx-auto mt-10 w-full max-w-4xl px-4 sm:px-6">
          <div className="overflow-hidden rounded-[var(--radius-card)] ring-1 ring-black/5">
            <MediaImage
              image={post.cover}
              priority
              sizes="(min-width: 1024px) 56rem, 100vw"
            />
          </div>
        </div>
      )}
      <div className="mx-auto mt-10 w-full max-w-3xl px-4 sm:px-6">
        <RichText html={post.body} className="prose-lg" />
        {post.author?.bio && (
          <aside className="mt-14 rounded-[var(--radius-card)] border border-line bg-white p-6">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">
              About the author
            </p>
            <p className="mt-2 font-semibold text-navy">{post.author.name}</p>
            {post.author.headline && (
              <p className="text-sm text-muted">{post.author.headline}</p>
            )}
            <p className="mt-3 text-sm leading-relaxed">{post.author.bio}</p>
          </aside>
        )}
      </div>
    </article>
  );
}
