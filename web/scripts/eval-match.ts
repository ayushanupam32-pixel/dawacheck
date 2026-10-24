// pnpm eval:match: evaluate Stage 4 (matching a strip to a medicine) and, with --fit, learn its
// weights and choose the abstention threshold. Writes eval/match-results.md.
//
// Two kinds of cases:
//   simulated  real brands from the database, turned into what OCR might read from their strip
//              (letter swaps seen on real photos, missing strength, junk characters, some
//              ingredients read). 1 in 4 is "not in the dataset": its true brand is removed from
//              the candidates, so the right answer is to abstain. Split dev / test by brand id.
//   photos     the labelled photos (eval/labels.json, field `matchBrand`), with the values the
//              user would confirm. Dev photos always; the frozen test photos only with --final.
//
// Weights are fitted, and the threshold chosen, on simulated DEV cases only; everything is then
// reported on cases the fit never saw.
//
// Usage (from the repo root; needs web/.env.local with the read-only Supabase key):
//   pnpm eval:match            evaluate with the current weights (lib/ai/match-weights.json)
//   pnpm eval:match --fit      refit the weights and threshold first, then evaluate
//   pnpm eval:match --final    also report the frozen test photos (once, for the final report)
//   DEBUG_MATCH=wrong|notfound|unsure pnpm eval:match   print simulated cases of that kind

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { extractIngredients, type Ingredient } from "../lib/ai/extract";
import { coreName, findReleases } from "../lib/ai/normalize";
import {
  decide,
  FEATURES,
  fitChoiceModel,
  nameIdentity as identity,
  WEIGHTS,
  type Decision,
  type MatchInput,
  type Weights,
} from "../lib/ai/rerank";
import type { Label } from "../lib/ai/score";
import { findCandidates } from "../lib/find-match";
import type { BrandCandidate } from "../lib/match";

const WEB_DIR = resolve(__dirname, "..");
const EVAL_DIR = resolve(WEB_DIR, "..", "eval");
// The candidate cache is only valid for the retrieval code that filled it, so its name includes
// a hash of lib/find-match.ts: change the search and the cache starts again.
const RETRIEVAL_VERSION = createHash("sha1")
  .update(readFileSync(join(WEB_DIR, "lib", "find-match.ts")))
  .digest("hex")
  .slice(0, 8);
const CACHE = join(EVAL_DIR, ".cache", `match-candidates-${RETRIEVAL_VERSION}.json`);
const WEIGHTS_FILE = join(WEB_DIR, "lib", "ai", "match-weights.json");
const fit = process.argv.includes("--fit");
const final = process.argv.includes("--final");

const SIMULATED = 800;
const NOT_IN_DATASET = 0.25;
// The project brief's targets: wrong matches <= 2% of answers, abstain on <= 20%.
const MAX_WRONG = 0.02;

if (existsSync(join(WEB_DIR, ".env.local"))) process.loadEnvFile(join(WEB_DIR, ".env.local"));
const db = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
  auth: { persistSession: false },
});

// ------------------------------------------------------------------ seeded randomness

