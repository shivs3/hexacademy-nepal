"use client";

import { EditorContent, useEditor, useEditorState, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import {
  Bold,
  Code,
  Heading2,
  Heading3,
  Heading4,
  Italic,
  Link2,
  List,
  ListOrdered,
  Minus,
  Quote,
  Redo2,
  Sigma,
  SquareSigma,
  Strikethrough,
  Underline,
  Undo2,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Checkbox, Input, Label, Textarea } from "@/components/ui/input";
import { renderMath } from "@/lib/rich-text";
import { cn } from "@/lib/utils";

import { BlockMath, InlineMath, MATH_EDIT_EVENT, type MathEditRequest } from "./math-nodes";

/** Mirrors apps/cms/sanitize.validate_link: site paths, #anchors, http(s), mailto:, tel:. */
export function linkError(value: string): string | null {
  const v = value.trim();
  if (!v) return "Enter a link.";
  if (/\s/.test(v)) return "Links cannot contain spaces.";
  if (v.startsWith("//") || v.startsWith("/\\")) return "Use a full https:// address for external links.";
  if (v.startsWith("/") || v.startsWith("#")) return null;
  if (/^https?:\/\/[^/]+/i.test(v) || /^(mailto|tel):.+/i.test(v)) return null;
  return "Use a site path such as /courses, or an https://, mailto: or tel: link.";
}

type MathDraft = { latex: string; display: boolean; pos: number | null };

export function RichTextEditor({
  id,
  value,
  onChange,
  invalid,
  minimal = false,
  placeholderLabel,
}: {
  id?: string;
  value: string;
  onChange: (html: string) => void;
  invalid?: boolean;
  /** Fewer block tools, for short fields such as FAQ answers. */
  minimal?: boolean;
  placeholderLabel?: string;
}) {
  const onChangeRef = useRef(onChange);
  const [math, setMath] = useState<MathDraft | null>(null);
  const [link, setLink] = useState<{ href: string; newTab: boolean } | null>(null);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3, 4] },
        codeBlock: minimal ? false : {},
        link: {
          openOnClick: false,
          autolink: true,
          protocols: ["mailto", "tel"],
          HTMLAttributes: { rel: "noopener noreferrer", target: null },
          isAllowedUri: (url) => linkError(url) === null,
        },
      }),
      InlineMath,
      BlockMath,
    ],
    content: value,
    editorProps: {
      attributes: {
        ...(id ? { id } : {}),
        role: "textbox",
        "aria-multiline": "true",
        ...(placeholderLabel ? { "aria-label": placeholderLabel } : {}),
        class: cn(
          "prose prose-slate max-w-none px-3 py-2 focus:outline-none prose-headings:font-display prose-headings:text-navy prose-a:text-teal-700",
          minimal ? "min-h-24" : "min-h-48",
        ),
      },
    },
    onUpdate: ({ editor: e }) => onChangeRef.current(e.isEmpty ? "" : e.getHTML()),
  });

  useEffect(() => {
    if (!editor) return;
    const dom = editor.view.dom;
    const handler = (e: Event) => {
      const req = (e as CustomEvent<MathEditRequest>).detail;
      setMath({ latex: req.latex, display: req.display, pos: req.pos });
    };
    dom.addEventListener(MATH_EDIT_EVENT, handler);
    return () => dom.removeEventListener(MATH_EDIT_EVENT, handler);
  }, [editor]);

  // Accept outside changes (version restore, form reset) without fighting the user's typing.
  useEffect(() => {
    if (!editor || editor.isFocused) return;
    const current = editor.isEmpty ? "" : editor.getHTML();
    if (current !== value) editor.commands.setContent(value || "", { emitUpdate: false });
  }, [editor, value]);

  return (
    <div
      className={cn(
        "overflow-hidden rounded-[var(--radius-control)] border border-line bg-white focus-within:border-teal focus-within:ring-2 focus-within:ring-teal/20",
        invalid && "border-danger",
      )}
    >
      {editor && (
        <Toolbar
          editor={editor}
          minimal={minimal}
          onLink={() => {
            const attrs = editor.getAttributes("link") as { href?: string; target?: string };
            setLink({ href: attrs.href ?? "", newTab: attrs.target === "_blank" });
          }}
          onMath={(display) => setMath({ latex: "", display, pos: null })}
        />
      )}
      <EditorContent editor={editor} />
      {editor && link && (
        <LinkDialog
          initial={link}
          onClose={() => setLink(null)}
          onRemove={() => {
            editor.chain().focus().extendMarkRange("link").unsetLink().run();
            setLink(null);
          }}
          onSave={(href, newTab) => {
            const chain = editor.chain().focus().extendMarkRange("link");
            if (editor.state.selection.empty && !editor.isActive("link")) {
              chain.insertContent({ type: "text", text: href, marks: [{ type: "link", attrs: { href, target: newTab ? "_blank" : null } }] }).run();
            } else {
              chain.setLink({ href, target: newTab ? "_blank" : null }).run();
            }
            setLink(null);
          }}
        />
      )}
      {editor && math && (
        <MathDialog
          initial={math}
          onClose={() => setMath(null)}
          onSave={(latex, display) => {
            const node = { type: display ? "blockMath" : "inlineMath", attrs: { latex } };
            if (math.pos === null) editor.chain().focus().insertContent(node).run();
            else editor.chain().focus().insertContentAt({ from: math.pos, to: math.pos + 1 }, node).run();
            setMath(null);
          }}
        />
      )}
    </div>
  );
}

