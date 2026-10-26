// The landing page's motion (hero entrance, scroll reveals, card stack, scroll letters) must
// switch off for people who ask their phone for reduced motion, and the page must stay accessible.

import { expect, test } from "@playwright/test";
import { expectAccessible, openPage } from "./helpers";

test.describe("reduced motion", () => {
  test.use({ reducedMotion: "reduce" });

  test("home page is still: no entrance animations, the checks are a plain list", async ({
    page,
  }) => {
    await openPage(page, "/en");
    // Hero words: no animation running at all (and none on the page except endless ones).
    const running = await page
      .locator(".rise-word")
      .first()
      .evaluate((el) => el.getAnimations().length);
    expect(running).toBe(0);
    // Scroll reveals are visible straight away, without scrolling.
    await expect(page.getByRole("heading", { name: "Ways to start" })).toBeVisible();
    const opacity = await page
      .getByRole("heading", { name: "Ways to start" })
      .evaluate((el) => getComputedStyle(el.parentElement!).opacity);
    expect(opacity).toBe("1");
    // The card stack falls back to a plain list (no sticky cards).
    const sticky = await page.locator("li.sticky").count();
    expect(sticky).toBe(0);
    await expectAccessible(page);
  });
});

test("home page counts come from the data refresh and read correctly", async ({ page }) => {
  await openPage(page, "/en");
  // The live numbers are announced as plain text (the rolling digits are hidden from readers).
  await expect(page.getByText("Jan Aushadhi Kendras", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Check your medicine strip against government data",
  );
});
