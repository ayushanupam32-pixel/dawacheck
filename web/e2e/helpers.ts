import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";

/**
 * Automated accessibility check (axe, the engine behind Lighthouse's accessibility score) on what
 * is on screen now. Checks WCAG 2.1 A and AA rules: contrast, labels, names, headings, ARIA.
 */
export async function expectAccessible(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    // Leaflet's map tiles are third-party images; the map is optional and off by default.
    .exclude(".leaflet-container")
    .analyze();
  const problems = results.violations.map(
    (v) =>
      `${v.id} (${v.impact}): ${v.help} — ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`,
  );
  expect(problems, problems.join("\n")).toEqual([]);
}

/** One row of the result card ("Batch safety", "Fair price", ...) by its heading. */
export function checkRow(page: Page, title: string) {
  return page
    .getByRole("listitem")
    .filter({ has: page.getByRole("heading", { level: 3, name: title, exact: true }) });
}
