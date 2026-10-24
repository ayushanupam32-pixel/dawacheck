// Scoring for the evaluation: how close is what we read to the true value typed in the labeling
// tool? Pure functions, unit-tested in tests/score.test.ts.

import { normalizeBatch, type ExtractedFields } from "./extract";

/** The true values for one strip, typed by a person in the labeling tool (eval/labels.json). */
export type Label = {
  id: string;
  /** dev = used while tuning; test = frozen, only for the final report; demo = sample images. */
  split: "dev" | "test" | "demo";
  front: string;
  back: string | null;
  /** Optional close-up of the batch / dates / MRP stamp (the app's optional third photo). */
  stamp?: string | null;
  brand: string;
  ingredients: string; // one per line: "Telmisartan 40 mg"
  mrp: number | null;
  packSize: number | null;
  batchNo: string;
  mfgDate: string; // "YYYY-MM"
  expDate: string; // "YYYY-MM"
  foil: boolean;
  lighting: "good" | "poor";
  notes?: string;
};

export const SCORED_FIELDS = [
  "brand",
  "ingredients",
  "mrp",
  "packSize",
  "batchNo",
  "mfgDate",
  "expDate",
] as const;
export type ScoredField = (typeof SCORED_FIELDS)[number];

/** Edit distance: the fewest single-character insertions, deletions or swaps from a to b. */
export function levenshtein(a: string, b: string): number {
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) {
      row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = row;
  }
  return prev[b.length];
}

/** Character error rate: edits needed / length of the truth. 0 = perfect. */
export function cer(read: string, truth: string): number {
  if (!truth) return read ? 1 : 0;
  return Math.min(1, levenshtein(read, truth) / truth.length);
}

const canonText = (s: string) =>
  s
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();

/** "Telmisartan 40 mg\nAmlodipine 5 mg" -> sorted ["AMLODIPINE 5 MG", "TELMISARTAN 40 MG"] */
function canonIngredients(text: string): string[] {
  return (
    text
      .split("\n")
      // Drop trailing zeros first ("1.0" -> "1", "12.50" -> "12.5"), before punctuation is removed.
      .map((line) =>
        canonText(line.replace(/(\d+\.\d*?)0+\b/g, "$1").replace(/(\d+)\.(?!\d)/g, "$1")),
      )
      .filter(Boolean)
      .sort()
  );
}

/** The value we read, as text comparable with the label. */
export function readValue(fields: ExtractedFields, key: ScoredField): string {
  if (key === "ingredients") {
    return (fields.ingredients?.value ?? [])
      .map((i) => `${i.salt} ${i.value} ${i.unit}`)
      .join("\n");
  }
  const field = fields[key];
  return field ? String(field.value) : "";
}

export function truthValue(label: Label, key: ScoredField): string {
  const value = label[key];
  return value === null || value === undefined ? "" : String(value);
}

/** Exact match after normalizing what doesn't matter (case, spaces, dashes, trailing .00). */
export function fieldCorrect(key: ScoredField, read: string, truth: string): boolean {
  switch (key) {
    case "brand":
      return canonText(read) === canonText(truth);
    case "ingredients":
      return JSON.stringify(canonIngredients(read)) === JSON.stringify(canonIngredients(truth));
    case "mrp":
    case "packSize":
      return read !== "" && truth !== "" && Math.abs(Number(read) - Number(truth)) < 0.005;
    case "batchNo":
      return normalizeBatch(read) === normalizeBatch(truth);
    default:
      return read === truth;
  }
}

/** wrong = we showed a value and it was incorrect (worse than showing nothing). */
export type FieldScore = { correct: number; wrong: number; total: number; cerSum: number };

export function emptyScores(): Record<ScoredField, FieldScore> {
  return Object.fromEntries(
    SCORED_FIELDS.map((k) => [k, { correct: 0, wrong: 0, total: 0, cerSum: 0 }]),
  ) as Record<ScoredField, FieldScore>;
}

/** Add one strip's result to the running totals. A field the label leaves empty isn't scored. */
export function addScores(
  scores: Record<ScoredField, FieldScore>,
  fields: ExtractedFields,
  label: Label,
): void {
  for (const key of SCORED_FIELDS) {
    const truth = truthValue(label, key);
    if (!truth) continue;
    const read = readValue(fields, key);
    const s = scores[key];
    s.total++;
    if (fieldCorrect(key, read, truth)) s.correct++;
    else if (read) s.wrong++;
    s.cerSum += cer(canonText(read), canonText(truth));
  }
}
