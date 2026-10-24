// One-off experiment (dev photos only): which image size, variant and Tesseract page mode read
// real strips best? Prints mean OCR confidence and whether known strings were found.
// Run: pnpm --filter web exec tsx scripts/ocr-experiment.ts

import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import jpeg from "jpeg-js";
import { PNG } from "pngjs";
import { createWorker, PSM } from "tesseract.js";
import { applyOrientation, jpegOrientation, resizeRgba, type Rgba } from "../lib/ai/image";
import { makeVariants, targetSize } from "../lib/ai/preprocess";

const EVAL_DIR = resolve(__dirname, "..", "..", "eval");
const CASES: [string, string[]][] = [
  ["favipill800-front.jpg", ["XFA20002", "1400", "Favipill", "Favipiravir"]],
  ["fincover1-front.jpg", ["FCR004", "33", "Fincover", "Finasteride"]],
  ["metformin500-zanza-front.jpg", ["Metformin", "500", "84"]],
  ["crocin-cold-flu-front.jpg", ["R3002", "15.00", "Crocin"]],
  ["dexedrine5-front.jpg", ["Dexedrine", "28"]],
];

function load(name: string): Rgba {
  const bytes = readFileSync(join(EVAL_DIR, "photos", name));
  const img = jpeg.decode(bytes, { useTArray: true, maxMemoryUsageInMB: 2048 });
  return applyOrientation(
    { data: new Uint8ClampedArray(img.data), width: img.width, height: img.height },
    jpegOrientation(bytes),
  );
}

function png(gray: Uint8ClampedArray, width: number, height: number): Buffer {
  const p = new PNG({ width, height, colorType: 0, inputColorType: 0, inputHasAlpha: false });
  p.data = Buffer.from(gray);
  return PNG.sync.write(p, { colorType: 0, inputColorType: 0, inputHasAlpha: false });
}

async function main() {
  const worker = await createWorker("eng", 1, { cachePath: join(EVAL_DIR, ".cache") });
  for (const [name, expected] of CASES) {
    const photo = load(name);
    console.log(`\n${name} (${photo.width}x${photo.height})`);
    for (const longSide of [1600, 2400, 3200]) {
      const { width, height } = targetSize(
        photo.width,
        photo.height,
        Math.min(longSide, Math.max(photo.width, photo.height)),
      );
      const variants = makeVariants(resizeRgba(photo, width, height).data, width, height);
      for (const v of variants) {
        for (const psm of [PSM.AUTO, PSM.SPARSE_TEXT]) {
          await worker.setParameters({ tessedit_pageseg_mode: psm });
          const t0 = performance.now();
          const { data } = await worker.recognize(png(v.gray, width, height));
          const ms = Math.round(performance.now() - t0);
          const text = data.text.toUpperCase().replace(/\s+/g, "");
          const hits = expected.filter((e) => text.includes(e.toUpperCase().replace(/\s+/g, "")));
          console.log(
            `  ${String(longSide).padEnd(5)} ${v.name.padEnd(9)} psm=${String(psm).padEnd(3)} conf=${String(Math.round(data.confidence)).padStart(3)} ${ms}ms  found ${hits.length}/${expected.length} ${hits.join(",")}`,
          );
        }
      }
    }
  }
  await worker.terminate();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
