import { describe, expect, it } from "vitest";
import { brandGuesses, isGoodEnough, mergeReadings, type OcrReading } from "@/lib/ai/merge";

const reading = (variant: string, text: string, confidence: number): OcrReading => ({
  variant,
  text,
  confidence,
  lines: [],
});

describe("mergeReadings", () => {
  it("takes each field from the variant that read it best", () => {
    const front = [reading("enhanced", "TELMA 40", 90)];
    const back = [
      // Glare: the enhanced variant misread the batch and missed the MRP.
      reading("enhanced", "B.No. 123\nMfg 09/2025 Exp 08/2027", 60),
      // The inverted variant got the batch and the MRP, but not the dates.
      reading("inverted", "B.No. GT2304\nM.R.P. Rs. 122.98", 85),
    ];
    const { fields, source } = mergeReadings(front, back);
    expect(fields.brand?.value).toBe("TELMA 40");
    expect(fields.batchNo?.value).toBe("GT2304");
    expect(source.batchNo).toEqual({ front: "enhanced", back: "inverted" });
    expect(fields.mrp?.value).toBe(122.98);
    expect(fields.expDate?.value).toBe("2027-08");
    expect(source.expDate?.back).toBe("enhanced");
  });

  it("prefers the reading with higher OCR confidence when both agree on the pattern", () => {
    const front = [reading("enhanced", "", 90)];
    const back = [
      reading("enhanced", "M.R.P. Rs. 122.98", 40),
      reading("binary", "M.R.P. Rs. 122.90", 95),
    ];
    const { fields } = mergeReadings(front, back);
    expect(fields.mrp?.value).toBe(122.9);
  });

  it("scales confidence by OCR confidence, so a blurry read is flagged on the confirm screen", () => {
    const sharp = mergeReadings([reading("e", "", 95)], [reading("e", "M.R.P. Rs. 50.00", 95)]);
    const blurry = mergeReadings([reading("e", "", 40)], [reading("e", "M.R.P. Rs. 50.00", 40)]);
    expect(sharp.fields.mrp!.confidence).toBeGreaterThan(0.85);
    expect(blurry.fields.mrp!.confidence).toBeLessThan(0.5);
  });

  it("works with only a front photo", () => {
    const { fields } = mergeReadings([reading("e", "DOLO 650\nM.R.P. Rs. 30.91", 90)], []);
    expect(fields.mrp?.value).toBe(30.91);
    expect(fields.batchNo).toBeNull();
  });
});

describe("isGoodEnough", () => {
  it("needs every key field with confidence >= 0.6", () => {
    const text = [
      "Each tablet contains: Telmisartan IP 40 mg",
      "B.No. GT2304 Mfg 09/2025 Exp 08/2027",
      "M.R.P. Rs. 122.98",
    ].join("\n");
    // Real OCR always gives line heights, which is how the brand is found with confidence.
    const front = {
      ...reading("e", "TELMA 40", 95),
      lines: [{ text: "TELMA 40", height: 60, confidence: 95 }],
    };
    const good = mergeReadings([front], [reading("e", text, 95)]);
    expect(isGoodEnough(good.fields)).toBe(true);
    const missingBatch = mergeReadings(
      [front],
      [reading("e", text.replace("B.No. GT2304", ""), 95)],
    );
    expect(isGoodEnough(missingBatch.fields)).toBe(false);
  });
});

describe("hiding low-confidence free text", () => {
  it("drops a garbage brand from a blurry photo, but keeps a structured field", () => {
    const blurry = {
      variant: "binary",
      text: "pe fav TRE ER Ema\nB.No. GT2304",
      confidence: 25,
      lines: [{ text: "Fav Tre Ema", height: 90, confidence: 61 }],
    };
    const { fields } = mergeReadings([blurry], [blurry]);
    expect(fields.brand).toBeNull();
    expect(fields.batchNo?.value).toBe("GT2304");
  });
});

describe("brandGuesses", () => {
  const line = (text: string, height: number, confidence = 90) => ({ text, height, confidence });
  it("lists plausible lines tallest first, from all variants, without repeats", () => {
    const binary: OcrReading = {
      variant: "binary",
      text: "",
      confidence: 70,
      lines: [
        line("Each tablet contains:", 20), // a label, never a brand
        line("FINCOVER-1", 60),
        line("Finasteride Tablets USP 1 mg", 25), // has "tablets": not a brand
        line("Favipill Ema", 70, 20), // tall but the OCR was very unsure: noise
        line("Cipla Healthcare", 30),
      ],
    };
    // Another variant of the same photo, read at a different size.
    const ink: OcrReading = {
      variant: "ink",
      text: "",
      confidence: 60,
      lines: [line("Fincover 1", 120), line("FINCOVER-1", 110), line("Protect hair", 30)],
    };
    // "FINCOVER-1" is the same name as "Fincover 1" once case and punctuation are ignored.
    expect(brandGuesses([binary, ink])).toEqual(["Fincover 1", "Cipla Healthcare", "Protect hair"]);
  });

  it("returns nothing when no line looks like a name", () => {
    expect(brandGuesses([reading("binary", "|| — 12", 40)])).toEqual([]);
  });
});

describe("mergeReadings without a back photo", () => {
  // Found by the final test run: a missing back used to count as a 100% confident reading, so a
  // front read at 24% scored like one read at 62%, and garbage passed MIN_SHOW as ingredients.
  it("uses the front's own confidence, so a poorly read front shows no free text", () => {
    const garbage = reading("binary", "Cee 8000 mg\nNee 2 %", 24);
    const { fields } = mergeReadings([garbage], []);
    expect(fields.ingredients).toBeNull();
  });

  it("still reads structured fields from a well-read front", () => {
    const clear = reading("binary", "M.R.P. Rs. 122.98\nB.No. GT2304", 90);
    const { fields } = mergeReadings([clear], []);
    expect(fields.mrp?.value).toBe(122.98);
    expect(fields.batchNo?.value).toBe("GT2304");
    // Pattern confidence × the front's 90%, not × the old (90 + 100) / 2 = 95%.
    expect(fields.mrp!.confidence).toBeLessThanOrEqual(0.9);
  });
});
