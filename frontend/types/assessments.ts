/** Exam payloads (mirrors apps/assessments/serializers.py and admin_serializers.py). Decimals arrive as strings. */

import type { MediaRef } from "./cms";

export type QuestionKind = "single" | "multiple" | "true_false";
export type QuestionStatus = "draft" | "active" | "retired";
export type Difficulty = "easy" | "medium" | "hard";
export type ExamKind = "practice" | "formal";
export type ExamStatus = "draft" | "published" | "closed";
export type ResultRelease = "immediate" | "after_close" | "manual";
export type AttemptStatus = "in_progress" | "submitted" | "expired";
export type Availability = "available" | "in_progress" | "not_open" | "closed" | "not_enrolled" | "no_attempts_left";

// --- Learner -----------------------------------------------------------------

export type CourseRef = { id: number; title: string; slug: string };

export type AttemptSummary = {
  id: number;
  number: number;
  status: AttemptStatus;
  started_at: string;
  deadline: string;
  ended_at: string | null;
  max_score: string;
  /** Null until results are released. */
  score: string | null;
  passed: boolean | null;
  results_released: boolean;
};

export type LearnerExam = {
  id: number;
  slug: string;
  title: string;
  kind: ExamKind;
  course: CourseRef | null;
  duration_minutes: number;
  opens_at: string | null;
  closes_at: string | null;
  max_attempts: number | null;
  total_marks: string;
  question_total: number;
  availability: Availability;
  attempts_used: number;
  open_attempt_id: number | null;
};

export type LearnerExamDetail = LearnerExam & {
  instructions: string;
  negative_marking: boolean;
  pass_marks: string | null;
  allow_revisit: boolean;
  result_release: ResultRelease;
  release_note: string;
  ranking_enabled: boolean;
  my_attempts: AttemptSummary[];
};

export type SnapshotOption = { id: number; text: string; image: MediaRef | null };

/** A question as frozen into the attempt. Never carries the answer key. */
export type SnapshotContent = { kind: QuestionKind; prompt: string; image: MediaRef | null; options: SnapshotOption[] };

export type AttemptQuestion = { id: number; position: number; content: SnapshotContent; marks: string; negative_marks: string };

export type SavedAnswer = { question: number; selected: number[]; flagged: boolean; saved_at: string };

export type Attempt = {
  id: number;
  exam: { id: number; slug: string; title: string; allow_revisit: boolean; negative_marking: boolean };
  number: number;
  status: AttemptStatus;
  started_at: string;
  deadline: string;
  ended_at: string | null;
  /** Server clock when the payload was built; the countdown is corrected by it. */
  server_time: string;
  furthest_position: number;
  max_score: string;
  results_released: boolean;
  /** Empty once the attempt has ended. */
  questions: AttemptQuestion[];
  answers: SavedAnswer[];
};

export type ResultSummary = {
  score: string;
  max_score: string;
  percent: string;
  passed: boolean | null;
  pass_marks: string | null;
  correct: number;
  incorrect: number;
  unanswered: number;
  accuracy: string;
  time_spent_seconds: number | null;
};

export type TopicRow = {
  topic: string;
  questions: number;
  correct: number;
  incorrect: number;
  unanswered: number;
  marks: string;
  max_marks: string;
  percent: string;
};

export type ReviewItem = {
  id: number;
  position: number;
  topic: string;
  content: SnapshotContent;
  selected: number[];
  is_correct: boolean | null;
  awarded_marks: string;
  marks: string;
  /** Null when the exam does not show answers. */
  correct_options: number[] | null;
  explanation: string;
};

export type RankRow = { rank: number; name: string; is_you: boolean; score: string; max_score: string; time_spent_seconds: number | null };

export type Ranking = { participants: number; top: RankRow[]; you: RankRow | null };

