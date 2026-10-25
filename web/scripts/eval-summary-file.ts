// Writes one section of web/lib/eval-summary.json (the About page's results), keeping the
// sections written by the other evaluation script. See lib/eval-summary.ts.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { EvalSummary } from "../lib/eval-summary";

const FILE = resolve(__dirname, "..", "lib", "eval-summary.json");

export function writeSummary<K extends keyof EvalSummary>(key: K, value: EvalSummary[K]): void {
  const current: EvalSummary = existsSync(FILE) ? JSON.parse(readFileSync(FILE, "utf8")) : {};
  writeFileSync(FILE, `${JSON.stringify({ ...current, [key]: value }, null, 2)}\n`);
}
