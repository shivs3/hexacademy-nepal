export type SubmissionStatus = "submitted" | "returned" | "graded";

type CourseRef = { id: number; title: string; slug: string };
type LessonRef = { id: number; title: string };

/** The learner's own submission. `points` appears once graded, `feedback` once reviewed. */
export type MySubmission = {
  status: SubmissionStatus;
  text: string;
  has_file: boolean;
  original_name: string;
  size_bytes: number;
  attempt: number;
  submitted_at: string;
  is_late: boolean;
  points: number | null;
  feedback: string;
  graded_at: string | null;
};

export type LearnerAssignment = {
  id: number;
  title: string;
  course: CourseRef;
  lesson: LessonRef | null;
  due_at: string | null;
  allow_late: boolean;
  accepts_text: boolean;
  accepts_file: boolean;
  max_points: number;
  submission: MySubmission | null;
  can_submit: boolean;
  closed_reason: string;
};

export type LearnerAssignmentDetail = LearnerAssignment & { instructions: string };

export type AdminAssignment = {
  id: number;
  course: CourseRef;
  lesson: LessonRef | null;
  title: string;
  instructions: string;
  due_at: string | null;
  allow_late: boolean;
  accepts_text: boolean;
  accepts_file: boolean;
  max_points: number;
  is_published: boolean;
  submitted_count: number;
  graded_count: number;
  returned_count: number;
  can_edit: boolean;
  can_grade: boolean;
  created_at: string;
  updated_at: string;
};

export type AdminSubmission = {
  id: number;
  user: { id: number; full_name: string; email: string };
  status: SubmissionStatus;
  text: string;
  has_file: boolean;
  original_name: string;
  mime_type: string;
  size_bytes: number;
  attempt: number;
  submitted_at: string;
  is_late: boolean;
  points: number | null;
  feedback: string;
  graded_by_name: string;
  graded_at: string | null;
};

export type AssignmentCourseOption = { id: number; title: string; slug: string; status: string; lessons: LessonRef[] };
