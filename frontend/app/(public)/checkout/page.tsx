import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { Checkout } from "@/components/commerce/checkout";
import { serverGetOrNull } from "@/lib/api/server";
import { requireUser } from "@/lib/auth";
import { checkoutHref } from "@/lib/commerce";
import type { CourseDetail } from "@/types/catalog";
import type { PlayerOutline } from "@/types/learning";

export const metadata: Metadata = { title: "Checkout", robots: { index: false } };
export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ course?: string | string[] }> };

export default async function CheckoutPage({ searchParams }: Props) {
  const { course: raw } = await searchParams;
  const slug = typeof raw === "string" ? raw : "";
  if (!slug) notFound();
  await requireUser(checkoutHref(slug));

  const course = await serverGetOrNull<CourseDetail>(`/courses/${encodeURIComponent(slug)}/`);
  if (!course) notFound();
  if (course.is_free) redirect(`/courses/${encodeURIComponent(course.slug)}`);
  const outline = await serverGetOrNull<PlayerOutline>(`/me/courses/${encodeURIComponent(course.slug)}/`);
  if (outline?.enrollment_id) redirect(`/learn/${encodeURIComponent(course.slug)}`);

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6">
      <nav aria-label="Breadcrumb" className="mb-4 text-sm text-muted">
        <Link href={`/courses/${encodeURIComponent(course.slug)}`} className="hover:text-teal-700">
          ← {course.title}
        </Link>
      </nav>
      <h1 className="mb-6 text-2xl font-semibold text-navy sm:text-3xl">Checkout</h1>
      <Checkout courseSlug={course.slug} />
    </div>
  );
}
