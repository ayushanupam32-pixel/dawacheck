// pnpm eval: run the strip reader on every labelled photo and write eval/results.md.
//
// Uses the same preprocessing, reading strategy and extractor as the app (lib/ai/*), so the
// numbers describe what users get. Compares two set-ups, as the project spec asks:
//   full      = preprocessing (straighten, contrast, black-and-white, inverted) + progressive reads
//   baseline  = raw Tesseract: the original photo file, untouched
//
// Usage (from the repo root):
//   pnpm eval              dev + demo photos (use while improving the reader)
//   pnpm eval --final      the frozen test photos only (once, for the final report)

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import jpeg from "jpeg-js";
import { PNG } from "pngjs";
import { createScheduler, createWorker } from "tesseract.js";
import {
  applyOrientation,
  jpegOrientation,
  resizeRgba,
  rotateRgba,
  type Rgba,
} from "../lib/ai/image";
import { estimateSkew, makeVariants, targetSize, type Variant } from "../lib/ai/preprocess";
import { brandGuesses } from "../lib/ai/merge";
import { pageToReading, readProgressively } from "../lib/ai/reader";
import { buildMatchInput, nameIdentity, type Decision } from "../lib/ai/rerank";
import { matchGuesses } from "../lib/find-match";
import type { BrandCandidate } from "../lib/match";
import { createClient } from "@supabase/supabase-js";
import {
  addScores,
  emptyScores,
  readValue,
  SCORED_FIELDS,
  type FieldScore,
  type Label,
  type ScoredField,
} from "../lib/ai/score";

const EVAL_DIR = resolve(__dirname, "..", "..", "eval");
const final = process.argv.includes("--final");

// Matching (M4) needs the read-only database key from web/.env.local; without it the reading
// is still evaluated and the matching section is skipped.
const envFile = resolve(__dirname, "..", ".env.local");
if (existsSync(envFile)) process.loadEnvFile(envFile);
const db =
  process.env.SUPABASE_URL && process.env.SUPABASE_PUBLISHABLE_KEY
    ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_PUBLISHABLE_KEY, {
        auth: { persistSession: false },
      })
    : null;

function decode(path: string): Rgba {
  const bytes = readFileSync(path);
  if (bytes[0] === 0x89) {
    const png = PNG.sync.read(bytes);
    return { data: new Uint8ClampedArray(png.data), width: png.width, height: png.height };
  }
  const img = jpeg.decode(bytes, { useTArray: true, maxMemoryUsageInMB: 1024 });
  const rgba = { data: new Uint8ClampedArray(img.data), width: img.width, height: img.height };
  return applyOrientation(rgba, jpegOrientation(bytes));
}

/** Same steps as preparePhoto() in lib/ai/prepare.ts, without a canvas. */
function prepareFull(photo: Rgba): Variant[] {
  const { width, height } = targetSize(photo.width, photo.height);
  let rgba = resizeRgba(photo, width, height);
  let variants = makeVariants(rgba.data, width, height);
  const skew = estimateSkew(variants[1].gray, width, height);
  if (Math.abs(skew) >= 1) {
    rgba = rotateRgba(rgba, -skew);
    variants = makeVariants(rgba.data, width, height);
  }
  return variants;
}

/**
 * Baseline: the ORIGINAL photo file straight into Tesseract, untouched (no resize, no
 * grayscale), which is what "raw Tesseract" means. Tesseract still applies its own built-in
 * global black-and-white step, so this is the fair thing to compare against.
 */
const RAW: Variant[] = [{ name: "enhanced", gray: new Uint8ClampedArray(0), width: 0, height: 0 }];

function toPng(gray: Uint8ClampedArray, width: number, height: number): Buffer {
  const png = new PNG({ width, height, colorType: 0, inputColorType: 0, inputHasAlpha: false });
  png.data = Buffer.from(gray);
  return PNG.sync.write(png, { colorType: 0, inputColorType: 0, inputHasAlpha: false });
}

type Row = {
  label: Label;
  full: Record<ScoredField, FieldScore>;
  base: Record<ScoredField, FieldScore>;
  ms: number;
  /** What DawaCheck read, per field, for error analysis. */
  read: Record<ScoredField, string>;
  /** OCR confidence of each reading, to spot photos the OCR could hardly read at all. */
  ocr: string[];
  /** Photo -> medicine with no corrections by the user (M4), if the label says what to expect. */
  match?: { got: string; outcome: "right" | "wrong" | "abstained"; guesses?: string[] };
  /** The same, matching only the one name the reader picked (no other brand guesses). */
  matchSingle?: Row["match"];
};

