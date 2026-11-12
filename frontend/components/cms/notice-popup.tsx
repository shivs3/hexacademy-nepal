"use client";

import { ChevronLeft, ChevronRight, Megaphone } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { Button, buttonVariants } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { noticePreview } from "@/lib/notice-preview";
import type { Notice } from "@/types/cms";

const SEEN_KEY = "hexa:notices-seen"; // closed this visit (sessionStorage)
const HIDDEN_KEY = "hexa:notices-hidden"; // "don't show again" (localStorage)

/** A version key, so an edited notice pops up again even if an older version was hidden. */
const versionOf = (n: Notice) => `${n.id}:${n.updated_at}`;

function readList(store: () => Storage, key: string): string[] {
  try {
    const raw = store().getItem(key);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}

function addToList(store: () => Storage, key: string, values: string[]) {
  try {
    const merged = Array.from(new Set([...readList(store, key), ...values])).slice(-200);
    store().setItem(key, JSON.stringify(merged));
  } catch {
    // Storage blocked (private mode etc.): the pop-up simply shows again next time.
  }
}

/** Pop-up for live notices; a small button reopens it after it is closed. */
export function NoticePopup({ notices }: { notices: Notice[] }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // Wait a moment so the page paints first, and read storage only in the browser.
    const timer = window.setTimeout(() => {
      setReady(true);
      if (pathname.startsWith("/notices")) return;
      const skip = new Set([...readList(() => sessionStorage, SEEN_KEY), ...readList(() => localStorage, HIDDEN_KEY)]);
      const first = notices.findIndex((n) => !skip.has(versionOf(n)));
      if (first >= 0) {
        setIndex(first);
        setOpen(true);
      }
    }, 700);
    return () => window.clearTimeout(timer);
    // Only on first load: navigating between pages must not reopen it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (notices.length === 0) return null;
  const notice = notices[Math.min(index, notices.length - 1)];
  const preview = noticePreview(notice);
  const many = notices.length > 1;

  function close() {
    addToList(() => sessionStorage, SEEN_KEY, notices.map(versionOf));
    setOpen(false);
  }

  function hideForGood() {
    addToList(() => localStorage, HIDDEN_KEY, notices.map(versionOf));
    close();
  }

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(next) => (next ? setOpen(true) : close())}
        title={notice.title}
        description={many ? `Notice ${index + 1} of ${notices.length}` : undefined}
        className="max-w-xl"
        footer={
          <div className="flex w-full flex-wrap items-center justify-between gap-2">
            <Button variant="ghost" size="sm" onClick={hideForGood}>
              Don’t show again
            </Button>
            <div className="flex items-center gap-2">
              {many && (
                <>
                  <Button variant="outline" size="sm" aria-label="Previous notice" disabled={index === 0} onClick={() => setIndex(index - 1)}>
                    <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    aria-label="Next notice"
                    disabled={index === notices.length - 1}
                    onClick={() => setIndex(index + 1)}
                  >
                    <ChevronRight className="h-4 w-4" aria-hidden="true" />
                  </Button>
                </>
              )}
              <Link href={`/notices/${notice.id}`} onClick={close} className={buttonVariants({ size: "sm" })}>
                View full notice
              </Link>
            </div>
          </div>
        }
      >
        <div className="flex flex-col gap-3">
          {preview && (
            <Link href={`/notices/${notice.id}`} onClick={close} className="block overflow-hidden rounded-lg border border-line bg-page">
              {/* eslint-disable-next-line @next/next/no-img-element -- media host image of unknown size */}
              <img
                src={preview.url}
                alt={notice.attachment?.alt || notice.title}
                width={preview.width ?? undefined}
                height={preview.height ?? undefined}
                className="mx-auto max-h-[55vh] w-auto object-contain object-top"
              />
            </Link>
          )}
          {notice.summary && <p className="whitespace-pre-line text-sm text-ink">{notice.summary}</p>}
          {notice.pages.length > 1 && <p className="text-xs text-muted">{notice.pages.length} pages — open the full notice to read them all.</p>}
        </div>
      </Dialog>

      {ready && !open && !pathname.startsWith("/notices") && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="fixed bottom-4 left-4 z-30 inline-flex items-center gap-2 rounded-full bg-navy px-4 py-2 text-sm font-medium text-white shadow-lg transition-colors hover:bg-teal-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal"
        >
          <Megaphone className="h-4 w-4" aria-hidden="true" />
          Notices{many ? ` (${notices.length})` : ""}
        </button>
      )}
    </>
  );
}
