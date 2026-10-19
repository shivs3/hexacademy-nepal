import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";

import { JsonLd } from "@/components/cms/json-ld";
import { BlogArticle } from "@/components/cms/blog-article";
import { serverGetOrNull } from "@/lib/api/server";
import { buildMetadata, getSiteSettings, SITE_URL } from "@/lib/cms";
import type { BlogPost } from "@/types/cms";

type Props = { params: Promise<{ slug: string }> };

const getPost = cache((slug: string) =>
  serverGetOrNull<BlogPost>(`/blog/posts/${encodeURIComponent(slug)}/`),
);

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const [settings, post] = await Promise.all([
    getSiteSettings(),
    getPost(slug),
  ]);
  if (!post) return { title: "Article not found", robots: { index: false } };
  const meta = buildMetadata(settings, {
    title: post.title,
    seo: {
      ...post.seo,
      meta_description: post.seo.meta_description || post.excerpt,
      og_image: post.seo.og_image ?? post.cover,
    },
    path: `/blog/${post.slug}`,
    type: "article",
  });
  return {
    ...meta,
    openGraph: {
      ...meta.openGraph,
      type: "article",
      publishedTime: post.published_at,
      modifiedTime: post.updated_at,
    },
  };
}

export default async function BlogPostPage({ params }: Props) {
  const { slug } = await params;
  const post = await getPost(slug);
  if (!post) notFound();
  const settings = await getSiteSettings();
  const image = post.seo.og_image ?? post.cover;

  return (
    <>
      <BlogArticle post={post} />
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "BlogPosting",
          headline: post.title,
          description: post.seo.meta_description || post.excerpt || undefined,
          datePublished: post.published_at,
          dateModified: post.updated_at,
          mainEntityOfPage: `${SITE_URL}/blog/${post.slug}`,
          ...(image ? { image: new URL(image.url, SITE_URL).toString() } : {}),
          ...(post.author
            ? { author: { "@type": "Person", name: post.author.name } }
            : {}),
          publisher: { "@type": "Organization", name: settings.site_name },
        }}
      />
    </>
  );
}
