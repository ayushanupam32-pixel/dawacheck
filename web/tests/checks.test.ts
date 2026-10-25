import { describe, expect, it } from "vitest";
import { parseCompositionKey } from "@/lib/ai/normalize";
import { checkBanned, combinationKey, type Medicine } from "@/lib/checks/banned";
import { checkBatch, type BatchInput } from "@/lib/checks/batch";
import type { AlertRow, BannedRow } from "@/lib/checks/types";
import { checkPrice, maxGst, pickCeiling, type CeilingRow } from "@/lib/checks/price";
import { chooseSalts, describeMedicine, parseChecksInput } from "@/lib/run-checks";

// Rows as loaded from the real CDSCO data (pipeline/clean/cdsco_alerts.csv, banned_fdcs.csv).
const alert = (over: Partial<AlertRow>): AlertRow => ({
  kind: "nsq",
  alert_month: "2026-09-01",
  product_name: "",
  brand_name: null,
  batch_no: "",
  batch_no_norm: "",
  mfg_date: null,
  exp_date: null,
  manufacturer: null,
  failed_parameter: null,
  reported_by: null,
  remarks: null,
  source_url: "https://cdsco.gov.in/opencms/opencms/en/Notifications/nsq-drugs/",
  ...over,
});
const ALZOMAC = alert({
  product_name: "Alprazolam Tablets IP 0.5 mg",
  brand_name: "Alzomac-0.5 Tablets",
  batch_no: "60098",
  batch_no_norm: "60098",
  manufacturer: "Uniza Lifecare Pvt. Ltd. , Sr. No. 919/7, Kadi-Detroj Road, Balasar, Gujarat",
  failed_parameter: "The sample does not conform to IP in respect of Dissolution",
});
const NAMIK = alert({
  product_name: "Aceclofenac, Paracetamol & Chlorzoxazone Tablets",
  brand_name: "Namik-MR",
  batch_no: "AT25-0938A",
  batch_no_norm: "AT250938A",
});
const LEVIPIL_2024 = alert({
  alert_month: "2024-01-01",
  product_name: "Levetiracetam Tablets IP (Levipil 500)",
  batch_no: "SIE1003A",
  batch_no_norm: "SIE1003A",
});
const TELMA_AM_SPURIOUS = alert({
  kind: "spurious",
  alert_month: "2026-08-01",
  product_name: "Telmisartan 40 mg and  Amlodipine 5mg tablets  IP (TELMA AM)",
  batch_no: "18230791",
  batch_no_norm: "18230791",
  manufacturer: "Under Investigation",
});

const input = (over: Partial<BatchInput>): BatchInput => ({
  batchNo: "",
  batchConfidence: 1,
  names: [],
  salts: [],
  manufacturer: null,
  ...over,
});

describe("checkBatch", () => {
  it("alerts when the batch and the brand both match", () => {
    const r = checkBatch(input({ batchNo: "60098", names: ["ALZOMAC 0.5"] }), [ALZOMAC], "2026-09");
    expect(r).toMatchObject({ status: "alert", reason: "match", checkedThrough: "2026-09" });
    expect(r.matches[0].failed_parameter).toContain("Dissolution");
  });

  it("matches on the ingredients when the brand was not read", () => {
    const r = checkBatch(
      input({ batchNo: "AT250938A", salts: ["aceclofenac", "chlorzoxazone", "paracetamol"] }),
      [NAMIK],
      "2026-09",
    );
    expect(r.status).toBe("alert");
  });

  it("matches on the manufacturer, even with the factory address in the alert", () => {
    const r = checkBatch(
      input({ batchNo: "60098", manufacturer: "UNIZA LIFECARE PVT. LTD." }),
      [ALZOMAC],
      "2026-09",
    );
    expect(r.status).toBe("alert");
  });

  it("finds a brand written in brackets in older alerts", () => {
    const r = checkBatch(
      input({ batchNo: "SIE1003A", names: ["Levipil 500"] }),
      [LEVIPIL_2024],
      "2026-09",
    );
    expect(r.status).toBe("alert");
  });

  it("reports spurious alerts too", () => {
    const r = checkBatch(
      input({ batchNo: "18230791", names: ["Telma AM"], salts: ["amlodipine", "telmisartan"] }),
      [TELMA_AM_SPURIOUS],
      "2026-09",
    );
    expect(r.status).toBe("alert");
    expect(r.matches[0].kind).toBe("spurious");
  });

  it("does not blame another product that happens to share the batch number", () => {
    const r = checkBatch(
      input({ batchNo: "60098", names: ["Glycomet 500"], salts: ["metformin"] }),
      [ALZOMAC],
      "2026-09",
    );
    expect(r).toMatchObject({ status: "ok", reason: "batch_only", matches: [] });
  });

  it("says ok only when the batch number was read with confidence", () => {
    expect(checkBatch(input({ batchNo: "" }), [], "2026-09")).toMatchObject({
      status: "unknown",
      reason: "no_batch",
    });
    expect(
      checkBatch(input({ batchNo: "6OO98", batchConfidence: 0.5 }), [], "2026-09"),
    ).toMatchObject({
      status: "unknown",
      reason: "uncertain_batch",
    });
    expect(checkBatch(input({ batchNo: "XYZ123" }), [], "2026-09")).toMatchObject({
      status: "ok",
      reason: "not_found",
    });
  });

  it("never says 'not found' when no alerts are loaded", () => {
    expect(checkBatch(input({ batchNo: "XYZ123" }), [], null)).toMatchObject({
      status: "unknown",
      reason: "no_data",
    });
  });
});

