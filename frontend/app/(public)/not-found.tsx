import Link from "next/link";

import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <section className="mx-auto flex max-w-xl flex-col items-center px-4 py-28 text-center">
      <p className="text-sm font-semibold uppercase tracking-wider text-teal-700">404</p>
      <h1 className="mt-2 text-3xl font-bold">Page not found</h1>
      <p className="mt-3 text-muted">The page you are looking for does not exist or is no longer published.</p>
      <Button asChild className="mt-8">
        <Link href="/">Go to the home page</Link>
      </Button>
    </section>
  );
}
