/** Public catalog payloads (mirrors apps/catalog/serializers.py). */

import type { MediaRef, Seo } from "./cms";

export type CourseLevel = "beginner" | "intermediate" | "advanced" | "all_levels";

export type CategoryRef = { id: number; name: string; slug: string };

export type Instructor = { id: number; full_name: string; headline: string; bio: string; avatar_url: string | null };

/** Decimal strings ("2500.00"): money is never handled as a float. */
export type Pricing = {
  currency: "NPR";
  price: string;
  current_price: string;
  sale_ends_at: string | null;
  is_free: boolean;
};

export type CourseCard = Pricing & {
  id: number;
  slug: string;
  title: string;
  subtitle: string;
  category: CategoryRef | null;
  thumbnail: MediaRef | null;
  level: CourseLevel;
  language: string;
  duration_text: string;
  is_featured: boolean;
  lesson_count: number;
  total_minutes: number;
  instructors: string[];
  published_at: string;
};

export type OutlineLesson = { id: number; title: string; duration_minutes: number; is_preview: boolean };
export type OutlineModule = { id: number; title: string; description: string; lessons: OutlineLesson[] };

export type CourseDetail = CourseCard & {
  description: string;
  learning_outcomes: string[];
  prerequisites: string[];
  sequential: boolean;
  curriculum: OutlineModule[];
  team: Instructor[];
  seo: Seo;
  updated_at: string;
};

export type PublicCategory = CategoryRef & {
  description: string;
  course_count: number;
  children: (CategoryRef & { description: string; course_count: number })[];
};

export const LEVEL_LABELS: Record<CourseLevel, string> = {
  beginner: "Beginner",
  intermediate: "Intermediate",
  advanced: "Advanced",
  all_levels: "All levels",
};

export const LANGUAGE_LABELS: Record<string, string> = { en: "English", ne: "Nepali" };
