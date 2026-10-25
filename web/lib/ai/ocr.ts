// Stage 2: read the photos with Tesseract.js, entirely in the browser.
//
// The photo never leaves the phone: Tesseract runs in Web Workers on the device. The only
// downloads are Tesseract's program and its English model (once; the browser caches them).
// This file is the "glue" between <canvas> pixels and the pure, tested stages:
//   preprocess.ts (Stage 1) -> Tesseract (Stage 2) -> extract.ts (Stage 3) via merge.ts.
// Two kinds of worker keep the page responsive and the reading fast:
//   - prepare.worker.ts makes the image variants (Stage 1) off the main thread;
//   - up to 2 Tesseract workers read variants at the same time (reader.ts starts all reads of a
//     pass together). On the dev photos this cut the median time from ~9.9 s to ~7.1 s with
//     exactly the same fields read (scripts/speed-experiment.ts).

import { createScheduler, createWorker, type Scheduler } from "tesseract.js";
import type { MergedResult, OcrReading } from "./merge";
import { preparePhoto, type Prepared } from "./prepare";
import { grayToRgba, type Variant } from "./preprocess";
import { pageToReading, readProgressively } from "./reader";

export type Stage = "loading-model" | "preparing" | "reading" | "reading-more" | "done";

let schedulerPromise: Promise<Scheduler> | null = null;

/**
 * Tesseract workers for the whole visit. Each worker is a separate copy of the OCR engine
 * (tens of MB of memory), so phones with fewer than 4 cores get just one. The first worker downloads
 * the model the first time; the second starts afterwards, loading the model from the browser's
 * cache, and joins in when ready (jobs already waiting are shared out as soon as it arrives).
 */
function getScheduler(): Promise<Scheduler> {
  schedulerPromise ??= (async () => {
    const scheduler = createScheduler();
    scheduler.addWorker(await createWorker("eng", 1 /* LSTM engine */));
    if ((navigator.hardwareConcurrency ?? 1) >= 4) {
      // If the second worker cannot start (e.g. low memory), the first one simply does it all.
      void createWorker("eng", 1)
        .then((worker) => scheduler.addWorker(worker))
        .catch(() => {});
    }
    return scheduler;
  })();
  return schedulerPromise;
}

function canvasOf(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

let prepWorker: Worker | null | undefined;
let nextJob = 0;
const waiting = new Map<number, { resolve: (p: Prepared) => void; reject: (e: Error) => void }>();

/** The preparing worker, or null on browsers without Web Workers + OffscreenCanvas. */
function getPrepWorker(): Worker | null {
  if (prepWorker !== undefined) return prepWorker;
  if (typeof Worker === "undefined" || typeof OffscreenCanvas === "undefined") {
    return (prepWorker = null);
  }
  prepWorker = new Worker(new URL("./prepare.worker.ts", import.meta.url), { type: "module" });
  prepWorker.onmessage = ({ data }) => {
    const job = waiting.get(data.id);
    waiting.delete(data.id);
    if (data.error) job?.reject(new Error(data.error));
    else job?.resolve(data.prepared);
  };
  // The worker script itself failed (e.g. blocked): fail the waiting jobs so they are redone on
  // the page, and stop using the worker.
  prepWorker.onerror = () => {
    for (const job of waiting.values()) job.reject(new Error("prepare worker failed"));
    waiting.clear();
    prepWorker = null;
  };
  return prepWorker;
}

/** Make the variants of one photo: in the worker if possible, otherwise on the page. */
export async function prepare(photo: Blob): Promise<Prepared> {
  const worker = getPrepWorker();
  if (worker) {
    try {
      const id = nextJob++;
      return await new Promise<Prepared>((resolve, reject) => {
        waiting.set(id, { resolve, reject });
        worker.postMessage({ id, photo });
      });
    } catch {
      // e.g. a browser whose OffscreenCanvas cannot decode this photo: fall through.
    }
  }
  return preparePhoto(photo, canvasOf);
}

/** Run Tesseract on one variant and keep the text, confidence and line heights. */
async function read(variant: Variant): Promise<OcrReading> {
  // Each variant carries its own size: a variant turned 90° swaps width and height.
  const canvas = canvasOf(variant.width, variant.height);
  canvas
    .getContext("2d")!
    .putImageData(new ImageData(grayToRgba(variant.gray), variant.width, variant.height), 0, 0);
  const scheduler = await getScheduler();
  const { data } = await scheduler.addJob("recognize", canvas, {}, { text: true, blocks: true });
  return pageToReading(variant.name, data);
}

export type StripReading = MergedResult & {
  front: OcrReading[];
  back: OcrReading[];
  skew: { front: number; back: number | null };
  millis: number;
};

/**
 * Read a strip from its front photo, the back (optional) and a close-up of the batch / expiry /
 * MRP stamp (optional; it helps a lot on shiny foil). Strategy: lib/ai/reader.ts.
 */
export async function readStrip(
  frontPhoto: Blob,
  backPhoto: Blob | null,
  onStage: (stage: Stage) => void = () => {},
  stampPhoto: Blob | null = null,
): Promise<StripReading> {
  const started = performance.now();
  onStage("loading-model");
  const ocrReady = getScheduler(); // start downloading the model while we prepare the images

  onStage("preparing");
  const front = await prepare(frontPhoto);
  const backs = [];
  for (const photo of [backPhoto, stampPhoto]) if (photo) backs.push(await prepare(photo));
  await ocrReady;

  onStage("reading");
  const result = await readProgressively(
    { variants: front.variants, recognize: read },
    backs.map((b) => ({ variants: b.variants, recognize: read })),
    { onMorePasses: () => onStage("reading-more") },
  );

  onStage("done");
  return {
    ...result,
    skew: { front: front.skew, back: backs[0]?.skew ?? null },
    millis: Math.round(performance.now() - started),
  };
}
