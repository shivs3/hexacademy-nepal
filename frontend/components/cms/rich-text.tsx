import { renderRichText } from "@/lib/rich-text";
import { cn } from "@/lib/utils";

/** Renders sanitised CMS rich text with KaTeX maths. */
export function RichText({ html, className }: { html: string; className?: string }) {
  if (!html) return null;
  return (
    <div
      className={cn(
        "prose prose-slate max-w-none prose-headings:font-display prose-headings:text-navy prose-a:text-teal-700 prose-a:underline-offset-2",
        className,
      )}
      // Sanitised twice (backend nh3 allowlist, then DOMPurify) before rendering.
      dangerouslySetInnerHTML={{ __html: renderRichText(html) }}
    />
  );
}
