import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";

/**
 * WCAG 2.1 A/AA violations on the current page, one readable line each. axe
 * catches contrast, labelling, landmark and ARIA mistakes, but not focus order
 * or whether alt text is meaningful; those still need a manual pass.
 */
export async function axeViolations(page: Page): Promise<string[]> {
  const { violations } = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    // WCAG 1.4.3 exempts logotypes from contrast; the wordmark keeps the exact brand teal.
    .exclude("[data-brand-logo]")
    .analyze();
  return violations.map(
    (v) => `${v.id} (${v.impact}): ${v.help} — ${v.nodes.map((n) => n.target.join(" ")).slice(0, 3).join(", ")}`,
  );
}
