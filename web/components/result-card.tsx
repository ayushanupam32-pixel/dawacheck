"use client";

// The result card (M5): five checks for one strip (the family-cabinet check of the brief's
// M6 was dropped by the user), each a row with an icon AND words for its
// status (never colour alone). The checks run on the server (/api/checks); this file only shows
// them. Wording follows the medical-safety rules: "show this to your pharmacist", never
// "stop taking" or "unsafe for you"; "not found in the lists we checked", never "safe".

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  CheckCircle2,
  CircleHelp,
  MapPin,
  MinusCircle,
  OctagonAlert,
  RotateCcw,
} from "lucide-react";
import { fill } from "@/components/generic-result";
import { Button } from "@/components/ui/button";
import { panelClass, Skeleton } from "@/components/ui/field";
import type { CheckStatus } from "@/lib/checks/types";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import type { PriceResult } from "@/lib/checks/price";
import type { ChecksResponse } from "@/lib/run-checks";
import { formatRupees } from "@/lib/savings";

type T = Dictionary["checks"];

export type ResultCardInput = {
  brandId: number;
  /** Ingredients confirmed from the strip, with strengths (the banned check compares them). */
  stripIngredients: { salt: string; value: number; unit: string }[];
  /** MRP printed on the strip (₹) and the number of tablets/capsules, for the fair price. */
  mrp: number | null;
  packSize: number | null;
  /** Manufacturing month ("YYYY-MM"), for the GST margin. */
  mfgDate: string | null;
  batchNo: string;
  batchConfidence: number;
  names: string[];
  manufacturer: string | null;
};

const STATUS_ICON: Record<CheckStatus, typeof CheckCircle2> = {
  ok: CheckCircle2,
  warn: AlertTriangle,
  alert: OctagonAlert,
  na: MinusCircle,
  unknown: CircleHelp,
};
const STATUS_COLOR: Record<CheckStatus, string> = {
  ok: "text-status-ok",
  warn: "text-status-warn",
  alert: "text-status-alert",
  na: "text-status-na",
  unknown: "text-status-warn",
};
/** The status chip's tint and border. The words inside stay in the normal text colour. */
const STATUS_CHIP: Record<CheckStatus, string> = {
  ok: "bg-status-ok/12 border-status-ok/40",
  warn: "bg-status-warn/15 border-status-warn/50",
  alert: "bg-status-alert/12 border-status-alert/50",
  na: "bg-muted border-border",
  unknown: "bg-status-warn/12 border-status-warn/40",
};

/** "2026-09" -> "Sep 2026" in the user's language. */
const monthName = (yyyyMm: string, locale: string) =>
  new Date(`${yyyyMm.slice(0, 7)}-01T00:00:00`).toLocaleDateString(`${locale}-IN`, {
    month: "short",
    year: "numeric",
  });

