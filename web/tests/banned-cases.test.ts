// The project brief's accuracy test for the banned-combination check: "correct verdict on 20
// positive and 20 negative cases" (target 100%).
//
// Each case is a medicine described in full (salts, strengths, form, release type), as a complete
// brand record or a fully confirmed strip gives it. The expected verdict comes from the official
// list text, not from our code:
// - banned: the CDSCO notification that bans exactly this medicine is quoted;
// - legal: widely sold combinations whose ingredients appear in the lists only inside OTHER
//   combinations (an extra salt, or a restricted form or strength), checked against the raw PDF
//   text (2026-10-25).
//
// The entries are a snapshot of pipeline/clean/banned_fdcs.csv (all 687), regenerated when the
// parser changes: see docs/milestones/M5-safety-checks.md.

import { describe, expect, it } from "vitest";
import { checkBanned, type Medicine } from "@/lib/checks/banned";
import type { BannedRow } from "@/lib/checks/types";
import entries from "./fixtures/banned-fdcs.json";

const ALL = entries as BannedRow[];

/** A fully known medicine: strengths in mg (or mg/ml), a form, and its release types. */
const med = (s: Record<string, number>, form: string, releases: string[] = []): Medicine => ({
  salts: Object.keys(s),
  saltsComplete: true,
  strengths: Object.fromEntries(Object.entries(s).map(([k, v]) => [k, { value: v, unit: "mg" }])),
  form,
  releases,
});

const BANNED: [string, Medicine, string][] = [
  ["Rosiglitazone 4 mg tablet", med({ rosiglitazone: 4 }, "tablet"), "GSR 910(E) 12.11.2010"],
  ["Terfenadine 60 mg tablet", med({ terfenadine: 60 }, "tablet"), "GSR 191(E) 05.03.2003"],
  ["Astemizole 10 mg tablet", med({ astemizole: 10 }, "tablet"), "GSR 191(E) 05.03.2003"],
  ["Phenformin 25 mg tablet", med({ phenformin: 25 }, "tablet"), "GSR 780(E) 01.10.2003"],
  ["Rimonabant 20 mg tablet", med({ rimonabant: 20 }, "tablet"), "GSR 884(E) 11.12.2009"],
  [
    "Nimesulide 100 + Paracetamol 325 dispersible tablet",
    med({ nimesulide: 100, paracetamol: 325 }, "tablet", ["dispersible"]),
    "S.O. 2394(E) 02.06.2023",
  ],
  [
    "Diclofenac 75 + Paracetamol 150 injection",
    med({ diclofenac: 75, paracetamol: 150 }, "injection"),
    "S.O. 4421(E) 07.09.2018",
  ],
  [
    "Aceclofenac 200 SR + Paracetamol 500 tablet",
    med({ aceclofenac: 200, paracetamol: 500 }, "tablet", ["er"]),
    "S.O. 4420(E) 07.09.2018",
  ],
  [
    "Aceclofenac 50 + Paracetamol 125 tablet",
    med({ aceclofenac: 50, paracetamol: 125 }, "tablet"),
    "S.O. 3409(E) 02.08.2024",
  ],
  [
    "Gliclazide 80 + Metformin 325 tablet",
    med({ gliclazide: 80, metformin: 325 }, "tablet"),
    "S.O. 4468(E) 07.09.2018",
  ],
  [
    "Azithromycin 250 + Cefixime 200 tablet",
    med({ azithromycin: 250, cefixime: 200 }, "tablet"),
    "S.O. 4422(E) 07.09.2018",
  ],
  [
    "Amoxicillin 250 + Dicloxacillin 250 capsule",
    med({ amoxicillin: 250, dicloxacillin: 250 }, "capsule"),
    "S.O. 4423(E) 07.09.2018",
  ],
  [
    "Ofloxacin 200 + Ornidazole 500 injection",
    med({ ofloxacin: 200, ornidazole: 500 }, "injection"),
    "S.O. 4703(E) 07.09.2018",
  ],
  [
    "Chlorpheniramine + Codeine syrup",
    med({ chlorpheniramine: 0.8, codeine: 2 }, "syrup"),
    "S.O. 2398(E) 02.06.2023",
  ],
  [
    "S(+) Etodolac 400 + Paracetamol 325 tablet",
    med({ "s-etodolac": 400, paracetamol: 325 }, "tablet"),
    "S.O. 3284(E) 12.08.2024",
  ],
  [
    "Nimesulide 100 + Serratiopeptidase 15 tablet",
    med({ nimesulide: 100, serratiopeptidase: 15 }, "tablet"),
    "S.O. 4389(E) 07.09.2018",
  ],
  [
    "Flupenthixol 0.5 + Melitracen 10 tablet",
    med({ flupenthixol: 0.5, melitracen: 10 }, "tablet"),
    "G.S.R. 377(E) 18.06.2013",
  ],
  [
    "Cefixime 200 + Ornidazole 500 tablet",
    med({ cefixime: 200, ornidazole: 500 }, "tablet"),
    "S.O. 215(E) 11.01.2019",
  ],
  [
    "Levocetirizine 5 + Phenylephrine 5 tablet",
    med({ levocetirizine: 5, phenylephrine: 5 }, "tablet"),
    "S.O. 3387(E) 02.08.2024",
  ],
  [
    "Mefenamic acid 50 + Paracetamol 150 injection",
    med({ "mefenamic acid": 50, paracetamol: 150 }, "injection"),
    "S.O. 3293(E) 02.08.2024",
  ],
];

