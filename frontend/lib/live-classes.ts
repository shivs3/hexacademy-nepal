import type { BadgeTone } from "@/components/ui/feedback";
import type { AttendanceStatus, SessionState } from "@/types/live-classes";

/**
 * Class times are entered and shown in Nepal time whatever the browser's
 * zone. Nepal has a fixed UTC+05:45 offset (no daylight saving), so a
 * wall-clock value converts to an exact instant without a zone database.
 */
export const NEPAL_OFFSET = "+05:45";
const LOCAL_INPUT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

/** "2026-11-02T18:30" (Nepal wall clock) -> "2026-11-02T18:30:00+05:45". */
export function fromNepalInput(value: string): string | null {
  return LOCAL_INPUT.test(value) ? `${value}:00${NEPAL_OFFSET}` : null;
}

/** An instant -> "YYYY-MM-DDTHH:MM" on the Nepal wall clock (for datetime-local inputs). */
export function toNepalInput(iso: string): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Kathmandu",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(new Date(iso))
      .map((p) => [p.type, p.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

/** Minutes between two Nepal wall-clock inputs, or null if either is invalid. */
export function minutesBetween(start: string, end: string): number | null {
  const a = fromNepalInput(start);
  const b = fromNepalInput(end);
  if (!a || !b) return null;
  return Math.round((Date.parse(b) - Date.parse(a)) / 60000);
}

export function timeRange(startIso: string, endIso: string): string {
  const day = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kathmandu", weekday: "short", day: "numeric", month: "short", year: "numeric" });
  const time = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kathmandu", hour: "numeric", minute: "2-digit", hour12: true });
  const start = new Date(startIso);
  const end = new Date(endIso);
  const sameDay = day.format(start) === day.format(end);
  return sameDay
    ? `${day.format(start)}, ${time.format(start)} – ${time.format(end)}`
    : `${day.format(start)}, ${time.format(start)} – ${day.format(end)}, ${time.format(end)}`;
}

export const STATE_BADGE: Record<SessionState, { label: string; tone: BadgeTone }> = {
  upcoming: { label: "Upcoming", tone: "teal" },
  live: { label: "Live now", tone: "success" },
  ended: { label: "Ended", tone: "neutral" },
  cancelled: { label: "Cancelled", tone: "danger" },
};

export const ATTENDANCE_LABEL: Record<AttendanceStatus, string> = {
  present: "Present",
  late: "Late",
  absent: "Absent",
  excused: "Excused",
};

/** Whether the Join button should be enabled now (the server decides again on click). */
export function joinOpen(session: { state: SessionState; join_opens_at: string; ends_at: string }, now = Date.now()): boolean {
  if (session.state === "cancelled") return false;
  return now >= Date.parse(session.join_opens_at) && now <= Date.parse(session.ends_at);
}

/** Split a pasted list of emails on commas, semicolons, whitespace or new lines. */
export function parseEmails(text: string): string[] {
  const seen = new Set<string>();
  for (const raw of text.split(/[\s,;]+/)) {
    const email = raw.trim().toLowerCase();
    if (email) seen.add(email);
  }
  return [...seen];
}
