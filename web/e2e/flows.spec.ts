// The other two ways in: typing a brand name, and finding the nearest Kendra by PIN code.
// Each step is also checked for accessibility, since these screens appear only after input.

import { expect, test } from "@playwright/test";
import { expectAccessible } from "./helpers";

test("typed search: Telma 40 -> pick the pack -> Jan Aushadhi generic with savings", async ({
  page,
}) => {
  await page.goto("/en/search");
  await page.getByLabel("Medicine name on your strip").fill("Telma 40");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page.getByText("Which one is yours?")).toBeVisible();
  await expectAccessible(page);

  await page
    .getByRole("button", { name: /Telma 40 Tablet/ })
    .first()
    .click();
  await expect(page.getByText("Telmisartan Tablets IP 40mg")).toBeVisible();
  await expect(page.getByText(/Save ₹[\d.]+ on a pack like yours/)).toBeVisible();
  await expectAccessible(page);
});

test("nearest Kendra by PIN code: 3 Kendras with distances", async ({ page }) => {
  await page.goto("/en/kendras");
  await page.getByLabel("Enter your PIN code").fill("110001");
  await page.getByRole("button", { name: "Find", exact: true }).click();
  await expect(page.getByText(/km away/)).toHaveCount(3);
  await expect(page.getByText("Using the approximate centre of your PIN code area.")).toBeVisible();
  await expectAccessible(page);
});
