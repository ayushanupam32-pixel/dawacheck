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
import { createWorker } from "tesseract.js";
import {
  applyOrientation,
  jpegOrientation,
  resizeRgba,
  rotateRgba,
  type Rgba,
} from "../lib/ai/image";
import { estimateSkew, makeVariants, targetSize, type Variant } from "../lib/ai/preprocess";
import { pageToReading, readProgressively } from "../lib/ai/reader";
import {
  addScores,
  emptyScores,
  SCORED_FIELDS,
  type FieldScore,
  type Label,
  type ScoredField,
} from "../lib/ai/score";

const EVAL_DIR = resolve(__dirname, "..", "..", "eval");
const final = process.argv.includes("--final");

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

/** Same steps as prepare() in lib/ai/ocr.ts, without a canvas. */
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
const RAW: Variant[] = [{ name: "enhanced", gray: new Uint8ClampedArray(0) }];

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
};

async function main() {
  const labelsPath = join(EVAL_DIR, "labels.json");
  const all = JSON.parse(readFileSync(labelsPath, "utf8")) as Label[];
  const labels = all.filter((l) => (final ? l.split === "test" : l.split !== "test"));
  if (!labels.length) throw new Error(`No ${final ? "test" : "dev/demo"} labels in ${labelsPath}`);

  const worker = await createWorker("eng", 1, { cachePath: join(EVAL_DIR, ".cache") });
  const recognizeWith = (photo: Rgba) => async (variant: Variant) => {
    const { width, height } = targetSize(photo.width, photo.height);
    const { data } = await worker.recognize(
      toPng(variant.gray, width, height),
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
    const front = decode(photoPath(label.front));
    const back = label.back ? decode(photoPath(label.back)) : null;

    const started = performance.now();
    const full = await readProgressively(
      { variants: prepareFull(front), recognize: recognizeWith(front) },
      back ? { variants: prepareFull(back), recognize: recognizeWith(back) } : null,
    );
    const ms = performance.now() - started;
    const recognizeRaw = (path: string) => async () => {
      const { data } = await worker.recognize(readFileSync(path), {}, { text: true, blocks: true });
      return pageToReading("raw", data);
    };
    const base = await readProgressively(
      { variants: RAW, recognize: recognizeRaw(photoPath(label.front)) },
      label.back ? { variants: RAW, recognize: recognizeRaw(photoPath(label.back)) } : null,
      { preprocess: false },
    );

    const row: Row = { label, full: emptyScores(), base: emptyScores(), ms };
    addScores(row.full, full.fields, label);
    addScores(row.base, base.fields, label);
    rows.push(row);
    console.log(`${label.id}: ${Math.round(ms)} ms`);
  }
  await worker.terminate();

  writeReport(rows);
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
        total: acc.total + s.total,
        cerSum: acc.cerSum + s.cerSum,
      };
    },
    { correct: 0, total: 0, cerSum: 0 },
  );
}

const pct = (s: FieldScore) =>
  s.total ? `${Math.round((100 * s.correct) / s.total)}% (${s.correct}/${s.total})` : "–";
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
    `| Field | DawaCheck (with preprocessing) | Baseline (raw Tesseract) | CER DawaCheck | CER baseline |`,
    `| --- | --- | --- | --- | --- |`,
    ...SCORED_FIELDS.map((k) => {
      const f = sum(rows, (r) => r.full, k);
      const b = sum(rows, (r) => r.base, k);
      return `| ${k} | ${pct(f)} | ${pct(b)} | ${cerText(f)} | ${cerText(b)} |`;
    }),
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
        full: r.full,
        base: r.base,
      })),
      null,
      1,
    ),
  );
  console.log(`\nWrote ${out}`);
  console.log(lines.slice(6, 17).join("\n"));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
