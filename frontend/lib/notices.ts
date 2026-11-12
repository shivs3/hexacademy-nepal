import { cache } from "react";

import { serverGet, serverGetOrNull } from "@/lib/api/server";
import type { Notice, NoticeDetail } from "@/types/cms";

/** Live notices in display order. A failure never breaks the page: it just shows none. */
export const getNotices = cache(async (): Promise<Notice[]> => {
  try {
    return await serverGet<Notice[]>("/notices/");
  } catch {
    return [];
  }
});

export const getNotice = cache((id: number) => serverGetOrNull<NoticeDetail>(`/notices/${id}/`));
