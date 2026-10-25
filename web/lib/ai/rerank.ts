// Stage 4 of the AI core: decide which medicine a scanned strip is, or say "not sure".
//
// 1. Candidates: brands whose names look like the name read from the strip (trigram search in
//    the database, see lib/find-match.ts).
// 2. Evidence: for each candidate, compare everything else read from the strip with the
//    database: strength in the name, ingredients, form, release type, manufacturer
//    (features(), below). Each piece of evidence is +1 (agrees), -1 (contradicts) or 0 (unknown).
// 3. Score: a choice model (conditional logit, the multi-option form of logistic regression)
//    turns the evidence into probabilities over "candidate 1, candidate 2, ..., none of these",
//    which add up to 1. Its weights were learnt from examples (scripts/eval-match.ts).
//    If two candidates look equally good (Valium 2 / 5 / 10 when no strength was read), the
//    probability is shared between them, so neither is confident.
// 4. Decide, with two safety rules the learned model cannot override:
//    - never answer with a candidate that something on the strip contradicts (strength, form,
//      ingredients or release type): "Potrate 5" is not "Potrate 10", however alike the names;
//    - if the brand comes in strengths (a number in its name, "Bilefix 600") the strip must
//      confirm which one, through the name or the ingredients.
//    Otherwise, below the threshold we abstain. Abstaining shows the top options for the user to
//    pick or type the name: a wrong medicine is worse than no answer.
//
// Pure functions, no I/O: tested in tests/rerank.test.ts.

import type { Ingredient } from "./extract";
import weights from "./match-weights.json";
import {
  coreName,
  findReleases,
  levenshtein,
  lookAlike,
  nameNumbers,
  nameSimilarity,
  normalizeSalt,
  parseCompositionKey,
  sameMaker,
  type Composition,
} from "./normalize";

/** What the strip says (after the user's corrections on the confirm screen). */
export type MatchInput = {
  brand: string | null;
  ingredients: Ingredient[] | null;
  form: string | null;
  manufacturer: string | null;
  /** Release types named on the strip, e.g. ["er"] for "SR" (normalize.findReleases). */
  releases: string[];
};

/** The parts of a database brand the matcher needs. */
export type MatchCandidate = {
  id: number;
  name: string;
  manufacturer: string | null;
  compositionKey: string | null;
  /** False when the dataset may have cut the ingredient list short (2-ingredient rows). */
  compositionComplete?: boolean;
};

export const FEATURES = ["name", "strength", "ingredients", "form", "release", "maker"] as const;
export type Features = Record<(typeof FEATURES)[number], number>;

export type AbstainReason =
  | "no_brand" // nothing was read as the name
  | "no_candidates" // no brand in the database looks like it
  | "contradiction" // the best candidate disagrees with something on the strip
  | "strength_unknown" // the brand comes in strengths and the strip did not say which
  | "unsure"; // below the confidence threshold

export type Scored<C> = { candidate: C; features: Features; probability: number };

export type Decision<C> =
  | { status: "match"; best: Scored<C>; confidence: number; ranked: Scored<C>[] }
  | {
      status: "abstain";
      reason: AbstainReason;
      confidence: number;
      ranked: Scored<C>[];
    };

export type Weights = { bias: number; threshold: number } & Features;

export const WEIGHTS: Weights = weights;

/**
 * The matcher's input from the confirm screen (or, in the evaluation, straight from the reader).
 * Release words count anywhere in the name ("Neorelax MR"), but in the rest of the strip's text
 * only as unmistakable phrases ("sustained release"): a stray "PR" there is likely OCR noise.
 */
export function buildMatchInput(strip: {
  brand: string;
  ingredients: Ingredient[];
  form: string | null;
  manufacturer: string | null;
  ocrText: string;
}): MatchInput {
  return {
    brand: strip.brand.trim() || null,
    ingredients: strip.ingredients.length ? strip.ingredients : null,
    form: strip.form,
    manufacturer: strip.manufacturer,
    releases: [...new Set([...findReleases(strip.brand), ...findReleases(strip.ocrText, true)])],
  };
}

// ------------------------------------------------------------------ evidence

/**
 * Same salt? "yes": exact after normalization, or one letter off for long names (an OCR slip).
 * "maybe": two letters off. That could be an OCR slip or a different medicine ("citalopram" vs
 * "escitalopram"), so it is neither evidence for nor against.
 */
function sameSalt(a: string, b: string): "yes" | "maybe" | "no" {
  if (a === b || lookAlike(a) === lookAlike(b)) return "yes";
  const distance = levenshtein(a, b);
  if (Math.min(a.length, b.length) >= 8 && distance <= 1) return "yes";
  return Math.min(a.length, b.length) >= 6 && distance <= 2 ? "maybe" : "no";
}