const banned = (over: Partial<BannedRow>): BannedRow => ({
  combination_key: null,
  salts: [],
  kind: "combination",
  status: "prohibited",
  description: "",
  strengths: null,
  salt_strengths: {},
  forms: [],
  releases: [],
  notification: null,
  notified_on: null,
  status_note: null,
  source_url: "https://cdsco.gov.in/",
  ...over,
});
// Real entries (pipeline/clean/banned_fdcs.csv), including the ones that, matched on salts
// alone, called thousands of legal medicines banned on the live site.
const ACECLO_SR = banned({
  combination_key: "aceclofenac|paracetamol",
  description: "Aceclofenac (SR) + Paracetamol",
  releases: ["er"],
});
const ACECLO_50_125 = banned({
  combination_key: "aceclofenac|paracetamol",
  description: "Aceclofenac 50mg + Paracetamol 125mg tablet",
  salt_strengths: { aceclofenac: ["50:mg"], paracetamol: ["125:mg"] },
  forms: ["tablet"],
});
const DICLO_INJ = banned({
  combination_key: "diclofenac|paracetamol",
  description: "Diclofenac + Paracetamol injection",
  forms: ["injection"],
});
const GLICLA_80_325 = banned({
  combination_key: "gliclazide|metformin",
  description: "Gliclazide 80mg + Metformin 325 mg",
  salt_strengths: { gliclazide: ["80:mg"], metformin: ["325:mg"] },
});
const S_ETODOLAC = banned({
  combination_key: "paracetamol|s-etodolac",
  description: "S(+) Etodolac + Paracetamol",
  notification: "S.O. 3284 (E) Dated 12.08.2024",
});
const PARA_PHENYL_CAFF = banned({
  combination_key: "caffeine|paracetamol|phenylephrine",
  status: "under_examination",
  description: "Paracetamol + Phenylephrine +Caffeine",
});
const GLIM_QUASHED = banned({
  combination_key: "glimepiride|metformin|pioglitazone",
  status: "quashed",
  salt_strengths: { glimepiride: ["1:mg", "2:mg"], pioglitazone: ["15:mg"], metformin: ["850:mg"] },
});
const ROSIGLITAZONE = banned({ combination_key: "rosiglitazone", kind: "single" });
const CATEGORY = banned({
  kind: "category",
  description: "Fixed dose combinations of vitamins with analgesics",
});
const ALL = [
  ACECLO_SR,
  ACECLO_50_125,
  DICLO_INJ,
  GLICLA_80_325,
  S_ETODOLAC,
  PARA_PHENYL_CAFF,
  GLIM_QUASHED,
  ROSIGLITAZONE,
  CATEGORY,
];

/** A medicine as a brand record describes it: "aceclofenac:100:mg|paracetamol:325:mg#tablet#ir". */
const med = (
  strengths: Record<string, number>,
  form: string | null = "tablet",
  releases: string[] | null = [],
  saltsComplete = true,
): Medicine => ({
  salts: Object.keys(strengths),
  saltsComplete,
  strengths: Object.fromEntries(
    Object.entries(strengths)
      .filter(([, v]) => v > 0)
      .map(([k, v]) => [k, { value: v, unit: "mg" }]),
  ),
  form,
  releases,
});

