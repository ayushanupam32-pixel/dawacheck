// Stage 2b: combine OCR readings of several image variants into one answer per field.
//
// Each side of the strip may be read in up to 3 variants (enhanced / binary / inverted). For every
// pair (front variant, back variant) we run the extractor and score each field as
//     score = pattern confidence (from extract.ts) × OCR confidence of the text it came from
// and keep the highest-scoring value per field. Pure function: tested in tests/merge.test.ts.

import { extractFields, type ExtractedFields, type OcrLine } from "./extract";

export type OcrReading = {
  variant: string;
  text: string;
  /** Tesseract's mean confidence for the whole page, 0–100. */
  confidence: number;
  lines: OcrLine[];
};

export type FieldKey = keyof ExtractedFields;

export type MergedResult = {
  fields: ExtractedFields;
  /** Which variant pair produced each field: shown in the "How we read this" panel. */
  source: Partial<Record<FieldKey, { front: string; back: string }>>;
};

/** Fields that decide whether the result is good enough without reading more variants. */
export const KEY_FIELDS: FieldKey[] = ["brand", "ingredients", "mrp", "batchNo", "expDate"];
export const GOOD_ENOUGH = 0.6;
export const MIN_SHOW = 0.3;
const FREE_TEXT: FieldKey[] = ["brand", "ingredients", "manufacturer"];

export function mergeReadings(front: OcrReading[], back: OcrReading[]): MergedResult {
  const backs = back.length ? back : [{ variant: "none", text: "", confidence: 100, lines: [] }];
  const fields = {} as ExtractedFields;
  const best = {} as Record<FieldKey, number>;
  const source: MergedResult["source"] = {};

  for (const f of front) {
    for (const b of backs) {
      const extracted = extractFields(f.text, b.text, f.lines);
      const ocr = (f.confidence + b.confidence) / 200;
      for (const key of Object.keys(extracted) as FieldKey[]) {
        const field = extracted[key];
        if (!field) {
          if (!(key in fields)) (fields as Record<FieldKey, unknown>)[key] = null;
          continue;
        }
        const score = field.confidence * ocr;
        if (score > (best[key] ?? -1)) {
          best[key] = score;
          // Report the combined score as the field's confidence, so the confirm screen
          // highlights values that were hard to read even if the pattern looked right.
          (fields as Record<FieldKey, unknown>)[key] = { value: field.value, confidence: score };
          source[key] = { front: f.variant, back: b.variant };
        }
      }
    }
  }
  // Free-text fields: below this combined confidence a value is more likely garbage than truth
  // ("pe fav TRE ER Ema" as a brand, seen on real photos). Show nothing, so the user types it,
  // rather than pre-fill something wrong. Structured fields (MRP, batch, dates, pack) are not
  // filtered: their strict patterns already reject garbage (0 wrong values on the dev photos),
  // and filtering them only hid correct readings. Tuned on the dev photos only.
  for (const key of FREE_TEXT) {
    const field = fields[key];
    if (field && field.confidence < MIN_SHOW) {
      (fields as Record<FieldKey, unknown>)[key] = null;
      delete source[key];
    }
  }
  return { fields, source };
}

/** True when every key field was read with at least GOOD_ENOUGH confidence. */
export function isGoodEnough(fields: ExtractedFields): boolean {
  return KEY_FIELDS.every((key) => (fields[key]?.confidence ?? 0) >= GOOD_ENOUGH);
}
