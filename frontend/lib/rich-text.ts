import DOMPurify from "isomorphic-dompurify";
import katex from "katex";

/**
 * Rich text arrives already sanitised by the backend (nh3 allowlist). It is
 * sanitised again here as defence in depth, then maths placeholders written
 * by the editor are rendered with KaTeX:
 *
 *   <span data-type="inline-math" data-latex="x^2"></span>
 *   <div data-type="block-math" data-latex="\int_0^1 f"></div>
 *
 * KaTeX runs with `trust: false`, so commands such as \href or \includegraphics
 * cannot introduce links or HTML.
 */
const PURIFY_CONFIG = {
  FORBID_TAGS: ["style", "form", "input", "button", "textarea", "select", "iframe", "object", "embed", "svg", "math", "img"],
  FORBID_ATTR: ["style"],
  ALLOW_DATA_ATTR: true,
};

const MATH = /<(span|div)\b([^>]*\bdata-type="(inline|block)-math"[^>]*)>([^<]*)<\/\1>/g;
const LATEX_ATTR = /\bdata-latex="([^"]*)"/;

function decodeAttr(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

export function renderMath(latex: string, display: boolean): string {
  return katex.renderToString(latex, {
    displayMode: display,
    throwOnError: false,
    trust: false,
    strict: "ignore",
    maxExpand: 500,
    maxSize: 20,
    output: "htmlAndMathml",
  });
}

export function renderRichText(html: string): string {
  if (!html) return "";
  const clean = DOMPurify.sanitize(html, PURIFY_CONFIG) as string;
  return clean.replace(MATH, (_match, tag: string, attrs: string, kind: string) => {
    const latex = decodeAttr(LATEX_ATTR.exec(attrs)?.[1] ?? "");
    if (!latex.trim()) return "";
    const display = kind === "block";
    const wrapper = display ? "div" : "span";
    return `<${wrapper} class="${display ? "math-block" : "math-inline"}">${renderMath(latex, display)}</${wrapper}>`;
  });
}

/** Plain text (for meta descriptions and structured data). */
export function richTextToPlain(html: string): string {
  return DOMPurify.sanitize(html, { ALLOWED_TAGS: [] }).replace(/\s+/g, " ").trim();
}
