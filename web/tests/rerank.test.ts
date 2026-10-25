import { describe, expect, it } from "vitest";
import {
  coreName,
  findReleases,
  nameKey,
  nameNumbers,
  nameSimilarity,
  normalizeSalt,
  parseCompositionKey,
  similarity,
} from "@/lib/ai/normalize";
import {
  combineDecisions,
  compositionDiffers,
  decide,
  features,
  fitChoiceModel,
  ingredientEvidence,
  logit,
  probabilities,
  type MatchCandidate,
  type MatchInput,
  type Weights,
} from "@/lib/ai/rerank";
import { cleanedQuery, parseGuesses, parseMatchInput } from "@/lib/find-match";

// Real rows from the brand database (names, makers and composition keys as stored).
const brand = (id: number, name: string, compositionKey: string, manufacturer = "Maker Ltd") =>
  ({ id, name, manufacturer, compositionKey }) satisfies MatchCandidate;
const NEORELAX_MR = brand(
  1,
  "Neorelax MR Tablet",
  "aceclofenac:100:mg|thiocolchicoside:4:mg#tablet#er",
  "Meyer Organics Pvt Ltd",
);
const NEORELAX_MR8 = brand(
  2,
  "Neorelax MR 8 Tablet",
  "aceclofenac:100:mg|thiocolchicoside:8:mg#tablet#er",
  "Meyer Organics Pvt Ltd",
);
const NEORELAX_GEL = brand(3, "Neorelax Gel", "diclofenac:1:%#gel#ir", "Meyer Organics Pvt Ltd");
const VALIUM_5 = brand(4, "Valium 5 Tablet", "diazepam:5:mg#tablet#ir", "Abbott");
const VALIUM_2 = brand(5, "Valium 2mg Tablet", "diazepam:2:mg#tablet#ir", "Abbott");
const VALIUM_10 = brand(6, "Valium 10mg Tablet", "diazepam:10:mg#tablet#ir", "Abbott");
const SORTIN_10 = brand(7, "Sortin 10mg Tablet", "rosuvastatin:10:mg#tablet#ir");
const SUHAGRA_100 = brand(8, "Suhagra 100 Tablet", "sildenafil:100:mg#tablet#ir", "Cipla Ltd");
const SUHAGRA_50 = brand(9, "Suhagra 50 Tablet", "sildenafil:50:mg#tablet#ir", "Cipla Ltd");
const AUGMENTIN_625 = brand(
  10,
  "Augmentin 625 Duo Tablet",
  "amoxicillin:500:mg|clavulanic acid:125:mg#tablet#ir",
);
const PAN_40 = brand(11, "Pan 40 Tablet", "pantoprazole:40:mg#tablet#dr");

const input = (over: Partial<MatchInput>): MatchInput => ({
  brand: null,
  ingredients: null,
  form: null,
  manufacturer: null,
  releases: [],
  ...over,
});

describe("normalizeSalt (same results as pipeline/tests/test_normalize.py)", () => {
  it.each([
    ["Metformin Hydrochloride", "metformin"],
    ["Metformin Hydrochloride IP", "metformin"],
    ["Amlodipine Besilate", "amlodipine"],
    ["Atorvastatin Calcium", "atorvastatin"],
    ["Amoxycillin", "amoxicillin"],
    ["Amoxycillin Trihydrate", "amoxicillin"],
    ["Acetaminophen", "paracetamol"],
    ["Vitamin D3", "cholecalciferol"],
    ["Vitamin-C", "ascorbic acid"],
    ["Torasemide", "torsemide"],
    ["Hyoscine Butylbromide", "hyoscine"],
    ["Fexofenadine Hydrochloride", "fexofenadine"],
    ["Potassium Chloride", "potassium chloride"],
    ["Sodium Bicarbonate", "sodium bicarbonate"],
    ["Sodium Valproate", "valproate"],
    ["Calcium", "calcium"],
  ])("%s -> %s", (raw, expected) => {
    expect(normalizeSalt(raw)).toBe(expected);
  });
});

