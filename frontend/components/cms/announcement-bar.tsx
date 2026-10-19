import { ArrowRight } from "lucide-react";

import type { SiteSettings } from "@/types/cms";

import { CmsLink } from "./cms-link";

export function AnnouncementBar({ announcement }: { announcement: SiteSettings["announcement"] }) {
  if (!announcement) return null;
  return (
    <div className="bg-teal text-white">
      <p className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-x-3 gap-y-1 px-4 py-2 text-center text-sm">
        <span>{announcement.text}</span>
        {announcement.link_label && announcement.link_url && (
          <CmsLink href={announcement.link_url} className="inline-flex items-center gap-1 font-semibold underline underline-offset-2">
            {announcement.link_label}
            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </CmsLink>
        )}
      </p>
    </div>
  );
}
