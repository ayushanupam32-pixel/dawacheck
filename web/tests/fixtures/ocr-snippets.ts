// OCR-style text snippets for the field extractor (tests/extract.test.ts).
//
// SYNTHETIC: written in the style of Indian medicine strips and Tesseract output, including the
// usual OCR mistakes (O for 0, l for 1, lost spaces). Real snippets from the evaluation photos
// are added in M3/M4 and kept apart in ocr-snippets-real.ts, so the report can show both.

export const mrpCases: [text: string, expected: number | null][] = [
  ["M.R.P. Rs. 125.00", 125],
  ["MRP ₹125/-", 125],
  ["M.R.P.Rs.125.00 (Incl. of all taxes)", 125],
  ["MRP Rs.48.50 per strip of 10 tablets", 48.5],
  ["M.R.P. ₹ 210.75", 210.75],
  ["Max. Retail Price Rs. 99.00", 99],
  ["M.R.P: Rs 32.10 Inclusive of all taxes", 32.1],
  ["MRP(Incl. of all taxes) Rs. 156.40", 156.4],
  ["M R P Rs. 87.25", 87.25],
  ["M.R.P. Rs. l25.OO", 125], // l -> 1, O -> 0
  ["MRP Rs.4S.00", 45], // S -> 5
  ["M.R.P. Rs. 2B.50", 28.5], // B -> 8
  ["MRP ₹ 1,245.00", null], // thousands separator not supported: refuse rather than misread
  ["MRP Rs.0.20", null], // below any real strip price
  ["M.R.P. Rs. 99999", null], // above any real strip price
  ["Rs. 64.00 per strip", 64], // no MRP label: still found, lower confidence
  ["MRP:Rs.18.90", 18.9],
  ["M.R.P. INR 72.00", 72],
  ["MRP Rs 120", 120],
  ["MRP. Rs. 33.6O", 33.6],
  ["M.R.P.\nRs. 141.00", 141],
  ["Batch No. A123 MRP Rs.55.00 Exp 08/2027", 55],
  ["MRP ₹ 9.50 for 10 tablets", 9.5],
  ["Maximum Retail Price ₹ 260.00", 260],
  ["Store below 25°C. Protect from light.", null],
];

export const batchCases: [text: string, expected: string | null][] = [
  ["B.No. GT2304", "GT2304"],
  ["Batch No.: AB12345", "AB12345"],
  ["B. No. 24A-118", "24A118"],
  ["LOT 7X9921", "7X9921"],
  ["Lot No. K-2307 Mfg. 07/2025", "K2307"],
  ["B.No.EC4521 MFG.DATE:03/2025", "EC4521"],
  ["Batch: 3001 2345", "30012345"],
  ["B.N. MT24019", "MT24019"],
  ["Batch No.NB/24/118", "NB24118"],
  ["B.No. 2A4K19 Mfd: 09/2025 Exp: 08/2027", "2A4K19"],
  ["BATCH NO. TR04-23", "TR0423"],
  ["B.No: DG25091", "DG25091"],
  ["Batch Number 5PX12", "5PX12"],
  ["B.No. 123", null], // too short to be a batch code
  ["Batch No. PENDING", null], // no digit: not a batch code
  ["Batch No. ABCDEFGHIJ12345678", null], // too long
  ["Keep out of reach of children", null],
  ["B. No.:  ZX99018  EXP. 12/2026", "ZX99018"],
  ["Lot: 24C1102", "24C1102"],
  ["B.No. HL5O21", "HL5O21"], // ambiguous O vs 0: kept as read, low confidence
  ["Batch No. 23/AT/091", "23AT091"],
  ["B.No.  M-4432 MRP Rs.10", "M4432"],
  ["B No. SR25004", "SR25004"],
  ["Batch No. 1234567", "1234567"],
  ["Mfg. Lic. No. MNB/05/123", null], // a licence number, not a batch
];