describe("name helpers", () => {
  it("keeps the identifying part of a brand name", () => {
    expect(coreName("Telma 40 Tablet")).toBe("telma");
    expect(coreName("Neorelax MR 8 Tablet")).toBe("neorelax mr");
    expect(coreName("SUHAGRA-100")).toBe("suhagra");
    expect(coreName("Augmentin 250mg/50mg Injection")).toBe("augmentin");
  });

  it("compares names forgiving OCR look-alikes, spacing, Rx and misspelt form words", () => {
    expect(nameSimilarity("TE1MA 40", "Telma 40 Tablet")).toBe(1);
    expect(nameSimilarity("TELRNA", "Telma")).toBe(1);
    expect(nameSimilarity("Rx KOFRITUSSDM", "Kofrituss-DM Syrup")).toBe(1);
    expect(nameSimilarity("ee CARDPIN 5MG", "Cardpin 5mg Tablet")).toBe(1);
    expect(nameSimilarity("Cobimep-P Casule", "Cobimep-P 500mcg/75mg Capsule")).toBe(1);
    // A really different letter still counts.
    expect(nameSimilarity("Sortis", "Sortin 10mg Tablet")).toBeLessThan(1);
    expect(nameKey("Neorelax MR 8 Tablet")).toBe("neorelaxmr");
    expect(nameKey("Hiperblo-H s0mg//12.5mg")).toBe("hlperbloh");
    expect(nameKey("Atorrxam 40mgTablet")).toBe(nameKey("Atorrxam 40mg Tablet"));
  });

  it("finds numbers in names", () => {
    expect(nameNumbers("Suhagra-100")).toEqual([100]);
    expect(nameNumbers("Augmentin 250mg/50mg Injection")).toEqual([250, 50]);
    expect(nameNumbers("Telma")).toEqual([]);
    // OCR letters inside a strength are read as digits; other tokens are left alone.
    expect(nameNumbers("ISOMOVE 1oMG")).toEqual([10]);
    expect(nameNumbers("Hiperblo-H s0mg/12.5mg")).toEqual([50, 12.5]);
    expect(nameNumbers("Sertima25mg")).toEqual([25]);
    // Digits stuck inside a word are not strengths; zero is a misread digit.
    expect(nameNumbers("Neurobion B12")).toEqual([]);
    expect(nameNumbers("Opan0 D 10mg/40mg")).toEqual([10, 40]);
    expect(nameNumbers("CHEK S 0RNG/10RNG")).toEqual([10]);
  });

  it("scores string similarity", () => {
    expect(similarity("telma", "telma")).toBe(1);
    expect(similarity("telrna", "telma")).toBeCloseTo(4 / 6);
    expect(similarity("", "")).toBe(1);
  });

  it("finds release words, whole words only", () => {
    expect(findReleases("Neorelax MR")).toEqual(["er"]);
    expect(findReleases("Pantoprazole Gastro-resistant Tablets")).toEqual(["dr"]);
    expect(findReleases("Store in a cool place, away from water")).toEqual([]);
    // Strict mode ignores short codes that are often OCR noise in a full page of text.
    expect(findReleases("BATCH PR 2034", true)).toEqual([]);
    expect(findReleases("Sustained Release Tablets", true)).toEqual(["er"]);
  });

  it("parses composition keys", () => {
    expect(parseCompositionKey("glimepiride:1:mg|metformin:500:mg#tablet#er")).toEqual({
      ingredients: [
        { salt: "glimepiride", value: 1, unit: "mg" },
        { salt: "metformin", value: 500, unit: "mg" },
      ],
      form: "tablet",
      release: "er",
    });
    expect(parseCompositionKey("broken")).toBeNull();
  });
});