describe("checkBanned", () => {
  it("does not call ordinary aceclofenac + paracetamol tablets banned", () => {
    // e.g. 100 mg + 325 mg immediate-release tablets: sold legally by thousands of brands.
    expect(checkBanned(med({ aceclofenac: 100, paracetamol: 325 }), ALL)).toMatchObject({
      status: "ok",
      reason: "not_listed",
    });
  });

  it("matches the sustained-release form and the banned strengths", () => {
    expect(
      checkBanned(med({ aceclofenac: 200, paracetamol: 500 }, "tablet", ["er"]), ALL).status,
    ).toBe("alert");
    expect(checkBanned(med({ aceclofenac: 50, paracetamol: 125 }), ALL).status).toBe("alert");
  });

  it("an injection-only ban does not apply to tablets", () => {
    expect(checkBanned(med({ diclofenac: 50, paracetamol: 325 }), ALL).status).toBe("ok");
    expect(checkBanned(med({ diclofenac: 75, paracetamol: 150 }, "injection"), ALL).status).toBe(
      "alert",
    );
  });

  it("a strength-specific ban applies only to those strengths", () => {
    expect(checkBanned(med({ gliclazide: 80, metformin: 500 }), ALL).status).toBe("ok");
    expect(checkBanned(med({ gliclazide: 80, metformin: 325 }), ALL).status).toBe("alert");
  });

  it("a brand record that may be cut short cannot confirm an exact combination", () => {
    // "Acemiz-MR": aceclofenac + paracetamol + chlorzoxazone, recorded with only 2 salts.
    const r = checkBanned(
      med({ aceclofenac: 100, paracetamol: 325 }, "tablet", ["er"], false),
      ALL,
    );
    expect(r.status).toBe("warn");
    expect(r.matches[0].certain).toBe(false);
    // A single-drug ban only needs the drug to be there: still certain.
    expect(
      checkBanned(med({ metformin: 500, rosiglitazone: 2 }, "tablet", [], false), ALL).status,
    ).toBe("alert");
  });

  it("when a restriction cannot be checked, it is 'may apply', never 'prohibited'", () => {
    // Strengths unknown (strip without a brand record): the 50+125 mg entry may apply.
    const r = checkBanned(med({ aceclofenac: 0, paracetamol: 0 }, null, null), ALL);
    expect(r.status).toBe("warn");
    expect(r.matches.every((m) => !m.certain)).toBe(true);
  });

  it("matches the set of salts in any order, S(+) etodolac distinct from etodolac", () => {
    expect(combinationKey(["s-etodolac", "paracetamol"])).toBe("paracetamol|s-etodolac");
    expect(checkBanned(med({ "s-etodolac": 400, paracetamol: 325 }), ALL).status).toBe("alert");
    expect(checkBanned(med({ etodolac: 400, paracetamol: 325 }), ALL).status).toBe("ok");
  });

  it("an extra salt makes a different combination", () => {
    expect(
      checkBanned(
        med({ caffeine: 30, chlorpheniramine: 2, paracetamol: 500, phenylephrine: 10 }),
        ALL,
      ).status,
    ).toBe("ok");
  });

  it("court or committee status is a warning, not a ban", () => {
    expect(
      checkBanned(med({ paracetamol: 500, phenylephrine: 10, caffeine: 30 }), ALL),
    ).toMatchObject({
      status: "warn",
      reason: "review",
    });
    expect(checkBanned(med({ glimepiride: 2, pioglitazone: 15, metformin: 850 }), ALL).status).toBe(
      "warn",
    );
    // Strengths not in the quashed entry: it does not apply at all.
    expect(checkBanned(med({ glimepiride: 2, pioglitazone: 15, metformin: 500 }), ALL).status).toBe(
      "ok",
    );
  });

  it("a single-drug ban matches any medicine containing it", () => {
    expect(checkBanned(med({ metformin: 500, rosiglitazone: 2 }), ALL).status).toBe("alert");
  });

  it("never matches categories; needs a composition and loaded lists", () => {
    expect(checkBanned(med({ paracetamol: 500 }), [CATEGORY]).status).toBe("ok");
    expect(checkBanned(med({}), ALL)).toMatchObject({
      status: "unknown",
      reason: "no_composition",
    });
    expect(checkBanned(med({ paracetamol: 500 }), [], false)).toMatchObject({
      status: "unknown",
      reason: "no_data",
    });
  });
});

