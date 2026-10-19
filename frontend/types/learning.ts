/** Learner payloads (mirrors apps/learning/serializers.py). */

import type { MediaRef } from "./cms";

export type Progress = {
  total_lessons: number;
  completed_lessons: number;
  percent: number;
  next_lesson_id: number | null;
};

export type CourseBrief = {
  id: number;
  slug: string;
  title: string;
  subtitle: string;
  status: "draft" | "published" | "archived";
  thumbnail: MediaRef | null;
};

export type MyEnrollment = {
  id: number;
  status: "active" | "revoked";
  source: "free" | "purchase" | "admin";
  enrolled_at: string;
  completed_at: string | null;
  last_accessed_at: string | null;
  last_lesson_id: number | null;
  course: CourseBrief;
  progress: Progress;
};

export type PlayerLesson = {
  id: number;
  title: string;
  duration_minutes: number;
  is_preview: boolean;
  is_published: boolean;
  completed: boolean;
  locked: boolean;
};

export type PlayerOutline = {
  course: CourseBrief;
  sequential: boolean;
  staff_preview: boolean;
  enrollment_id: number | null;
  progress: Progress | null;
  modules: { id: number; title: string; lessons: PlayerLesson[] }[];
};

export type LessonResource = {
  id: number;
  title: string;
  kind: "file" | "link";
  url: string;
  original_name: string;
  mime_type: string;
  size_bytes: number | null;
};

export type LessonView = {
  lesson: {
    id: number;
    title: string;
    summary: string;
    body: string;
    video_embed_url: string;
    duration_minutes: number;
    is_preview: boolean;
    is_published: boolean;
    module_id: number;
    module_title: string;
    course: CourseBrief;
    resources: LessonResource[];
  };
  completed: boolean;
  previous_lesson_id: number | null;
  next_lesson_id: number | null;
  staff_preview: boolean;
  enrolled: boolean;
};

export type ProgressResult = { completed: boolean; course_completed: boolean; progress: Progress };
