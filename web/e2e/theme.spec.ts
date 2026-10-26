// The theme menu (light / dark / same as phone) and the mobile menu sheet.

import { expect, test } from "@playwright/test";
import { checkRow, expectAccessible, openPage } from "./helpers";

test("theme: follows the phone, can be set to dark, and stays dark after a reload", async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: "light" });
  await openPage(page, "/en");
  const html = page.locator("html");
  await expect(html).not.toHaveClass(/dark/);

  // The menu lives in the mobile sheet on a phone-sized screen.
  await page.getByRole("button", { name: "Menu", exact: true }).click();
  const sheet = page.getByRole("dialog", { name: "Menu" });
  await expect(sheet).toBeVisible();
  await expectAccessible(page);
  await sheet.getByText("Dark", { exact: true }).click();
  await expect(html).toHaveClass(/dark/);
  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();

  // Saved on the phone and applied before the first paint: dark straight after a reload.
  await openPage(page, "/en"); // a fresh load, like a reload
  await expect(html).toHaveClass(/dark/);
  await expect(page.getByRole("button", { name: "Theme: Dark" })).toBeVisible();

  // Back to "Same as phone": the light setting of the (emulated) phone wins again.
  await page.getByRole("button", { name: "Theme: Dark" }).click();
  await page.getByRole("menuitemradio", { name: "Same as phone" }).click();
  await expect(html).not.toHaveClass(/dark/);
});

test("language switch keeps you on the same page", async ({ page }) => {
  await openPage(page, "/en/kendras");
  await page.getByRole("button", { name: "Menu", exact: true }).click();
  await page.getByRole("dialog", { name: "Menu" }).getByRole("link", { name: "हिन्दी" }).click();
  await expect(page).toHaveURL(/\/hi\/kendras$/);
});

test.describe("dark theme, interactive screens", () => {
  test.use({ colorScheme: "dark" });

  test("result card with a red batch alert is accessible in dark mode", async ({ page }) => {
    await openPage(page, "/en/search");
    await page.getByLabel("Medicine name on your strip").fill("Taxim-O 200");
    await page.getByRole("button", { name: "Search", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Which one is yours?" })).toBeVisible();
    await expectAccessible(page);
    await page
      .getByRole("button", { name: /Taxim-O 200 Tablet/ })
      .first()
      .click();
    await page.getByLabel("Batch number").fill("25460922");
    await expect(checkRow(page, "Batch safety")).toContainText("Alert");
    await expectAccessible(page);
  });

  test("Kendra results are accessible in dark mode", async ({ page }) => {
    await openPage(page, "/en/kendras");
    await page.getByLabel("Enter your PIN code").fill("600003");
    await page.getByRole("button", { name: "Find", exact: true }).click();
    await expect(page.getByText(/km away/)).toHaveCount(3);
    await expectAccessible(page);
  });
});