const LEGAL: [string, Medicine][] = [
  ["Paracetamol 500 tablet", med({ paracetamol: 500 }, "tablet")],
  [
    "Aceclofenac 100 + Paracetamol 325 tablet",
    med({ aceclofenac: 100, paracetamol: 325 }, "tablet"),
  ],
  ["Diclofenac 50 + Paracetamol 325 tablet", med({ diclofenac: 50, paracetamol: 325 }, "tablet")],
  ["Nimesulide 100 + Paracetamol 325 tablet", med({ nimesulide: 100, paracetamol: 325 }, "tablet")],
  ["Gliclazide 80 + Metformin 500 tablet", med({ gliclazide: 80, metformin: 500 }, "tablet")],
  ["Ofloxacin 200 + Ornidazole 500 tablet", med({ ofloxacin: 200, ornidazole: 500 }, "tablet")],
  ["Etodolac 400 + Paracetamol 325 tablet", med({ etodolac: 400, paracetamol: 325 }, "tablet")],
  ["Telmisartan 40 tablet", med({ telmisartan: 40 }, "tablet")],
  ["Metformin 500 tablet", med({ metformin: 500 }, "tablet")],
  ["Amlodipine 5 tablet", med({ amlodipine: 5 }, "tablet")],
  ["Atorvastatin 10 tablet", med({ atorvastatin: 10 }, "tablet")],
  ["Pantoprazole 40 tablet", med({ pantoprazole: 40 }, "tablet", ["dr"])],
  [
    "Amoxicillin 500 + Clavulanic acid 125 tablet",
    med({ amoxicillin: 500, "clavulanic acid": 125 }, "tablet"),
  ],
  ["Cefixime 200 tablet", med({ cefixime: 200 }, "tablet")],
  ["Cetirizine 10 tablet", med({ cetirizine: 10 }, "tablet")],
  [
    "Montelukast 10 + Levocetirizine 5 tablet",
    med({ montelukast: 10, levocetirizine: 5 }, "tablet"),
  ],
  ["Glimepiride 2 + Metformin 500 tablet", med({ glimepiride: 2, metformin: 500 }, "tablet")],
  [
    "Domperidone 30 SR + Rabeprazole 20 capsule",
    med({ domperidone: 30, rabeprazole: 20 }, "capsule", ["dr", "er"]),
  ],
  ["Azithromycin 500 tablet", med({ azithromycin: 500 }, "tablet")],
  ["Ibuprofen 400 + Paracetamol 325 tablet", med({ ibuprofen: 400, paracetamol: 325 }, "tablet")],
];

describe("banned check: 20 banned medicines (brief: 100%)", () => {
  it.each(BANNED)("%s is prohibited (%s)", (_name, medicine) => {
    const r = checkBanned(medicine, ALL);
    expect(r.status).toBe("alert");
    expect(r.reason).toBe("prohibited");
  });
});

describe("banned check: 20 legal medicines (brief: 100%)", () => {
  it.each(LEGAL)("%s is not listed", (_name, medicine) => {
    expect(checkBanned(medicine, ALL)).toMatchObject({ status: "ok", reason: "not_listed" });
  });
});
