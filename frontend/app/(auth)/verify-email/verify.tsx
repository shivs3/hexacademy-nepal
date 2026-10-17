"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/feedback";
import { Spinner } from "@/components/ui/spinner";
import { api } from "@/lib/api/client";
import { errorMessage } from "@/lib/api/errors";

type State = { status: "pending" } | { status: "ok" } | { status: "error"; message: string };

export function VerifyEmail() {
  const token = useSearchParams().get("token");
  const [state, setState] = useState<State>(
    token ? { status: "pending" } : { status: "error", message: "This verification link is incomplete." },
  );
  const started = useRef(false);

  useEffect(() => {
    // Verification is a one-time POST; guard against StrictMode double effects.
    if (!token || started.current) return;
    started.current = true;
    api
      .post("/auth/verify-email/", { token })
      .then(() => setState({ status: "ok" }))
      .catch((err: unknown) => setState({ status: "error", message: errorMessage(err) }));
  }, [token]);

  if (state.status === "pending") {
    return (
      <p className="mt-6 flex items-center gap-2 text-sm text-muted" role="status">
        <Spinner /> Verifying your email address…
      </p>
    );
  }
  if (state.status === "ok") {
    return (
      <div className="mt-6 flex flex-col gap-4">
        <Alert tone="success">Your email address has been verified.</Alert>
        <Button asChild>
          <Link href="/dashboard">Go to dashboard</Link>
        </Button>
      </div>
    );
  }
  return (
    <div className="mt-6 flex flex-col gap-4">
      <Alert tone="danger">{state.message}</Alert>
      <p className="text-sm text-muted">
        Signed in? You can request a new link from your{" "}
        <Link href="/dashboard/profile" className="font-medium text-teal-700 hover:underline">
          profile page
        </Link>
        .
      </p>
    </div>
  );
}
