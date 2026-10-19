"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { toLocalInput } from "@/lib/utils";

/** Pick a future publication time in the browser's zone; reports it as an ISO string. */
export function ScheduleDialog({
  description,
  current,
  loading,
  onClose,
  onSchedule,
}: {
  description: string;
  current: string | null;
  loading: boolean;
  onClose: () => void;
  onSchedule: (iso: string) => void;
}) {
  const [value, setValue] = useState(() => toLocalInput(current ? new Date(current) : new Date(Date.now() + 60 * 60 * 1000)));
  const [error, setError] = useState<string | null>(null);
  // Rendered only after a click, so reading the browser's zone here is safe.
  const [zone] = useState(() => Intl.DateTimeFormat().resolvedOptions().timeZone);

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title="Schedule publication"
      description={description}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            loading={loading}
            onClick={() => {
              const date = new Date(value);
              if (Number.isNaN(date.getTime())) setError("Choose a date and time.");
              else if (date.getTime() <= Date.now()) setError("Choose a time in the future.");
              else onSchedule(date.toISOString());
            }}
          >
            Schedule
          </Button>
        </>
      }
    >
      <Field label="Publish at" htmlFor="schedule-at" error={error ?? undefined} hint={zone ? `In your time zone (${zone}).` : undefined}>
        <Input type="datetime-local" value={value} onChange={(e) => setValue(e.target.value)} />
      </Field>
    </Dialog>
  );
}
