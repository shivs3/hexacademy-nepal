"use client";

import { Flag } from "lucide-react";

import { RichText } from "@/components/cms/rich-text";
import { cn } from "@/lib/utils";
import { KIND_LABEL, formatMarks, optionLetter } from "@/lib/assessments";
import type { AttemptQuestion } from "@/types/assessments";

type Props = {
  question: AttemptQuestion;
  number: number;
  total: number;
  selected: number[];
  flagged: boolean;
  negativeMarking: boolean;
  disabled?: boolean;
  onSelect: (optionId: number) => void;
  onClear: () => void;
  onToggleFlag: () => void;
};

export function QuestionView({ question, number, total, selected, flagged, negativeMarking, disabled, onSelect, onClear, onToggleFlag }: Props) {
  const { content } = question;
  const multiple = content.kind === "multiple";
  const name = `q-${question.id}`;
  const negative = negativeMarking && Number(question.negative_marks) > 0;

  return (
    <section aria-labelledby={`${name}-title`} className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id={`${name}-title`} className="text-sm font-semibold uppercase tracking-wide text-muted">
          Question {number} of {total}
        </h2>
        <p className="text-sm text-muted">
          {KIND_LABEL[content.kind]} · {formatMarks(question.marks)} mark{question.marks === "1.00" ? "" : "s"}
          {negative && <span> · −{formatMarks(question.negative_marks)} if wrong</span>}
        </p>
      </div>

      <div id={`${name}-prompt`} className="text-lg text-navy">
        <RichText html={content.prompt} className="prose-lg" />
        {content.image && (
          // eslint-disable-next-line @next/next/no-img-element -- media is served from object storage with its own sizing
          <img src={content.image.url} alt={content.image.alt} className="mt-4 max-h-80 rounded-lg border border-line" />
        )}
      </div>

      <fieldset aria-describedby={`${name}-prompt`} disabled={disabled}>
        <legend className="mb-2 text-sm text-muted">{multiple ? "Select all that apply." : "Choose one answer."}</legend>
        <ul className="flex flex-col gap-3">
          {content.options.map((option, i) => {
            const checked = selected.includes(option.id);
            return (
              <li key={option.id}>
                <label
                  className={cn(
                    "relative flex cursor-pointer items-start gap-3 rounded-lg border bg-white p-4 transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-teal",
                    checked ? "border-teal bg-teal-50" : "border-line hover:border-teal/60",
                    disabled && "cursor-not-allowed opacity-70",
                  )}
                >
                  <input
                    type={multiple ? "checkbox" : "radio"}
                    name={name}
                    value={option.id}
                    checked={checked}
                    onChange={() => onSelect(option.id)}
                    className="absolute inset-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
                  />
                  <span
                    aria-hidden="true"
                    className={cn(
                      "flex h-7 w-7 shrink-0 items-center justify-center border text-sm font-semibold",
                      multiple ? "rounded-md" : "rounded-full",
                      checked ? "border-teal bg-teal text-white" : "border-line text-muted",
                    )}
                  >
                    {optionLetter(i)}
                  </span>
                  <span className="min-w-0 flex-1 pt-0.5">
                    <span className="sr-only">Option {optionLetter(i)}: </span>
                    <RichText html={option.text} className="prose-p:my-0" />
                    {option.image && (
                      // eslint-disable-next-line @next/next/no-img-element -- see above
                      <img src={option.image.url} alt={option.image.alt} className="mt-2 max-h-48 rounded-md border border-line" />
                    )}
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      </fieldset>

      <div className="flex flex-wrap items-center gap-4 text-sm">
        <button
          type="button"
          onClick={onToggleFlag}
          aria-pressed={flagged}
          disabled={disabled}
          className={cn("inline-flex items-center gap-1.5 font-medium hover:underline disabled:opacity-60", flagged ? "text-warning" : "text-teal-700")}
        >
          <Flag className="h-4 w-4" aria-hidden="true" fill={flagged ? "currentColor" : "none"} />
          {flagged ? "Flagged for review" : "Flag for review"}
        </button>
        {selected.length > 0 && (
          <button type="button" onClick={onClear} disabled={disabled} className="font-medium text-muted hover:text-navy hover:underline disabled:opacity-60">
            Clear answer
          </button>
        )}
      </div>
    </section>
  );
}
