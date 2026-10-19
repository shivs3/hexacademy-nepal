"use client";

import { Button } from "@/components/ui/button";

export default function PublicError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <section className="mx-auto flex max-w-xl flex-col items-center px-4 py-28 text-center">
      <h1 className="text-3xl font-bold">Something went wrong</h1>
      <p className="mt-3 text-muted">This page could not be loaded right now. Please try again in a moment.</p>
      <Button className="mt-8" onClick={reset}>
        Try again
      </Button>
    </section>
  );
}
