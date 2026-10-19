"use client";

import { ArrowDown, ArrowUp, CornerDownRight, Eye, EyeOff, ListTree, Plus, Trash2 } from "lucide-react";
import { useState } from "react";

import { LoadError, TableSkeleton } from "@/components/cms/admin/list-parts";
import { linkError } from "@/components/cms/admin/rich-text-editor";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { Alert, Badge, EmptyState } from "@/components/ui/feedback";
import { Field } from "@/components/ui/field";
import { Checkbox, Input, Label, Select } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { useApiResource } from "@/hooks/use-api-resource";
import { useSaveShortcut, useUnsavedWarning } from "@/hooks/use-unsaved-warning";
import { api } from "@/lib/api/client";
import { ApiError, errorMessage } from "@/lib/api/errors";
import { cn, formatDateTime } from "@/lib/utils";
import type { Paginated } from "@/types/accounts";
import type { AdminMenu, AdminMenuItem, AdminPageSummary, MenuLocation } from "@/types/cms-admin";

const MAX_LINKS = 60;
const LABEL_MAX = 80;

/** How each location is rendered on the public site, so editors know what nesting does. */
const LOCATION_HELP: Record<MenuLocation, { help: string; nested: boolean }> = {
  header: { help: "Top navigation. A link with sub-links opens a dropdown.", nested: true },
  footer: { help: "Links listed in the site footer.", nested: false },
  legal: { help: "Small links at the very bottom, such as privacy and terms.", nested: false },
};

type LinkKind = "page" | "url" | "group";
type DraftItem = {
  key: string;
  label: string;
  kind: LinkKind;
  page: number | null;
  url: string;
  open_in_new_tab: boolean;
  is_visible: boolean;
  children: DraftItem[];
};
type DraftMenu = { title: string; items: DraftItem[] };
type Errors = Record<string, string>;

let keySeq = 0;
const newKey = () => `m${++keySeq}`;

function toDraft(item: AdminMenuItem): DraftItem {
  return {
    key: newKey(),
    label: item.label,
    kind: item.page ? "page" : item.url ? "url" : "group",
    page: item.page,
    url: item.url,
    open_in_new_tab: item.open_in_new_tab,
    is_visible: item.is_visible,
    children: item.children.map(toDraft),
  };
}

function toPayload(item: DraftItem): Omit<AdminMenuItem, "id"> {
  return {
    label: item.label.trim(),
    page: item.kind === "page" ? item.page : null,
    url: item.kind === "url" ? item.url.trim() : "",
    open_in_new_tab: item.open_in_new_tab,
    is_visible: item.is_visible,
    children: item.children.map(toPayload),
  };
}

function menuPayload(menu: DraftMenu) {
  return { title: menu.title.trim(), items: menu.items.map(toPayload) };
}

function validate(menu: DraftMenu): Errors {
  const errors: Errors = {};
  const check = (item: DraftItem, path: string) => {
    if (!item.label.trim()) errors[`${path}.label`] = "Enter a label.";
    if (item.kind === "page" && !item.page) errors[`${path}.page`] = "Choose a page.";
    if (item.kind === "url") {
      const err = linkError(item.url);
      if (err) errors[`${path}.url`] = err;
    }
    if (item.kind === "group" && item.children.length === 0) errors[`${path}.url`] = "Add sub-links, or link this item to a page.";
    item.children.forEach((c, i) => check(c, `${path}.children.${i}`));
  };
  menu.items.forEach((item, i) => check(item, `items.${i}`));
  return errors;
}

function countLinks(items: DraftItem[]) {
  return items.reduce((n, i) => n + 1 + i.children.length, 0);
}

function blankItem(): DraftItem {
  return { key: newKey(), label: "", kind: "page", page: null, url: "", open_in_new_tab: false, is_visible: true, children: [] };
}

function move<T>(list: T[], from: number, to: number): T[] {
  if (to < 0 || to >= list.length) return list;
  const next = [...list];
  const [x] = next.splice(from, 1);
  next.splice(to, 0, x);
  return next;
}

export function MenusEditor() {
  const { data, error, reload } = useApiResource<AdminMenu[]>("/admin/cms/menus/");
  const { data: pages } = useApiResource<Paginated<AdminPageSummary>>("/admin/cms/pages/", { page_size: 100, ordering: "title" });
  const [location, setLocation] = useState<MenuLocation>("header");

  if (error) return <LoadError message={error} onRetry={reload} />;
  if (!data) return <TableSkeleton rows={6} />;

  const menu = data.find((m) => m.location === location) ?? data[0];

  return (
    <div className="flex flex-col gap-4">
      <div role="tablist" aria-label="Menu location" className="flex gap-1 border-b border-line">
        {data.map((m) => (
          <button
            key={m.location}
            type="button"
            role="tab"
            aria-selected={m.location === menu.location}
            onClick={() => setLocation(m.location)}
            className={cn(
              "-mb-px border-b-2 px-4 py-2 text-sm font-medium transition-colors",
              m.location === menu.location ? "border-teal text-navy" : "border-transparent text-muted hover:text-navy",
            )}
          >
            {m.location_label}
          </button>
        ))}
      </div>
      {/* All forms stay mounted so unsaved edits survive switching tabs; a save remounts that form from the server copy. */}
      {data.map((m) => (
        <div key={`${m.location}-${m.updated_at}`} role="tabpanel" hidden={m.location !== menu.location}>
          <MenuForm menu={m} pages={pages?.results ?? null} active={m.location === menu.location} onSaved={reload} />
        </div>
      ))}
    </div>
  );
}