describe("evidence", () => {
  const key = parseCompositionKey(NEORELAX_MR.compositionKey);

  it("+1 when ingredients and strengths agree exactly (after normalization)", () => {
    const read = [
      { salt: "Thiocolchicoside IP", value: 4, unit: "mg" },
      { salt: "Aceclofenac", value: 100, unit: "mg" },
    ];
    expect(ingredientEvidence(read, key)).toBe(1);
  });

  it("+0.5 when some ingredients were not read but nothing contradicts", () => {
    expect(ingredientEvidence([{ salt: "Aceclofenac", value: 100, unit: "mg" }], key)).toBe(0.5);
  });

  it("-1 when a strength or a salt contradicts", () => {
    expect(ingredientEvidence([{ salt: "Thiocolchicoside", value: 8, unit: "mg" }], key)).toBe(-1);
    expect(ingredientEvidence([{ salt: "Paracetamol", value: 100, unit: "mg" }], key)).toBe(-1);
  });

  it("tolerates one OCR slip in a long salt name, but not two", () => {
    const valium = parseCompositionKey(VALIUM_10.compositionKey);
    // "rn" read for "m" is a look-alike, so this is still diazepam.
    expect(ingredientEvidence([{ salt: "Diazeparn", value: 10, unit: "mg" }], valium)).toBe(1);
    expect(ingredientEvidence([{ salt: "Diltiazem", value: 10, unit: "mg" }], valium)).toBe(-1);
    const read = [{ salt: "Thiocolchicosde", value: 4, unit: "mg" }];
    expect(ingredientEvidence(read, key)).toBe(0.5);
    // Two letters off: could be a slip or another medicine, so it is not evidence either way.
    const esc = parseCompositionKey("escitalopram:20:mg#tablet#ir");
    expect(ingredientEvidence([{ salt: "Citalopram", value: 20, unit: "mg" }], esc)).toBe(0);
    expect(ingredientEvidence([{ salt: "Citalopram", value: 10, unit: "mg" }], esc)).toBe(-1);
  });

  it("an extra salt is not a contradiction when the dataset's list may be cut short", () => {
    const read = [
      { salt: "Thiocolchicoside", value: 4, unit: "mg" },
      { salt: "Aceclofenac", value: 100, unit: "mg" },
      { salt: "Paracetamol", value: 325, unit: "mg" },
    ];
    expect(ingredientEvidence(read, key, true)).toBe(-1);
    expect(ingredientEvidence(read, key, false)).toBe(0.5);
    // ...but at least one salt must agree.
    expect(ingredientEvidence([{ salt: "Paracetamol", value: 325, unit: "mg" }], key, false)).toBe(
      -1,
    );
  });

  it("0 when nothing was read", () => {
    expect(ingredientEvidence(null, key)).toBe(0);
    expect(ingredientEvidence([], key)).toBe(0);
  });

  it("checks the strength in the name, including totals like Augmentin 625", () => {
    expect(features(input({ brand: "SUHAGRA-100" }), SUHAGRA_100).strength).toBe(1);
    expect(features(input({ brand: "SUHAGRA-100" }), SUHAGRA_50).strength).toBe(-1);
    expect(features(input({ brand: "Augmentin 625" }), AUGMENTIN_625).strength).toBe(1);
    expect(features(input({ brand: "Suhagra" }), SUHAGRA_50).strength).toBe(0);
  });

  it("compares form, release and manufacturer", () => {
    const f = features(
      input({
        brand: "Neorelax MR",
        form: "tablet",
        releases: ["er"],
        manufacturer: "MEYER ORGANICS PVT. LTD.",
      }),
      NEORELAX_MR,
    );
    expect(f).toMatchObject({ name: 1, form: 1, release: 1, maker: 1 });
    expect(features(input({ brand: "Neorelax", form: "tablet" }), NEORELAX_GEL).form).toBe(-1);
    // Pan 40 is delayed-release; a strip that says nothing about release is not evidence.
    expect(features(input({ brand: "Pan 40" }), PAN_40).release).toBe(0);
    const rypraz = brand(
      12,
      "Rypraz-D Capsule SR",
      "domperidone:30:mg|rabeprazole:20:mg#capsule#dr+er",
    );
    expect(features(input({ brand: "RYPRAZ-D SR", releases: ["er"] }), rypraz).release).toBe(1);
  });
});