export type AttemptResult = {
  attempt: AttemptSummary;
  exam: { id: number; slug: string; title: string; kind: ExamKind; show_answers: boolean; show_explanations: boolean };
  released: boolean;
  release_note: string;
  summary: ResultSummary | null;
  topics: TopicRow[];
  review: ReviewItem[];
  ranking: Ranking | null;
};

export type HistoryItem = AttemptSummary & { exam: { id: number; slug: string; title: string }; percent: string | null };

// --- Staff -------------------------------------------------------------------

export type AdminTopic = {
  id: number;
  subject: number;
  parent: number | null;
  name: string;
  slug: string;
  position: number;
  question_count: number;
};

export type AdminSubject = {
  id: number;
  name: string;
  slug: string;
  description: string;
  position: number;
  topics: AdminTopic[];
  question_count: number;
};

export type AdminOption = { id?: number; text: string; image: number | null; image_detail?: MediaRef | null; is_correct: boolean };

export type AdminQuestionSummary = {
  id: number;
  subject: number;
  subject_name: string;
  topic: number | null;
  topic_name: string;
  course: number | null;
  course_title: string;
  kind: QuestionKind;
  status: QuestionStatus;
  difficulty: Difficulty;
  prompt: string;
  tags: string[];
  default_marks: string;
  default_negative_marks: string;
  version: number;
  option_count: number;
  used_in_exams: number;
  can_edit: boolean;
  updated_at: string;
};

export type AdminQuestion = AdminQuestionSummary & {
  image: number | null;
  image_detail: MediaRef | null;
  explanation: string;
  options: AdminOption[];
  created_at: string;
};

export type QuestionVersion = {
  id: number;
  version: number;
  snapshot: { prompt?: string; kind?: QuestionKind; options?: { text: string; is_correct: boolean }[]; [key: string]: unknown };
  created_by_name: string;
  created_at: string;
};

export type ImportReport = {
  rows: number;
  valid: number;
  created: number;
  dry_run: boolean;
  errors: { row: number; field: string; message: string }[];
};

export type CourseOption = { id: number; title: string; status: string };

export type AdminExamSummary = {
  id: number;
  title: string;
  slug: string;
  course: number | null;
  course_title: string;
  kind: ExamKind;
  status: ExamStatus;
  duration_minutes: number;
  opens_at: string | null;
  closes_at: string | null;
  question_total: number;
  attempt_total: number;
  result_release: ResultRelease;
  results_published_at: string | null;
  updated_at: string;
};

export type AdminExam = AdminExamSummary & {
  instructions: string;
  question_count: number | null;
  shuffle_questions: boolean;
  shuffle_options: boolean;
  negative_marking: boolean;
  pass_marks: string | null;
  max_attempts: number | null;
  allow_revisit: boolean;
  show_answers: boolean;
  show_explanations: boolean;
  ranking_enabled: boolean;
  published_at: string | null;
  total_marks: string;
  drawn_questions: number;
  abilities: { edit: boolean; structure: boolean; delete: boolean };
  publish_problems: string[];
  results_released: boolean;
  created_at: string;
};

export type ExamQuestionLink = {
  id: number;
  question: AdminQuestionSummary;
  position: number;
  marks: string;
  negative_marks: string;
};

export type AdminAttempt = {
  id: number;
  learner: { id: number; full_name: string; email: string };
  number: number;
  status: AttemptStatus;
  started_at: string;
  deadline: string;
  ended_at: string | null;
  score: string | null;
  max_score: string;
  correct_count: number;
  incorrect_count: number;
  unanswered_count: number;
  passed: boolean | null;
  time_spent_seconds: number | null;
};

export type ExamAnalytics = {
  attempts: number;
  learners: number;
  in_progress: number;
  expired: number;
  average_score: string | null;
  highest_score: string | null;
  lowest_score: string | null;
  pass_rate: string | null;
  distribution: { range: string; count: number }[];
  questions: { question_id: number; seen: number; correct: number; incorrect: number; unanswered: number; correct_rate: string }[];
};