function MenuForm({
  menu,
  pages,
  active,
  onSaved,
}: {
  menu: AdminMenu;
  pages: AdminPageSummary[] | null;
  active: boolean;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [initial] = useState<DraftMenu>(() => ({ title: menu.title, items: menu.items.map(toDraft) }));
  const [draft, setDraft] = useState<DraftMenu>(initial);
  const [errors, setErrors] = useState<Errors>({});
  const [saving, setSaving] = useState(false);
  const { help, nested } = LOCATION_HELP[menu.location];
  const dirty = JSON.stringify(menuPayload(draft)) !== JSON.stringify(menuPayload(initial));
  const total = countLinks(draft.items);

  useUnsavedWarning(dirty);

  async function save() {
    const found = validate(draft);
    setErrors(found);
    if (Object.keys(found).length) {
      toast.error("Fix the highlighted links before saving.");
      return;
    }
    setSaving(true);
    try {
      await api.put<AdminMenu>(`/admin/cms/menus/${menu.location}/`, menuPayload(draft));
      toast.success(`${menu.location_label} menu saved.`);
      onSaved();
    } catch (err) {
      if (err instanceof ApiError) setErrors(err.fieldErrors());
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  useSaveShortcut(() => void save(), active && dirty && !saving);

  const setItems = (items: DraftItem[]) => setDraft((d) => ({ ...d, items }));

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted">{help}</p>
      <Card>
        <CardBody className="flex flex-col gap-4">
          <Field label="Menu heading" htmlFor={`menu-title-${menu.location}`} hint="Optional. Shown above the links where the layout has room.">
            <Input value={draft.title} maxLength={100} onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))} />
          </Field>
        </CardBody>
      </Card>

      {draft.items.length === 0 ? (
        <EmptyState icon={ListTree} title="No links yet" description="Add a link to a page or another address." />
      ) : (
        <ol className="flex flex-col gap-3">
          {draft.items.map((item, i) => (
            <li key={item.key}>
              <ItemEditor
                item={item}
                path={`items.${i}`}
                pages={pages}
                errors={errors}
                index={i}
                count={draft.items.length}
                allowChildren={nested}
                canAddMore={total < MAX_LINKS}
                onChange={(next) => setItems(draft.items.map((x, j) => (j === i ? next : x)))}
                onMove={(to) => setItems(move(draft.items, i, to))}
                onRemove={() => setItems(draft.items.filter((_, j) => j !== i))}
              />
            </li>
          ))}
        </ol>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Button variant="outline" onClick={() => setItems([...draft.items, blankItem()])} disabled={total >= MAX_LINKS}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          Add link
        </Button>
        <span className="text-xs text-muted">
          {total} of {MAX_LINKS} links
        </span>
        <div className="ml-auto flex items-center gap-3">
          <span className="text-xs text-muted">Last saved {formatDateTime(menu.updated_at)}</span>
          <Button variant="ghost" disabled={!dirty || saving} onClick={() => { setDraft(initial); setErrors({}); }}>
            Discard changes
          </Button>
          <Button onClick={save} loading={saving} disabled={!dirty}>
            Save menu
          </Button>
        </div>
      </div>
      {dirty && <Alert tone="info">You have unsaved changes to this menu.</Alert>}
    </div>
  );
}

function ItemEditor({
  item,
  path,
  pages,
  errors,
  index,
  count,
  allowChildren,
  canAddMore,
  onChange,
  onMove,
  onRemove,
  child = false,
}: {
  item: DraftItem;
  path: string;
  pages: AdminPageSummary[] | null;
  errors: Errors;
  index: number;
  count: number;
  allowChildren: boolean;
  canAddMore: boolean;
  onChange: (item: DraftItem) => void;
  onMove: (to: number) => void;
  onRemove: () => void;
  child?: boolean;
}) {
  const set = (patch: Partial<DraftItem>) => onChange({ ...item, ...patch });
  const id = `menu-${item.key}`;
  const selectedPage = pages?.find((p) => p.id === item.page);
  const canGroup = allowChildren && !child;

  return (
    <Card className={cn(!item.is_visible && "opacity-70", child && "bg-page")}>
      <CardBody className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          {child && <CornerDownRight className="h-4 w-4 text-muted" aria-hidden="true" />}
          <span className="text-sm font-medium text-navy">{item.label.trim() || (child ? "New sub-link" : "New link")}</span>
          {!item.is_visible && <Badge tone="neutral">Hidden</Badge>}
          <div className="ml-auto flex items-center gap-1">
            <Button variant="ghost" size="sm" aria-label="Move up" disabled={index === 0} onClick={() => onMove(index - 1)}>
              <ArrowUp className="h-4 w-4" aria-hidden="true" />
            </Button>
            <Button variant="ghost" size="sm" aria-label="Move down" disabled={index === count - 1} onClick={() => onMove(index + 1)}>
              <ArrowDown className="h-4 w-4" aria-hidden="true" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              aria-label={item.is_visible ? "Hide link" : "Show link"}
              onClick={() => set({ is_visible: !item.is_visible })}
            >
              {item.is_visible ? <Eye className="h-4 w-4" aria-hidden="true" /> : <EyeOff className="h-4 w-4" aria-hidden="true" />}
            </Button>
            <Button variant="ghost" size="sm" aria-label="Remove link" className="text-danger" onClick={onRemove}>
              <Trash2 className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-[1fr_10rem_1.5fr]">
          <Field label="Label" htmlFor={`${id}-label`} error={errors[`${path}.label`]} required>
            <Input value={item.label} maxLength={LABEL_MAX} onChange={(e) => set({ label: e.target.value })} />
          </Field>
          <Field label="Links to" htmlFor={`${id}-kind`}>
            <Select value={item.kind} onChange={(e) => set({ kind: e.target.value as LinkKind })}>
              <option value="page">A page</option>
              <option value="url">Web address</option>
              {canGroup && <option value="group">Nothing (dropdown only)</option>}
            </Select>
          </Field>
          {item.kind === "page" && (
            <Field
              label="Page"
              htmlFor={`${id}-page`}
              error={errors[`${path}.page`] ?? errors[`${path}.url`]}
              hint={selectedPage && selectedPage.status !== "published" ? "This page is not published, so the link is hidden from visitors." : undefined}
            >
              <Select
                value={item.page ?? ""}
                disabled={!pages}
                onChange={(e) => {
                  const pageId = e.target.value ? Number(e.target.value) : null;
                  const page = pages?.find((p) => p.id === pageId);
                  set({ page: pageId, label: item.label.trim() || page?.title || "" });
                }}
              >
                <option value="">{pages ? "Choose a page…" : "Loading pages…"}</option>
                {pages?.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title} ({p.path}){p.status !== "published" ? ` · ${p.status}` : ""}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          {item.kind === "url" && (
            <Field label="Address" htmlFor={`${id}-url`} error={errors[`${path}.url`]} hint="A site path such as /courses, or a full https:// address.">
              <Input value={item.url} maxLength={500} onChange={(e) => set({ url: e.target.value })} placeholder="/courses" />
            </Field>
          )}
          {item.kind === "group" && (
            <div className="flex flex-col justify-end">
              {errors[`${path}.url`] ? (
                <p className="text-xs text-danger">{errors[`${path}.url`]}</p>
              ) : (
                <p className="text-xs text-muted">Opens a dropdown of the sub-links below.</p>
              )}
            </div>
          )}
        </div>

        {item.kind !== "group" && (
          <div className="flex items-center gap-2">
            <Checkbox id={`${id}-tab`} checked={item.open_in_new_tab} onChange={(e) => set({ open_in_new_tab: e.target.checked })} />
            <Label htmlFor={`${id}-tab`} className="font-normal">
              Open in a new tab
            </Label>
          </div>
        )}

        {canGroup && (
          <div className="flex flex-col gap-2 border-t border-line pt-3">
            {item.children.length > 0 && (
              <ol className="flex flex-col gap-2">
                {item.children.map((c, ci) => (
                  <li key={c.key}>
                    <ItemEditor
                      item={c}
                      path={`${path}.children.${ci}`}
                      pages={pages}
                      errors={errors}
                      index={ci}
                      count={item.children.length}
                      allowChildren={false}
                      canAddMore={canAddMore}
                      child
                      onChange={(next) => set({ children: item.children.map((x, j) => (j === ci ? next : x)) })}
                      onMove={(to) => set({ children: move(item.children, ci, to) })}
                      onRemove={() => {
                        const children = item.children.filter((_, j) => j !== ci);
                        // A dropdown-only item with no sub-links left would be invalid; turn it back into a page link.
                        set({ children, kind: item.kind === "group" && children.length === 0 ? "page" : item.kind });
                      }}
                    />
                  </li>
                ))}
              </ol>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="self-start"
              disabled={!canAddMore}
              onClick={() => set({ children: [...item.children, blankItem()] })}
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              Add sub-link
            </Button>
          </div>
        )}
      </CardBody>
    </Card>
  );
}
