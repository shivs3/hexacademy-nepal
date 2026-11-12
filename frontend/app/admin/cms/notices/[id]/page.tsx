import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { requireStaff } from "@/lib/auth";
import { hasPerm } from "@/lib/permissions";

import { NoticeEditor } from "./notice-editor";

export const metadata: Metadata = { title: "Notice" };

type Props = { params: Promise<{ id: string }> };

export default async function NoticeEditorPage({ params }: Props) {
  const user = await requireStaff();
  if (!hasPerm(user, "cms.manage_notices")) redirect("/admin");
  const { id } = await params;
  if (id !== "new" && !/^\d+$/.test(id)) notFound();
  return <NoticeEditor noticeId={id === "new" ? null : Number(id)} canUpload={hasPerm(user, "cms.manage_media")} />;
}