export const dateCases: [text: string, mfg: string | null, exp: string | null][] = [
  ["MFG 09/2025 EXP 08/2027", "2025-09", "2027-08"],
  ["Mfg. Date: 03/2025 Exp. Date: 02/2028", "2025-03", "2028-02"],
  ["Mfd: AUG. 2025 Exp: JUL. 2027", "2025-08", "2027-07"],
  ["MFG.DT. 11/24 EXP.DT. 10/26", "2024-11", "2026-10"],
  ["M.D. 06/2025 E.D. 05/2027", "2025-06", "2027-05"],
  ["Mfg: Jan-25 Exp: Dec-26", "2025-01", "2026-12"],
  ["Mfd. 12/2024\nExp. 11/2026", "2024-12", "2026-11"],
  ["Exp. AUG. 2027", null, "2027-08"],
  ["EXP 08/2027", null, "2027-08"],
  ["Use before: 03/2028", null, "2028-03"],
  ["Mfg. Date 15/03/2025 Expiry Date 14/03/2027", "2025-03", "2027-03"],
  ["MFG O9/2O25 EXP O8/2O27", "2025-09", "2027-08"], // O -> 0
  ["Mfd: SEP 2025 Exp: AUG 2027", "2025-09", "2027-08"],
  ["Mfg.: 10.2025 Exp.: 09.2027", "2025-10", "2027-09"],
  ["MFD 04-2025 EXP 03-2027", "2025-04", "2027-03"],
  ["Exp: 13/2027", null, null], // month 13 is impossible
  ["Mfg 08/2025", "2025-08", null],
  ["DOM 07/2025 EXP 06/2028", "2025-07", "2028-06"],
  ["Mfg.Date:FEB.2025 Exp.Date:JAN.2028", "2025-02", "2028-01"],
  ["Best before Mar 2027", null, "2027-03"],
  ["Mfg. Lic. No. KTK/25/123", null, null],
  ["MFG: 1l/2025 EXP: 1O/2027", "2025-11", "2027-10"], // l -> 1, O -> 0
  ["Mfg Date: Oct 2025 Exp Date: Sept 2027", "2025-10", "2027-09"],
  ["EXP. 12/26", null, "2026-12"],
  ["Mfd 05/2025 Exp 04/2027 MRP Rs.50", "2025-05", "2027-04"],
];

// Expiry before manufacture: both read, but flagged with low confidence (one is a misread).
export const inconsistentDates = "MFG 09/2027 EXP 08/2025";

export const ingredientCases: [
  text: string,
  expected: { salt: string; value: number; unit: string }[] | null,
][] = [
  [
    "Each film coated tablet contains:\nMetformin Hydrochloride IP 500 mg",
    [{ salt: "Metformin Hydrochloride", value: 500, unit: "mg" }],
  ],
  [
    "Each uncoated tablet contains: Telmisartan IP 40 mg\nExcipients q.s.\nColour: Titanium Dioxide IP",
    [{ salt: "Telmisartan", value: 40, unit: "mg" }],
  ],
  [
    "Each tablet contains:\nGlimepiride IP 1 mg\nMetformin Hydrochloride IP 500 mg\n(in sustained release form)",
    [
      { salt: "Glimepiride", value: 1, unit: "mg" },
      { salt: "Metformin Hydrochloride", value: 500, unit: "mg" },
    ],
  ],
  [
    "Each tablet contains: Amlodipine Besilate IP eq. to Amlodipine 5 mg",
    [{ salt: "Amlodipine Besilate", value: 5, unit: "mg" }],
  ],
  [
    "Each tablet contains: Thyroxine Sodium IP 50 mcg",
    [{ salt: "Thyroxine Sodium", value: 0.05, unit: "mg" }],
  ],
  ["Each 5 ml contains: Paracetamol IP 125 mg", [{ salt: "Paracetamol", value: 125, unit: "mg" }]],
  [
    "Composition: Each tablet contains Atorvastatin Calcium IP eq. to Atorvastatin 10 mg + Aspirin IP 75 mg",
    [
      { salt: "Atorvastatin Calcium", value: 10, unit: "mg" },
      { salt: "Aspirin", value: 75, unit: "mg" },
    ],
  ],
  [
    "Each capsule contains: Pantoprazole Sodium IP 40 mg & Domperidone IP 30 mg",
    [
      { salt: "Pantoprazole Sodium", value: 40, unit: "mg" },
      { salt: "Domperidone", value: 30, unit: "mg" },
    ],
  ],
  [
    "Contains: Cholecalciferol IP 60000 IU",
    [{ salt: "Cholecalciferol", value: 60000, unit: "iu" }],
  ],
  ["Ketoconazole IP 2% w/w\nCream base q.s.", [{ salt: "Ketoconazole", value: 2, unit: "%" }]],
  [
    "Each film coated tablet contains: Losartan Potassium IP 50 mg and Hydrochlorothiazide IP 12.5 mg",
    [
      { salt: "Losartan Potassium", value: 50, unit: "mg" },
      { salt: "Hydrochlorothiazide", value: 12.5, unit: "mg" },
    ],
  ],
  [
    "Each tablet contains: Rosuvastatin Calcium IP eq. to Rosuvastatin 10 mg\nColours: Red Oxide of Iron",
    [{ salt: "Rosuvastatin Calcium", value: 10, unit: "mg" }],
  ],
  ["Store in a cool, dry place. Keep out of reach of children.", null],
  [
    "Each tablet contains: Paracetamol IP 650 mg",
    [{ salt: "Paracetamol", value: 650, unit: "mg" }],
  ],
  [
    "Each hard gelatin capsule contains: Omeprazole IP 20 mg (as enteric coated pellets)",
    [{ salt: "Omeprazole", value: 20, unit: "mg" }],
  ],
];

