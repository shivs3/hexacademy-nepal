import { mergeAttributes, Node } from "@tiptap/core";
import katex from "katex";

/**
 * Editor nodes for maths. They serialise to exactly the markup the backend
 * sanitiser allows and lib/rich-text.ts renders:
 *
 *   <span data-type="inline-math" data-latex="x^2"></span>
 *   <div data-type="block-math" data-latex="\int_0^1 f"></div>
 *
 * The editor shows a KaTeX preview; double-clicking a formula dispatches a
 * bubbling `MATH_EDIT_EVENT` so the host can open its formula dialog.
 */
export type MathEditRequest = { pos: number; latex: string; display: boolean };

export const MATH_EDIT_EVENT = "hx-math-edit";

function makeMathNode(display: boolean) {
  const dataType = display ? "block-math" : "inline-math";
  const tag = display ? "div" : "span";
  return Node.create({
    name: display ? "blockMath" : "inlineMath",
    group: display ? "block" : "inline",
    inline: !display,
    atom: true,
    selectable: true,
    draggable: display,

    addAttributes() {
      return {
        latex: {
          default: "",
          parseHTML: (el) => el.getAttribute("data-latex") ?? "",
          renderHTML: (attrs) => ({ "data-latex": attrs.latex as string }),
        },
      };
    },

    parseHTML() {
      return [{ tag: `${tag}[data-type="${dataType}"]` }];
    },

    renderHTML({ HTMLAttributes }) {
      return [tag, mergeAttributes({ "data-type": dataType }, HTMLAttributes)];
    },

    addNodeView() {
      return ({ node, getPos }) => {
        const dom = document.createElement(tag);
        dom.className = display
          ? "my-3 cursor-pointer rounded-md border border-dashed border-line bg-page px-3 py-2 text-center"
          : "cursor-pointer rounded bg-teal-50 px-0.5";
        dom.title = "Double-click to edit formula";
        dom.setAttribute("contenteditable", "false");
        const latex = (node.attrs.latex as string) || "";
        katex.render(latex || "\\square", dom, { displayMode: display, throwOnError: false, trust: false, strict: "ignore" });
        dom.addEventListener("dblclick", () => {
          const pos = typeof getPos === "function" ? getPos() : undefined;
          if (typeof pos !== "number") return;
          const detail: MathEditRequest = { pos, latex, display };
          dom.dispatchEvent(new CustomEvent(MATH_EDIT_EVENT, { bubbles: true, detail }));
        });
        return { dom };
      };
    },
  });
}

export const InlineMath = makeMathNode(false);
export const BlockMath = makeMathNode(true);
