// Normalization for Stage 4 (matching), mirroring pipeline/dawacheck_pipeline/normalize.py.
//
// The database was normalized by the Python pipeline; text read from a strip must be normalized
// the same way before the two can be compared. The rules come from the same file
// (synonyms.yaml, copied to salt-rules.json by pipeline/dawacheck_pipeline/export_rules.py).

import rules from "./salt-rules.json";

const synonyms: Record<string, string> = rules.synonyms;
const suffixes = new Set(rules.strip_suffixes);
const protectedPrefixes = rules.protect_prefixes;

/** "Metformin Hydrochloride IP" -> "metformin"; "Amoxycillin" -> "amoxicillin". Same as Python. */
export function normalizeSalt(name: string): string {
  let s = name
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\bvitamin-/g, "vitamin ")
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  s = synonyms[s] ?? s;
  if (!protectedPrefixes.some((prefix) => s.startsWith(prefix))) {
    const words = s.split(" ");
    // Remove suffix words from the end, but never the first word.
    while (words.length > 1 && suffixes.has(words.at(-1)!)) words.pop();
    s = words.join(" ");
  }
  return synonyms[s] ?? s;
}

export type KeyIngredient = { salt: string; value: number; unit: string };
export type Composition = { ingredients: KeyIngredient[]; form: string; release: string };

/** "aceclofenac:100:mg|thiocolchicoside:4:mg#tablet#er" -> its parts. */
export function parseCompositionKey(key: string): Composition | null {
  const [salts, form, release] = key.split("#");
  if (!salts || !form) return null;
  const ingredients = salts.split("|").map((part) => {
    const [salt, value, unit] = part.split(":");
    return { salt, value: Number(value), unit };
  });
  if (ingredients.some((i) => !i.salt || !Number.isFinite(i.value))) return null;
  return { ingredients, form, release: release || "ir" };
}

// ------------------------------------------------------------------ release words

// Whole words only ("er" must not match inside "water"); a space also matches a hyphen.
const phrasePattern = (phrase: string) =>
  new RegExp(
    `(?<![a-z])${phrase
      .split(" ")
      .map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
      .join("[\\s-]+")}(?![a-z])`,
    "i",
  );

const RELEASE_PHRASES = Object.entries(rules.releases).flatMap(([code, phrases]) =>
  phrases.map((phrase) => ({ code, phrase, pattern: phrasePattern(phrase) })),
);

/**
 * Release types named in a piece of text: "Neorelax MR" -> ["er"].
 * `strict`: only long, unmistakable phrases ("sustained release", "dispersible"). Used on the
 * whole OCR text of a strip, where a stray "PR" or "MD" is more likely noise than a release type.
 */
export function findReleases(text: string, strict = false): string[] {
  const found = new Set<string>();
  for (const { code, phrase, pattern } of RELEASE_PHRASES) {
    if (strict && !phrase.includes(" ") && phrase.length < 6) continue;
    if (pattern.test(text)) found.add(code);
  }
  return [...found].sort();
}

// ------------------------------------------------------------------ brand names

const FORM_WORDS = new Set([
  ...Object.values(rules.forms).flatMap((phrases) => phrases.flatMap((p) => p.split(/[\s/]/))),
  "mg",
  "mcg",
  "ml",
  "gm",
  "iu",
]);

const UNIT = String.raw`(?:mg|rng|mcg|ml|gm?|iu)`;
// A strength, allowing OCR letters for digits: "40mg", "1oMG", "s0mg".
const STRENGTH_TOKEN = new RegExp(
  String.raw`^[0-9OoQDlI|iSsBZG.]*\d[0-9OoQDlI|iSsBZG.]*(?:${UNIT}|%)?$`,
  "i",
);

const tokens = (name: string) =>
  name
    .normalize("NFKC")
    .toLowerCase()
    // "sertima25mg" -> "sertima 25mg"; "40mgtablet" -> "40mg tablet"
    // (3+ letters first, so an OCR'd strength like "s0mg" is not split into "s 0mg")
    .replace(new RegExp(String.raw`([a-z]{3,})(\d+(?:\.\d+)?${UNIT}\b)`, "g"), "$1 $2")
    .replace(new RegExp(String.raw`(\d${UNIT})([a-z])`, "g"), "$1 $2")
    .replace(/[^a-z0-9.%]+/g, " ")
    .split(" ")
    .filter(Boolean);

// Printed on many strips but not part of the brand: the prescription sign and trademark marks.
const NOT_NAME = new Set(["rx", "tm"]);
const LONG_FORM_WORDS = [...FORM_WORDS].filter((w) => w.length >= 5);

/** "tablef", "casule", "srup": a form word with an OCR slip in it. */
const nearFormWord = (t: string) =>
  t.length >= 4 && LONG_FORM_WORDS.some((w) => similarity(t, w) >= 0.75);

