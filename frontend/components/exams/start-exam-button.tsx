"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Alert } from "@/components/ui/feedback";
import { api } from "@/lib/api/client";
import { errorMessage } from "@/lib/api/errors";
import type { Attempt } from "@/types/assessments";

/** Starting creates the attempt on the server and the clock starts there, so it is confirmed first. */
export function StartExamButton({ slug, resumeId }: { slug: string; resumeId: number | null }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (resumeId) {
    return (
      <Button asChild>
        <Link href={`/exam/${resumeId}`}>Resume attempt</Link>
      </Button>
    );
  }

  async function start() {
    setBusy(true);
    setError(null);
    try {
      const attempt = await api.post<Attempt>(`/exams/${slug}/attempts/`);
      router.push(`/exam/${attempt.id}`);
    } catch (err) {
      setError(errorMessage(err));
      setConfirming(false);
      setBusy(false);
    }
  }

  return (
    <>
      {error && <Alert tone="danger">{error}</Alert>}
      <Button onClick={() => setConfirming(true)}>Start exam</Button>
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title="Start the exam now?"
        description="The timer starts as soon as you confirm and keeps running even if you leave the page."
        confirmLabel="Start"
        loading={busy}
        onConfirm={start}
      />
    </>
  );
}