export function ResultCard({
  t,
  locale,
  input,
  disclaimer,
}: {
  t: T;
  locale: string;
  input: ResultCardInput;
  disclaimer: string;
}) {
  const key = JSON.stringify(input);
  const [state, setState] = useState<
    | { key: string; step: "loading" }
    | { key: string; step: "done"; data: ChecksResponse }
    | { key: string; step: "error" }
  >({ key, step: "loading" });
  const [attempt, setAttempt] = useState(0);
  const current = state.key === key ? state : { key, step: "loading" as const };

  useEffect(() => {
    let cancelled = false;
    // POST: batch numbers and medicine details go in the body, not the URL.
    fetch("/api/checks", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: key,
    })
      .then((res) => {
        if (!res.ok) throw new Error(String(res.status));
        return res.json() as Promise<ChecksResponse>;
      })
      .then((data) => !cancelled && setState({ key, step: "done", data }))
      .catch(() => !cancelled && setState({ key, step: "error" }));
    return () => {
      cancelled = true;
    };
  }, [key, attempt]);

  if (current.step === "loading") {
    // Five placeholder rows, the shape of the card that is coming.
    return (
      <div role="status" className={panelClass("flex flex-col gap-4 p-5")}>
        <span className="sr-only">{t.loading}</span>
        <Skeleton className="h-7 w-1/2" />
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="flex flex-col gap-2 border-t border-border pt-4">
            <div className="flex justify-between gap-4">
              <Skeleton className="h-5 w-2/5" />
              <Skeleton className="h-6 w-24 rounded-full" />
            </div>
            <Skeleton className="h-4 w-4/5" />
          </div>
        ))}
      </div>
    );
  }
  if (current.step === "error") {
    return (
      <div className="flex flex-col gap-3 rounded-2xl border-2 border-status-warn bg-card p-5">
        <p className="text-base">{t.error}</p>
        <Button variant="outline" className="w-fit" onClick={() => setAttempt((a) => a + 1)}>
          <RotateCcw aria-hidden="true" />
          {t.checkAgain}
        </Button>
      </div>
    );
  }

  const { data } = current;
  const batch = data.batch;
  const batchNo = input.batchNo.toUpperCase();
  const legal = (status: string) => t[`legal_${status}` as keyof T] ?? status;
  const updated = (iso: string | null) =>
    iso ? `${t.updated}: ${new Date(iso).toLocaleDateString(`${locale}-IN`)}` : "";

  return (
    <section
      aria-labelledby="checks-title"
      // No entrance animation: the card re-runs its checks as the user types a batch or MRP, and a
      // fade on every keystroke would flicker.
      className={panelClass("flex flex-col gap-2 p-5")}
    >
      <h2 id="checks-title" className="text-2xl font-bold tracking-tight">
        {t.title}
      </h2>
      <ul className="flex flex-col divide-y divide-border">
        <Row
          t={t}
          title={t.genericTitle}
          status={data.generic.found ? "ok" : "na"}
          label={data.generic.found ? t.statusAvailable : undefined}
        >
          <p>{data.generic.found ? t.genericFound : t.genericNone}</p>
        </Row>

        <Row t={t} title={t.batchTitle} status={batch.status}>
          {batch.reason === "match" ? (
            <>
              <p className="font-medium">
                {batch.matches.some((m) => m.kind === "spurious") ? t.batchSpurious : t.batchAlert}
              </p>
              <ul className="list-inside list-disc">
                {batch.matches.slice(0, 3).map((m, i) => (
                  <li key={i}>
                    {fill(t.batchAlertDetail, {
                      month: monthName(m.alert_month, locale),
                      product: m.brand_name
                        ? `${m.brand_name} (${m.product_name})`
                        : m.product_name,
                      batch: m.batch_no,
                      failed: m.failed_parameter ?? "-",
                      lab: m.reported_by ?? "-",
                    })}
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p>
              {fill(
                {
                  not_found: t.batchNotFound,
                  batch_only: t.batchOnly,
                  no_batch: t.batchNoBatch,
                  uncertain_batch: t.batchUncertain,
                  no_data: t.noData,
                  match: t.batchAlert,
                }[batch.reason],
                { batch: batchNo },
              )}
            </p>
          )}
          {batch.checkedThrough && batch.status !== "unknown" && (
            <Source
              t={t}
              url={data.sources.alerts.url}
              note={`${fill(t.checkedThrough, { month: monthName(batch.checkedThrough, locale) })} ${updated(data.sources.alerts.updatedOn)}`}
            />
          )}
        </Row>

        <Row t={t} title={t.priceTitle} status={data.price.status}>
          <PriceText t={t} locale={locale} price={data.price} />
          {data.price.ceiling && (
            <p className="text-sm text-muted-foreground">
              {t.source}:{" "}
              <a
                href={data.price.ceiling.source_url}
                target="_blank"
                rel="noreferrer"
                className="underline"
              >
                NPPA
              </a>{" "}
              {fill(t.priceSource, {
                order: data.price.ceiling.order_no,
                date: new Date(data.price.ceiling.effective_from).toLocaleDateString(
                  `${locale}-IN`,
                ),
              })}
            </p>
          )}
        </Row>

        <Row t={t} title={t.bannedTitle} status={data.banned.status}>
          {data.banned.reason === "prohibited" ? (
            <p className="font-medium">
              {fill(t.bannedAlert, { notification: data.banned.matches[0].notification ?? "" })}
            </p>
          ) : data.banned.reason === "review" ? (
            <>
              <p className="font-medium">{t.bannedReview}</p>
              <ul className="list-inside list-disc">
                {data.banned.matches.map((m, i) => (
                  <li key={i}>
                    {legal(m.status)}: {m.description}
                    {m.notification && ` (${m.notification})`}
                    {m.strengths && `. ${fill(t.bannedStrengths, { strengths: m.strengths })}`}
                    {/* The entry names a form, release type or strength we could not confirm. */}
                    {!m.certain && ` (${t.bannedMaybe})`}
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p>
              {
                {
                  no_composition: t.bannedNoComposition,
                  no_data: t.noData,
                  not_listed: t.bannedNotListed,
                }[data.banned.reason]
              }
            </p>
          )}
          {data.banned.status !== "unknown" && (
            <Source t={t} url={data.sources.fdc.url} note={updated(data.sources.fdc.updatedOn)} />
          )}
        </Row>

        <Row t={t} title={t.kendraTitle} status="na" hideStatus>
          <Link
            href={`/${locale}/kendras`}
            className="inline-flex min-h-12 items-center gap-2 font-medium underline underline-offset-4"
          >
            <MapPin aria-hidden="true" className="size-5" />
            {t.kendraLink}
          </Link>
        </Row>
      </ul>
      <p className="mt-2 rounded-xl bg-muted p-4 text-sm leading-relaxed">{disclaimer}</p>
    </section>
  );
}

/** The fair-price row in words. Prices exclude GST, so the GST is always said. */
function PriceText({ t, locale, price }: { t: T; locale: string; price: PriceResult }) {
  const rupees = (x: number | null) => (x === null ? "" : formatRupees(x, `${locale}-IN`));
  const c = price.ceiling;
  const values = {
    perUnit: rupees(price.perUnit),
    ceiling: rupees(c?.ceiling_price ?? null),
    max: rupees(price.maxWithGst),
    gst: `${Math.round(price.gst * 100)}%`,
    unit: c?.unit.replace(/^1\s*/, "").toLowerCase() ?? "",
  };
  const text = {
    within: t.priceWithin,
    above: t.priceAbove,
    not_scheduled: t.priceNotScheduled,
    need_mrp: t.priceNeedMrp,
    other_unit: t.priceOtherUnit,
    unsure_composition: t.priceUnsure,
    no_composition: t.bannedNoComposition,
    no_data: t.noData,
  }[price.reason];
  return <p className={price.reason === "above" ? "font-medium" : ""}>{fill(text, values)}</p>;
}

function Row({
  t,
  title,
  status,
  label: ownLabel,
  hideStatus = false,
  children,
}: {
  t: T;
  title: string;
  status: CheckStatus;
  /** For rows where "ok" means "found" (the generic), not "no problem found". */
  label?: string;
  hideStatus?: boolean;
  children: React.ReactNode;
}) {
  const Icon = STATUS_ICON[status];
  const label =
    ownLabel ??
    {
      ok: t.statusOk,
      warn: t.statusWarn,
      alert: t.statusAlert,
      na: t.statusNa,
      unknown: t.statusUnknown,
    }[status];
  return (
    <li
      className={`flex flex-col gap-1.5 py-4 text-base leading-relaxed ${
        // A government alert is the most important thing the card can say: it gets a tinted band
        // with a red edge, on top of the icon and the word "Alert".
        status === "alert"
          ? "-mx-5 border-l-4 border-l-status-alert bg-status-alert/8 px-4 sm:rounded-r-xl"
          : ""
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-lg font-semibold">{title}</h3>
        {!hideStatus && (
          <span
            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-sm font-semibold ${STATUS_CHIP[status]}`}
          >
            <Icon aria-hidden="true" className={`size-4.5 ${STATUS_COLOR[status]}`} />
            <span className="text-foreground">{label}</span>
          </span>
        )}
      </div>
      {children}
    </li>
  );
}

function Source({ t, url, note }: { t: T; url: string; note: string }) {
  return (
    <p className="text-sm text-muted-foreground">
      {t.source}:{" "}
      <a href={url} target="_blank" rel="noreferrer" className="underline">
        CDSCO
      </a>
      {note && `, ${note.trim()}`}
    </p>
  );
}
