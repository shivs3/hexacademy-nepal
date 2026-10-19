import { Eye } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { BlogArticle } from "@/components/cms/blog-article";
import { PublicChrome } from "@/components/cms/public-chrome";
import { serverGetOrNull } from "@/lib/api/server";
import { requireStaff } from "@/lib/auth";
import type { BlogPostPreview } from "@/types/cms";

export const metadata: Metadata = { title: "Preview", robots: { index: false, follow: false } };

type Props = { params: Promise<{ id: string }> };

/** Staff-only preview of a saved blog post in any status; Django checks the blog permission. */
export default async function PostPreview({ params }: Props) {
  await requireStaff();
  const { id } = await params;
  if (!/^\d+$/.test(id)) notFound();
  const post = await serverGetOrNull<BlogPostPreview>(`/admin/cms/blog/posts/${id}/preview/`);
  if (!post) notFound();

  const banner = (
    <div className="sticky top-0 z-40 bg-warning text-white">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-2 text-sm">
        <p className="flex items-center gap-2 font-medium">
          <Eye className="h-4 w-4" aria-hidden="true" />
          Preview of “{post.title}”. Only staff can see this page.
        </p>
        <Link href={`/admin/cms/blog/${id}`} className="font-semibold underline underline-offset-2">
          Back to editor
        </Link>
      </div>
    </div>
  );

  return (
    <PublicChrome banner={banner}>
      <BlogArticle post={post} />
    </PublicChrome>
  );
}
