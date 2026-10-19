/** Staff catalog and enrollment payloads (mirrors apps/catalog/admin_serializers.py, apps/learning/admin_serializers.py). */

import type { CourseLevel } from "./catalog";
import type { MediaRef } from "./cms";

export type CourseStatus = "draft" | "published" | "archived";
export type TeamRole = "instructor" | "teaching_assistant";

export type AdminCategory = {
  id: number;
  name: string;
  slug: string;
  parent: number | null;
  description: string;
  position: number;
  course_count: number;
};

export type AdminCourseSummary = {
  id: number;
  title: string;
  slug: string;
  status: CourseStatus;
  category_name: string;
  thumbnail_detail: MediaRef | null;
  price: string;
  current_price: string;
  is_featured: boolean;
  lesson_count: number;
  published_lesson_count: number;
  enrollment_count: number;
  published_at: string | null;
  updated_at: string;
};

export type TeamMember = { user_id: number; full_name: string; email: string; role: TeamRole; is_public: boolean };

export type CourseAbilities = { edit: boolean; manage: boolean; publish: boolean; delete: boolean };

export type AdminCourse = AdminCourseSummary & {
  subtitle: string;
  description: string;
  category: number | null;
  thumbnail: number | null;
  level: CourseLevel;
  language: string;
  duration_text: string;
  learning_outcomes: string[];
  prerequisites: string[];
  sequential: boolean;
  sale_price: string | null;
  sale_ends_at: string | null;
  meta_title: string;
  meta_description: string;
  canonical_url: string;
  og_image: number | null;
  og_image_detail: MediaRef | null;
  noindex: boolean;
  team: TeamMember[];
  abilities: CourseAbilities;
  publish_problems: string[];
  created_at: string;
};

export type TeamCandidate = { id: number; full_name: string; email: string };

export type LessonSummary = {
  id: number;
  title: string;
  is_published: boolean;
  is_preview: boolean;
  duration_minutes: number;
  has_video: boolean;
  resource_count: number;
};

export type AdminModule = { id: number; title: string; description: string; position: number; lessons: LessonSummary[] };

export type AdminResource = {
  id: number;
  title: string;
  kind: "file" | "link";
  original_name: string;
  mime_type: string;
  size_bytes: number | null;
  url: string;
  position: number;
  created_at: string;
};

export type AdminLesson = {
  id: number;
  course: number;
  module: number;
  title: string;
  summary: string;
  body: string;
  video_url: string;
  video_embed_url: string;
  duration_minutes: number;
  is_preview: boolean;
  is_published: boolean;
  position: number;
  resources: AdminResource[];
  updated_at: string;
};

export type EnrollmentStatus = "active" | "revoked";
export type EnrollmentSource = "free" | "purchase" | "admin";

export type AdminEnrollment = {
  id: number;
  user: { id: number; full_name: string; email: string };
  course: { id: number; title: string; slug: string };
  status: EnrollmentStatus;
  source: EnrollmentSource;
  granted_by_name: string;
  enrolled_at: string;
  completed_at: string | null;
  last_accessed_at: string | null;
  revoked_at: string | null;
  completed_lessons: number;
  total_lessons: number;
  percent: number;
};

export type AdminEnrollmentDetail = AdminEnrollment & {
  lessons: { lesson_id: number; title: string; module_title: string; first_viewed_at: string | null; completed_at: string | null }[];
};

export type EnrollmentCourseOption = { id: number; title: string; slug: string; status: CourseStatus };

export const COURSE_STATUS_LABELS: Record<CourseStatus, string> = { draft: "Draft", published: "Published", archived: "Archived" };
export const SOURCE_LABELS: Record<EnrollmentSource, string> = { free: "Free enrollment", purchase: "Purchase", admin: "Granted by staff" };
export const TEAM_ROLE_LABELS: Record<TeamRole, string> = { instructor: "Instructor", teaching_assistant: "Teaching assistant" };
