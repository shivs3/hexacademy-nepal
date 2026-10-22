"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/feedback";
import { api } from "@/lib/api/client";
import { ApiError, errorMessage } from "@/lib/api/errors";
import { checkoutHref } from "@/lib/commerce";

type Props = {
  slug: string;
  isFree: boolean;
  signedIn: boolean;
  enrolled: boolean;
  contactEmail: string;
};

/**
 * Enrollment call to action. Free courses enroll in one click; paid courses
 * go to checkout. The backend decides: a paid course answers 402 to the free
 * enroll endpoint even if this UI is bypassed, and checkout prices server-side.
 */
export function EnrollPanel({ slug, isFree, signedIn, enrolled, contactEmail }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const learnHref = `/learn/${encodeURIComponent(slug)}`;

  if (enrolled) {
    return (
      <Button asChild size="lg" className="w-full">
        <Link href={learnHref}>Continue learning</Link>
      </Button>
    );
  }

  if (!isFree) {
    const checkout = checkoutHref(slug);
    return (
      <div className="flex flex-col gap-3">
        <Button asChild size="lg" className="w-full">
          <Link href={signedIn ? checkout : `/login?next=${encodeURIComponent(checkout)}`}>
            {signedIn ? "Buy now" : "Sign in to buy"}
          </Link>
        </Button>
        {contactEmail && (
          <p className="text-center text-xs text-muted">
            Questions before you buy?{" "}
            <a href={`mailto:${contactEmail}?subject=${encodeURIComponent(`Course: ${slug}`)}`} className="font-medium text-teal-700 underline">
              {contactEmail}
            </a>
          </p>
        )}
      </div>
    );
  }

  if (!signedIn) {
    return (
      <Button asChild size="lg" className="w-full">
        <Link href={`/login?next=${encodeURIComponent(`/courses/${slug}`)}`}>Sign in to enroll for free</Link>
      </Button>
    );
  }

  async function enroll() {
    setBusy(true);
    setError(null);
    try {
      await api.post(`/courses/${encodeURIComponent(slug)}/enroll/`);
      router.push(learnHref);
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError && err.status === 402 ? "This course now requires payment. Refresh the page." : errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <Button size="lg" className="w-full" loading={busy} onClick={enroll}>
        Enroll for free
      </Button>
      {error && <Alert tone="danger">{error}</Alert>}
    </div>
  );
}