describe("decide", () => {
  it("picks Neorelax MR over Neorelax MR 8 when the ingredients say 4 mg", () => {
    const d = decide(
      input({
        brand: "NEORELAX MR",
        ingredients: [
          { salt: "Thiocolchicoside", value: 4, unit: "mg" },
          { salt: "Aceclofenac", value: 100, unit: "mg" },
        ],
      }),
      [NEORELAX_MR8, NEORELAX_GEL, NEORELAX_MR],
    );
    expect(d.status).toBe("match");
    expect(d.ranked[0].candidate.name).toBe("Neorelax MR Tablet");
  });

  it("abstains between Valium 2 / 5 / 10 when no strength was read", () => {
    const d = decide(input({ brand: "Valium" }), [VALIUM_5, VALIUM_2, VALIUM_10]);
    expect(d.status).toBe("abstain");
    expect(d.ranked).toHaveLength(3); // offered to the user to pick from
  });

  it("matches Valium 10 when the strip says diazepam 10 mg", () => {
    const d = decide(
      input({ brand: "Valium", ingredients: [{ salt: "Diazepam", value: 10, unit: "mg" }] }),
      [VALIUM_5, VALIUM_2, VALIUM_10],
    );
    expect(d.status).toBe("match");
    expect(d.ranked[0].candidate).toBe(VALIUM_10);
  });

  it("does not turn Sortis (atorvastatin) into Sortin (rosuvastatin)", () => {
    const d = decide(
      input({ brand: "Sortis", ingredients: [{ salt: "Atorvastatin", value: 40, unit: "mg" }] }),
      [SORTIN_10],
    );
    expect(d.status).toBe("abstain");
  });

  it("never answers with a candidate the strip contradicts, however alike the names", () => {
    const potrate10 = brand(13, "Potrate 10 Tablet ER", "trimetazidine:10:mg#tablet#er");
    const d = decide(input({ brand: "Potrate 5 ER", form: "tablet", releases: ["er"] }), [
      potrate10,
    ]);
    expect(d).toMatchObject({ status: "abstain", reason: "contradiction" });
    const injection = brand(14, "Novon 2mg Injection", "ondansetron:2:mg/ml#injection#ir");
    expect(decide(input({ brand: "NOVON", form: "syrup" }), [injection]).status).toBe("abstain");
  });

  it("asks which strength when the brand comes in strengths and the strip did not say", () => {
    const bilefix = brand(15, "Bilefix 600 Tablet", "ursodeoxycholic acid:600:mg#tablet#ir");
    expect(decide(input({ brand: "Bilefix" }), [bilefix])).toMatchObject({
      status: "abstain",
      reason: "strength_unknown",
    });
    // ...but a strip that names its ingredients and strength confirms it.
    const read = [{ salt: "Ursodeoxycholic Acid", value: 600, unit: "mg" }];
    expect(decide(input({ brand: "Bilefix", ingredients: read }), [bilefix]).status).toBe("match");
  });

  it("abstains with no brand or no candidates", () => {
    expect(decide(input({}), [SUHAGRA_100])).toMatchObject({
      status: "abstain",
      reason: "no_brand",
    });
    expect(decide(input({ brand: "Xyzzy" }), [])).toMatchObject({
      status: "abstain",
      reason: "no_candidates",
    });
  });

  it("counts two names for the same product once", () => {
    const twin = { ...SUHAGRA_100, id: 99, name: "Suhagra 100mg Tablet" };
    const alone = decide(input({ brand: "Suhagra 100" }), [SUHAGRA_100]);
    const withTwin = decide(input({ brand: "Suhagra 100" }), [SUHAGRA_100, twin]);
    expect(withTwin.confidence).toBeCloseTo(alone.confidence);
  });
});

describe("choice model", () => {
  it("gives probabilities over the candidates and 'none of these' that add up to 1", () => {
    const p = probabilities([2, 1, -1]);
    const none = 1 - p.reduce((a, b) => a + b, 0);
    expect(none).toBeGreaterThan(0);
    expect(p[0]).toBeGreaterThan(p[1]);
    expect(probabilities([1000, 999])[0]).toBeCloseTo(1 / (1 + Math.exp(-1))); // no overflow
  });

  it("learns that name similarity and strength pick the right candidate", () => {
    const zero = { name: 0, strength: 0, ingredients: 0, form: 0, release: 0, maker: 0 };
    const right = { ...zero, name: 1, strength: 1 };
    const sibling = { ...zero, name: 1, strength: -1 };
    const stranger = { ...zero, name: 0.3 };
    const examples = [
      ...Array.from({ length: 20 }, () => ({ candidates: [sibling, right, stranger], truth: 1 })),
      ...Array.from({ length: 10 }, () => ({ candidates: [stranger], truth: null })),
    ];
    const w: Weights = { ...fitChoiceModel(examples), threshold: 0.5 };
    expect(w.name).toBeGreaterThan(0);
    expect(w.strength).toBeGreaterThan(0);
    const [pRight, pSibling] = probabilities([logit(right, w), logit(sibling, w)]);
    expect(pRight).toBeGreaterThan(0.8);
    expect(pSibling).toBeLessThan(0.2);
    expect(probabilities([logit(stranger, w)])[0]).toBeLessThan(0.2);
  });
});

