import Link from "next/link";

import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";

// Interim landing page for Milestone 1. Milestone 2 replaces it with the CMS-driven home page.
export default function Home() {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-line bg-white">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
          <Logo />
          <nav className="flex items-center gap-2">
            <Button asChild variant="ghost" size="sm">
              <Link href="/login">Sign in</Link>
            </Button>
            <Button asChild size="sm">
              <Link href="/register">Create account</Link>
            </Button>
          </nav>
        </div>
      </header>
      <main id="main" className="mx-auto flex w-full max-w-6xl flex-1 flex-col justify-center px-4 py-20">
        <h1 className="max-w-2xl font-display text-4xl font-bold leading-tight text-navy sm:text-5xl">
          Engineering, programming and AI education in Nepal.
        </h1>
        <p className="mt-4 max-w-xl text-lg text-muted">
          Structured courses, live classes and online examinations — in one place.
        </p>
      </main>
    </div>
  );
}
