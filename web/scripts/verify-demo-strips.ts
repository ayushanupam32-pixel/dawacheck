// Checks every strip in demo/strips.json through the real website, the way a person would use
// it: choose the front, back and stamp photos from the gallery, wait for the reading, then
// "Find a cheaper generic", and read the result card. Writes demo/VERIFIED.md.
// Run (from web/): pnpm exec tsx scripts/verify-demo-strips.ts [base URL]

import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { chromium, devices, type Page } from "@playwright/test";

const BASE = process.argv[2] ?? "https://dawacheck-psi.vercel.app";
const DEMO = resolve(__dirname, "..", "..", "demo");

type Strip = {
  folder: string;
  front: string;
  expect: { match: string; generic: string; batch: string; price: string; banned: string };
};
type Outcome = {
  folder: string;
  seconds: number;
  nameRead: string;
  typedName: boolean;
  tickedBatch: boolean;
  matched: string;
  rows: Record<string, string>;
  price: string;
  problems: string[];
};

const ROWS = ["Cheaper generic", "Batch safety", "Fair price", "Banned combination"] as const;
const STATUS = [
  "Available",
  "Nothing found",
  "Alert",
  "Show your pharmacist",
  "Not available",
  "Couldn't check",
];

async function choose(page: Page, file: string) {
  await page.locator('input[type="file"]:not([capture])').setInputFiles(file);
  await page.getByRole("button", { name: "Next", exact: true }).click();
}

async function check(page: Page, s: Strip): Promise<Outcome> {
  const dir = join(DEMO, s.folder);
  const out: Outcome = {
    folder: s.folder,
    seconds: 0,
    nameRead: "",
    typedName: false,
    tickedBatch: false,
    matched: "",
    rows: {},
    price: "",
    problems: [],
  };
  await page.goto(`${BASE}/en/scan`);
  await choose(page, join(dir, "front.jpg"));
  await choose(page, join(dir, "back.jpg"));
  await choose(page, join(dir, "stamp.jpg"));
  await page.getByRole("heading", { name: "Check what we read" }).waitFor({ timeout: 120_000 });
  const how = (await page.getByText(/Read in [\d.]+ seconds/).textContent()) ?? "";
  out.seconds = Number(/([\d.]+)/.exec(how)?.[1] ?? 0);

  const name = page.getByLabel("Medicine name");
  out.nameRead = await name.inputValue();
  // As in the live demo: if the reader couldn't read the name, the presenter types it.
  if (!out.nameRead.trim()) {
    await name.fill(s.front);
    out.typedName = true;
  }
  const tick = page.getByLabel("It matches my strip");
  if (await tick.isVisible()) {
    await tick.check();
    out.tickedBatch = true;
  }
  await page.getByRole("button", { name: "Find a cheaper generic" }).click();

  const matched = page.getByText("This looks like:");
  const abstained = page.getByText(
    /Couldn't find this name|Couldn't match confidently|more than one strength/,
  );
  await matched.or(abstained).first().waitFor({ timeout: 60_000 });
  if (await abstained.first().isVisible()) {
    out.problems.push(`abstained: ${(await abstained.first().textContent())?.slice(0, 60)}`);
    return out;
  }
  out.matched = (await matched.locator("xpath=following-sibling::p[1]").textContent()) ?? "";
  await page.getByRole("heading", { name: "Checks for this strip" }).waitFor({ timeout: 60_000 });
  await page
    .getByText(/Fair price/)
    .first()
    .waitFor();
  for (const row of ROWS) {
    const li = page
      .getByRole("listitem")
      .filter({ has: page.getByRole("heading", { level: 3, name: row, exact: true }) });
    await li.waitFor();
    const text = (await li.textContent()) ?? "";
    out.rows[row] = STATUS.find((st) => text.includes(st)) ?? "?";
    if (row === "Fair price") {
      out.price = text.includes("is within")
        ? "within"
        : text.includes("is above")
          ? "above"
          : text.includes("does not fix a ceiling")
            ? "no ceiling"
            : text.slice(10, 70);
    }
  }

  const e = s.expect;
  if (out.matched !== e.match) out.problems.push(`matched "${out.matched}", expected "${e.match}"`);
  if (out.rows["Cheaper generic"] !== e.generic)
    out.problems.push(`generic: ${out.rows["Cheaper generic"]}`);
  if (out.rows["Batch safety"] !== e.batch) out.problems.push(`batch: ${out.rows["Batch safety"]}`);
  if (out.rows["Banned combination"] !== e.banned)
    out.problems.push(`banned: ${out.rows["Banned combination"]}`);
  if (e.price !== "any" && out.price !== e.price) out.problems.push(`price: ${out.price}`);
  return out;
}

async function main() {
  const spec = JSON.parse(readFileSync(join(DEMO, "strips.json"), "utf8")) as { strips: Strip[] };
  const only = process.argv[3];
  const strips = spec.strips.filter((s) => !only || s.folder.includes(only));
  const browser = await chromium.launch({ channel: "chrome" });
  const page = await browser.newPage({ ...devices["Pixel 7"] });
  const results: Outcome[] = [];
  for (const s of strips) {
    let r: Outcome;
    try {
      r = await check(page, s);
    } catch (error) {
      r = {
        folder: s.folder,
        seconds: 0,
        nameRead: "",
        typedName: false,
        tickedBatch: false,
        matched: "",
        rows: {},
        price: "",
        problems: [String(error).slice(0, 120)],
      };
    }
    results.push(r);
    console.log(
      `${r.problems.length ? "FAIL" : "ok  "} ${s.folder}: ${r.matched || "-"} | read "${r.nameRead}"${r.typedName ? " (typed)" : ""}${r.tickedBatch ? " (ticked)" : ""} | ${JSON.stringify(r.rows)} ${r.price} ${r.problems.join("; ")}`,
    );
  }
  await browser.close();
  if (only) return;

  const md = [
    "# Demo strips: verified on the website",
    "",
    `Checked ${new Date().toISOString().slice(0, 10)} on ${BASE} by \`web/scripts/verify-demo-strips.ts\`:`,
    'front, back and stamp chosen from the gallery, then "Find a cheaper generic", like a user.',
    "",
    "| Strip | Name read | Matched to | Generic | Batch | Fair price | Banned | Read in | OK |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- |",
    ...results.map(
      (r) =>
        `| ${r.folder} | ${r.typedName ? "— (type it)" : r.nameRead}${r.tickedBatch ? " · tick batch" : ""} | ${r.matched || "—"} | ${r.rows["Cheaper generic"] ?? "—"} | ${r.rows["Batch safety"] ?? "—"} | ${r.price || "—"} | ${r.rows["Banned combination"] ?? "—"} | ${r.seconds} s | ${r.problems.length ? `**no**: ${r.problems.join("; ")}` : "yes"} |`,
    ),
    "",
  ].join("\n");
  writeFileSync(join(DEMO, "VERIFIED.md"), md);
  console.log(
    `\n${results.filter((r) => !r.problems.length).length}/${results.length} ok; wrote demo/VERIFIED.md`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
