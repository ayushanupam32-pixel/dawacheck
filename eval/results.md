# DawaCheck evaluation results

Generated 2026-10-24 by `pnpm eval`.
Strips: 1 (demo). Photos with a back side: 1.

## Field reading: exact-match accuracy and character error rate (CER)

| Field       | DawaCheck (with preprocessing) | Baseline (raw Tesseract) | CER DawaCheck | CER baseline |
| ----------- | ------------------------------ | ------------------------ | ------------- | ------------ |
| brand       | 100% (1/1)                     | 0% (0/1)                 | 0.00          | 0.80         |
| ingredients | 100% (1/1)                     | 0% (0/1)                 | 0.00          | 1.00         |
| mrp         | 100% (1/1)                     | 0% (0/1)                 | 0.00          | 1.00         |
| packSize    | 100% (1/1)                     | 0% (0/1)                 | 0.00          | 1.00         |
| batchNo     | 100% (1/1)                     | 0% (0/1)                 | 0.00          | 1.00         |
| mfgDate     | 100% (1/1)                     | 0% (0/1)                 | 0.00          | 1.00         |
| expDate     | 100% (1/1)                     | 100% (1/1)               | 0.00          | 0.00         |

## Batch number: foil vs matte packs

| Pack  | DawaCheck  | Baseline |
| ----- | ---------- | -------- |
| Foil  | –          | –        |
| Matte | 100% (1/1) | 0% (0/1) |

## Speed (this computer, not a phone)

Median 550 ms, p95 550 ms per strip (front + back). Phone timing is measured
separately in the app ("How we read this" shows the time).

CER = edits needed / length of the true value (0 = perfect). Exact match ignores case,
spaces and punctuation. A field left empty in the label is not scored.
