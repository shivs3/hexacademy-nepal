import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { requireStaff } from "@/lib/auth";
import { canOpenCatalog } from "@/lib/permissions";

import { LessonEditor } from "./lesson-editor";

export const metadata: Metadata = { title: "Edit lesson" };

type Props = { params: Promise<{ id: string }> };

export default async function EditLessonPage({ params }: Props) {
  const user = await requireStaff();
  if (!canOpenCatalog(user)) redirect("/admin");
  const { id } = await params;
  if (!/^\d+$/.test(id)) notFound();
  return <LessonEditor lessonId={Number(id)} />;
}
