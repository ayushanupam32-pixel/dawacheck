// The evaluation numbers shown on the About page. eval-summary.json is GENERATED: `pnpm eval`
// writes `reader` (or `readerFinal` with --final) and `pnpm eval:match` writes `matching`
// (scripts/eval-summary-file.ts). The page never computes or types in a number itself, so it
// always shows what the evaluation last measured.

import type { ScoredField } from "./ai/score";
import summary from "./eval-summary.json";

export type ReaderSummary = {
  generated: string; // YYYY-MM-DD
  split: "dev" | "test";
  strips: number;
  fields: {
    field: ScoredField;
    total: number;
    correct: number;
    wrong: number;
    /** Raw Tesseract on the untouched photo (the brief's baseline). */
    baseCorrect: number;
    baseWrong: number;
  }[];
  medianMs: number;
  p95Ms: number;
};

export const MATCH_METHODS = ["exact", "trigram", "rerank", "medicheck"] as const;
export type MatchMethod = (typeof MATCH_METHODS)[number];
export const MATCH_SETS = ["simDev", "simTest", "photosDev", "photosTest"] as const;
export type MatchSet = (typeof MATCH_SETS)[number];

export type MatchSummary = {
  generated: string;
  sets: {
    set: MatchSet;
    cases: number;
    inDataset: number;
    rows: {
      method: MatchMethod;
      top1: number | null;
      top3: number | null;
      wrongOfAnswered: number;
      abstainedInDataset: number | null;
    }[];
  }[];
};

export type EvalSummary = {
  reader?: ReaderSummary;
  readerFinal?: ReaderSummary;
  matching?: MatchSummary;
};

export const evalSummary = summary as EvalSummary;
