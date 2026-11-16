"use client";

import { ChevronLeft, ChevronRight, FileText, Image as ImageIcon, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/feedback";
import { cn } from "@/lib/utils";
import type { LessonResource } from "@/types/learning";

/**
 * Lesson files are read in the page: PDFs one page at a time (as images the
 * server prepared), images and text inline. There is no download link, and
 * the original PDF never reaches the browser. This stops casual saving, not
 * screenshots.
 */

const POLL_MS = 6000;
const MAX_POLLS = 50; // about five minutes, then the learner can reload

function base(lessonId: number, resourceId: number) {
  return `/api/v1/lessons/${lessonId}/resources/${resourceId}`;
}

const noSave = {
  onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
  onDragStart: (e: React.DragEvent) => e.preventDefault(),
};

export function LessonFiles({ lessonId, files }: { lessonId: number; files: LessonResource[] }) {
  const [activeId, setActiveId] = useState(files[0]?.id);
  const active = files.find((f) => f.id === activeId) ?? files[0];
  if (!active) return null;

  return (
    <div className="mt-3">
      {files.length > 1 && (
        <div role="tablist" aria-label="Lesson files" className="mb-4 flex flex-wrap gap-2">
          {files.map((file) => {
            const Icon = file.viewer === "image" ? ImageIcon : FileText;
            const selected = file.id === active.id;
            return (
              <button
                key={file.id}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => setActiveId(file.id)}
                className={cn(
                  "inline-flex items-center gap-2 rounded-[var(--radius-control)] border px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal",
                  selected ? "border-teal-700 bg-teal-50 text-teal-800" : "border-line bg-white text-navy hover:bg-teal-50",
                )}
              >
                <Icon className="h-4 w-4" aria-hidden="true" />
                {file.title}
              </button>
            );
          })}
        </div>
      )}
      {files.length === 1 && <p className="mb-3 text-sm font-medium text-navy">{active.title}</p>}
      <div role={files.length > 1 ? "tabpanel" : undefined}>
        {active.viewer === "pdf" && <PdfPageViewer key={active.id} lessonId={lessonId} file={active} />}
        {active.viewer === "image" && <ImageViewer key={active.id} lessonId={lessonId} file={active} />}
        {active.viewer === "text" && <TextViewer key={active.id} lessonId={lessonId} file={active} />}
      </div>
    </div>
  );
}

export function PdfPageViewer({ lessonId, file }: { lessonId: number; file: LessonResource }) {
  const router = useRouter();
  const pages = file.pages;
  const [index, setIndex] = useState(0);
  const [loaded, setLoaded] = useState<number | null>(null);
  const [failed, setFailed] = useState(false);
  const [polls, setPolls] = useState(0);
  const [attempt, setAttempt] = useState(0);

  // While the server prepares the pages, look again every few seconds.
  const preparing = file.status === "pending";
  useEffect(() => {
    if (!preparing || polls >= MAX_POLLS) return;
    const timer = setTimeout(() => {
      setPolls((n) => n + 1);
      router.refresh();
    }, POLL_MS);
    return () => clearTimeout(timer);
  }, [preparing, polls, router]);

  const total = pages.length;
  const page = pages[Math.min(index, total - 1)];
  const src = (n: number) => `${base(lessonId, file.id)}/pages/${n}/`;

  const go = useCallback(
    (delta: number) => {
      setFailed(false);
      setIndex((i) => Math.max(0, Math.min(total - 1, i + delta)));
    },
    [total],
  );

  // Fetch the next page ahead so "Next" feels instant.
  useEffect(() => {
    if (page && page.number < total) {
      const img = new window.Image();
      img.src = src(page.number + 1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page?.number, total]);

  if (file.status === "failed") {
    return (
      <Alert tone="danger" title="This file can't be shown right now">
        The pages could not be prepared. Your instructor has been shown the problem; please check back later.
      </Alert>
    );
  }
  if (preparing || !page) {
    return (
      <div className="flex items-center gap-3 rounded-[var(--radius-card)] border border-line bg-page p-6 text-sm text-muted" role="status">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        {polls >= MAX_POLLS ? "This file is still being prepared. Reload the page in a few minutes." : "Preparing the pages… this can take a minute."}
      </div>
    );
  }

  return (
    <div
      className="rounded-[var(--radius-card)] border border-line bg-white"
      tabIndex={0}
      aria-label={`${file.title}, page ${page.number} of ${total}. Use the left and right arrow keys to turn pages.`}
      onKeyDown={(e) => {
        if (e.key === "ArrowRight" || e.key === "PageDown") {
          e.preventDefault();
          go(1);
        } else if (e.key === "ArrowLeft" || e.key === "PageUp") {
          e.preventDefault();
          go(-1);
        }
      }}
    >
      <Pager number={page.number} total={total} onPrevious={() => go(-1)} onNext={() => go(1)} />
      <div className="relative select-none overflow-hidden border-y border-line bg-page" style={{ aspectRatio: `${page.width} / ${page.height}` }}>
        {loaded !== page.number && !failed && (
          <div className="absolute inset-0 flex items-center justify-center text-muted" aria-hidden="true">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        )}
        {failed ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-4 text-center text-sm text-muted">
            This page could not be loaded.
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setFailed(false);
                setAttempt((n) => n + 1);
              }}
            >
              Try again
            </Button>
          </div>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element -- private, per-learner image; next/image would cache it
          <img
            key={`${page.number}-${attempt}`}
            src={attempt ? `${src(page.number)}?retry=${attempt}` : src(page.number)}
            alt={`${file.title}, page ${page.number}`}
            width={page.width}
            height={page.height}
            draggable={false}
            onLoad={() => setLoaded(page.number)}
            onError={() => setFailed(true)}
            className="pointer-events-none h-full w-full object-contain"
            {...noSave}
          />
        )}
        {/* A transparent layer over the page catches right-clicks and long-presses. */}
        <div className="absolute inset-0" {...noSave} />
      </div>
      <Pager number={page.number} total={total} onPrevious={() => go(-1)} onNext={() => go(1)} />
    </div>
  );
}