describe("describeMedicine", () => {
  it("takes strengths, form and release from the brand record", () => {
    const m = describeMedicine(
      parseCompositionKey("aceclofenac:100:mg|paracetamol:325:mg#tablet#ir"),
      [],
    );
    expect(m).toEqual({
      salts: ["aceclofenac", "paracetamol"],
      saltsComplete: true,
      strengths: {
        aceclofenac: { value: 100, unit: "mg" },
        paracetamol: { value: 325, unit: "mg" },
      },
      form: "tablet",
      releases: [],
    });
  });

  it("adds the strip's extra ingredient, and knows nothing about form without a brand", () => {
    const m = describeMedicine(
      parseCompositionKey("aceclofenac:100:mg|thiocolchicoside:4:mg#tablet#er"),
      [
        { salt: "Paracetamol IP", value: 325, unit: "mg" },
        { salt: "Aceclofenac", value: 100, unit: "mg" },
        { salt: "Thiocolchicoside", value: 4, unit: "mg" },
      ],
    );
    expect(m.salts).toHaveLength(3);
    // From the strip, as confirmed by the user: complete, even if the brand record is not.
    expect(m.saltsComplete).toBe(true);
    expect(m.strengths.paracetamol).toEqual({ value: 325, unit: "mg" });
    expect(m.releases).toEqual(["er"]);
    // The strip lists the same 2 salts as a cut-short record: still not proven complete (the
    // reader may have missed the third, as on "Acemiz-MR").
    expect(
      describeMedicine(
        parseCompositionKey("aceclofenac:100:mg|paracetamol:325:mg#tablet#er"),
        [
          { salt: "Aceclofenac", value: 100, unit: "mg" },
          { salt: "Paracetamol", value: 325, unit: "mg" },
        ],
        false,
      ).saltsComplete,
    ).toBe(false);
    // A brand record the dataset marks incomplete, with no strip ingredients: not complete.
    expect(
      describeMedicine(
        parseCompositionKey("aceclofenac:100:mg|paracetamol:325:mg#tablet#er"),
        [],
        false,
      ).saltsComplete,
    ).toBe(false);
    expect(describeMedicine(null, [{ salt: "Metformin", value: 500, unit: "mg" }])).toMatchObject({
      form: null,
      releases: null,
    });
  });
});

describe("which salts the checks use", () => {
  it("prefers the strip when it lists all of the brand's salts and more", () => {
    // Neorelax MR: the dataset keeps 2 ingredients, the strip lists 3.
    const brand = ["aceclofenac", "thiocolchicoside"];
    expect(chooseSalts(["aceclofenac", "paracetamol", "thiocolchicoside"], brand)).toHaveLength(3);
    // The reader missed one: the brand's record is more complete.
    expect(chooseSalts(["aceclofenac"], brand)).toEqual(brand);
    expect(chooseSalts([], brand)).toEqual(brand);
    expect(chooseSalts(["metformin"], [])).toEqual(["metformin"]);
  });
});

describe("parseChecksInput", () => {
  it("keeps valid fields and clamps the confidence", () => {
    expect(
      parseChecksInput({
        brandId: 7,
        batchNo: " ab-12 ",
        batchConfidence: 3,
        names: ["Telma", 4],
        x: 1,
      }),
    ).toEqual({
      brandId: 7,
      stripIngredients: [],
      batchNo: "ab-12",
      batchConfidence: 1,
      names: ["Telma"],
      manufacturer: null,
      mrp: null,
      packSize: null,
      mfgDate: null,
    });
    // MRP and count: positive numbers only.
    expect(parseChecksInput({ mrp: "103.8", packSize: 15 })).toMatchObject({
      mrp: 103.8,
      packSize: 15,
    });
    expect(parseChecksInput({ mrp: -5, packSize: "x" })).toMatchObject({
      mrp: null,
      packSize: null,
      mfgDate: null,
    });
    expect(parseChecksInput("x")).toBeNull();
  });
});

// Real rows of NPPA order S.O. 1575(E), in force from 1.4.2026.
const ceiling = (over: Partial<CeilingRow>): CeilingRow => ({
  composition_key: "telmisartan:40:mg#tablet#ir",
  medicine: "Telmisartan",
  dosage: "Tablet 40mg",
  unit: "1 Tablet",
  unit_kind: "unit",
  ceiling_price: 6.92,
  order_no: "S.O. 1575(E)",
  effective_from: "2026-04-01",
  list: "NLEM 2022",
  source_url: "https://nppa.gov.in/",
  ...over,
});
const TELMISARTAN_40 = ceiling({});
const price = (over: Partial<Parameters<typeof checkPrice>[0]>) => ({
  compositionKey: "telmisartan:40:mg#tablet#ir",
  saltsComplete: true,
  mrp: null,
  packSize: null,
  mfgDate: "2026-01", // made after the GST cut: 5% margin
  ...over,
});