/**
 * +1 the strip's ingredients and strengths are exactly the candidate's
 * +0.5 no contradiction, but not a full match (some salts not read, or the dataset's list is
 *      incomplete and the strip names more)
 * -1 a salt or a strength contradicts the candidate
 *  0 nothing to compare
 *
 * `complete = false`: the dataset keeps only 2 ingredients per brand, so a third salt on the
 * strip (Neorelax MR: + paracetamol) is not a contradiction. The generic step asks the user to
 * confirm the full composition for such brands before showing any generic.
 */
export function ingredientEvidence(
  read: Ingredient[] | null,
  composition: Composition | null,
  complete = true,
) {
  if (!read?.length || !composition) return 0;
  const theirs = composition.ingredients;
  const sameStrength = (a: { value: number; unit: string }, b: { value: number; unit: string }) =>
    a.unit === b.unit && Math.abs(a.value - b.value) < 1e-6;
  let matched = 0;
  let unsure = 0;
  for (const ingredient of read) {
    const salt = normalizeSalt(ingredient.salt);
    const match = theirs.find((t) => sameSalt(salt, t.salt) === "yes");
    if (match) {
      if (!sameStrength(match, ingredient)) return -1;
      matched++;
    } else if (
      theirs.some((t) => sameSalt(salt, t.salt) === "maybe" && sameStrength(t, ingredient))
    ) {
      unsure++;
    } else if (complete) {
      return -1;
    }
  }
  if (!matched) return unsure ? 0 : -1;
  return matched === read.length && read.length >= theirs.length ? 1 : 0.5;
}

/**
 * True when the ingredients confirmed from the strip are not the brand's: a salt the brand does
 * not have, or a different strength. Then the brand's generic is not the strip's generic.
 * A brand ingredient missing from the strip is not counted (the user may not have typed it).
 */
export function compositionDiffers(
  strip: Ingredient[],
  brand: { salt: string; value: number; unit: string }[],
): boolean {
  const theirs = brand.map((b) => ({ ...b, salt: normalizeSalt(b.salt), value: Number(b.value) }));
  return strip.some((ingredient) => {
    const match = theirs.find((t) => sameSalt(normalizeSalt(ingredient.salt), t.salt) === "yes");
    return (
      !match || match.unit !== ingredient.unit || Math.abs(match.value - ingredient.value) > 1e-6
    );
  });
}

/** Numbers in the name on the strip ("Suhagra-100") must appear in the candidate. */
export function strengthEvidence(brand: string, candidate: MatchCandidate, c: Composition | null) {
  const read = nameNumbers(brand);
  if (!read.length) return 0;
  const values = c?.ingredients.map((i) => i.value) ?? [];
  // "Augmentin 625" = 500 mg + 125 mg: the name shows the total.
  const known = new Set([
    ...nameNumbers(candidate.name),
    ...values,
    values.reduce((a, b) => a + b, 0),
  ]);
  return read.every((n) => known.has(n)) ? 1 : -1;
}

export function features(input: MatchInput, candidate: MatchCandidate): Features {
  const composition = candidate.compositionKey
    ? parseCompositionKey(candidate.compositionKey)
    : null;
  const brand = input.brand ?? "";
  const release = composition?.release ?? "ir";

  const maker =
    input.manufacturer && candidate.manufacturer
      ? Number(sameMaker(input.manufacturer, candidate.manufacturer))
      : 0;

  return {
    name: nameSimilarity(brand, candidate.name),
    strength: strengthEvidence(brand, candidate, composition),
    ingredients: ingredientEvidence(
      input.ingredients,
      composition,
      candidate.compositionComplete ?? true,
    ),
    form: input.form && composition ? (input.form === composition.form ? 1 : -1) : 0,
    // A key may combine release types: "dr+er" (a gastro-resistant PPI with an SR partner).
    release: input.releases.length
      ? input.releases.some((r) => release.split("+").includes(r))
        ? 1
        : -1
      : 0,
    maker,
  };
}

// ------------------------------------------------------------------ score and decide

/** How strongly the evidence points to a candidate (a "logit"); "none of these" scores 0. */
export function logit(f: Features, w: Pick<Weights, "bias" | keyof Features> = WEIGHTS): number {
  return w.bias + FEATURES.reduce((sum, key) => sum + w[key] * f[key], 0);
}

/**
 * Softmax over the candidates plus "none of these":
 *   P(candidate j) = e^logit_j / (1 + sum over k of e^logit_k)
 * The 1 in the denominator is "none of these" (e^0). The bias decides how good the evidence must
 * be before a candidate beats "none".
 */