export const packCases: [text: string, expected: number | null][] = [
  ["Strip of 10 tablets", 10],
  ["10 x 15 Tablets", 15],
  ["Pack of 30 capsules", 30],
  ["15 Tablets", 15],
  ["10's", 10],
  ["Blister of 14", 14],
  ["Each tablet contains: Telmisartan IP 40 mg", null],
  ["Box of 3 strips", 3],
];

export const formCases: [text: string, expected: string | null][] = [
  ["Each film coated tablet contains", "tablet"],
  ["Each hard gelatin capsule contains", "capsule"],
  ["Oral Suspension IP", "suspension"],
  ["Cough Syrup", "syrup"],
  ["Eye Drops 5 ml", "eye_drops"],
  ["For external use only. Cream", "cream"],
  ["Store below 25°C", null],
];

export const manufacturerCases: [text: string, expected: string | null][] = [
  ["Manufactured by: Glenmark Pharmaceuticals Ltd.\nNashik", "Glenmark Pharmaceuticals Ltd."],
  ["Mfd. by:\nSun Pharmaceutical Industries Ltd.", "Sun Pharmaceutical Industries Ltd."],
  ["Marketed by: Abbott India Limited, Mumbai", "Abbott India Limited"],
  ["Mfg. by: Torrent Pharmaceuticals Ltd. Indrad", "Torrent Pharmaceuticals Ltd."],
  ["Keep out of reach of children", null],
];

export const brandCases: {
  text: string;
  lines?: { text: string; height: number; confidence: number }[];
  expected: string | null;
}[] = [
  {
    text: "Rx\nTELMA 40\nTelmisartan Tablets IP 40 mg\n10 Tablets",
    lines: [
      { text: "Rx", height: 20, confidence: 90 },
      { text: "TELMA 40", height: 64, confidence: 92 },
      { text: "Telmisartan Tablets IP 40 mg", height: 24, confidence: 88 },
      { text: "10 Tablets", height: 18, confidence: 90 },
    ],
    expected: "TELMA 40",
  },
  { text: "GLYCOMET 500 SR\nMetformin Hydrochloride", expected: "GLYCOMET 500 SR" },
  { text: "Each tablet contains\nIP 40 mg", expected: null },
];

// REAL OCR output from the evaluation photos (eval/photos, Wikimedia Commons / Flickr), copied
// from what Tesseract produced. Kept separate from the synthetic snippets above.
export const realSnippets = {
  mrpPerTabs: [
    "M.R.P. FOR 10 TABS.\nR5.33-00 INCLUSIVE",
    "MRP FOR 6 TABS.\nRs.15.00 INCL.OF ALL TAXES",
  ],
  batchWithNoise: "B.No.FCR 004 ii",
  splitIngredient: "Metformin\n500mg Tablets\nMetformin hydrochloride",
  noisyBrandLines: [
    { text: "pe fav TRE ER Ema", height: 140, confidence: 31 },
    { text: "— | DEMO", height: 120, confidence: 70 },
    { text: "Metformin", height: 90, confidence: 88 },
    { text: "500mg Tablets", height: 50, confidence: 86 },
  ],
};