async function main() {
  const labelsPath = join(EVAL_DIR, "labels.json");
  const all = JSON.parse(readFileSync(labelsPath, "utf8")) as Label[];
  const labels = all.filter((l) => (final ? l.split === "test" : l.split !== "test"));
  if (!labels.length) throw new Error(`No ${final ? "test" : "dev/demo"} labels in ${labelsPath}`);

  // Two Tesseract workers, like the app on a phone with 4+ cores (lib/ai/ocr.ts), so the timing
  // below describes the app. The baseline reads one photo at a time anyway.
  const worker = createScheduler();
  for (let i = 0; i < 2; i++) {
    worker.addWorker(await createWorker("eng", 1, { cachePath: join(EVAL_DIR, ".cache") }));
  }
  const recognize = async (variant: Variant) => {
    const { data } = await worker.addJob(
      "recognize",
      toPng(variant.gray, variant.width, variant.height),
      {},
      { text: true, blocks: true },
    );
    return pageToReading(variant.name, data);
  };

  const rows: Row[] = [];
  for (const label of labels) {
    const photoPath = (name: string) => resolve(EVAL_DIR, "photos", name);
    if (!existsSync(photoPath(label.front))) {
      console.warn(`skip ${label.id}: ${label.front} not found in eval/photos`);
      continue;
    }
    // Back photos: the back of the strip and, if taken, the close-up of the stamp.
    const backFiles = [label.back, label.stamp].filter((f): f is string => Boolean(f));

    const started = performance.now();
    const full = await readProgressively(
      { variants: prepareFull(decode(photoPath(label.front))), recognize },
      backFiles.map((f) => ({ variants: prepareFull(decode(photoPath(f))), recognize })),
    );
    const ms = performance.now() - started;
    const recognizeRaw = (path: string) => async () => {
      const { data } = await worker.addJob(
        "recognize",
        readFileSync(path),
        {},
        {
          text: true,
          blocks: true,
        },
      );
      return pageToReading("raw", data);
    };
    const base = await readProgressively(
      { variants: RAW, recognize: recognizeRaw(photoPath(label.front)) },
      backFiles.map((f) => ({ variants: RAW, recognize: recognizeRaw(photoPath(f)) })),
      { preprocess: false },
    );

    const read = Object.fromEntries(
      SCORED_FIELDS.map((k) => [k, readValue(full.fields, k)]),
    ) as Record<ScoredField, string>;
    const ocr = [...full.front, ...full.back].map(
      (r) => `${r.variant}:${Math.round(r.confidence)}`,
    );
    const row: Row = { label, full: emptyScores(), base: emptyScores(), ms, read, ocr };
    if (db && label.matchBrand !== undefined) {
      // Exactly what the app sends when the user taps "Find" without correcting anything: the
      // name as read plus the other brand guesses (components/scan-client.tsx). Ablation: the
      // same without the guesses (only the one name the reader picked, as before M7).
      const input = buildMatchInput({
        brand: full.fields.brand?.value ?? "",
        ingredients: full.fields.ingredients?.value ?? [],
        form: full.fields.form?.value ?? null,
        manufacturer: full.fields.manufacturer?.value ?? null,
        ocrText: [...full.front, ...full.back].map((r) => r.text).join("\n"),
      });
      const outcome = (d: Decision<BrandCandidate>): Row["match"] =>
        d.status === "match"
          ? {
              got: d.best.candidate.name,
              outcome:
                label.matchBrand &&
                nameIdentity(d.best.candidate.name) === nameIdentity(label.matchBrand)
                  ? "right"
                  : "wrong",
            }
          : { got: `abstain (${d.reason})`, outcome: "abstained" };
      const guesses = brandGuesses(full.front);
      row.match = { ...outcome(await matchGuesses(db, input, guesses))!, guesses };
      row.matchSingle = outcome(await matchGuesses(db, input));
    }
    addScores(row.full, full.fields, label);
    addScores(row.base, base.fields, label);
    rows.push(row);
    console.log(`${label.id}: ${Math.round(ms)} ms`);
  }
  await worker.terminate();

  writeReport(rows);
}

/** Photo -> medicine, fully automatic: the reader's output straight into the matcher. */
function matchSection(rows: Row[]): string[] {
  const matched = rows.filter((r) => r.match);
  if (!matched.length)
    return ["", "## Photo → medicine", "", "Skipped: no database key or no `matchBrand` labels."];
  const count = (pick: (r: Row) => Row["match"], outcome: string, inDataset?: boolean) =>
    matched.filter(
      (r) =>
        pick(r)!.outcome === outcome &&
        (inDataset === undefined || Boolean(r.label.matchBrand) === inDataset),
    ).length;
  const summary = (pick: (r: Row) => Row["match"]) =>
    `Right: ${count(pick, "right")} · Wrong: ${count(pick, "wrong")} · Abstained: ${count(pick, "abstained", true)} in dataset, ${count(pick, "abstained", false)} not in dataset`;
  const inDataset = matched.filter((r) => r.label.matchBrand).length;
  return [
    ``,
    `## Photo → medicine, fully automatic (no corrections on the confirm screen)`,
    ``,
    `The reader's fields go straight into the matcher, as if the user tapped "Find" without`,
    `fixing anything. ${inDataset} of ${matched.length} strips are in the brand dataset; for the`,
    `others, abstaining is the right answer. In the app the user can fix the name first, which`,
    `\`pnpm eval:match\` measures.`,
    ``,
    `- With brand guesses (the tallest plausible lines on the front, confirmed by matching):`,
    `  ${summary((r) => r.match)}`,
    `- Ablation, only the one name the reader picked: ${summary((r) => r.matchSingle)}`,
    ``,
    `| Photo | Expected | DawaCheck | | Without guesses | Guesses tried |`,
    `| --- | --- | --- | --- | --- | --- |`,
    ...matched.map(
      (r) =>
        `| ${r.label.id} | ${r.label.matchBrand ?? "(abstain: not in dataset)"} | ${r.match!.got} | ${r.match!.outcome === "wrong" ? "**wrong**" : r.match!.outcome} | ${r.matchSingle!.outcome === "wrong" ? "**wrong**" : r.matchSingle!.outcome} | ${(r.match!.guesses ?? []).join(" / ").replace(/\|/g, "\\|")} |`,
    ),
  ];
}

