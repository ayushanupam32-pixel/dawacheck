import { describe, expect, it } from "vitest";
import {
  cleanOcrText,
  extractBatch,
  extractBrand,
  extractDates,
  extractFields,
  extractForm,
  extractIngredients,
  extractManufacturer,
  extractMrp,
  extractPackSize,
  fixDigits,
  normalizeBatch,
  parseMonthYear,
} from "@/lib/ai/extract";
import {
  batchCases,
  brandCases,
  dateCases,
  formCases,
  inconsistentDates,
  ingredientCases,
  manufacturerCases,
  mrpCases,
  packCases,
  realSnippets,
} from "./fixtures/ocr-snippets";

const total =
  mrpCases.length +
  batchCases.length +
  dateCases.length +
  ingredientCases.length +
  packCases.length +
  formCases.length +
  manufacturerCases.length +
  brandCases.length;

it(`fixture has at least 100 snippets (${total})`, () => {
  expect(total).toBeGreaterThanOrEqual(100);
});

describe("MRP", () => {
  it.each(mrpCases)("%j -> %s", (text, expected) => {
    expect(extractMrp(cleanOcrText(text))?.value ?? null).toBe(expected);
  });

  it("is less confident without an MRP label or with OCR swaps", () => {
    const clean = extractMrp(cleanOcrText("M.R.P. Rs. 125.00"))!;
    const swapped = extractMrp(cleanOcrText("M.R.P. Rs. l25.OO"))!;
    const unlabelled = extractMrp(cleanOcrText("Rs. 64.00 per strip"))!;
    expect(clean.confidence).toBeGreaterThan(swapped.confidence);
    expect(swapped.confidence).toBeGreaterThan(unlabelled.confidence);
  });
});

describe("batch number", () => {
  it.each(batchCases)("%j -> %s", (text, expected) => {
    expect(extractBatch(cleanOcrText(text))?.value ?? null).toBe(expected);
  });

  it("ambiguous O/0 characters lower the confidence", () => {
    expect(extractBatch("B.No. HL5O21")!.confidence).toBeLessThan(0.7);
    expect(extractBatch("B.No. GT2304")!.confidence).toBeGreaterThan(0.8);
  });

  it("normalizes to uppercase without spaces, dashes or slashes", () => {
    expect(normalizeBatch("ab-12 3/4")).toBe("AB1234");
  });
});

describe("dates", () => {
  it.each(dateCases)("%j -> mfg %s, exp %s", (text, mfg, exp) => {
    const d = extractDates(cleanOcrText(text));
    expect(d.mfgDate?.value ?? null).toBe(mfg);
    expect(d.expDate?.value ?? null).toBe(exp);
  });

  it("flags expiry before manufacture with low confidence", () => {
    const d = extractDates(inconsistentDates);
    expect(d.expDate!.confidence).toBeLessThan(0.5);
  });

  it("parses the common formats", () => {
    expect(parseMonthYear("AUG. 2027")).toBe("2027-08");
    expect(parseMonthYear("12/08/2027")).toBe("2027-08");
    expect(parseMonthYear("O8/2O27")).toBe("2027-08");
    expect(parseMonthYear("08/1999")).toBeNull();
  });
});

describe("ingredients", () => {
  it.each(ingredientCases)("%j", (text, expected) => {
    expect(extractIngredients(cleanOcrText(text))?.value ?? null).toEqual(expected);
  });
});

describe("pack size", () => {
  it.each(packCases)("%j -> %s", (text, expected) => {
    expect(extractPackSize(cleanOcrText(text))?.value ?? null).toBe(expected);
  });
});

describe("dosage form", () => {
  it.each(formCases)("%j -> %s", (text, expected) => {
    expect(extractForm(cleanOcrText(text))?.value ?? null).toBe(expected);
  });
});

describe("manufacturer", () => {
  it.each(manufacturerCases)("%j -> %s", (text, expected) => {
    expect(extractManufacturer(cleanOcrText(text))?.value ?? null).toBe(expected);
  });
});

describe("brand", () => {
  it.each(brandCases)("$expected", ({ text, lines, expected }) => {
    expect(extractBrand(cleanOcrText(text), lines)?.value ?? null).toBe(expected);
  });

  it("prefers the tallest line when OCR line heights are known", () => {
    const b = extractBrand("", brandCases[0].lines)!;
    expect(b.value).toBe("TELMA 40");
    expect(b.confidence).toBeGreaterThan(0.7);
  });
});

describe("fixDigits", () => {
  it("swaps look-alike letters for digits", () => {
    expect(fixDigits("l2S.OB")).toBe("125.08");
  });
});