function Toolbar({
  editor,
  minimal,
  onLink,
  onMath,
}: {
  editor: Editor;
  minimal: boolean;
  onLink: () => void;
  onMath: (display: boolean) => void;
}) {
  const state = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive("bold"),
      italic: e.isActive("italic"),
      underline: e.isActive("underline"),
      strike: e.isActive("strike"),
      h2: e.isActive("heading", { level: 2 }),
      h3: e.isActive("heading", { level: 3 }),
      h4: e.isActive("heading", { level: 4 }),
      bullet: e.isActive("bulletList"),
      ordered: e.isActive("orderedList"),
      quote: e.isActive("blockquote"),
      code: e.isActive("code"),
      link: e.isActive("link"),
      canUndo: e.can().undo(),
      canRedo: e.can().redo(),
    }),
  });

  const c = () => editor.chain().focus();
  const groups: { icon: LucideIcon; label: string; active?: boolean; disabled?: boolean; run: () => void; hide?: boolean }[][] = [
    [
      { icon: Bold, label: "Bold", active: state.bold, run: () => c().toggleBold().run() },
      { icon: Italic, label: "Italic", active: state.italic, run: () => c().toggleItalic().run() },
      { icon: Underline, label: "Underline", active: state.underline, run: () => c().toggleUnderline().run() },
      { icon: Strikethrough, label: "Strikethrough", active: state.strike, run: () => c().toggleStrike().run() },
      { icon: Code, label: "Inline code", active: state.code, run: () => c().toggleCode().run() },
    ],
    [
      { icon: Heading2, label: "Heading 2", active: state.h2, run: () => c().toggleHeading({ level: 2 }).run(), hide: minimal },
      { icon: Heading3, label: "Heading 3", active: state.h3, run: () => c().toggleHeading({ level: 3 }).run(), hide: minimal },
      { icon: Heading4, label: "Heading 4", active: state.h4, run: () => c().toggleHeading({ level: 4 }).run(), hide: minimal },
      { icon: List, label: "Bulleted list", active: state.bullet, run: () => c().toggleBulletList().run() },
      { icon: ListOrdered, label: "Numbered list", active: state.ordered, run: () => c().toggleOrderedList().run() },
      { icon: Quote, label: "Quote", active: state.quote, run: () => c().toggleBlockquote().run(), hide: minimal },
      { icon: Minus, label: "Divider", run: () => c().setHorizontalRule().run(), hide: minimal },
    ],
    [
      { icon: Link2, label: "Link", active: state.link, run: onLink },
      { icon: Sigma, label: "Inline formula", run: () => onMath(false) },
      { icon: SquareSigma, label: "Formula block", run: () => onMath(true), hide: minimal },
    ],
    [
      { icon: Undo2, label: "Undo", disabled: !state.canUndo, run: () => c().undo().run() },
      { icon: Redo2, label: "Redo", disabled: !state.canRedo, run: () => c().redo().run() },
    ],
  ];

  return (
    <div role="toolbar" aria-label="Formatting" className="flex flex-wrap items-center gap-0.5 border-b border-line bg-page px-1.5 py-1">
      {groups.map((group, gi) => (
        <div key={gi} className={cn("flex items-center gap-0.5", gi > 0 && "border-l border-line pl-1 ml-0.5")}>
          {group
            .filter((b) => !b.hide)
            .map(({ icon: Icon, label, active, disabled, run }) => (
              <button
                key={label}
                type="button"
                title={label}
                aria-label={label}
                aria-pressed={active === undefined ? undefined : active}
                disabled={disabled}
                onMouseDown={(e) => e.preventDefault()}
                onClick={run}
                className={cn(
                  "flex h-8 w-8 items-center justify-center rounded text-navy hover:bg-white disabled:opacity-40",
                  active && "bg-white text-teal-700 shadow-sm",
                )}
              >
                <Icon className="h-4 w-4" aria-hidden="true" />
              </button>
            ))}
        </div>
      ))}
    </div>
  );
}

