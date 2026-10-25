// One-off experiment (dev + demo photos only, never the frozen test set): where does the reading
// time go, and what makes it faster without reading worse? Compares
//   - 1 Tesseract worker vs 2 running at the same time (createScheduler)
//   - photos scaled to a long side of 1600 px (current) vs 1200 px
// and prints, per set-up, the median / p95 time per strip, how many OCR reads it needed, and the
// field accuracy (same scoring as `pnpm eval`).
// Run: pnpm --filter web exec tsx scripts/speed-experiment.ts

import { readFileSync, existsSync } from "node:fs";
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
import { pageToReading, readProgressively } from "../lib/ai/reader";
import { addScores, emptyScores, SCORED_FIELDS, type Label } from "../lib/ai/score";

const EVAL_DIR = resolve(__dirname, "..", "..", "eval");

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

function prepare(photo: Rgba, longSide: number): Variant[] {
  const { width, height } = targetSize(photo.width, photo.height, longSide);
  let rgba = resizeRgba(photo, width, height);
  let variants = makeVariants(rgba.data, width, height);
  const skew = estimateSkew(variants[1].gray, width, height);
  if (Math.abs(skew) >= 1) {
    rgba = rotateRgba(rgba, -skew);
    variants = makeVariants(rgba.data, width, height);
  }
  return variants;
}

function toPng(v: Variant): Buffer {
  const png = new PNG({ width: v.width, height: v.height, colorType: 0, inputHasAlpha: false });
  png.data = Buffer.from(v.gray);
  return PNG.sync.write(png, { colorType: 0, inputColorType: 0, inputHasAlpha: false });
}

const pct = (sorted: number[], q: number) =>
  Math.round(sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))]);

async function main() {
  const labels = (JSON.parse(readFileSync(join(EVAL_DIR, "labels.json"), "utf8")) as Label[])
    .filter((l) => l.split !== "test")
    .filter((l) => existsSync(join(EVAL_DIR, "photos", l.front)));
  const photos = labels.map((l) => ({
    label: l,
    front: decode(join(EVAL_DIR, "photos", l.front)),
    backs: [l.back, l.stamp]
      .filter((f): f is string => Boolean(f))
      .map((f) => decode(join(EVAL_DIR, "photos", f))),
  }));

  for (const workers of [1, 2]) {
    const scheduler = createScheduler();
    for (let i = 0; i < workers; i++) {
      scheduler.addWorker(await createWorker("eng", 1, { cachePath: join(EVAL_DIR, ".cache") }));
    }
    for (const longSide of [1600, 1200]) {
      const times: number[] = [];
      const prepTimes: number[] = [];
      let reads = 0;
      const scores = emptyScores();
      for (const { label, front, backs } of photos) {
        const recognize = async (v: Variant) => {
          reads++;
          const { data } = await scheduler.addJob(
            "recognize",
            toPng(v),
            {},
            { text: true, blocks: true },
          );
          return pageToReading(v.name, data);
        };
        const started = performance.now();
        const frontVariants = prepare(front, longSide);
        const backVariants = backs.map((b) => prepare(b, longSide));
        prepTimes.push(performance.now() - started);
        const result = await readProgressively(
          { variants: frontVariants, recognize },
          backVariants.map((variants) => ({ variants, recognize })),
        );
        times.push(performance.now() - started);
        addScores(scores, result.fields, label);
      }
      times.sort((a, b) => a - b);
      prepTimes.sort((a, b) => a - b);
      const correct = SCORED_FIELDS.map((k) => `${k} ${scores[k].correct}/${scores[k].total}`);
      const wrong = SCORED_FIELDS.reduce((n, k) => n + scores[k].wrong, 0);
      console.log(
        `workers=${workers} size=${longSide}: median ${pct(times, 0.5)} ms, p95 ${pct(times, 0.95)} ms ` +
          `(preprocessing median ${pct(prepTimes, 0.5)} ms), ${reads} reads for ${photos.length} strips\n` +
          `  correct: ${correct.join(", ")}; wrong values: ${wrong}`,
      );
    }
    await scheduler.terminate();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
