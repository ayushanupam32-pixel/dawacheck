import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";

/**
 * Automated accessibility check (axe, the engine behind Lighthouse's accessibility score) on what
 * is on screen now. Checks WCAG 2.1 A and AA rules: contrast, labels, names, headings, ARIA.
 */
export async function expectAccessible(page: Page) {
  // Let entrance animations (fade-ins, the menu sheet sliding in) finish first: halfway through a
  // fade, text is partly transparent and axe would measure a contrast the user never settles on.
  // Endless animations (loading skeletons, spinners) are skipped, or this would never return.
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter((a) => a.effect?.getComputedTiming().iterations !== Infinity)
        .map((a) => a.finished.catch(() => undefined)),
    ),
  );
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    // Leaflet's map tiles are third-party images; the map is optional and off by default.
    .exclude(".leaflet-container")
    .analyze();
  const problems = results.violations.map(
    (v) =>
      `${v.id} (${v.impact}): ${v.help} — ${v.nodes.map((n) => `${n.target.join(" ")} [${n.any[0]?.message ?? ""}] ${n.html.slice(0, 160)}`).join(", ")}`,
  );
  expect(problems, problems.join("\n")).toEqual([]);
}

/** One row of the result card ("Batch safety", "Fair price", ...) by its heading. */
export function checkRow(page: Page, title: string) {
  return page
    .getByRole("listitem")
    .filter({ has: page.getByRole("heading", { level: 3, name: title, exact: true }) });
}

/**
 * Open a page and wait until React has hydrated it, i.e. attached its event handlers to the
 * controls. Typing or clicking earlier goes to the bare HTML: React never sees the text, so a
 * "Search" button stays disabled (seen in CI once the shared header added more JavaScript).
 * The page's own controls are checked when it has any (they may hydrate after the header).
 */
export async function openPage(page: Page, path: string) {
  await page.goto(path);
  await page.waitForFunction(() => {
    const control =
      document.querySelector("#main input, #main button") ??
      document.querySelector("header button");
    return !!control && Object.keys(control).some((key) => key.startsWith("__reactProps"));
  });
}