function LinkDialog({
  initial,
  onClose,
  onSave,
  onRemove,
}: {
  initial: { href: string; newTab: boolean };
  onClose: () => void;
  onSave: (href: string, newTab: boolean) => void;
  onRemove: () => void;
}) {
  const [href, setHref] = useState(initial.href);
  const [newTab, setNewTab] = useState(initial.newTab);
  const [error, setError] = useState<string | null>(null);
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={initial.href ? "Edit link" : "Add link"}
      footer={
        <>
          {initial.href && (
            <Button variant="ghost" onClick={onRemove} className="mr-auto">
              Remove link
            </Button>
          )}
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              const err = linkError(href);
              if (err) setError(err);
              else onSave(href.trim(), newTab);
            }}
          >
            Apply
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <Field label="Link" htmlFor="rte-link" error={error ?? undefined} hint="A site path such as /courses, or https://…">
          <Input value={href} onChange={(e) => setHref(e.target.value)} autoFocus placeholder="/courses" />
        </Field>
        <Label className="flex items-center gap-2 font-normal">
          <Checkbox checked={newTab} onChange={(e) => setNewTab(e.target.checked)} />
          Open in a new tab
        </Label>
      </div>
    </Dialog>
  );
}

function MathDialog({
  initial,
  onClose,
  onSave,
}: {
  initial: MathDraft;
  onClose: () => void;
  onSave: (latex: string, display: boolean) => void;
}) {
  const [latex, setLatex] = useState(initial.latex);
  const [display, setDisplay] = useState(initial.display);
  const preview = latex.trim() ? renderMath(latex, display) : "";
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={initial.pos === null ? "Insert formula" : "Edit formula"}
      description="Write the formula in LaTeX, for example \frac{a}{b} or x^2 + y^2 = r^2."
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={!latex.trim()} onClick={() => onSave(latex.trim(), display)}>
            {initial.pos === null ? "Insert" : "Update"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <Field label="LaTeX" htmlFor="rte-latex">
          <Textarea value={latex} onChange={(e) => setLatex(e.target.value)} rows={3} autoFocus className="font-mono text-sm" />
        </Field>
        <Label className="flex items-center gap-2 font-normal">
          <Checkbox checked={display} onChange={(e) => setDisplay(e.target.checked)} />
          Show as a centred block
        </Label>
        <div className="min-h-14 overflow-x-auto rounded-md border border-line bg-page px-3 py-2" aria-live="polite">
          {preview ? (
            // KaTeX output (trust: false) of the editor's own input.
            <div dangerouslySetInnerHTML={{ __html: preview }} />
          ) : (
            <span className="text-sm text-muted">Preview appears here.</span>
          )}
        </div>
      </div>
    </Dialog>
  );
}
