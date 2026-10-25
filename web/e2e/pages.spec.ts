// Accessibility of every page as it first loads, in all three languages (Lighthouse's
// accessibility audit uses the same axe rules; the brief asks for a score of at least 90).

import { test } from "@playwright/test";
import { expectAccessible } from "./helpers";

for (const locale of ["en", "hi", "ta"]) {
  for (const path of ["", "/scan", "/search", "/kendras", "/about"]) {
    test(`/${locale}${path} is accessible`, async ({ page }) => {
      await page.goto(`/${locale}${path}`);
      await expectAccessible(page);
    });
  }
}
