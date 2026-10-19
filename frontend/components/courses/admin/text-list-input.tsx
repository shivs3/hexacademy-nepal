"use client";

import { ArrowDown, ArrowUp, Plus, X } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/** An ordered list of short text items (learning outcomes, prerequisites). */
export function TextListInput({
  id,
  value,
  onChange,
  max,
  placeholder,
  disabled,
}: {
  id: string;
  value: string[];
  onChange: (items: string[]) => void;
  max: number;
  placeholder: string;
  disabled?: boolean;
}) {
  const [pending, setPending] = useState("");

  function add() {
    const item = pending.trim();
    if (!item || value.length >= max) return;
    onChange([...value, item]);
    setPending("");
  }

  function move(from: number, to: number) {
    const next = [...value];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    onChange(next);
  }

  return (
    <div className="flex flex-col gap-2">
      {value.length > 0 && (
        <ol className="flex flex-col gap-1.5">
          {value.map((item, i) => (
            <li key={i} className="flex items-center gap-1">
              <Input
                value={item}
                maxLength={200}
                aria-label={`Item ${i + 1}`}
                disabled={disabled}
                onChange={(e) => onChange(value.map((v, j) => (j === i ? e.target.value : v)))}
              />
              {!disabled && (
                <>
                  <Button type="button" variant="ghost" size="icon" disabled={i === 0} onClick={() => move(i, i - 1)} aria-label={`Move item ${i + 1} up`}>
                    <ArrowUp className="h-4 w-4" aria-hidden="true" />
                  </Button>
                  <Button type="button" variant="ghost" size="icon" disabled={i === value.length - 1} onClick={() => move(i, i + 1)} aria-label={`Move item ${i + 1} down`}>
                    <ArrowDown className="h-4 w-4" aria-hidden="true" />
                  </Button>
                  <Button type="button" variant="ghost" size="icon" className="text-danger" onClick={() => onChange(value.filter((_, j) => j !== i))} aria-label={`Remove item ${i + 1}`}>
                    <X className="h-4 w-4" aria-hidden="true" />
                  </Button>
                </>
              )}
            </li>
          ))}
        </ol>
      )}
      {!disabled && value.length < max && (
        <div className="flex gap-2">
          <Input
            id={id}
            value={pending}
            maxLength={200}
            placeholder={placeholder}
            onChange={(e) => setPending(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                add();
              }
            }}
          />
          <Button type="button" variant="outline" onClick={add} disabled={!pending.trim()}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            Add
          </Button>
        </div>
      )}
      <p className="text-xs text-muted">
        {value.length} of {max}
      </p>
    </div>
  );
}
