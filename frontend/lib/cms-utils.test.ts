import { describe, expect, it } from "vitest";

import { linkError } from "@/components/cms/admin/rich-text-editor";
import { emptyData } from "@/components/cms/admin/section-fields";
import { isInternalHref } from "@/components/cms/cms-link";
import type { FieldDescriptor } from "@/types/cms-admin";

import { ApiError } from "./api/errors";
import { contrastWithWhite } from "./color";
import { renderRichText, richTextToPlain } from "./rich-text";
import { slugField, slugify } from "./validation/cms";

describe("renderRichText", () => {
  it("strips scripts, event handlers and inline styles", () => {
    const out = renderRichText('<p style="color:red" onclick="x()">Hi<script>alert(1)</script></p><iframe src="https://x"></iframe>');
    expect(out).toBe("<p>Hi</p>");
  });

  it("drops javascript: links", () => {
    expect(renderRichText('<a href="javascript:alert(1)">x</a>')).not.toContain("javascript:");
  });

  it("renders maths placeholders with KaTeX and decodes the attribute", () => {
    const out = renderRichText('<p><span data-type="inline-math" data-latex="a &lt; b"></span></p>');
    expect(out).toContain('class="math-inline"');
    expect(out).toContain("katex");
    expect(out).not.toContain("data-latex");
  });

  it("does not let KaTeX create links", () => {
    const out = renderRichText('<div data-type="block-math" data-latex="\\href{javascript:alert(1)}{x}"></div>');
    expect(out).toContain("math-block");
    expect(out).not.toContain("<a ");
  });

  it("removes empty maths nodes", () => {
    expect(renderRichText('<span data-type="inline-math" data-latex=" "></span>')).toBe("");
  });

  it("produces plain text for metadata", () => {
    expect(richTextToPlain("<h2>Title</h2>\n<p>Some <strong>bold</strong>   text</p>")).toBe("Title Some bold text");
  });
});

describe("linkError", () => {
  it.each(["/courses", "#faq", "https://hexacademynepal.com/x", "mailto:info@example.com", "tel:+9771234567"])("accepts %s", (v) => {
    expect(linkError(v)).toBeNull();
  });
  it.each(["", "javascript:alert(1)", "//evil.example", "/\\evil.example", "data:text/html,x", "https://", "/a b"])("rejects %s", (v) => {
    expect(linkError(v)).not.toBeNull();
  });
});

describe("isInternalHref", () => {
  it("treats only single-slash paths as internal", () => {
    expect(isInternalHref("/blog")).toBe(true);
    expect(isInternalHref("//evil.example")).toBe(false);
    expect(isInternalHref("https://example.com")).toBe(false);
  });
});

describe("emptyData", () => {
  it("builds empty values matching the backend's defaults", () => {
    const fields = [
      { name: "title", kind: "text", label: "Title" },
      { name: "image", kind: "image", label: "Image" },
      { name: "show", kind: "boolean", label: "Show", default: true },
      { name: "align", kind: "select", label: "Align", choices: [{ value: "left", label: "Left" }] },
      { name: "items", kind: "list", label: "Items", min_items: 2, fields: [{ name: "q", kind: "text", label: "Q" }] },
    ] as FieldDescriptor[];
    expect(emptyData(fields)).toEqual({ title: "", image: null, show: true, align: "left", items: [{ q: "" }, { q: "" }] });
  });
});

describe("ApiError.fieldErrors", () => {
  it("flattens nested serializer errors into dotted keys", () => {
    const err = new ApiError(400, "validation_error", "Invalid", {
      name: ["Required."],
      items: [{}, { label: ["Too long."], children: [{}, { url: ["Bad link."] }] }],
      social_links: [{ url: ["Use https."] }],
    });
    expect(err.fieldErrors()).toEqual({
      name: "Required.",
      "items.1.label": "Too long.",
      "items.1.children.1.url": "Bad link.",
      "social_links.0.url": "Use https.",
    });
  });
});

describe("contrastWithWhite", () => {
  it("matches the WCAG formula", () => {
    expect(contrastWithWhite("#000000")).toBeCloseTo(21, 1);
    expect(contrastWithWhite("#FFFFFF")).toBeCloseTo(1, 5);
    expect(contrastWithWhite("#102A43")!).toBeGreaterThan(4.5);
  });
  it("returns null for invalid colours", () => {
    expect(contrastWithWhite("red")).toBeNull();
    expect(contrastWithWhite("#FFF")).toBeNull();
  });
});

describe("slugs", () => {
  it("slugifies titles", () => {
    expect(slugify("  Intro to Machine Learning — Part 2! ")).toBe("intro-to-machine-learning-part-2");
    expect(slugify("Café Déjà vu")).toBe("cafe-deja-vu");
  });
  it("truncates without leaving a trailing hyphen", () => {
    expect(slugify("abc def", 4)).toBe("abc");
  });
  it("validates format and length", () => {
    const field = slugField(10);
    expect(field.safeParse("good-slug").success).toBe(true);
    expect(field.safeParse("Bad-Slug").success).toBe(false);
    expect(field.safeParse("double--hyphen").success).toBe(false);
    expect(field.safeParse("-lead").success).toBe(false);
    expect(field.safeParse("much-too-long").success).toBe(false);
  });
});
