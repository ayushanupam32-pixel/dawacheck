// Stage 2: read the photos with Tesseract.js, entirely in the browser.
//
// The photo never leaves the phone: Tesseract runs in its own Web Worker on the device. The only
// downloads are Tesseract's program and its English model (once; the browser caches them).
// This file is the "glue" between <canvas> pixels and the pure, tested stages:
//   preprocess.ts (Stage 1) -> Tesseract (Stage 2) -> extract.ts (Stage 3) via merge.ts.

import { createWorker, type Worker } from "tesseract.js";
import type { MergedResult, OcrReading } from "./merge";
import { estimateSkew, grayToRgba, makeVariants, targetSize, type Variant } from "./preprocess";
import { pageToReading, readProgressively } from "./reader";

export type Stage = "loading-model" | "preparing" | "reading" | "reading-more" | "done";

type Prepared = { width: number; height: number; variants: Variant[]; skew: number };

let workerPromise: Promise<Worker> | null = null;

/** One Tesseract worker for the whole visit; creating it downloads the model the first time. */
function getWorker(): Promise<Worker> {
  workerPromise ??= createWorker("eng", 1 /* LSTM engine */);
  return workerPromise;
}

const nextFrame = () => new Promise((resolve) => setTimeout(resolve, 0));

function canvasOf(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

/**
 * Load a photo, scale it to ~1600 px, straighten it if the text is tilted, and make the
 * 3 variants. `imageOrientation: "from-image"` honours the phone's rotation flag (EXIF).
 */
export async function prepare(photo: Blob): Promise<Prepared> {
  const bitmap = await createImageBitmap(photo, { imageOrientation: "from-image" });
  const { width, height } = targetSize(bitmap.width, bitmap.height);
  const canvas = canvasOf(width, height);
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  let variants = makeVariants(ctx.getImageData(0, 0, width, height).data, width, height);
  await nextFrame(); // let the progress message paint before the next heavy step
  const skew = estimateSkew(variants[1].gray, width, height);
  if (Math.abs(skew) >= 1) {
    // Rotate the original photo the other way, on a white background, then redo the variants.
    const straight = canvasOf(width, height);
    const sctx = straight.getContext("2d", { willReadFrequently: true })!;
    sctx.fillStyle = "#fff";
    sctx.fillRect(0, 0, width, height);
    sctx.translate(width / 2, height / 2);
    sctx.rotate((-skew * Math.PI) / 180);
    sctx.drawImage(canvas, -width / 2, -height / 2);
    variants = makeVariants(sctx.getImageData(0, 0, width, height).data, width, height);
  }
  return { width, height, variants, skew };
}

/** Run Tesseract on one variant and keep the text, confidence and line heights. */
async function read(prepared: Prepared, variant: Variant): Promise<OcrReading> {
  const canvas = canvasOf(prepared.width, prepared.height);
  canvas
    .getContext("2d")!
    .putImageData(new ImageData(grayToRgba(variant.gray), prepared.width, prepared.height), 0, 0);
  const worker = await getWorker();
  const { data } = await worker.recognize(canvas, {}, { text: true, blocks: true });
  return pageToReading(variant.name, data);
}

export type StripReading = MergedResult & {
  front: OcrReading[];
  back: OcrReading[];
  skew: { front: number; back: number | null };
  millis: number;
};

/** Read a strip from its front photo (and the back, if given). Strategy: lib/ai/reader.ts. */
export async function readStrip(
  frontPhoto: Blob,
  backPhoto: Blob | null,
  onStage: (stage: Stage) => void = () => {},
): Promise<StripReading> {
  const started = performance.now();
  onStage("loading-model");
  const workerReady = getWorker(); // start downloading the model while we prepare the images

  onStage("preparing");
  const front = await prepare(frontPhoto);
  const back = backPhoto ? await prepare(backPhoto) : null;
  await workerReady;

  onStage("reading");
  const result = await readProgressively(
    { variants: front.variants, recognize: (v) => read(front, v) },
    back ? { variants: back.variants, recognize: (v) => read(back, v) } : null,
    { onMorePasses: () => onStage("reading-more") },
  );

  onStage("done");
  return {
    ...result,
    skew: { front: front.skew, back: back?.skew ?? null },
    millis: Math.round(performance.now() - started),
  };
}
