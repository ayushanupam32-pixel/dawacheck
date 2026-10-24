import { describe, expect, it } from "vitest";
import { checkBanned, combinationKey } from "@/lib/checks/banned";
import { checkBatch, type BatchInput } from "@/lib/checks/batch";
import type { AlertRow, BannedRow } from "@/lib/checks/types";
import { chooseSalts, parseChecksInput } from "@/lib/run-checks";

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
  notification: null,
  notified_on: null,
  status_note: null,
  source_url: "https://cdsco.gov.in/",
  ...over,
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
const GLIM_2016 = banned({ combination_key: "glimepiride|metformin|pioglitazone" });
const GLIM_QUASHED = banned({
  combination_key: "glimepiride|metformin|pioglitazone",
  status: "quashed",
  strengths: "1mg/2mg ; 15mg/15mg ; 850mg/850mg",
});
const ROSIGLITAZONE = banned({ combination_key: "rosiglitazone", kind: "single" });
const CATEGORY = banned({
  kind: "category",
  description: "Fixed dose combinations of vitamins with analgesics",
});
const ALL = [S_ETODOLAC, PARA_PHENYL_CAFF, GLIM_2016, GLIM_QUASHED, ROSIGLITAZONE, CATEGORY];

describe("checkBanned", () => {
  it("matches the set of salts in any order", () => {
    expect(combinationKey(["s-etodolac", "paracetamol"])).toBe("paracetamol|s-etodolac");
    expect(checkBanned(["s-etodolac", "paracetamol"], ALL)).toMatchObject({
      status: "alert",
      reason: "prohibited",
    });
  });

  it("does not treat ordinary etodolac as S(+) etodolac", () => {
    expect(checkBanned(["etodolac", "paracetamol"], ALL).status).toBe("ok");
  });

  it("a different combination (an extra salt) is not a match", () => {
    expect(
      checkBanned(["caffeine", "chlorpheniramine", "paracetamol", "phenylephrine"], ALL).status,
    ).toBe("ok");
  });

  it("court or committee status is a warning, not a ban", () => {
    expect(checkBanned(["paracetamol", "phenylephrine", "caffeine"], ALL)).toMatchObject({
      status: "warn",
      reason: "review",
    });
  });

  it("warns when entries differ by strength and status", () => {
    const r = checkBanned(["metformin", "glimepiride", "pioglitazone"], ALL);
    expect(r.status).toBe("warn");
    expect(r.matches).toHaveLength(2);
  });

  it("a single-drug ban matches any medicine containing it", () => {
    expect(checkBanned(["metformin", "rosiglitazone"], ALL).status).toBe("alert");
  });

  it("never matches categories, and needs a composition", () => {
    expect(checkBanned(["paracetamol"], [CATEGORY]).status).toBe("ok");
    expect(checkBanned([], ALL)).toMatchObject({ status: "unknown", reason: "no_composition" });
    // Lists not loaded: "not listed" would be a guess.
    expect(checkBanned(["paracetamol"], [], false)).toMatchObject({
      status: "unknown",
      reason: "no_data",
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
      stripSalts: [],
      batchNo: "ab-12",
      batchConfidence: 1,
      names: ["Telma"],
      manufacturer: null,
    });
    expect(parseChecksInput("x")).toBeNull();
  });
});