function sum(
  rows: Row[],
  pick: (r: Row) => Record<ScoredField, FieldScore>,
  key: ScoredField,
): FieldScore {
  return rows.reduce(
    (acc, r) => {
      const s = pick(r)[key];
      return {
        correct: acc.correct + s.correct,
        wrong: acc.wrong + s.wrong,
        total: acc.total + s.total,
        cerSum: acc.cerSum + s.cerSum,
      };
    },
    { correct: 0, wrong: 0, total: 0, cerSum: 0 },
  );
}

const pct = (s: FieldScore) =>
  s.total ? `${Math.round((100 * s.correct) / s.total)}% (${s.correct}/${s.total})` : "–";
const wrongText = (s: FieldScore) =>
  s.total ? `${Math.round((100 * s.wrong) / s.total)}% (${s.wrong}/${s.total})` : "–";
const cerText = (s: FieldScore) => (s.total ? (s.cerSum / s.total).toFixed(2) : "–");

function writeReport(rows: Row[]) {
  const splits = [...new Set(rows.map((r) => r.label.split))].join(", ");
  const times = rows.map((r) => r.ms).sort((a, b) => a - b);
  const p = (q: number) =>
    times.length ? Math.round(times[Math.min(times.length - 1, Math.floor(q * times.length))]) : 0;

  const lines = [
    `# DawaCheck evaluation results`,
    ``,
    `Generated ${new Date().toISOString().slice(0, 10)} by \`pnpm eval${final ? " --final" : ""}\`.`,
    `Strips: ${rows.length} (${splits}). Photos with a back side: ${rows.filter((r) => r.label.back).length}.`,
    ``,
    `## Field reading: exact-match accuracy and character error rate (CER)`,
    ``,
    `| Field | DawaCheck correct | DawaCheck wrong | Baseline correct | Baseline wrong | CER DawaCheck | CER baseline |`,
    `| --- | --- | --- | --- | --- | --- | --- |`,
    ...SCORED_FIELDS.map((k) => {
      const f = sum(rows, (r) => r.full, k);
      const b = sum(rows, (r) => r.base, k);
      return `| ${k} | ${pct(f)} | ${wrongText(f)} | ${pct(b)} | ${wrongText(b)} | ${cerText(f)} | ${cerText(b)} |`;
    }),
    ``,
    `"Wrong" = a value was shown and it was incorrect. The rest of each row (not correct, not`,
    `wrong) was left empty: the user is asked to type it. A wrong value is worse than an empty one.`,
    ``,
    `## Batch number: foil vs matte packs`,
    ``,
    `| Pack | DawaCheck | Baseline |`,
    `| --- | --- | --- |`,
    ...([true, false] as const).map((foil) => {
      const subset = rows.filter((r) => r.label.foil === foil);
      return `| ${foil ? "Foil" : "Matte"} | ${pct(sum(subset, (r) => r.full, "batchNo"))} | ${pct(sum(subset, (r) => r.base, "batchNo"))} |`;
    }),
    ``,
    `## Speed (this computer, not a phone)`,
    ``,
    `Median ${p(0.5)} ms, p95 ${p(0.95)} ms per strip (front + back). Phone timing is measured`,
    `separately in the app ("How we read this" shows the time).`,
    ``,
    `CER = edits needed / length of the true value (0 = perfect). Exact match ignores case,`,
    `spaces and punctuation. A field left empty in the label is not scored.`,
    ...matchSection(rows),
  ];
  const out = join(EVAL_DIR, final ? "results-final.md" : "results.md");
  writeFileSync(out, lines.join("\n") + "\n");
  writeFileSync(
    out.replace(/\.md$/, ".json"),
    JSON.stringify(
      rows.map((r) => ({
        id: r.label.id,
        split: r.label.split,
        ms: Math.round(r.ms),
        ocr: r.ocr,
        read: r.read,
        match: r.match,
        matchSingle: r.matchSingle,
        full: r.full,
        base: r.base,
      })),
      null,
      1,
    ),
  );
  console.log(`\nWrote ${out}`);
  console.log(lines.slice(6, 20).join("\n"));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
