"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { api } from "@/lib/api/client";
import { isApiError } from "@/lib/api/errors";
import type { SavedAnswer } from "@/types/assessments";

export type AnswerPayload = { selected: number[]; flagged: boolean };
export type SaveStatus = "idle" | "saving" | "offline";

type Handlers = {
  onSaved: (answer: SavedAnswer) => void;
  /** The server refused this answer (for example going back when revisits are off). */
  onRejected: (questionId: number, message: string) => void;
  /** The attempt has ended on the server; nothing more can be saved. */
  onClosed: () => void;
};

const RETRY_MS = 3000;

/**
 * Saves answers one request at a time. Only the latest state of each question
 * is kept while waiting, so rapid clicks collapse into a single save. Network
 * failures keep the answer queued and retry; the server stays the authority on
 * what was recorded.
 */
export function useAnswerQueue(attemptId: number, handlers: Handlers) {
  const pending = useRef(new Map<number, AnswerPayload>());
  const running = useRef(false);
  const stopped = useRef(false);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const waiters = useRef<((drained: boolean) => void)[]>([]);
  const handlersRef = useRef(handlers);
  const retryRef = useRef<() => void>(() => {});
  const [status, setStatus] = useState<SaveStatus>("idle");
  const [pendingCount, setPendingCount] = useState(0);
  const [savedOnce, setSavedOnce] = useState(false);

  useEffect(() => {
    handlersRef.current = handlers;
  });

  useEffect(() => {
    // Reset on (re)mount: Strict Mode runs the cleanup once before the real mount.
    stopped.current = false;
    return () => {
      stopped.current = true;
      if (retryTimer.current) clearTimeout(retryTimer.current);
    };
  }, []);

  const settle = useCallback((drained: boolean) => {
    const list = waiters.current;
    waiters.current = [];
    list.forEach((resolve) => resolve(drained));
  }, []);

  const run = useCallback(async () => {
    if (running.current || stopped.current) return;
    running.current = true;
    if (retryTimer.current) {
      clearTimeout(retryTimer.current);
      retryTimer.current = null;
    }
    setStatus("saving");
    while (pending.current.size > 0 && !stopped.current) {
      const [questionId, payload] = pending.current.entries().next().value as [number, AnswerPayload];
      pending.current.delete(questionId);
      setPendingCount(pending.current.size);
      try {
        const saved = await api.put<SavedAnswer>(`/attempts/${attemptId}/answers/${questionId}/`, payload);
        setSavedOnce(true);
        handlersRef.current.onSaved(saved);
      } catch (err) {
        if (isApiError(err) && err.code === "attempt_closed") {
          stopped.current = true;
          pending.current.clear();
          setPendingCount(0);
          running.current = false;
          settle(true);
          handlersRef.current.onClosed();
          return;
        }
        if (isApiError(err) && err.status < 500 && err.status !== 429) {
          handlersRef.current.onRejected(questionId, err.message);
          continue;
        }
        // Offline, throttled or a server error: keep the answer unless a newer one replaced it.
        if (!pending.current.has(questionId)) pending.current.set(questionId, payload);
        setPendingCount(pending.current.size);
        setStatus("offline");
        running.current = false;
        settle(false);
        retryTimer.current = setTimeout(() => retryRef.current(), RETRY_MS);
        return;
      }
    }
    running.current = false;
    setPendingCount(0);
    setStatus("idle");
    settle(true);
  }, [attemptId, settle]);

  useEffect(() => {
    retryRef.current = () => void run();
  }, [run]);

  const enqueue = useCallback(
    (questionId: number, payload: AnswerPayload) => {
      if (stopped.current) return;
      pending.current.set(questionId, payload);
      setPendingCount(pending.current.size);
      void run();
    },
    [run],
  );

  /** Resolves true once everything queued is saved, false if the server could not be reached. */
  const flush = useCallback((): Promise<boolean> => {
    if (!running.current && pending.current.size === 0) return Promise.resolve(true);
    const done = new Promise<boolean>((resolve) => waiters.current.push(resolve));
    void run();
    return done;
  }, [run]);

  return { enqueue, flush, status, pendingCount, savedOnce };
}