function Pager({ number, total, onPrevious, onNext }: { number: number; total: number; onPrevious: () => void; onNext: () => void }) {
  return (
    <div className="flex items-center justify-between gap-3 px-3 py-2">
      <Button size="sm" variant="outline" onClick={onPrevious} disabled={number <= 1}>
        <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        Previous
      </Button>
      <p className="text-sm text-muted" aria-live="polite">
        Page <span className="font-medium text-navy">{number}</span> of {total}
      </p>
      <Button size="sm" variant="outline" onClick={onNext} disabled={number >= total}>
        Next
        <ChevronRight className="h-4 w-4" aria-hidden="true" />
      </Button>
    </div>
  );
}

function ImageViewer({ lessonId, file }: { lessonId: number; file: LessonResource }) {
  return (
    <div className="relative select-none overflow-hidden rounded-[var(--radius-card)] border border-line bg-page">
      {/* eslint-disable-next-line @next/next/no-img-element -- private, per-learner image */}
      <img
        src={`${base(lessonId, file.id)}/view/`}
        alt={file.title}
        draggable={false}
        className="pointer-events-none mx-auto max-h-[80vh] w-auto max-w-full"
        {...noSave}
      />
      <div className="absolute inset-0" {...noSave} />
    </div>
  );
}

type TextState = { status: "loading" } | { status: "error" } | { status: "ready"; text: string; truncated: boolean };

export function TextViewer({ lessonId, file }: { lessonId: number; file: LessonResource }) {
  const [state, setState] = useState<TextState>({ status: "loading" });

  useEffect(() => {
    const controller = new AbortController();
    fetch(`${base(lessonId, file.id)}/view/`, { credentials: "same-origin", signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error(String(res.status));
        setState({ status: "ready", text: await res.text(), truncated: res.headers.get("X-Truncated") === "1" });
      })
      .catch((err: unknown) => {
        if (!(err instanceof DOMException && err.name === "AbortError")) setState({ status: "error" });
      });
    return () => controller.abort();
  }, [lessonId, file.id]);

  if (state.status === "loading") {
    return (
      <div className="flex items-center gap-3 rounded-[var(--radius-card)] border border-line bg-page p-6 text-sm text-muted" role="status">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        Loading…
      </div>
    );
  }
  if (state.status === "error") {
    return <Alert tone="danger" title="This file could not be loaded">Reload the page to try again.</Alert>;
  }
  return (
    <div>
      <pre className="max-h-[70vh] overflow-auto rounded-[var(--radius-card)] border border-line bg-navy p-4 font-mono text-sm leading-relaxed text-white">
        <code>{state.text}</code>
      </pre>
      {state.truncated && <p className="mt-2 text-xs text-muted">Only the first part of this file is shown.</p>}
    </div>
  );
}
