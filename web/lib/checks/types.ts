// Shared shapes for the six checks on the result card (M5).
//
// Every check is a pure function that returns a status and structured details; the result card
// turns them into words in the user's language. Statuses, as in the project brief:
//   ok       nothing found (never "safe": only "not on the lists we checked")
//   warn     something to show the pharmacist, but not a confirmed problem
//   alert    a confirmed match on an official list
//   na       does not apply / no data yet
//   unknown  could not check (e.g. the batch number could not be read reliably)

export type CheckStatus = "ok" | "warn" | "alert" | "na" | "unknown";

/** A row of nsq_alerts (CDSCO Not of Standard Quality / spurious drug alerts). */
export type AlertRow = {
  kind: "nsq" | "spurious";
  alert_month: string; // YYYY-MM-DD (first of the month)
  product_name: string;
  brand_name: string | null;
  batch_no: string;
  batch_no_norm: string;
  mfg_date: string | null;
  exp_date: string | null;
  manufacturer: string | null;
  failed_parameter: string | null;
  reported_by: string | null;
  remarks: string | null;
  source_url: string;
};

/** A row of banned_fdcs (CDSCO lists of prohibited fixed-dose combinations). */
export type BannedRow = {
  combination_key: string | null;
  salts: string[];
  kind: "combination" | "single" | "category";
  status:
    | "prohibited"
    | "stayed"
    | "quashed"
    | "under_examination"
    | "revoked_with_conditions"
    | "restricted";
  description: string;
  strengths: string | null;
  notification: string | null;
  notified_on: string | null;
  status_note: string | null;
  source_url: string;
};
