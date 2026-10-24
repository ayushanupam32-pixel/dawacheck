import { describe, expect, it } from "vitest";
import { extractFields } from "@/lib/ai/extract";
import { addScores, cer, emptyScores, fieldCorrect, levenshtein, type Label } from "@/lib/ai/score";

describe("levenshtein / cer", () => {
  it("counts single-character edits", () => {
    expect(levenshtein("kitten", "sitting")).toBe(3);
    expect(levenshtein("", "abc")).toBe(3);
    expect(levenshtein("same", "same")).toBe(0);
  });

  it("CER is edits divided by the true length", () => {
    expect(cer("GT23O4", "GT2304")).toBeCloseTo(1 / 6);
    expect(cer("", "")).toBe(0);
    expect(cer("x", "")).toBe(1);
  });
});

describe("fieldCorrect", () => {
  it("ignores case and punctuation in brand names", () => {
    expect(fieldCorrect("brand", "TELMA 40", "Telma-40")).toBe(true);
  });
  it("ignores the order of ingredients and trailing .0", () => {
    expect(
      fieldCorrect(
        "ingredients",
        "Metformin 500 mg\nGlimepiride 1 mg",
        "Glimepiride 1.0 mg\nMetformin 500 mg",
      ),
    ).toBe(true);
  });
  it("compares batch numbers without dashes or spaces", () => {
    expect(fieldCorrect("batchNo", "24A118", "24A-118")).toBe(true);
    expect(fieldCorrect("batchNo", "24A11B", "24A118")).toBe(false);
  });
  it("compares prices as numbers", () => {
    expect(fieldCorrect("mrp", "122.98", "122.980")).toBe(true);
    expect(fieldCorrect("mrp", "", "122.98")).toBe(false);
  });
});

describe("addScores", () => {
  it("scores only the fields the label fills in", () => {
    const label: Label = {
      id: "x",
      split: "dev",
      front: "x-front.jpg",
      back: null,
      brand: "TELMA 40",
      ingredients: "",
      mrp: 122.98,
      packSize: null,
      batchNo: "GT2304",
      mfgDate: "",
      expDate: "2027-08",
      foil: false,
      lighting: "good",
    };
    const fields = extractFields("TELMA 40", "B.No. GT23O4 Exp 08/2027 M.R.P. Rs. 122.98");
    const scores = emptyScores();
    addScores(scores, fields, label);
    expect(scores.brand).toMatchObject({ correct: 1, total: 1 });
    expect(scores.mrp).toMatchObject({ correct: 1, total: 1 });
    expect(scores.batchNo).toMatchObject({ correct: 0, total: 1 }); // O misread as part of batch
    expect(scores.expDate).toMatchObject({ correct: 1, total: 1 });
    expect(scores.ingredients.total).toBe(0); // not labelled: not scored
  });
});
