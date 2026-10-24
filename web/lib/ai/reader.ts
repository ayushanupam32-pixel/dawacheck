// The reading strategy, shared by the browser (lib/ai/ocr.ts) and the evaluation script
// (scripts/eval.ts), so the evaluation measures exactly what the app does.
//
// Progressive, to stay fast on cheap phones:
//   pass 1  the black-and-white ("binary") variant of each photo
//   pass 2  if a key field is missing or unsure: the "ink", "enhanced" and "inverted" variants
//   pass 3  if batch, expiry or MRP is still missing: the stamp close-up's "ink" variant turned
//           90° and 270° (stamps are often printed sideways)

import type { Page } from "tesseract.js";
import type { FieldKey } from "./merge";
import { isGoodEnough, mergeReadings, type MergedResult, type OcrReading } from "./merge";
import { rotateQuarter, straighten, type Variant } from "./preprocess";

export type Recognize = (variant: Variant) => Promise<OcrReading>;
export type Side = { variants: Variant[]; recognize: Recognize };

export type ReadOptions = {
  /** Ablation switch for the evaluation: false = read the unprocessed photo only. */
  preprocess?: boolean;
  /** Ablation switch: false = always stop after the first pass. */
  progressive?: boolean;
  onMorePasses?: () => void;
};

const byName = (variants: Variant[], name: string) => variants.find((v) => v.name === name);

const STAMP_FIELDS: FieldKey[] = ["batchNo", "expDate", "mrp"];

/**
 * front: the photo with the name. back: the photo(s) with composition, batch, dates and MRP;
 * the last one may be a close-up of the stamp. Any of the back photos may be missing.
 */
export async function readProgressively(
  front: Side,
  back: Side[] | Side | null,
  options: ReadOptions = {},
): Promise<MergedResult & { front: OcrReading[]; back: OcrReading[] }> {
  const { preprocess = true, progressive = true } = options;
  const backs = back === null ? [] : Array.isArray(back) ? back : [back];
  const first = preprocess ? "binary" : "enhanced";

  const frontReadings: OcrReading[] = [];
  const backReadings: OcrReading[] = [];
  const readSide = async (side: Side, names: string[], into: OcrReading[]) => {
    for (const name of names) {
      const variant = byName(side.variants, name);
      if (variant) into.push(await side.recognize(variant));
    }
  };

  // Pass 1
  await readSide(front, [first], frontReadings);
  for (const side of backs) await readSide(side, [first], backReadings);
  let merged = mergeReadings(frontReadings, backReadings);
  if (!preprocess || !progressive) return { ...merged, front: frontReadings, back: backReadings };

  // Pass 2
  if (!isGoodEnough(merged.fields)) {
    options.onMorePasses?.();
    await readSide(front, ["ink", "enhanced", "inverted"], frontReadings);
    for (const side of backs) await readSide(side, ["ink", "enhanced", "inverted"], backReadings);
    merged = mergeReadings(frontReadings, backReadings);
  }

  // Pass 3: sideways stamps. Only the last back photo (the close-up, or the back) is turned,
  // and only its ink variant, to keep this cheap.
  const stamp = backs.at(-1);
  const ink = stamp && byName(stamp.variants, "ink");
  if (ink && STAMP_FIELDS.some((key) => (merged.fields[key]?.confidence ?? 0) < 0.5)) {
    for (const clockwise of [true, false]) {
      backReadings.push(await stamp.recognize(straighten(rotateQuarter(ink, clockwise))));
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
