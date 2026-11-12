import type { Notice } from "@/types/cms";

/** The picture that represents a notice: its image, or the first page of its PDF. */
export function noticePreview(n: Notice): { url: string; width: number | null; height: number | null } | null {
  if (n.pages.length) return n.pages[0];
  if (n.attachment?.kind === "image") return n.attachment;
  return null;
}