describe("extractFields (front + back together)", () => {
  it("reads a typical strip", () => {
    const front = "TELMA 40\nTelmisartan Tablets IP 40 mg\n15 Tablets";
    const back = [
      "Each uncoated tablet contains:",
      "Telmisartan IP 40 mg",
      "Excipients q.s.",
      "B.No. GT2304 Mfg. 09/2025 Exp. 08/2027",
      "M.R.P. Rs. 122.98 (Incl. of all taxes)",
      "Manufactured by: Glenmark Pharmaceuticals Ltd.",
    ].join("\n");
    const f = extractFields(front, back);
    expect(f.brand?.value).toBe("TELMA 40");
    expect(f.ingredients?.value).toEqual([{ salt: "Telmisartan", value: 40, unit: "mg" }]);
    expect(f.form?.value).toBe("tablet");
    expect(f.mrp?.value).toBe(122.98);
    expect(f.packSize?.value).toBe(15);
    expect(f.batchNo?.value).toBe("GT2304");
    expect(f.mfgDate?.value).toBe("2025-09");
    expect(f.expDate?.value).toBe("2027-08");
    expect(f.manufacturer?.value).toBe("Glenmark Pharmaceuticals Ltd.");
  });

  it("returns nulls, not guesses, for unreadable text", () => {
    const f = extractFields("~~ ## ..", "");
    expect(Object.values(f).every((v) => v === null)).toBe(true);
  });
});

describe("real OCR output from the evaluation photos", () => {
  it("'MRP FOR 10 TABS. Rs.33-00' is ₹33 for 10, not ₹10", () => {
    const [fincover, crocin] = realSnippets.mrpPerTabs.map(cleanOcrText);
    // "R5." is how the OCR read "Rs." on the Fincover strip; the extractor can't know it was Rs.
    expect(extractMrp(cleanOcrText("M.R.P. FOR 10 TABS.\nRs.33-00 INCLUSIVE"))?.value).toBe(33);
    expect(extractMrp(crocin)?.value).toBe(15);
    expect(extractPackSize(crocin)?.value).toBe(6);
    expect(extractPackSize(fincover)?.value).toBe(10);
  });

  it("the decimal point printed as a dash", () => {
    expect(extractMrp(cleanOcrText("M.R.P. Rs.33-00"))?.value).toBe(33);
  });

  it("drops OCR noise after a batch code", () => {
    expect(extractBatch(realSnippets.batchWithNoise)?.value).toBe("FCR004");
  });

  it("joins a name and its strength printed on separate lines", () => {
    expect(extractIngredients(realSnippets.splitIngredient)?.value).toEqual([
      { salt: "Metformin", value: 500, unit: "mg" },
    ]);
  });

  it("ignores garbage and low-confidence lines when choosing the brand", () => {
    expect(extractBrand("", realSnippets.noisyBrandLines)?.value).toBe("Metformin");
  });
});

describe("more real OCR output from the stamp close-ups", () => {
  it("reads 'BR. No.' (the dot misread as R) as a batch label", () => {
    expect(extractBatch("BR. No. XFA20002")?.value).toBe("XFA20002");
  });
  it("accepts a comma after the month: 'EXP NOV, 12'", () => {
    expect(extractDates(cleanOcrText("EXP NOV, 12"))?.expDate?.value).toBe("2012-11");
  });
  it("flags an implausible mfg/exp pair (OCR read DEC.09 as DEC.0S)", () => {
    const d = extractDates(cleanOcrText("MFD.DEC.0S\nEXP NOV, 12"));
    expect(d.mfgDate?.value).toBe("2005-12");
    expect(d.mfgDate!.confidence).toBeLessThan(0.5); // shown as "Please check"
  });
});

describe("wrong MRPs seen on real photos", () => {
  it("'MRPFOR6TABS.' followed by the next line's '4XP' is not ₹4", () => {
    expect(extractMrp(cleanOcrText("MRPFOR6TABS.\n4XP.DEC.2014"))).toBeNull();
  });
  it("'Rs. 5TABS' is not a price", () => {
    expect(extractMrp(cleanOcrText("Rs. 5TABS. st 7 EXP.DEC.2014"))).toBeNull();
  });
  it("'Rs. Sm' from a garbled reading is not ₹5", () => {
    expect(extractMrp(cleanOcrText("ia 62 UIE Rs. Sm Ln An"))).toBeNull();
  });
});

describe("extractIngredients: a salt written over two lines with 'eq. to'", () => {
  // Found with the demo strips: the second line was read alone and gave the salt "To Amlodipine".
  it.each([
    ["Amlodipine Besilate IP\neq. to Amlodipine 5 mg", "Amlodipine Besilate", 5],
    ["Montelukast Sodium IP\neq. to Montelukast 10 mg", "Montelukast Sodium", 10],
    ["Cefixime IP\neq. to anhydrous Cefixime 200 mg", "Cefixime", 200],
    ["Atorvastatin Calcium IP\nEquivalent to Atorvastatin 10 mg", "Atorvastatin Calcium", 10],
    ["eq. to Amlodipine 5 mg", "Amlodipine", 5],
  ])("%j", (lines, salt, value) => {
    const result = extractIngredients(
      `Each film coated tablet contains:\n${lines}\nExcipients q.s.`,
    );
    expect(result?.value).toEqual([{ salt, value, unit: "mg" }]);
  });
});
