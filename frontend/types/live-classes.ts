export type MeetingProvider = "google_meet" | "zoom";
export type SessionState = "cancelled" | "upcoming" | "live" | "ended";
export type AttendanceStatus = "present" | "late" | "absent" | "excused";
export type BatchStatus = "active" | "archived";

type CourseRef = { id: number; title: string; slug: string };
type Person = { id: number; full_name: string; email: string };

/** Learner view: never carries the meeting link; POST .../join/ returns it. */
export type LearnerSession = {
  id: number;
  title: string;
  description: string;
  course: CourseRef;
  batch_name: string;
  starts_at: string;
  ends_at: string;
  provider: MeetingProvider;
  provider_label: string;
  instructor_name: string;
  status: "scheduled" | "cancelled";
  state: SessionState;
  cancel_reason: string;
  original_starts_at: string | null;
  join_opens_at: string;
  recording_url: string;
  notes: string;
  attendance: AttendanceStatus | "";
  joined_at: string | null;
};

export type JoinResult = { provider: MeetingProvider; join_url: string; passcode: string };

export type Batch = {
  id: number;
  course: CourseRef;
  name: string;
  description: string;
  starts_on: string | null;
  ends_on: string | null;
  capacity: number | null;
  status: BatchStatus;
  member_count: number;
  upcoming_count: number;
  next_session_at: string | null;
  can_schedule: boolean;
  created_at: string;
};

export type BatchMember = { id: number; user: Person; enrolled: boolean; added_at: string };

export type AddMembersResult = { added: number; already_members: number; not_enrolled: string[]; unknown: string[] };

export type TeamMember = { id: number; full_name: string; email: string; role: "instructor" | "teaching_assistant" };

/** Staff view. join_url / passcode / external_meeting_id are blank for roles that may not see them. */
export type AdminSession = {
  id: number;
  batch: { id: number; name: string };
  course: CourseRef;
  title: string;
  description: string;
  starts_at: string;
  ends_at: string;
  instructor: Person | null;
  provider: MeetingProvider;
  provider_label: string;
  status: "scheduled" | "cancelled";
  state: SessionState;
  cancelled_at: string | null;
  cancel_reason: string;
  series_id: string | null;
  original_starts_at: string | null;
  reminder_sent_at: string | null;
  recording_url: string;
  notes: string;
  join_url: string;
  passcode: string;
  external_meeting_id: string;
  can_schedule: boolean;
  can_take_attendance: boolean;
  created_at: string;
};

export type RosterRow = {
  user: Person;
  is_member: boolean;
  joined_at: string | null;
  status: AttendanceStatus | "";
  note: string;
  marked_by_name: string;
  marked_at: string | null;
};

export type ScheduleCourseOption = CourseRef & { status: string };

export type AppNotification = {
  id: number;
  kind: string;
  title: string;
  body: string;
  link: string;
  created_at: string;
  read_at: string | null;
};
