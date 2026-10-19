"use client";

import { ArrowDown, ArrowUp, ChevronDown, Copy, Eye, EyeOff, LayoutTemplate, Plus, Trash2 } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { ConfirmDialog, Dialog } from "@/components/ui/dialog";
import { Badge, EmptyState } from "@/components/ui/feedback";
import { cn } from "@/lib/utils";
import type { DraftSection, SectionTypeInfo } from "@/types/cms-admin";

import { emptyData, FieldsForm, hasErrorsUnder, type FieldErrors } from "./section-fields";

export const MAX_SECTIONS = 40;

function newId() {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 12);
}

function summary(section: DraftSection): string {
  const d = section.data;
  const candidate = d.heading ?? d.title ?? d.eyebrow;
  return typeof candidate === "string" ? candidate : "";
}

export function SectionBuilder({
  sections,
  onChange,
  types,
  errors,
}: {
  sections: DraftSection[];
  onChange: (sections: DraftSection[]) => void;
  types: SectionTypeInfo[];
  errors: FieldErrors;
}) {
  const [open, setOpen] = useState<Set<string>>(() => new Set(sections.length === 1 ? [sections[0].id] : []));
  const [adding, setAdding] = useState<number | null>(null);
  const [removing, setRemoving] = useState<DraftSection | null>(null);
  const typeMap = new Map(types.map((t) => [t.type, t]));

  function toggle(id: string, force?: boolean) {
    setOpen((prev) => {
      const next = new Set(prev);
      if (force ?? !next.has(id)) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function update(index: number, patch: Partial<DraftSection>) {
    onChange(sections.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  }

  function move(from: number, to: number) {
    const next = [...sections];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    onChange(next);
  }

  function insert(type: SectionTypeInfo, at: number) {
    const section: DraftSection = { id: newId(), type: type.type, hidden: false, data: emptyData(type.fields) };
    const next = [...sections];
    next.splice(at, 0, section);
    onChange(next);
    toggle(section.id, true);
  }

  function duplicate(index: number) {
    const copy: DraftSection = { ...structuredClone(sections[index]), id: newId() };
    const next = [...sections];
    next.splice(index + 1, 0, copy);
    onChange(next);
  }

  const full = sections.length >= MAX_SECTIONS;

  return (
    <div className="flex flex-col gap-3">
      {errors.sections && <p className="text-sm text-danger">{errors.sections}</p>}
      {sections.length === 0 ? (
        <EmptyState
          icon={LayoutTemplate}
          title="This page has no sections yet"
          description="Add a hero banner, text, FAQs and more. Sections appear on the page in this order."
          action={
            <Button type="button" onClick={() => setAdding(0)}>
              <Plus className="h-4 w-4" aria-hidden="true" />
              Add a section
            </Button>
          }
        />
      ) : (
        <ol className="flex flex-col gap-3">
          {sections.map((section, i) => {
            const info = typeMap.get(section.type);
            const isOpen = open.has(section.id);
            const prefix = `sections.${i}`;
            const invalid = hasErrorsUnder(errors, prefix);
            const panelId = `section-panel-${section.id}`;
            return (
              <li
                key={section.id}
                className={cn(
                  "rounded-[var(--radius-card)] border bg-white",
                  invalid ? "border-danger" : "border-line",
                  section.hidden && "bg-page",
                )}
              >
                <div className="flex items-center gap-2 px-3 py-2">
                  <button
                    type="button"
                    onClick={() => toggle(section.id)}
                    aria-expanded={isOpen}
                    aria-controls={panelId}
                    className="flex min-w-0 flex-1 items-center gap-2 rounded py-1 text-left focus-visible:outline-2 focus-visible:outline-teal"
                  >
                    <ChevronDown className={cn("h-4 w-4 shrink-0 text-muted transition-transform", !isOpen && "-rotate-90")} aria-hidden="true" />
                    <span className="text-xs font-medium text-muted">{i + 1}.</span>
                    <span className="font-semibold text-navy">{info?.label ?? section.type}</span>
                    {summary(section) && <span className="hidden min-w-0 truncate text-sm text-muted sm:inline">— {summary(section)}</span>}
                    {section.hidden && <Badge tone="neutral">Hidden</Badge>}
                    {invalid && <Badge tone="danger">Needs attention</Badge>}
                  </button>
                  <div className="flex shrink-0 items-center">
                    <IconButton label="Move up" disabled={i === 0} onClick={() => move(i, i - 1)} icon={ArrowUp} />
                    <IconButton label="Move down" disabled={i === sections.length - 1} onClick={() => move(i, i + 1)} icon={ArrowDown} />
                    <IconButton
                      label={section.hidden ? "Show section" : "Hide section"}
                      onClick={() => update(i, { hidden: !section.hidden })}
                      icon={section.hidden ? EyeOff : Eye}
                    />
                    <IconButton label="Duplicate section" disabled={full} onClick={() => duplicate(i)} icon={Copy} />
                    <IconButton label="Remove section" onClick={() => setRemoving(section)} icon={Trash2} danger />
                  </div>
                </div>
                {isOpen && (
                  <div id={panelId} className="border-t border-line px-4 py-4">
                    {info ? (
                      <>
                        {info.description && <p className="mb-4 text-sm text-muted">{info.description}</p>}
                        <FieldsForm fields={info.fields} data={section.data} onChange={(data) => update(i, { data })} path={prefix} errors={errors} />
                      </>
                    ) : (
                      <p className="text-sm text-warning">This section type is no longer available and will be removed when you save.</p>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      )}
      {sections.length > 0 && (
        <div>
          <Button type="button" variant="outline" disabled={full} onClick={() => setAdding(sections.length)}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            Add section
          </Button>
          {full && <span className="ml-3 text-xs text-muted">A page can have at most {MAX_SECTIONS} sections.</span>}
        </div>
      )}

      <Dialog open={adding !== null} onOpenChange={(o) => !o && setAdding(null)} title="Add a section" className="max-w-2xl">
        <ul className="grid gap-2 sm:grid-cols-2">
          {types.map((t) => (
            <li key={t.type}>
              <button
                type="button"
                className="h-full w-full rounded-lg border border-line p-3 text-left hover:border-teal/50 hover:bg-teal-50 focus-visible:outline-2 focus-visible:outline-teal"
                onClick={() => {
                  insert(t, adding ?? sections.length);
                  setAdding(null);
                }}
              >
                <span className="block font-semibold text-navy">{t.label}</span>
                <span className="mt-0.5 block text-xs text-muted">{t.description}</span>
              </button>
            </li>
          ))}
        </ul>
      </Dialog>

      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(o) => !o && setRemoving(null)}
        title="Remove this section?"
        description="The section is removed from the draft. Earlier versions in the history keep it, so it can be restored."
        confirmLabel="Remove"
        tone="danger"
        onConfirm={() => {
          if (removing) onChange(sections.filter((s) => s.id !== removing.id));
          setRemoving(null);
        }}
      />
    </div>
  );
}

function IconButton({
  label,
  icon: Icon,
  onClick,
  disabled,
  danger,
}: {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex h-8 w-8 items-center justify-center rounded text-muted hover:bg-page hover:text-navy disabled:opacity-35",
        danger && "hover:text-danger",
      )}
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}
