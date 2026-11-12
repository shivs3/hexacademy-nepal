import { Badge } from "@/components/ui/feedback";
import { formatDateTime } from "@/lib/utils";
import type { AdminNotice } from "@/types/cms-admin";

/** Why a notice is or isn't on the site right now (the server decides, by its clock). */
export function NoticeStatus({
  notice,
}: {
  notice: Pick<AdminNotice, "is_live" | "is_upcoming" | "is_active" | "starts_at" | "ends_at">;
}) {
  if (notice.is_live) return <Badge tone="success">Live</Badge>;
  if (!notice.is_active) return <Badge>Off</Badge>;
  if (notice.is_upcoming) return <Badge tone="mint">Starts {formatDateTime(notice.starts_at)}</Badge>;
  return <Badge tone="warning">Ended {formatDateTime(notice.ends_at)}</Badge>;
}