/**
 * The part of a brand name that identifies it: "Telma 40 Tablet" -> "telma",
 * "Neorelax MR 8 Tablet" -> "neorelax mr". Form words and strengths are removed (they are
 * compared separately); release words like "MR" or "SR" stay, because they are part of the brand.
 */
export function coreName(name: string): string {
  return tokens(name)
    .filter(
      (t) =>
        !FORM_WORDS.has(t) &&
        !NOT_NAME.has(t) &&
        !/^e{2,}$/.test(t) && // "ee": OCR reading the edge of the foil as letters
        !/^\d/.test(t) &&
        !(STRENGTH_TOKEN.test(t) && /[a-z]$/.test(t) && /\d/.test(t)) &&
        !nearFormWord(t),
    )
    .join(" ")
    .replace(/[.%/]/g, "")
    .trim();
}

// Characters Tesseract confuses with each other (seen on the M3 photos). Mapping each group to
// one letter means "TE1MA" and "Telma" compare as equal, while a really different letter still
// counts as a difference.
const LOOK_ALIKE: [RegExp, string][] = [
  [/rn/g, "m"],
  [/cl/g, "d"],
  [/vv/g, "w"],
  [/[0q]/g, "o"],
  [/[1i|!]/g, "l"],
  [/5/g, "s"],
  [/8/g, "b"],
];

/** Merge look-alike characters: "te1rna" -> "telma". */
export function lookAlike(text: string): string {
  return LOOK_ALIKE.reduce((t, [re, letter]) => t.replace(re, letter), text);
}

/** For comparing names: core name, without spaces or hyphens, look-alike characters merged. */
export function nameKey(name: string): string {
  return lookAlike(coreName(name).replace(/[\s-]/g, ""));
}

/** How alike two brand names are, 0–1, forgiving of the usual OCR mistakes. */
export function nameSimilarity(read: string, candidate: string): number {
  return similarity(nameKey(read), nameKey(candidate));
}

const OCR_DIGITS: Record<string, string> = {
  o: "0",
  q: "0",
  d: "0",
  l: "1",
  i: "1",
  "|": "1",
  s: "5",
  b: "8",
  z: "2",
  g: "6",
};

/**
 * Numbers printed in a name: "Augmentin 625 Duo" -> [625]; "Suhagra-100" -> [100].
 * Only strengths count: tokens that start with a digit ("40", "40mg"), or OCR letters in front
 * of a unit ("1oMG" -> 10, "s0mg" -> 50). Digits stuck inside a word ("Opan0", "B12") are not
 * strengths. Zero is never a strength (it is a misread digit).
 */
export function nameNumbers(name: string): number[] {
  const numbers: number[] = [];
  for (const token of tokens(name)) {
    const strength = new RegExp(`^([0-9oqdli|sbzg.]+?)(?:${UNIT}|%)$`).exec(token)?.[1];
    const raw = strength ?? (/^\d/.test(token) ? /^\d+(?:\.\d+)?/.exec(token)?.[0] : undefined);
    if (!raw || !/\d/.test(raw)) continue;
    const value = Number(raw.replace(/[a-z|]/g, (c) => OCR_DIGITS[c] ?? c));
    if (Number.isFinite(value) && value > 0) numbers.push(value);
  }
  return numbers;
}

const MAKER_NOISE =
  /\b(m s|ltd|limited|pvt|private|pharma|pharmaceuticals?|laboratories|labs?|healthcare|india|inc|llp|co|and)\b/g;
const makerCore = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z\s]/g, " ")
    .replace(/\s+/g, " ")
    .replace(MAKER_NOISE, " ")
    .replace(/\s+/g, " ")
    .trim();

/**
 * Same manufacturer? "Meyer Organics Pvt Ltd" = "MEYER ORGANICS PVT. LTD.". Containment counts,
 * because alerts add the factory address: "M/s. Uniza Lifecare Pvt. Ltd., Sr. No. 919/7, ...".
 */
export function sameMaker(a: string, b: string): boolean {
  const [x, y] = [makerCore(a), makerCore(b)];
  if (x.length < 3 || y.length < 3) return false;
  return x.includes(y) || y.includes(x) || similarity(x, y) >= 0.6;
}

/** Edit distance: how many letters must be added, removed or changed to turn a into b. */
export function levenshtein(a: string, b: string): number {
  let previous = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++) {
      current[j] = Math.min(
        previous[j] + 1,
        current[j - 1] + 1,
        previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    previous = current;
  }
  return previous[b.length];
}

/** 1 = identical, 0 = nothing in common (edit distance scaled by the longer string). */
export function similarity(a: string, b: string): number {
  if (!a && !b) return 1;
  return 1 - levenshtein(a, b) / Math.max(a.length, b.length);
}
