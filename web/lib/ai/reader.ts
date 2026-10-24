// The reading strategy, shared by the browser (lib/ai/ocr.ts) and the evaluation script
// (scripts/eval.ts), so the evaluation measures exactly what the app does.
//
// Progressive, to stay fast on cheap phones: first only the black-and-white ("binary") variant
// of each side. If any key field (brand, ingredients, MRP, batch, expiry) is missing or unsure,
// also read the "inverted" and "enhanced" variants and merge everything.

import type { Page } from "tesseract.js";
import { isGoodEnough, mergeReadings, type MergedResult, type OcrReading } from "./merge";
import type { Variant } from "./preprocess";

export type Recognize = (variant: Variant) => Promise<OcrReading>;

export type ReadOptions = {
  /** Ablation switch for the evaluation: false = read the unprocessed grayscale only. */
  preprocess?: boolean;
  /** Ablation switch: false = always stop after the first pass. */
  progressive?: boolean;
  onMorePasses?: () => void;
};

// Order of makeVariants(): enhanced, binary, inverted.
const ENHANCED = 0;
const BINARY = 1;
const INVERTED = 2;

export async function readProgressively(
  front: { variants: Variant[]; recognize: Recognize },
  back: { variants: Variant[]; recognize: Recognize } | null,
  options: ReadOptions = {},
): Promise<MergedResult & { front: OcrReading[]; back: OcrReading[] }> {
  const { preprocess = true, progressive = true } = options;
  // Without preprocessing, the "enhanced" slot holds the plain grayscale photo (see eval.ts).
  const first = preprocess ? BINARY : ENHANCED;

  const frontReadings = [await front.recognize(front.variants[first])];
  const backReadings = back ? [await back.recognize(back.variants[first])] : [];
  let merged = mergeReadings(frontReadings, backReadings);

  if (preprocess && progressive && !isGoodEnough(merged.fields)) {
    options.onMorePasses?.();
    for (const v of [INVERTED, ENHANCED]) {
      frontReadings.push(await front.recognize(front.variants[v]));
    }
    if (back) {
      for (const v of [INVERTED, ENHANCED]) {
        backReadings.push(await back.recognize(back.variants[v]));
      }
    }
    merged = mergeReadings(frontReadings, backReadings);
  }
  return { ...merged, front: frontReadings, back: backReadings };
}

/** Tesseract's result -> what the extractor needs: text, overall confidence, line heights. */
export function pageToReading(variant: string, page: Page): OcrReading {
  const lines = (page.blocks ?? [])
    .flatMap((block) => block.paragraphs)
    .flatMap((paragraph) => paragraph.lines)
    .map((line) => ({
      text: line.text.trim(),
      height: line.bbox.y1 - line.bbox.y0,
      confidence: line.confidence,
    }))
    .filter((line) => line.text);
  return { variant, text: page.text, confidence: page.confidence, lines };
}