describe("checkPrice", () => {
  it("is within the ceiling when MRP per tablet <= ceiling + 5% GST", () => {
    // 15 tablets for 103.80 = 6.92 a tablet, exactly the ceiling.
    const r = checkPrice(price({ mrp: 103.8, packSize: 15 }), [TELMISARTAN_40]);
    expect(r).toMatchObject({ status: "ok", reason: "within", perUnit: 6.92, maxWithGst: 7.27 });
    // 7.26 a tablet: above the ceiling, but within ceiling + 5% GST.
    expect(checkPrice(price({ mrp: 108.9, packSize: 15 }), [TELMISARTAN_40]).reason).toBe("within");
  });

  it("allows 12% GST for strips made before the 22.09.2025 cut, or of unknown date", () => {
    // 7.75 a tablet = ceiling + 12%: correct for a strip made in 2024, too high for one in 2026.
    expect(
      checkPrice(price({ mrp: 116.25, packSize: 15, mfgDate: "2024-06" }), [TELMISARTAN_40]),
    ).toMatchObject({ reason: "within", maxWithGst: 7.75 });
    expect(
      checkPrice(price({ mrp: 116.25, packSize: 15, mfgDate: null }), [TELMISARTAN_40]).reason,
    ).toBe("within");
    expect(checkPrice(price({ mrp: 116.25, packSize: 15 }), [TELMISARTAN_40]).reason).toBe("above");
  });

  it("is above the ceiling when MRP per tablet > ceiling + 5% GST", () => {
    const r = checkPrice(price({ mrp: 150, packSize: 15 }), [TELMISARTAN_40]);
    expect(r).toMatchObject({ status: "warn", reason: "above", perUnit: 10 });
  });

  it("says when a medicine is not price-controlled", () => {
    expect(
      checkPrice(price({ compositionKey: "aceclofenac:100:mg|paracetamol:325:mg#tablet#ir" }), [
        TELMISARTAN_40,
      ]),
    ).toMatchObject({ status: "na", reason: "not_scheduled" });
  });

  it("needs the MRP and the count, and per-tablet prices only", () => {
    expect(checkPrice(price({ mrp: 103.8 }), [TELMISARTAN_40])).toMatchObject({
      status: "unknown",
      reason: "need_mrp",
      maxWithGst: 7.27,
    });
    const syrup = ceiling({ composition_key: "x:1:mg/ml#syrup#ir", unit: "1 ML", unit_kind: "ml" });
    expect(
      checkPrice(price({ compositionKey: "x:1:mg/ml#syrup#ir", mrp: 50, packSize: 60 }), [syrup])
        .reason,
    ).toBe("other_unit");
  });

  it("does not guess the ceiling of a combination whose ingredient list may be cut short", () => {
    const amoxiclav = ceiling({
      composition_key: "amoxicillin:500:mg|clavulanic acid:125:mg#tablet#ir",
    });
    expect(
      checkPrice(
        price({
          compositionKey: amoxiclav.composition_key,
          saltsComplete: false,
          mrp: 200,
          packSize: 10,
        }),
        [amoxiclav],
      ),
    ).toMatchObject({ status: "unknown", reason: "unsure_composition" });
  });

  it("prefers the newer list, and the highest price among several", () => {
    const old = ceiling({ list: "NLEM 2015", ceiling_price: 9 });
    const a = ceiling({ ceiling_price: 6.5 });
    expect(pickCeiling([old, a, TELMISARTAN_40])?.ceiling_price).toBe(6.92);
    expect(pickCeiling([old])?.ceiling_price).toBe(9);
  });

  it("needs a composition and loaded prices", () => {
    expect(checkPrice(price({ compositionKey: null }), []).reason).toBe("no_composition");
    expect(checkPrice(price({}), [], false).reason).toBe("no_data");
  });
});

describe("maxGst", () => {
  it("is 5% for strips made from October 2025, 12% before or when unknown", () => {
    expect(maxGst("2025-10")).toBe(0.05);
    expect(maxGst("2025-09")).toBe(0.12); // the cut was on 22.09.2025: either rate possible
    expect(maxGst(null)).toBe(0.12);
  });
});
