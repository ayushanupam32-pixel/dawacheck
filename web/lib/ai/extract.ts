// Stage 3 of the AI core: turn raw OCR text from a medicine strip into structured fields.
//
// Rules + scoring, no machine learning: every rule is a small regular expression that can be
// explained and unit-tested (tests/extract.test.ts runs it on 100+ OCR-style snippets).
// Each field gets a confidence in [0, 1]; low-confidence fields are highlighted on the confirm
// screen so the user checks them. A field we can't read is null, never a guess.

export type Field<T> = { value: T; confidence: number } | null;

export type Ingredient = { salt: string; value: number; unit: string };

export type ExtractedFields = {
  brand: Field<string>;
  ingredients: Field<Ingredient[]>;
  form: Field<string>;
  mrp: Field<number>;
  packSize: Field<number>;
  batchNo: Field<string>;
  mfgDate: Field<string>; // "YYYY-MM"
  expDate: Field<string>; // "YYYY-MM"
  manufacturer: Field<string>;
};

/** Optional OCR word boxes, used to find the brand (usually the biggest text on the front). */
export type OcrLine = { text: string; height: number; confidence: number };

// ------------------------------------------------------------------ text clean-up

/** Normalize OCR text: unify spaces, dashes, rupee signs and quotes; keep line breaks. */
export function cleanOcrText(text: string): string {
  return text
    .normalize("NFKC")
    .replace(/[‐-―]/g, "-")
    .replace(/[‘’`]/g, "'")
    .replace(/(?:₹|\bRs\b\.?|\bINR\b)/gi, " Rs. ")
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .trim();
}

/**
 * Fix the usual OCR letter/digit swaps inside something that should be a number:
 * O/o/Q/D → 0, l/L/I/|/i → 1, S/s → 5, B → 8, Z → 2, G → 6. Only call this on a token we already
 * know is numeric (after "MRP", in a date), never on a whole line.
 */
export function fixDigits(token: string): string {
  return token
    .replace(/[OoQD]/g, "0")
    .replace(/[lLI|i]/g, "1")
    .replace(/[Ss]/g, "5")
    .replace(/B/g, "8")
    .replace(/Z/g, "2")
    .replace(/G/g, "6");
}

// Characters OCR produces where a digit was printed.
const DIGITISH = "[0-9OoQDlI|iSsBZG]";

// ------------------------------------------------------------------ MRP and pack size

const MRP_RE = new RegExp(
  // "M.R.P.", "MRP", "M R P", "Max. Retail Price"; then optional "Rs." / ":" / "incl..." text
  String.raw`(?:M\s*\.?\s*R\s*\.?\s*P\s*\.?|Max(?:imum)?\.?\s*Retail\s*Price)` +
    String.raw`[^0-9A-Za-z]{0,6}(?:\(?\s*incl[^)\n]{0,30}\)?)?[^0-9]{0,8}?(?:Rs\.?\s*)?` +
    `(${DIGITISH}{1,5}(?:[.,]\\s?${DIGITISH}{1,2})?)\\s*(?:/-)?`,
  "i",
);

const PRICE_ONLY_RE = new RegExp(
  `Rs\\.\\s*(${DIGITISH}{1,5}(?:[.,]${DIGITISH}{1,2})?)\\s*(?:/-)?`,
  "i",
);

// "M.R.P. FOR 10 TABS. Rs.33-00" (common on Indian strips): the first number after "MRP" is the
// tablet count, not the price. Read the count as pack size and the number after "Rs." as MRP.
// The decimal point is sometimes printed as a dash ("33-00").
const MRP_FOR_RE = new RegExp(
  String.raw`M\s*\.?\s*R\s*\.?\s*P\s*\.?\s*(?:for|per)\s*(\d{1,3})\s*(?:tabs?|tablets?|caps?|capsules?)\.?` +
    // "Rs." is required here: without it, "MRPFOR6TABS.\n4XP.DEC" gave a price of ₹4.
    String.raw`\s*Rs\.?\s*(${DIGITISH}{1,5}(?:[.,\-]${DIGITISH}{2})?)`,
  "i",
);

export function parsePrice(raw: string): number | null {
  const fixed = fixDigits(raw.replace(/\s/g, ""))
    .replace(/-(?=\d{2}$)/, ".") // "33-00" -> "33.00"
    .replace(",", ".");
  const value = Number(fixed);
  // Indian strip MRPs: from ₹0.50 to a few thousand. Anything else is a misread.
  return Number.isFinite(value) && value >= 0.5 && value <= 20000 ? value : null;
}

export function extractMrp(text: string): Field<number> {
  // "1,245.00" matches only as "1,24" (the comma looks like a decimal point). If digits continue
  // straight after what we read, the number was cut: refuse rather than report ₹1.24. Letters
  // straight after it ("Rs. 5TABS", real OCR output) mean it was never a price.
  const continues = (m: RegExpExecArray) => {
    const numberEnd = m.index + m[0].lastIndexOf(m.at(-1)!) + m.at(-1)!.length;
    return (
      /^[.,]?\d/.test(text.slice(m.index + m[0].length)) || /^[A-Za-z]/.test(text.slice(numberEnd))
    );
  };

  const perPack = MRP_FOR_RE.exec(text);
  if (perPack && !continues(perPack)) {
    const value = parsePrice(perPack[2]);
    if (value !== null) return { value, confidence: 0.9 };
  }
  const labelled = MRP_RE.exec(text);
  if (labelled && continues(labelled)) return null;
  if (labelled) {
    const value = parsePrice(labelled[1]);
    if (value !== null) {
      const hasDecimals = /[.,]\s?\S{2}$/.test(labelled[1]);
      const hadSwaps = /[^0-9.,\s]/.test(labelled[1]);
      return { value, confidence: hadSwaps ? 0.7 : hasDecimals ? 0.95 : 0.85 };
    }
  }
  // "Rs. 125.00" without an MRP label: could be MRP or something else, so lower confidence.
  const bare = PRICE_ONLY_RE.exec(text);
  // Without an MRP label nearby, only trust a price that starts with a real digit: "Rs. Sm" from
  // a garbled reading must not become ₹5 through the S -> 5 fix.
  const value = bare && /^\d/.test(bare[1]) && !continues(bare) ? parsePrice(bare[1]) : null;
  return value !== null ? { value, confidence: 0.5 } : null;
}

const PACK_RES = [
  // "strip of 10 tablets", "pack of 15 capsules", "10 x 10 tablets" (the first number is strips)
  /\b(?:strip|pack|blister|box)\s+of\s+(\d{1,3})\b/i,
  // "M.R.P. FOR 10 TABS.", "Rs.1400.00 (10 TABS)": the price is for this many
  /(?:\bfor|\bper|\()\s*(\d{1,3})\s*(?:tabs?|tablets?|caps?|capsules?)\b/i,
  /\b\d{1,3}\s*[xX×]\s*(\d{1,3})\s*(?:tablets?|tabs?|capsules?|caps?)\b/i,
  /\b(\d{1,3})\s*(?:tablets?|tabs?|capsules?|caps?)\b(?!\s*(?:contains|IP|BP|USP))/i,
  /\b(\d{1,3})\s*['’]s\b/i, // "10's"
];

export function extractPackSize(text: string): Field<number> {
  for (const [i, re] of PACK_RES.entries()) {
    const m = re.exec(text);
    if (!m) continue;
    const n = Number(m[1]);
    if (n >= 1 && n <= 200) return { value: n, confidence: i < 3 ? 0.9 : 0.6 };
  }
  return null;
}

// ------------------------------------------------------------------ batch number

// "B.No.", "B. No", "Batch No.", "Batch", "Lot No.", "LOT", "B.N." followed by the code.
// OCR sometimes reads the dot in "B.No." as an R ("BR. No.", seen on a real strip).
const BATCH_LABEL = String.raw`(?:B\s*[R.]?\s*\.?\s*No\s*\.?|B\s*\.\s*N\s*\.?|Batch\s*(?:No\.?|Number)?|Lot\s*(?:No\.?)?)`;
const BATCH_RE = new RegExp(`${BATCH_LABEL}\\s*[:.\\-]?\\s*([A-Z0-9][A-Z0-9\\-/ ]{2,18})`, "i");
// Words that often follow a batch code on the same line and must not be glued onto it.
const BATCH_STOP = /\s+(?:MFG|MFD|MANUF|EXP|USE|M\.?R\.?P|DATE|D\.?O\.?M|RS)\b.*$/i;

/** "2a4-k 19" -> "2A4K19": uppercase, no spaces, dashes or slashes. */
export function normalizeBatch(batch: string): string {
  return batch.toUpperCase().replace(/[\s\-/]/g, "");
}

export function extractBatch(text: string): Field<string> {
  for (const line of text.split("\n")) {
    const m = BATCH_RE.exec(line);
    if (!m) continue;
    // "FCR 004 ii": OCR noise after the code. Keep the first word, then only following words
    // that contain a digit ("3001 2345" is one code printed with a space).
    const [first, ...rest] = m[1].replace(BATCH_STOP, "").trim().split(/\s+/);
    const kept = [first];
    for (const word of rest) {
      if (!/\d/.test(word)) break;
      kept.push(word);
    }
    const value = normalizeBatch(kept.join(""));
    // A real batch code is 4-15 characters and has at least one digit ("BATCH" alone is not one).
    if (value.length < 4 || value.length > 15 || !/\d/.test(value)) continue;
    // Letters that look like digits (O vs 0) can't be fixed here: batch codes mix both.
    // So an ambiguous character lowers confidence, and checkBatch treats it as "unknown".
    const ambiguous = /[O0][A-Z]|[A-Z][O0]|[I1L]/.test(value);
    return { value, confidence: ambiguous ? 0.6 : 0.85 };
  }
  return null;
}

// ------------------------------------------------------------------ dates

const MONTHS: Record<string, number> = {
  JAN: 1,
  FEB: 2,
  MAR: 3,
  APR: 4,
  MAY: 5,
  JUN: 6,
  JUL: 7,
  AUG: 8,
  SEP: 9,
  SEPT: 9,
  OCT: 10,
  NOV: 11,
  DEC: 12,
};

const MFG_LABEL = String.raw`(?:M(?:fg|fd|anuf(?:actured)?)\.?\s*(?:Date|Dt|On)?\.?|D\.?\s*O\.?\s*M\.?|M\.\s*D\.?)`;
const EXP_LABEL = String.raw`(?:Exp(?:iry)?\.?\s*(?:Date|Dt)?\.?|E\.\s*D\.?|Use\s*before|Best\s*before)`;
const DATE_VALUE = String.raw`([A-Za-z]{3,4}\.?\s*[-/.,]?\s*(?:${DIGITISH}{2}){1,2}|${DIGITISH}{1,2}\s*[-/.]\s*(?:${DIGITISH}{1,2}\s*[-/.]\s*)?(?:${DIGITISH}{2}){1,2})`;

/** "08/2027", "Aug. 2027", "AUG-27", "12/08/2027", "O8/2O27" -> "2027-08"; null if invalid. */
export function parseMonthYear(raw: string): string | null {
  const s = raw.trim().toUpperCase().replace(/\s+/g, " ");
  let month: number | undefined;
  let year: number | undefined;

  const named = /^([A-Z]{3,4})\.?\s*[-/.,]?\s*(\S+)$/.exec(s); // "NOV, 12" seen on a real strip
  if (named && MONTHS[named[1]] !== undefined) {
    month = MONTHS[named[1]];
    year = Number(fixDigits(named[2]));
  } else {
    const parts = s.split(/\s*[-/.]\s*/).map((p) => Number(fixDigits(p)));
    if (parts.some((p) => !Number.isFinite(p))) return null;
    if (parts.length === 2) [month, year] = parts;
    else if (parts.length === 3) [, month, year] = parts; // DD/MM/YYYY
  }
  if (month === undefined || year === undefined || !Number.isInteger(month)) return null;
  if (year < 100) year += 2000;
  if (month < 1 || month > 12 || year < 2000 || year > 2045) return null;
  return `${year}-${String(month).padStart(2, "0")}`;
}

function findDate(text: string, label: string): string | null {
  const re = new RegExp(`${label}\\s*[:.\\-]?\\s*${DATE_VALUE}`, "gi");
  for (const m of text.matchAll(re)) {
    const parsed = parseMonthYear(m[1]);
    if (parsed) return parsed;
  }
  return null;
}

export function extractDates(text: string): { mfgDate: Field<string>; expDate: Field<string> } {
  const mfg = findDate(text, MFG_LABEL);
  const exp = findDate(text, EXP_LABEL);
  if (mfg && exp) {
    // Expiry must be after manufacture and at most 6 years later; otherwise one is misread.
    const months = (d: string) => Number(d.slice(0, 4)) * 12 + Number(d.slice(5, 7));
    const gap = months(exp) - months(mfg);
    const consistent = gap > 0 && gap <= 72;
    const confidence = consistent ? 0.9 : 0.4;
    return { mfgDate: { value: mfg, confidence }, expDate: { value: exp, confidence } };
  }
  return {
    mfgDate: mfg ? { value: mfg, confidence: 0.75 } : null,
    expDate: exp ? { value: exp, confidence: 0.75 } : null,
  };
}

// ------------------------------------------------------------------ composition

const STRENGTH = String.raw`(\d+(?:\.\d+)?)\s*(mg|mcg|µg|g|gm|IU|I\.U\.|%\s*w\/[wv]|%)(?:\s*(?:\/|per)\s*(\d+(?:\.\d+)?)?\s*(ml|g))?`;
const INGREDIENT_RE = new RegExp(
  // Name (letters, spaces, dashes, brackets), then optional IP/BP/USP, then the strength.
  String.raw`([A-Za-z][A-Za-z\-\s()]{2,60}?)\s*(?:I\.?P\.?|B\.?P\.?|U\.?S\.?P\.?|Ph\.?\s*Eur\.?)?\s*` +
    String.raw`(?:eq(?:uivalent|v)?\.?\s*to\s+[A-Za-z\s]{3,40}?)?[:\-]?\s*` +
    STRENGTH,
  "gi",
);
// Lines that list things that are not active ingredients.
const NOT_ACTIVE =
  /\b(colou?rs?|excipients?|q\.?\s*s|flavou?r|preservative|base|sugar|approved|lake)\b/i;
const NAME_NOISE =
  /\b(each|film|coated|uncoated|sugar|enteric|tablet|tablets|capsule|capsules|hard|soft|gelatin|contains?|ml|of|the|and|with|in|form|as|sustained|extended|prolonged|release|delayed|gastro|resistant|dispersible|chewable|oral|suspension|syrup|tablet\s+contains)\b/gi;

function cleanSaltName(raw: string): string {
  return raw
    .replace(/\([^)]*\)/g, " ")
    .replace(NAME_NOISE, " ")
    .replace(/[^A-Za-z\- ]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

const STARTS_WITH_STRENGTH = new RegExp(`^\\s*${STRENGTH}`, "i");

/**
 * "Each film coated tablet contains: Metformin Hydrochloride IP 500 mg, Glimepiride IP 1 mg"
 * -> [{salt: "Metformin Hydrochloride", value: 500, unit: "mg"}, {salt: "Glimepiride", ...}]
 * Mass is reported in mg (500 mcg -> 0.5 mg), like the pipeline's normalize.py.
 */
export function extractIngredients(text: string): Field<Ingredient[]> {
  // Prefer the "contains:" block; fall back to the whole text.
  const containsAt = text.search(/contains?\s*:?/i);
  const block = containsAt >= 0 ? text.slice(containsAt) : text;
  const found: Ingredient[] = [];

  // "Metformin\n500mg Tablets": a name on one line and its strength at the start of the next.
  // Join such pairs first, so the name and its strength are read together.
  const lines = block.split(/\n|;/);
  const joined: string[] = [];
  for (const line of lines) {
    const previous = joined.at(-1);
    if (
      previous !== undefined &&
      !/\d/.test(previous) &&
      /[A-Za-z]{4}/.test(previous) &&
      STARTS_WITH_STRENGTH.test(line)
    ) {
      joined[joined.length - 1] = `${previous} ${line}`;
    } else {
      joined.push(line);
    }
  }

  for (const line of joined) {
    if (NOT_ACTIVE.test(line)) continue;
    for (const m of line
      .replaceAll(/\s+\+\s+|\s*&\s*|\s+and\s+/gi, " , ")
      .matchAll(INGREDIENT_RE)) {
      const salt = cleanSaltName(m[1]);
      if (salt.length < 3 || /^(Rs|Mrp|Batch|Exp|Mfg|Lot)$/i.test(salt)) continue;
      let value = Number(m[2]);
      let unit = m[3].toLowerCase().replace(/\s/g, "");
      if (unit === "µg" || unit === "mcg") [value, unit] = [value / 1000, "mg"];
      else if (unit === "g" || unit === "gm") [value, unit] = [value * 1000, "mg"];
      else if (unit.startsWith("i.u") || unit === "iu") unit = "iu";
      else if (unit.startsWith("%")) unit = "%";
      if (m[5]) {
        const per = Number(m[4] ?? 1);
        [value, unit] = [value / per, `${unit}/${m[5].toLowerCase()}`];
      }
      if (!found.some((f) => f.salt.toLowerCase() === salt.toLowerCase())) {
        found.push({ salt, value: Number(value.toFixed(4)), unit });
      }
    }
    if (found.length >= 6) break;
  }
  if (!found.length) return null;
  return { value: found, confidence: containsAt >= 0 ? 0.85 : 0.6 };
}

// ------------------------------------------------------------------ form, manufacturer, brand

const FORMS: [RegExp, string][] = [
  [/\beye\s*drops?\b/i, "eye_drops"],
  [/\boral\s+suspension\b|\bsuspension\b/i, "suspension"],
  [/\bsyrup\b/i, "syrup"],
  [/\binjection\b|\binj\.?\b/i, "injection"],
  [/\bcapsules?\b|\bcaps?\.?\b/i, "capsule"],
  [/\btablets?\b|\btabs?\.?\b/i, "tablet"],
  [/\bcream\b/i, "cream"],
  [/\bointment\b/i, "ointment"],
  [/\bgel\b/i, "gel"],
  [/\bdrops?\b/i, "drops"],
];

export function extractForm(text: string): Field<string> {
  for (const [re, form] of FORMS) if (re.test(text)) return { value: form, confidence: 0.8 };
  return null;
}

const MAKER_LABEL = String.raw`(?:Manufactured|Mfd\.?|Mktd\.?|Marketed|Mfg\.?)\s*(?:&\s*Marketed\s*)?by\s*:?\s*\n?\s*`;
// Prefer the full legal name ("... Industries Ltd."); fall back to a name ending in "Pharma" etc.
const MAKER_RES = [
  new RegExp(`${MAKER_LABEL}([A-Z][A-Za-z.&\\-\\s]{2,60}?\\s(?:Ltd\\.?|Limited|Inc\\.?|LLP))`, "i"),
  new RegExp(
    `${MAKER_LABEL}([A-Z][A-Za-z.&\\-\\s]{2,60}?(?:Pharma(?:ceuticals?)?|Laboratories|Labs|Healthcare))`,
    "i",
  ),
];

export function extractManufacturer(text: string): Field<string> {
  for (const [i, re] of MAKER_RES.entries()) {
    const m = re.exec(text);
    if (m) return { value: m[1].replace(/\s+/g, " ").trim(), confidence: i === 0 ? 0.85 : 0.6 };
  }
  return null;
}

const BRAND_MIN_OCR = 60;

const NOT_BRAND =
  /\b(each|contains|tablets?|capsules?|ip|bp|usp|mrp|batch|exp|mfg|rx|schedule|warning|store|keep|dosage|manufactured|marketed|composition|only|prescription|drug)\b/i;

/**
 * The brand is usually the biggest text on the front of the pack. With OCR line heights we take
 * the tallest plausible line; without them, the first plausible line. Matching (Stage 4)
 * confirms or rejects it against the brand database.
 */
export function extractBrand(text: string, lines?: OcrLine[]): Field<string> {
  const plausible = (s: string) => {
    const t = s.trim();
    // Real OCR of busy photos produces lines like "pe fav TRE ER Ema" or "— | DEMO". A brand
    // has a word of 4+ letters with a vowel, and is mostly letters and digits.
    const wordy = /\b[A-Za-z]*[AEIOUaeiou][A-Za-z]*\b/.test(t) && /[A-Za-z]{4}/.test(t);
    const clean = t.replace(/[^A-Za-z0-9]/g, "").length / Math.max(1, t.replace(/\s/g, "").length);
    return t.length >= 3 && t.length <= 40 && wordy && clean >= 0.8 && !NOT_BRAND.test(t);
  };
  if (lines?.length) {
    // Lines the OCR itself was unsure about are noise more often than not.
    const candidates = lines.filter((l) => l.confidence >= BRAND_MIN_OCR && plausible(l.text));
    if (candidates.length) {
      const tallest = candidates.reduce((a, b) => (b.height > a.height ? b : a));
      const ratio = tallest.height / Math.max(...lines.map((l) => l.height));
      return {
        value: tallest.text.trim(),
        confidence: Math.min(0.9, 0.5 + 0.4 * ratio) * (tallest.confidence / 100 || 1),
      };
    }
  }
  const first = text.split("\n").find(plausible);
  return first ? { value: first.trim(), confidence: 0.4 } : null;
}

// ------------------------------------------------------------------ all together

/**
 * Extract every field from the OCR text of the front and back of a strip.
 * `frontLines` (with heights) helps find the brand; everything else uses both sides.
 */
export function extractFields(
  frontText: string,
  backText = "",
  frontLines?: OcrLine[],
): ExtractedFields {
  const front = cleanOcrText(frontText);
  const all = cleanOcrText(`${frontText}\n${backText}`);
  const { mfgDate, expDate } = extractDates(all);
  return {
    brand: extractBrand(front, frontLines),
    ingredients: extractIngredients(all),
    form: extractForm(all),
    mrp: extractMrp(all),
    packSize: extractPackSize(all),
    batchNo: extractBatch(all),
    mfgDate,
    expDate,
    manufacturer: extractManufacturer(all),
  };
}
