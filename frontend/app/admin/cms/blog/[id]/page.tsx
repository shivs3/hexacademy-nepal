import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { requireStaff } from "@/lib/auth";
import { hasPerm } from "@/lib/permissions";

import { PostEditor } from "./post-editor";

export const metadata: Metadata = { title: "Edit post" };

type Props = { params: Promise<{ id: string }> };

export default async function EditPostPage({ params }: Props) {
  const user = await requireStaff();
  if (!hasPerm(user, "cms.manage_blog")) redirect("/admin");
  const { id } = await params;
  if (!/^\d+$/.test(id)) notFound();
  return (
    <PostEditor
      postId={Number(id)}
      canPublish={hasPerm(user, "cms.publish_blog")}
      canUpload={hasPerm(user, "cms.manage_media")}
    />
  );
}
