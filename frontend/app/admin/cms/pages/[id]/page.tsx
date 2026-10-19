import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { requireStaff } from "@/lib/auth";
import { hasPerm } from "@/lib/permissions";

import { PageEditor } from "./page-editor";

export const metadata: Metadata = { title: "Edit page" };

type Props = { params: Promise<{ id: string }> };

export default async function EditPage({ params }: Props) {
  const user = await requireStaff();
  if (!hasPerm(user, "cms.manage_pages")) redirect("/admin");
  const { id } = await params;
  if (!/^\d+$/.test(id)) notFound();
  return <PageEditor pageId={Number(id)} canPublish={hasPerm(user, "cms.publish_pages")} />;
}
