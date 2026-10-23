import { CalendarClock, ExternalLink, User } from "lucide-react";
import Link from "next/link";

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/feedback";
import { ATTENDANCE_LABEL, STATE_BADGE, timeRange } from "@/lib/live-classes";
import { formatDateTime } from "@/lib/utils";
import type { LearnerSession } from "@/types/live-classes";

import { JoinButton } from "./join-button";

export function SessionCard({ session, compact = false }: { session: LearnerSession; compact?: boolean }) {
  const badge = STATE_BADGE[session.state];
  return (
    <Card className="flex h-full flex-col gap-3 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Link href={`/courses/${session.course.slug}`} className="text-xs font-medium text-teal-700 hover:underline">
            {session.course.title}
          </Link>
          <h3 className="mt-0.5 font-semibold text-navy">{session.title}</h3>
        </div>
        <Badge tone={badge.tone}>{badge.label}</Badge>
      </div>

      <dl className="flex flex-col gap-1.5 text-sm text-muted">
        <div className="flex items-center gap-2">
          <CalendarClock className="h-4 w-4 shrink-0" aria-hidden="true" />
          <dt className="sr-only">When</dt>
          <dd>
            {timeRange(session.starts_at, session.ends_at)} <span className="text-xs">(Nepal time)</span>
          </dd>
        </div>
        {session.instructor_name && (
          <div className="flex items-center gap-2">
            <User className="h-4 w-4 shrink-0" aria-hidden="true" />
            <dt className="sr-only">Instructor</dt>
            <dd>{session.instructor_name}</dd>
          </div>
        )}
        {!compact && (
          <div className="text-xs">
            <dt className="inline">On </dt>
            <dd className="inline">
              {session.provider_label} · {session.batch_name}
            </dd>
          </div>
        )}
      </dl>

      {session.original_starts_at && session.state !== "cancelled" && (
        <p className="text-xs text-warning">Rescheduled from {formatDateTime(session.original_starts_at)}.</p>
      )}
      {session.state === "cancelled" && (
        <p className="text-sm text-danger">This class was cancelled{session.cancel_reason ? `: ${session.cancel_reason}` : "."}</p>
      )}
      {!compact && session.description && <p className="text-sm">{session.description}</p>}

      {session.state === "ended" && (
        <div className="flex flex-col gap-2 text-sm">
          {session.attendance && (
            <p>
              Attendance: <span className="font-medium text-navy">{ATTENDANCE_LABEL[session.attendance]}</span>
            </p>
          )}
          {session.recording_url && (
            <a href={session.recording_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium text-teal-700 hover:underline">
              Watch the recording
              <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
            </a>
          )}
          {session.notes && <p className="whitespace-pre-line rounded-lg bg-page p-3 text-sm">{session.notes}</p>}
        </div>
      )}

      <div className="mt-auto pt-1">
        <JoinButton session={session} size={compact ? "sm" : "md"} />
      </div>
    </Card>
  );
}
