import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { AccessRequestForm } from "@/components/commerce/access-request-form";
import { serverGetOrNull } from "@/lib/api/server";
import { requireUser } from "@/lib/auth";
import { checkoutHref, examCheckoutHref } from "@/lib/commerce";
import type { CheckoutItem } from "@/types/access";
import type { LearnerExam } from "@/types/assessments";
import type { PlayerOutline } from "@/types/learning";

export const metadata: Metadata = { title: "Checkout", robots: { index: false } };
export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ course?: string | string[]; exam?: string | string[] }> };

/**
 * No payment gateway is connected: checkout is a request form. Staff confirm
 * the payment and add the course or exam to the learner's account.
 */
export default async function CheckoutPage({ searchParams }: Props) {
  const params = await searchParams;
  const course = typeof params.course === "string" ? params.course : "";
  const exam = typeof params.exam === "string" ? params.exam : "";
  if (!course && !exam) notFound();
  const user = await requireUser(course ? checkoutHref(course) : examCheckoutHref(exam));

  const query = course ? `course=${encodeURIComponent(course)}` : `exam=${encodeURIComponent(exam)}`;
  const item = await serverGetOrNull<CheckoutItem>(`/checkout/item/?${query}`);
  if (!item) notFound();
  const slug = encodeURIComponent(item.slug);
  let back: { href: string; label: string };

  if (item.kind === "course") {
    back = { href: `/courses/${slug}`, label: item.title };
    if (Number(item.price) <= 0) redirect(back.href);
    const outline = await serverGetOrNull<PlayerOutline>(`/me/courses/${slug}/`);
    if (outline?.enrollment_id) redirect(`/learn/${slug}`);
  } else {
    back = { href: `/dashboard/exams/${slug}`, label: item.title };
    const detail = await serverGetOrNull<LearnerExam>(`/exams/${slug}/`);
    if (!detail || detail.is_free || detail.has_access) redirect(back.href);
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6">
      <nav aria-label="Breadcrumb" className="mb-4 text-sm text-muted">
        <Link href={back.href} className="hover:text-teal-700">
          ← {back.label}
        </Link>
      </nav>
      <h1 className="mb-6 text-2xl font-semibold text-navy sm:text-3xl">Checkout</h1>
      <AccessRequestForm item={item} defaultName={user.full_name} />
    </div>
  );
}
