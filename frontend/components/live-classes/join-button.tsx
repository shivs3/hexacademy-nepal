"use client";

import { ExternalLink, Video } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { useNow } from "@/hooks/use-now";
import { api } from "@/lib/api/client";
import { errorMessage } from "@/lib/api/errors";
import { joinOpen } from "@/lib/live-classes";
import { formatDateTime } from "@/lib/utils";
import type { JoinResult, LearnerSession } from "@/types/live-classes";

/**
 * Asks the server for the meeting link at the moment of joining. The button
 * enables itself when the join window opens, but the server checks again.
 */
export function JoinButton({ session, size = "md" }: { session: LearnerSession; size?: "sm" | "md" }) {
  const toast = useToast();
  const now = useNow();
  const [busy, setBusy] = useState(false);
  const [withPasscode, setWithPasscode] = useState<JoinResult | null>(null);
  const open = joinOpen(session, now);

  if (session.state === "cancelled" || session.state === "ended") return null;

  async function join() {
    setBusy(true);
    try {
      const result = await api.post<JoinResult>(`/class-sessions/${session.id}/join/`);
      if (result.passcode) {
        setWithPasscode(result);
        setBusy(false);
      } else {
        window.location.assign(result.join_url);
      }
    } catch (err) {
      toast.error(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <>
      <Button size={size} onClick={join} loading={busy} disabled={!open} title={open ? undefined : `Opens ${formatDateTime(session.join_opens_at)}`}>
        <Video className="h-4 w-4" aria-hidden="true" />
        {open ? "Join class" : `Opens ${formatDateTime(session.join_opens_at)}`}
      </Button>
      {withPasscode && (
        <Dialog
          open
          onOpenChange={(o) => !o && setWithPasscode(null)}
          title="Meeting passcode"
          description="You may be asked for this passcode when the meeting opens."
          footer={
            <Button asChild>
              <a href={withPasscode.join_url} target="_blank" rel="noopener noreferrer">
                Open meeting
                <ExternalLink className="h-4 w-4" aria-hidden="true" />
              </a>
            </Button>
          }
        >
          <p className="rounded-lg border border-line bg-page px-4 py-3 text-center font-mono text-lg tracking-wider text-navy">{withPasscode.passcode}</p>
        </Dialog>
      )}
    </>
  );
}