// mulberry32: a tiny pseudo-random generator. Same seed -> same cases on every run, so results
// can be reproduced and compared between versions of the matcher.
function random(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = random(20261024);
const chance = (p: number) => rand() < p;
const pick = <T>(items: T[]) => items[Math.floor(rand() * items.length)];

// ------------------------------------------------------------------ the OCR noise model

// Letter confusions seen in Tesseract output on the M3 dev photos ("Telrna", "0" for "O", ...).
const CONFUSIONS: [string, string][] = [
  ["m", "rn"],
  ["rn", "m"],
  ["o", "0"],
  ["0", "o"],
  ["l", "1"],
  ["1", "l"],
  ["i", "l"],
  ["l", "i"],
  ["e", "c"],
  ["c", "e"],
  ["a", "o"],
  ["s", "5"],
  ["5", "s"],
  ["b", "8"],
  ["8", "b"],
  ["cl", "d"],
  ["h", "b"],
  ["u", "v"],
  ["n", "h"],
  ["t", "f"],
];
const JUNK = ["|", "—", "Rx", "ee", "®", "TM", "' ", "i"];
const FORM_WORDS =
  /^(tablets?|tab|capsules?|cap|syrup|suspension|injection|cream|gel|ointment|drops?|solution|lotion|spray|powder|sachet|inhaler|respules|kit|mg|ml)$/i;

/** Each character, with probability `rate`, is swapped, dropped or doubled. */
function ocrNoise(text: string, rate: number): string {
  let out = "";
  for (let i = 0; i < text.length; i++) {
    if (!chance(rate)) {
      out += text[i];
      continue;
    }
    const rest = text.slice(i).toLowerCase();
    const confusion = CONFUSIONS.find(([from]) => rest.startsWith(from) && chance(0.7));
    if (confusion) {
      const isUpper = text[i] !== text[i].toLowerCase();
      out += isUpper ? confusion[1].toUpperCase() : confusion[1];
      i += confusion[0].length - 1;
    } else if (chance(0.5)) {
      continue; // dropped
    } else {
      out += text[i] + text[i]; // doubled
    }
  }
  return out;
}

type PoolBrand = BrandCandidate & { trueIngredients: Ingredient[] };

/** What the reader might produce for this brand's strip (after a quick look by the user). */
function simulateReading(brand: PoolBrand): MatchInput {
  let words = brand.name.split(/\s+/);
  // Strips usually show "TELMA 40", not "Telma 40 Tablet".
  if (chance(0.8)) words = words.filter((w) => !FORM_WORDS.test(w));
  // Strength not read, or not next to the name.
  if (chance(0.3)) words = words.filter((w) => !/\d/.test(w));
  let text = words.join(" ") || brand.name;
  if (chance(0.5)) text = text.toUpperCase();
  text = ocrNoise(text, pick([0, 0, 0.03, 0.03, 0.06, 0.1]));
  if (chance(0.15)) text = chance(0.5) ? `${pick(JUNK)} ${text}` : `${text} ${pick(JUNK)}`;

  let ingredients: Ingredient[] | null = null;
  if (chance(0.5) && brand.trueIngredients.length) {
    ingredients = brand.trueIngredients.map((i) => ({
      ...i,
      salt: chance(0.5) ? ocrNoise(i.salt, 0.02) : `${i.salt}${chance(0.3) ? " IP" : ""}`,
    }));
    if (ingredients.length > 1 && chance(0.15))
      ingredients.splice(Math.floor(rand() * ingredients.length), 1);
  }
  const form = brand.compositionKey?.split("#")[1] ?? null;
  return {
    brand: text,
    ingredients,
    form: chance(0.6) ? form : null,
    manufacturer: chance(0.3) && brand.manufacturer ? ocrNoise(brand.manufacturer, 0.03) : null,
    releases: findReleases(text),
  };
}

// ------------------------------------------------------------------ building the cases

type Case = {
  id: string;
  kind: "simulated" | "photo";
  split: "dev" | "test";
  input: MatchInput;
  /** The right brand, or null = abstaining is the right answer. */
  truth: { name: string; compositionKey: string | null } | null;
  /** Simulated "not in the dataset": hide these from the candidates. */
  hide?: string;
  /** For hidden brands: their real composition, to tell whether a wrong answer's generic is wrong. */
  hiddenKey?: string | null;
};

async function samplePool(): Promise<PoolBrand[]> {
  const { data: last } = await db
    .from("brands")
    .select("id")
    .order("id", { ascending: false })
    .limit(1);
  const maxId = last![0].id as number;
  const pool = new Map<string, PoolBrand>();
  while (pool.size < SIMULATED) {
    const ids = Array.from({ length: 300 }, () => 1 + Math.floor(rand() * maxId));
    const { data, error } = await db
      .from("brands")
      .select(
        "id, name, manufacturer, form, release, pack_size, pack_unit, mrp_2022, composition_key, composition_complete, discontinued, brand_ingredients(strength_value, strength_unit, salts(display_name))",
      )
      .in("id", ids)
      .eq("discontinued", false)
      .not("composition_key", "is", null);
    if (error) throw new Error(error.message);
    type Row = {
      id: number;
      name: string;
      manufacturer: string | null;
      composition_key: string;
      composition_complete: boolean;
      brand_ingredients: {
        strength_value: number;
        strength_unit: string;
        salts: { display_name: string };
      }[];
    };
    for (const row of (data as unknown as Row[]).sort((a, b) => a.id - b.id)) {
      if (pool.size >= SIMULATED || pool.has(row.name)) continue;
      pool.set(row.name, {
        id: row.id,
        name: row.name,
        manufacturer: row.manufacturer,
        form: null,
        release: null,
        packSize: null,
        packUnit: null,
        mrp2022: null,
        compositionKey: row.composition_key,
        compositionComplete: row.composition_complete,
        discontinued: false,
        ingredients: [],
        score: 1,
        trueIngredients: row.brand_ingredients.map((i) => ({
          salt: i.salts.display_name,
          value: Number(i.strength_value),
          unit: i.strength_unit,
        })),
      });
    }
  }
  return [...pool.values()];
}

function photoCases(): Case[] {
  const labels = JSON.parse(readFileSync(join(EVAL_DIR, "labels.json"), "utf8")) as Label[];
  return labels
    .filter((l) => l.matchBrand !== undefined && (l.split !== "test" || final))
    .map((l) => ({
      id: l.id,
      kind: "photo" as const,
      split: l.split === "test" ? ("test" as const) : ("dev" as const),
      // What the user would confirm on the confirm screen: the labelled values.
      input: {
        brand: l.brand || null,
        ingredients: l.ingredients ? (extractIngredients(l.ingredients)?.value ?? null) : null,
        form: null,
        manufacturer: null,
        releases: findReleases(l.brand),
      },
      truth: l.matchBrand ? { name: l.matchBrand, compositionKey: null } : null,
    }));
}

// ------------------------------------------------------------------ candidates (cached)

const cache: Record<string, BrandCandidate[]> = existsSync(CACHE)
  ? JSON.parse(readFileSync(CACHE, "utf8"))
  : {};

const failures: string[] = [];

async function candidatesFor(cases: Case[]): Promise<Map<Case, BrandCandidate[]>> {
  const todo = [...new Set(cases.map((c) => c.input.brand).filter((b): b is string => !!b))].filter(
    (b) => !(b in cache),
  );
  // 4 requests at a time: polite to the free database, and fast enough.
  for (let i = 0; i < todo.length; i += 4) {
    await Promise.all(
      todo.slice(i, i + 4).map(async (b) => {
        try {
          cache[b] = await findCandidates(db, b);
        } catch (e) {
          // Reported, not hidden: a failed search would mean "no answer" in the app too.
          failures.push(`${b}: ${(e as Error).message}`);
        }
      }),
    );
    if (i % 100 === 0) process.stdout.write(`  candidates ${i}/${todo.length}\r`);
  }
  mkdirSync(join(EVAL_DIR, ".cache"), { recursive: true });
  writeFileSync(CACHE, JSON.stringify(cache));
  return new Map(
    cases.map((c) => {
      const all = (c.input.brand && cache[c.input.brand]) || [];
      return [c, c.hide ? all.filter((b) => identity(b.name) !== c.hide) : all];
    }),
  );
}

// ------------------------------------------------------------------ metrics

type Outcome = { c: Case; d: Decision<BrandCandidate> };
const isTruth = (c: Case, b: BrandCandidate) =>
  !!c.truth && identity(b.name) === identity(c.truth.name);

type Strategy = (c: Case, candidates: BrandCandidate[]) => Decision<BrandCandidate>;

/** "Answered" = the app would show this medicine and its generic without asking. */
function summarize(outcomes: Outcome[]) {
  const pos = outcomes.filter((o) => o.c.truth);
  const neg = outcomes.filter((o) => !o.c.truth);
  const answered = outcomes.filter((o) => o.d.status === "match");
  const wrong = answered.filter((o) => o.d.status === "match" && !isTruth(o.c, o.d.best.candidate));
  // Wrong brand but the same composition still gives the right generic.
  const wrongGeneric = wrong.filter((o) => {
    const rightKey = o.c.truth?.compositionKey ?? o.c.hiddenKey;
    return o.d.status !== "match" || !rightKey || o.d.best.candidate.compositionKey !== rightKey;
  });
  const top = (k: number) =>
    pos.filter((o) => o.d.ranked.slice(0, k).some((r) => isTruth(o.c, r.candidate))).length;
  return {
    cases: outcomes.length,
    inDataset: pos.length,
    top1: pos.length ? top(1) / pos.length : null,
    top3: pos.length ? top(3) / pos.length : null,
    answered: answered.length / outcomes.length,
    abstained: 1 - answered.length / outcomes.length,
    // The brief's "abstain <= 20%" is about medicines we could have answered.
    abstainedInDataset: pos.length
      ? pos.filter((o) => o.d.status !== "match").length / pos.length
      : null,
    wrongOfAnswered: answered.length ? wrong.length / answered.length : 0,
    wrongGenericOfAnswered: answered.length ? wrongGeneric.length / answered.length : 0,
    notInDatasetAnswered: neg.length
      ? neg.filter((o) => o.d.status === "match").length / neg.length
      : null,
    wrongCases: wrong.map((o) => o.c.id),
    // Why in-dataset strips were not answered correctly.
    misses: {
      notFound: pos.filter((o) => !o.d.ranked.some((r) => isTruth(o.c, r.candidate))).length,
      rankedLower: pos.filter(
        (o) =>
          o.d.ranked.length &&
          !isTruth(o.c, o.d.ranked[0].candidate) &&
          o.d.ranked.some((r) => isTruth(o.c, r.candidate)),
      ).length,
      unsureSibling: pos.filter(
        (o) =>
          o.d.status !== "match" &&
          o.d.ranked.length > 1 &&
          isTruth(o.c, o.d.ranked[0].candidate) &&
          o.d.ranked
            .slice(1)
            .some((r) => coreName(r.candidate.name) === coreName(o.d.ranked[0].candidate.name)),
      ).length,
      unsureOther: pos.filter(
        (o) =>
          o.d.status !== "match" &&
          o.d.ranked.length > 0 &&
          isTruth(o.c, o.d.ranked[0].candidate) &&
          !o.d.ranked
            .slice(1)
            .some((r) => coreName(r.candidate.name) === coreName(o.d.ranked[0].candidate.name)),
      ).length,
    },
  };
}

const run = (cases: Case[], cands: Map<Case, BrandCandidate[]>, strategy: Strategy): Outcome[] =>
  cases.map((c) => ({ c, d: strategy(c, cands.get(c) ?? []) }));

/** Always answer with the top of the list (no abstention). */
const alwaysAnswer = (d: Decision<BrandCandidate>): Decision<BrandCandidate> =>
  d.ranked.length
    ? { status: "match", best: d.ranked[0], confidence: d.confidence, ranked: d.ranked }
    : d;

function baselines(w: Weights): [string, Strategy][] {
  return [
    [
      "Exact name only (no fuzzy matching)",
      (c, cands) => {
        const d = decide(c.input, cands, { ...w, threshold: 2 });
        const exact = d.ranked.find(
          (r) => identity(r.candidate.name) === identity(c.input.brand ?? ""),
        );
        // Only the exact hit is ranked: this baseline has no notion of "close".
        return exact
          ? { status: "match", best: exact, confidence: 1, ranked: [exact] }
          : { ...d, ranked: [] };
      },
    ],
    [
      "Trigram search only (no re-ranking, no abstention)",
      (c, cands) => {
        const d = decide(c.input, cands, w);
        const ranked = [...d.ranked].sort((a, b) => b.candidate.score - a.candidate.score);
        return alwaysAnswer({ ...d, ranked });
      },
    ],
    ["Re-ranking, no abstention", (c, cands) => alwaysAnswer(decide(c.input, cands, w))],
    ["DawaCheck (re-ranking + abstention)", (c, cands) => decide(c.input, cands, w)],
  ];
}

// ------------------------------------------------------------------ main

const pct = (x: number | null) => (x === null ? "—" : `${(x * 100).toFixed(1)}%`);

async function main() {
  console.log("Sampling brands…");
  const pool = await samplePool();
  const simulated: Case[] = pool.map((b) => {
    const hidden = chance(NOT_IN_DATASET);
    return {
      id: `sim-${b.id}`,
      kind: "simulated",
      split: b.id % 4 === 0 ? "test" : "dev",
      input: simulateReading(b),
      truth: hidden ? null : { name: b.name, compositionKey: b.compositionKey },
      hide: hidden ? identity(b.name) : undefined,
      hiddenKey: hidden ? b.compositionKey : undefined,
    };
  });
  const photos = photoCases();
  const cands = await candidatesFor([...simulated, ...photos]);
  const dev = simulated.filter((c) => c.split === "dev");
  const test = simulated.filter((c) => c.split === "test");

  let w: Weights = WEIGHTS;
  if (fit) {
    // One example per strip: its candidates, and which one is right. If the right brand is not
    // among them (not in the dataset, or the search missed it), the right answer is "none".
    const examples = dev.map((c) => {
      const { ranked } = decide(c.input, cands.get(c) ?? [], w);
      const truth = ranked.findIndex((r) => isTruth(c, r.candidate));
      return { candidates: ranked.map((r) => r.features), truth: truth >= 0 ? truth : null };
    });
    const fitted = fitChoiceModel(examples);
    // Threshold: the lowest (answers the most) whose wrong-match rate on dev is within target.
    let threshold = 0.95;
    for (let t = 0.3; t <= 0.951; t += 0.05) {
      const s = summarize(
        run(dev, cands, (c, cs) => decide(c.input, cs, { ...fitted, threshold: t })),
      );
      if (s.wrongOfAnswered <= MAX_WRONG) {
        threshold = Number(t.toFixed(2));
        break;
      }
    }
    w = { ...fitted, threshold };
    const rounded = Object.fromEntries(
      Object.entries(w).map(([k, v]) => [k, Number(v.toFixed(3))]),
    ) as Weights;
    writeFileSync(WEIGHTS_FILE, `${JSON.stringify(rounded, null, 2)}\n`);
    w = rounded;
    console.log(`Fitted on ${dev.length} dev cases:`, w);
  }

  // DEBUG_MATCH=wrong | notfound | unsure prints simulated cases of that kind, to see why.
  const debug = process.env.DEBUG_MATCH;
  for (const c of debug ? simulated : []) {
    const d = decide(c.input, cands.get(c) ?? [], w);
    const top = d.ranked[0];
    const found = d.ranked.some((r) => isTruth(c, r.candidate));
    const show =
      (debug === "wrong" && d.status === "match" && !isTruth(c, d.best.candidate)) ||
      (debug === "notfound" && c.truth && !found) ||
      (debug === "unsure" && c.truth && top && d.status !== "match" && isTruth(c, top.candidate));
    if (!show) continue;
    const truth = c.truth?.name ?? `(hidden) ${pool.find((b) => `sim-${b.id}` === c.id)?.name}`;
    console.log(
      `${c.split} ${JSON.stringify(c.input.brand)} truth: ${truth} | ${d.status}${d.status === "abstain" ? ` (${d.reason})` : ""}`,
      d.ranked
        .slice(0, 2)
        .map((r) => `${r.candidate.name} ${r.probability.toFixed(2)} ${JSON.stringify(r.features)}`)
        .join(" | "),
    );
  }

  const sets: [string, Case[]][] = [
    ["Simulated, dev (weights and threshold chosen here)", dev],
    ["Simulated, test (never used for fitting)", test],
    [
      "Labelled photos, dev (values as confirmed by the user)",
      photos.filter((c) => c.split === "dev"),
    ],
  ];
  if (final)
    sets.push(["Labelled photos, TEST (frozen)", photos.filter((c) => c.split === "test")]);

  const results = sets.map(([name, cases]) => ({
    name,
    rows: baselines(w).map(([label, strategy]) => ({
      label,
      ...summarize(run(cases, cands, strategy)),
    })),
  }));

  // Calibration on simulated test: does "80% sure" mean right 80% of the time?
  const bins = [0, 0.25, 0.5, 0.75, 0.9, 1.0001];
  const testOutcomes = run(test, cands, (c, cs) => decide(c.input, cs, w));
  const calibration = bins.slice(0, -1).map((lo, i) => {
    const inBin = testOutcomes.filter(
      (o) => o.d.ranked.length && o.d.confidence >= lo && o.d.confidence < bins[i + 1],
    );
    const right = inBin.filter((o) => isTruth(o.c, o.d.ranked[0].candidate)).length;
    return {
      range: `${lo.toFixed(2)}–${Math.min(1, bins[i + 1]).toFixed(2)}`,
      n: inBin.length,
      right: inBin.length ? right / inBin.length : null,
    };
  });

  const photoDetail = photos.map((c) => {
    const d = decide(c.input, cands.get(c) ?? [], w);
    return {
      id: c.id,
      read: c.input.brand,
      expected: c.truth?.name ?? "(abstain: not in dataset)",
      got: d.status === "match" ? d.best.candidate.name : `abstain (${d.reason})`,
      confidence: d.confidence,
      ok: d.status === "match" ? isTruth(c, d.best.candidate) : !c.truth,
      options: d.ranked.slice(0, 3).map((r) => r.candidate.name),
    };
  });

  const md = [
    "# Matching evaluation (M4)",
    "",
    `Written by \`pnpm eval:match${fit ? " --fit" : ""}${final ? " --final" : ""}\` on ${new Date().toISOString().slice(0, 10)}.`,
    "",
    "**Answered** = the app shows a medicine without asking. **Wrong** = an answered medicine that",
    'is not the one on the strip (for "not in dataset" cases, any answer is wrong).',
    "**Wrong generic** = wrong answers that would also give a different generic (a wrong brand with",
    "the same composition still gives the right generic). Top-1 / top-3 are over in-dataset cases.",
    "Targets from the brief: top-1 ≥ 85%, top-3 ≥ 95%, wrong ≤ 2% of answers, abstain ≤ 20%.",
    "",
    `Weights: ${FEATURES.map((k) => `${k} ${w[k]}`).join(", ")}, bias ${w.bias}; threshold ${w.threshold}.`,
    "",
    ...results.flatMap(({ name, rows }) => [
      `## ${name}`,
      "",
      `${rows[0].cases} cases, ${rows[0].inDataset} in the dataset.`,
      "",
      "| Method | Top-1 | Top-3 | Answered | Wrong (of answered) | Wrong generic | Abstained, in dataset | Not-in-dataset answered |",
      "| --- | --- | --- | --- | --- | --- | --- | --- |",
      ...rows.map(
        (r) =>
          `| ${r.label} | ${pct(r.top1)} | ${pct(r.top3)} | ${pct(r.answered)} | ${pct(r.wrongOfAnswered)} | ${pct(r.wrongGenericOfAnswered)} | ${pct(r.abstainedInDataset)} | ${pct(r.notInDatasetAnswered)} |`,
      ),
      "",
      (({ misses: m }) =>
        `DawaCheck on in-dataset strips it did not answer correctly: right brand not found by the search ${m.notFound}; found but ranked below another ${m.rankedLower}; ranked first but not sure enough, because a same-name brand with another strength is also possible ${m.unsureSibling}, for other reasons ${m.unsureOther}.`)(
        rows.at(-1)!,
      ),
      "",
    ]),
    ...(failures.length
      ? ["## Searches that failed", "", ...failures.map((f) => `- ${f}`), ""]
      : []),
    "## Calibration (simulated test)",
    "",
    "| Confidence | Cases | Top choice right |",
    "| --- | --- | --- |",
    ...calibration.map((b) => `| ${b.range} | ${b.n} | ${pct(b.right)} |`),
    "",
    "## Each labelled photo",
    "",
    "| Photo | Name confirmed | Expected | DawaCheck | Confidence | OK | Options offered |",
    "| --- | --- | --- | --- | --- | --- | --- |",
    ...photoDetail.map(
      (p) =>
        `| ${p.id} | ${p.read ?? "—"} | ${p.expected} | ${p.got} | ${pct(p.confidence)} | ${p.ok ? "yes" : "**no**"} | ${p.options.join("; ")} |`,
    ),
    "",
  ].join("\n");

  writeFileSync(join(EVAL_DIR, "match-results.md"), md);
  writeFileSync(
    join(EVAL_DIR, "match-results.json"),
    `${JSON.stringify({ weights: w, results, calibration, photos: photoDetail }, null, 2)}\n`,
  );
  console.log(md);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