describe("compositionDiffers", () => {
  // Neorelax MR in the dataset (cut to 2 ingredients) vs the strip (3 ingredients).
  const record = [
    { salt: "Aceclofenac", value: 100, unit: "mg" },
    { salt: "Thiocolchicoside", value: 4, unit: "mg" },
  ];
  it("flags a salt the record does not have, or another strength", () => {
    expect(
      compositionDiffers([...record, { salt: "Paracetamol", value: 325, unit: "mg" }], record),
    ).toBe(true);
    expect(compositionDiffers([{ salt: "Thiocolchicoside", value: 8, unit: "mg" }], record)).toBe(
      true,
    );
  });
  it("accepts the same ingredients, written differently, or fewer of them", () => {
    expect(
      compositionDiffers([{ salt: "Thiocolchicoside IP", value: 4, unit: "mg" }], record),
    ).toBe(false);
    expect(compositionDiffers(record, record)).toBe(false);
  });
});

describe("cleanedQuery", () => {
  it("undoes the usual OCR slips before searching", () => {
    expect(cleanedQuery("Sert0sh 100mg Talet")).toBe("sertosh");
    expect(cleanedQuery("ee AMLIBON")).toBe("amlibon");
    expect(cleanedQuery("G-RNoxclav 62s")).toBe("g moxclav");
    expect(cleanedQuery("Rx HYDRA")).toBe("hydra");
  });
});

describe("parseMatchInput", () => {
  it("keeps valid fields and drops the rest", () => {
    expect(
      parseMatchInput({
        brand: "  Telma 40 ",
        ingredients: [
          { salt: "Telmisartan", value: 40, unit: "mg" },
          { salt: "x", value: "40" },
        ],
        form: "tablet",
        releases: ["er", 7],
        extra: "ignored",
      }),
    ).toEqual({
      brand: "Telma 40",
      ingredients: [{ salt: "Telmisartan", value: 40, unit: "mg" }],
      form: "tablet",
      manufacturer: null,
      releases: ["er"],
    });
    expect(parseMatchInput(null)).toBeNull();
    expect(parseMatchInput("telma")).toBeNull();
  });
});

describe("combineDecisions (several name guesses for one strip)", () => {
  const diazepam10 = [{ salt: "Diazepam", value: 10, unit: "mg" }];
  const valium = decide(input({ brand: "Valium", ingredients: diazepam10 }), [VALIUM_5, VALIUM_10]);
  const garbage = decide(input({ brand: "Abbott Healthcare" }), []);

  it("takes the guess that matched when the others found nothing", () => {
    expect(valium.status).toBe("match");
    const d = combineDecisions([garbage, valium]);
    expect(d.status).toBe("match");
    expect(d.ranked[0].candidate).toBe(VALIUM_10);
  });

  it("abstains when two guesses match different medicines", () => {
    const suhagra = decide(input({ brand: "Suhagra 100" }), [SUHAGRA_100, SUHAGRA_50]);
    expect(suhagra.status).toBe("match");
    const d = combineDecisions([valium, suhagra]);
    expect(d.status).toBe("abstain");
    expect(d.ranked.map((s) => s.candidate.name).sort()).toEqual([
      "Suhagra 100 Tablet",
      "Valium 10mg Tablet",
    ]);
  });

  it("keeps the match when two guesses name the same product", () => {
    const again = decide(input({ brand: "VALIUM 10", ingredients: diazepam10 }), [VALIUM_10]);
    expect(combineDecisions([valium, again]).status).toBe("match");
  });

  it("with no match, offers the options of the first guess that found any", () => {
    const unsure = decide(input({ brand: "Valium" }), [VALIUM_5, VALIUM_10]);
    const d = combineDecisions([garbage, unsure]);
    expect(d.status).toBe("abstain");
    expect(d.ranked).toHaveLength(2);
  });

  it("accepts at most 3 short guesses from a request", () => {
    expect(parseGuesses({ brandGuesses: ["Telma 40", "", 5, "x".repeat(80), "A", "B"] })).toEqual([
      "Telma 40",
      "x".repeat(60),
      "A",
    ]);
    expect(parseGuesses({})).toEqual([]);
  });
});