export function probabilities(logits: number[]): number[] {
  const top = Math.max(0, ...logits); // subtract the largest, so e^x cannot overflow
  const exps = logits.map((z) => Math.exp(z - top));
  const total = Math.exp(-top) + exps.reduce((a, b) => a + b, 0);
  return exps.map((e) => e / total);
}

/** Two names for the same product ("Telma 40 Tablet" / "Telma 40mg Tablet") count as one. */
export const nameIdentity = (name: string) =>
  `${coreName(name)}|${nameNumbers(name)
    .sort((a, b) => a - b)
    .join(",")}`;

export function decide<C extends MatchCandidate>(
  input: MatchInput,
  candidates: C[],
  w: Weights = WEIGHTS,
): Decision<C> {
  if (!input.brand?.trim()) {
    return { status: "abstain", reason: "no_brand", confidence: 0, ranked: [] };
  }
  // Keep one row per product, so a duplicate name does not split the probability.
  const seen = new Set<string>();
  const unique = candidates.filter((c) => {
    const id = nameIdentity(c.name);
    return !seen.has(id) && seen.add(id);
  });
  const scored = unique.map((candidate) => ({ candidate, features: features(input, candidate) }));
  const p = probabilities(scored.map((s) => logit(s.features, w)));
  const ranked = scored
    .map((s, i) => ({ ...s, probability: p[i] }))
    .sort((a, b) => b.probability - a.probability);
  if (!ranked.length) return { status: "abstain", reason: "no_candidates", confidence: 0, ranked };

  const [best] = ranked;
  const f = best.features;
  const abstain = (reason: AbstainReason): Decision<C> => ({
    status: "abstain",
    reason,
    confidence: best.probability,
    ranked,
  });
  if (f.strength < 0 || f.form < 0 || f.ingredients < 0 || f.release < 0) {
    return abstain("contradiction");
  }
  const strengthConfirmed =
    f.strength > 0 || f.ingredients > 0 || nameNumbers(best.candidate.name).length === 0;
  if (!strengthConfirmed) return abstain("strength_unknown");
  return best.probability >= w.threshold
    ? { status: "match", best, confidence: best.probability, ranked }
    : abstain("unsure");
}

/**
 * Several names were tried for one strip (the name on the confirm screen and the reader's other
 * guesses, lib/ai/merge.ts brandGuesses): one decision per name, in that order. Combine them:
 * - every name that matched points to the same product -> that match (the most confident);
 * - names matched DIFFERENT products -> abstain: the strip is ambiguous, let the user pick;
 * - nothing matched -> the first decision that has options to offer (else the first one).
 */
export function combineDecisions<C extends MatchCandidate>(decisions: Decision<C>[]): Decision<C> {
  const matches = decisions
    .filter((d) => d.status === "match")
    .sort((a, b) => b.confidence - a.confidence);
  const products = new Set(matches.map((d) => nameIdentity(d.best.candidate.name)));
  if (products.size === 1) return matches[0];
  if (products.size > 1) {
    const seen = new Set<string>();
    const ranked = matches
      .map((d) => d.best)
      .filter((s) => {
        const id = nameIdentity(s.candidate.name);
        return !seen.has(id) && seen.add(id);
      });
    return { status: "abstain", reason: "unsure", confidence: matches[0].confidence, ranked };
  }
  return decisions.find((d) => d.ranked.length) ?? decisions[0];
}

// ------------------------------------------------------------------ learning the weights

/**
 * Fit the choice model by gradient descent. Each example is one strip: the features of its
 * candidates and which one is right (`truth`, or null when the right answer is "none of these").
 * Minimizes -log P(right answer); the gradient is (expected features - features of the right
 * answer). A small L2 penalty keeps weights from growing without bound. Used only by
 * scripts/eval-match.ts.
 */
export function fitChoiceModel(
  examples: { candidates: Features[]; truth: number | null }[],
  { epochs = 2000, rate = 0.5, l2 = 0.001 } = {},
): Omit<Weights, "threshold"> {
  const w = { bias: 0, ...Object.fromEntries(FEATURES.map((k) => [k, 0])) } as Omit<
    Weights,
    "threshold"
  >;
  const n = examples.length;
  for (let epoch = 0; epoch < epochs; epoch++) {
    const grad = { bias: 0, ...Object.fromEntries(FEATURES.map((k) => [k, 0])) } as typeof w;
    for (const { candidates, truth } of examples) {
      const p = probabilities(candidates.map((f) => logit(f, w)));
      candidates.forEach((f, j) => {
        const error = p[j] - (j === truth ? 1 : 0);
        grad.bias += error;
        for (const k of FEATURES) grad[k] += error * f[k];
      });
    }
    w.bias -= (rate * grad.bias) / n;
    for (const k of FEATURES) w[k] -= rate * (grad[k] / n + l2 * w[k]);
  }
  return w;
}
