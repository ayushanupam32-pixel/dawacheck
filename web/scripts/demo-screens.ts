// Takes the screenshots for the README's demo GIF: the live site on a phone-sized screen, through
// both demo strips, the Kendra finder and the About page. eval/make_demo_gif.py then turns them
// into docs/demo.gif.
// Run (from web/): pnpm exec tsx scripts/demo-screens.ts [base URL] [output folder]

import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { chromium, devices, type Page } from "@playwright/test";

const BASE = process.argv[2] ?? "https://medicheck-in.vercel.app";
const OUT = process.argv[3] ?? "demo-screens";

async function main() {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ channel: "chrome" });
  const page = await browser.newPage({ ...devices["Pixel 7"] });
  let n = 0;
  const shot = async (name: string) => {
    // Let entrance animations finish (the hero's words and live check take about 2 s); endless
    // ones (the drifting lights) are skipped, or this would never return.
    await page.waitForTimeout(300);
    await page.evaluate(() =>
      Promise.all(
        document
          .getAnimations()
          .filter((a) => a.effect?.getComputedTiming().iterations !== Infinity)
          .map((a) => a.finished.catch(() => undefined)),
      ),
    );
    await page.waitForTimeout(200);
    await page.screenshot({ path: join(OUT, `${String(++n).padStart(2, "0")}-${name}.png`) });
  };
  const show = async (p: Page, text: string | RegExp) => {
    await p.getByText(text).first().scrollIntoViewIfNeeded();
  };

  await page.goto(`${BASE}/en`);
  await shot("home");

  // Demo 1: a blood-pressure medicine -> match, generic, checks.
  await page.goto(`${BASE}/en/scan`);
  await page.getByRole("button", { name: "Demo: blood-pressure strip" }).scrollIntoViewIfNeeded();
  await shot("scan");
  await page.getByRole("button", { name: "Demo: blood-pressure strip" }).click();
  await page.waitForTimeout(300);
  await shot("reading");
  await page.getByRole("heading", { name: "Check what we read" }).waitFor({ timeout: 90_000 });
  await shot("confirm");
  await page.getByRole("button", { name: "Find a cheaper generic" }).click();
  await page.getByRole("heading", { name: "Checks for this strip" }).waitFor({ timeout: 60_000 });
  await show(page, "This looks like:");
  await shot("match");
  await show(page, "Checks for this strip");
  await shot("checks");
  await show(page, /Save ₹[\d.]+ on a pack like yours/);
  await shot("savings");

  // Demo 2: a batch named in a real CDSCO alert -> red alert.
  await page.goto(`${BASE}/en/scan`);
  await page.getByRole("button", { name: "Demo: strip with a quality alert" }).click();
  await page.getByRole("heading", { name: "Check what we read" }).waitFor({ timeout: 90_000 });
  await page.getByLabel("Medicine name").fill("Omee");
  const box = page.getByLabel("It matches my strip");
  if (await box.isVisible()) await box.check();
  await page.getByRole("button", { name: "Find a cheaper generic" }).click();
  await page.getByRole("heading", { name: "Checks for this strip" }).waitFor({ timeout: 60_000 });
  await show(page, "Batch safety");
  await shot("alert");

  // Nearest Kendra, computed on the phone.
  await page.goto(`${BASE}/en/kendras`);
  await page.getByLabel("Enter your PIN code").fill("110001");
  await page.getByRole("button", { name: "Find", exact: true }).click();
  await page
    .getByText(/km away/)
    .first()
    .waitFor();
  await shot("kendras");

  // About page: the results.
  await page.goto(`${BASE}/en/about`);
  await show(page, "Finding the right medicine");
  await shot("results");

  await browser.close();
  console.log(`${n} screenshots in ${OUT}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
