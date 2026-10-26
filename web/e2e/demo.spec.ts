// The brief's end-to-end test: sample photos -> confirm screen -> result card, through the real
// app (in-browser OCR, /api/match, /api/checks, the database). Uses Demo mode's two strips
// (public/demo, made by eval/make_demo_images.py from real records).

import { expect, test } from "@playwright/test";
import { checkRow, expectAccessible, openPage } from "./helpers";

const ROWS = [
  "Cheaper generic",
  "Batch safety",
  "Fair price",
  "Banned combination",
  "Nearest Jan Aushadhi Kendra",
];

test("blood-pressure demo: read, match, all checks, accessible at every step", async ({ page }) => {
  await openPage(page, "/en/scan");
  await expectAccessible(page);

  await page.getByRole("button", { name: "Demo: blood-pressure strip" }).click();
  await expect(page.getByRole("heading", { name: "Check what we read" })).toBeVisible();
  // The fields read from the demo photos.
  await expect(page.getByLabel("Medicine name")).toHaveValue("TELMIKIND 40");
  await expect(page.getByLabel("Ingredients")).toHaveValue("Telmisartan 40 mg");
  await expect(page.getByLabel("MRP (₹)")).toHaveValue("38.59");
  await expect(page.getByLabel("Batch number")).toHaveValue("DM2506");
  await expect(page.getByLabel("Expiry")).toHaveValue("05/2027");
  await expectAccessible(page);

  await page.getByRole("button", { name: "Find a cheaper generic" }).click();
  await expect(page.getByText("Telmikind 40 Tablet").first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "Checks for this strip" })).toBeVisible();
  for (const row of ROWS) await expect(checkRow(page, row)).toBeVisible();
  await expect(checkRow(page, "Cheaper generic")).toContainText("Available");
  await expect(checkRow(page, "Batch safety")).toContainText("Nothing found");
  await expect(checkRow(page, "Fair price")).toContainText("within the government ceiling");
  await expect(checkRow(page, "Banned combination")).toContainText("Nothing found");
  // Every result shows the disclaimer.
  await expect(page.getByText("It is not medical advice").first()).toBeVisible();
  await expectAccessible(page);
});

test("quality-alert demo: the batch from a real CDSCO alert shows a red alert", async ({
  page,
}) => {
  await openPage(page, "/en/scan");
  await page.getByRole("button", { name: "Demo: strip with a quality alert" }).click();
  await expect(page.getByRole("heading", { name: "Check what we read" })).toBeVisible();
  await expect(page.getByLabel("Batch number")).toHaveValue("25281124");

  // The OCR can't read the short brand name in a browser: the user types it (and the app never
  // guesses a name it couldn't read). The batch was read with a "1" in it, so it is marked
  // "Please check": the user confirms it matches the strip.
  await page.getByLabel("Medicine name").fill("Omee");
  await page.getByLabel("It matches my strip").check();
  await page.getByRole("button", { name: "Find a cheaper generic" }).click();

  await expect(page.getByText("Omee Capsule").first()).toBeVisible();
  const batch = checkRow(page, "Batch safety");
  await expect(batch).toContainText("Alert");
  await expect(batch).toContainText("25281124");
  await expect(batch).toContainText("Show this to your pharmacist");
  await expectAccessible(page);
});
