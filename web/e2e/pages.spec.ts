// Accessibility of every page as it first loads, in all three languages and in both themes
// (Lighthouse's accessibility audit uses the same axe rules; the brief asks for a score of at
// least 90). Dark mode comes from the phone's setting, as for a first-time visitor.

import { test } from "@playwright/test";
import { expectAccessible } from "./helpers";

const paths = ["", "/scan", "/search", "/kendras", "/about"];

for (const locale of ["en", "hi", "ta"]) {
  for (const path of paths) {
    test(`/${locale}${path} is accessible`, async ({ page }) => {
      await page.goto(`/${locale}${path}`);
      await expectAccessible(page);
    });
  }
}

test.describe("dark theme", () => {
  test.use({ colorScheme: "dark" });
  for (const path of paths) {
    test(`/en${path} is accessible in dark mode`, async ({ page }) => {
      await page.goto(`/en${path}`);
      await expectAccessible(page);
    });
  }
});
