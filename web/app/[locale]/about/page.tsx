import Link from "next/link";
import { notFound } from "next/navigation";
import { cacheLife } from "next/cache";
import { ArrowLeft, ExternalLink, Info } from "lucide-react";
import { evalSummary, type ReaderSummary } from "@/lib/eval-summary";
import { isLocale } from "@/lib/i18n/config";
import { getDictionary, type Dictionary } from "@/lib/i18n/dictionaries";
import { supabase } from "@/lib/supabase";

// About page (brief, section 6): every data source with its last-updated date, the evaluation
// results, the privacy explanation and the disclaimer. The numbers come from
// lib/eval-summary.json, which the evaluation scripts write; nothing here is typed in by hand.

const REPO = "https://github.com/ayushanupam32-pixel/dawacheck";

/** Our sources, in the order shown. `key` is the pipeline's row in `data_sources` (not OSM). */
const SOURCES = [
  { key: "ja_products", url: "https://janaushadhi.gov.in/product-portfolio/product-mrp-list" },
  { key: "kendras", url: "https://janaushadhi.gov.in/near-by-kendra" },
  { key: "cdsco_alerts", url: "https://cdsco.gov.in/opencms/opencms/en/Notifications/nsq-drugs/" },
  { key: "cdsco_fdc", url: "https://cdsco.gov.in/opencms/opencms/en/Drugs/FDC/" },
  { key: "nppa", url: "https://nppa.gov.in/en/view_more?id=4" },
  {
    key: "brands",
    url: "https://www.kaggle.com/datasets/shudhanshusingh/az-medicine-dataset-of-india",
  },
  { key: "osm", url: "https://www.openstreetmap.org/copyright" },
] as const;

type SourceRow = { source: string; last_run_at: string; rows_loaded: number };

/**
 * When the monthly refresh last loaded each source. Cached for an hour, so the page stays a fast
 * static page and the database is asked at most once an hour. If the database can't be reached
 * (e.g. a build without its keys), the page still works and just says the date isn't available.
 */
async function refreshDates(): Promise<SourceRow[] | null> {
  "use cache";
  cacheLife("hours");
  try {
    const { data, error } = await supabase()
      .from("data_sources")
      .select("source, last_run_at, rows_loaded");
    return error ? null : (data as SourceRow[]);
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: PageProps<"/[locale]/about">) {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const dict = await getDictionary(locale);
  return { title: `${dict.about.title} — DawaCheck` };
}

const fill = (text: string, values: Record<string, string | number>) =>
  text.replace(/\{(\w+)\}/g, (_, k: string) => String(values[k] ?? ""));

const percent = (x: number | null) => (x === null ? "—" : `${Math.round(x * 100)}%`);

export default async function AboutPage({ params }: PageProps<"/[locale]/about">) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const dict = await getDictionary(locale);
  const t = dict.about;
  const rows = await refreshDates();
  const date = (iso: string) =>
    new Date(iso).toLocaleDateString(`${locale}-IN`, {
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: "Asia/Kolkata",
    });
  const number = (n: number) => n.toLocaleString(`${locale}-IN`);

  const sectionClass = "flex flex-col gap-3";
  const h2Class = "text-2xl font-semibold tracking-tight";

  return (
    <div className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-6 px-4 py-6">
      <Link
        href={`/${locale}`}
        className="inline-flex min-h-12 w-fit items-center gap-2 text-base font-medium underline-offset-4 hover:underline"
      >
        <ArrowLeft aria-hidden="true" className="size-5" />
        DawaCheck
      </Link>
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight">{t.title}</h1>
        <p className="text-lg text-muted-foreground">{t.intro}</p>
      </div>

      <main className="flex flex-col gap-10">
        <section aria-labelledby="sources" className={sectionClass}>
          <h2 id="sources" className={h2Class}>
            {t.sourcesTitle}
          </h2>
          <p className="text-base">{t.sourcesIntro}</p>
          <ul className="flex flex-col gap-3">
            {SOURCES.map(({ key, url }) => {
              const row = rows?.find((r) => r.source === key);
              const text = (part: "name" | "by" | "use") =>
                t[`src_${key}_${part}` as keyof Dictionary["about"]];
              return (
                <li key={key} className="flex flex-col gap-1 rounded-xl border border-border p-4">
                  <h3 className="text-lg font-semibold">{text("name")}</h3>
                  <p className="text-base text-muted-foreground">{text("by")}</p>
                  <p className="text-base">{text("use")}</p>
                  {key !== "osm" && (
                    <p className="text-base">
                      {row ? fill(t.refreshed, { date: date(row.last_run_at) }) : t.notRefreshed}
                      {row && ` · ${fill(t.rows, { count: number(row.rows_loaded) })}`}
                    </p>
                  )}
                  <a
                    href={url}
                    className="inline-flex min-h-12 w-fit items-center gap-2 text-base font-medium text-primary underline underline-offset-4"
                  >
                    {t.openSource}
                    <ExternalLink aria-hidden="true" className="size-4" />
                  </a>
                </li>
              );
            })}
          </ul>
        </section>

        <section aria-labelledby="results" className={sectionClass}>
          <h2 id="results" className={h2Class}>
            {t.resultsTitle}
          </h2>
          <p className="text-base">{t.resultsIntro}</p>
          <MatchResults t={t} date={date} />
          <ReaderResults
            t={t}
            tScan={dict.scan}
            reader={evalSummary.readerFinal ?? evalSummary.reader}
            date={date}
          />
        </section>

        <section aria-labelledby="privacy" className={sectionClass}>
          <h2 id="privacy" className={h2Class}>
            {t.privacyTitle}
          </h2>
          <ul className="flex list-disc flex-col gap-2 pl-6 text-base">
            <li>{t.privacyPhotos}</li>
            <li>{t.privacyLocation}</li>
            <li>{t.privacySent}</li>
            <li>{t.privacyNone}</li>
          </ul>
          <p className="text-base">
            {t.privacyCode}{" "}
            <a href={REPO} className="font-medium text-primary underline underline-offset-4">
              github.com/ayushanupam32-pixel/dawacheck
            </a>
          </p>
        </section>

        <section aria-labelledby="safety" className={sectionClass}>
          <h2 id="safety" className={h2Class}>
            {t.safetyTitle}
          </h2>
          <ul className="flex list-disc flex-col gap-2 pl-6 text-base">
            <li>{t.safetyAdvice}</li>
            <li>{t.safetyGeneric}</li>
            <li>{t.safetyUnsure}</li>
            <li>{t.safetyData}</li>
          </ul>
        </section>
      </main>

      <footer className="mt-auto flex gap-3 rounded-xl border border-border bg-muted/40 p-4 text-base leading-relaxed">
        <Info aria-hidden="true" className="mt-1 size-5 shrink-0" />
        <p>{dict.common.disclaimer}</p>
      </footer>
    </div>
  );
}

type T = Dictionary["about"];

/**
 * A table that may be wider than a phone: it scrolls sideways inside its own box (focusable and
 * labelled, so keyboard and screen-reader users can scroll it too) instead of the whole page.
 * The most important columns come first, so they are visible without scrolling.
 */
function ScrollTable({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div role="region" aria-label={label} tabIndex={0} className="overflow-x-auto rounded-lg">
      <table className="w-full border-collapse text-left text-base">{children}</table>
    </div>
  );
}

const th = "border-b-2 border-border px-1.5 py-2 align-bottom font-semibold";
const td = "border-b border-border px-1.5 py-2 align-top";

type DateFormat = (iso: string) => string;

function MatchResults({ t, date }: { t: T; date: DateFormat }) {
  const set = evalSummary.matching?.sets.find((s) => s.set === "simTest");
  if (!set) return <p className="text-base">{t.noResults}</p>;
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-xl font-semibold">{t.matchTitle}</h3>
      <p className="text-base">
        {fill(t.matchIntro, { count: set.cases, date: date(evalSummary.matching!.generated) })}
      </p>
      <ScrollTable label={t.matchTitle}>
        <thead>
          <tr>
            <th scope="col" className={th}>
              {t.colMethod}
            </th>
            <th scope="col" className={th}>
              {t.colTop1}
            </th>
            <th scope="col" className={th}>
              {t.colWrong}
            </th>
            <th scope="col" className={th}>
              {t.colTop3}
            </th>
          </tr>
        </thead>
        <tbody>
          {set.rows.map((r) => {
            const ours = r.method === "dawacheck";
            return (
              <tr key={r.method} className={ours ? "bg-primary/10 font-semibold" : undefined}>
                <th scope="row" className={`${td} font-normal ${ours ? "font-semibold" : ""}`}>
                  {t[`method_${r.method}`]}
                </th>
                <td className={td}>{percent(r.top1)}</td>
                <td className={td}>{percent(r.wrongOfAnswered)}</td>
                <td className={td}>{percent(r.top3)}</td>
              </tr>
            );
          })}
        </tbody>
      </ScrollTable>
      <p className="text-base text-muted-foreground">{t.matchNote}</p>
    </div>
  );
}

function ReaderResults({
  t,
  tScan,
  reader,
  date,
}: {
  t: T;
  tScan: Dictionary["scan"];
  reader: ReaderSummary | undefined;
  date: DateFormat;
}) {
  if (!reader) return <p className="text-base">{t.noResults}</p>;
  const of = (n: number, total: number) => `${n}/${total}`;
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-xl font-semibold">{t.readTitle}</h3>
      <p className="text-base">
        {fill(reader.split === "test" ? t.finalNote : t.devNote, {
          count: reader.strips,
          date: date(reader.generated),
        })}
      </p>
      <ScrollTable label={t.readTitle}>
        {/* Two header rows: "DawaCheck" over right / wrong, "Plain OCR" over right. Short
            headers keep the table within a phone's width in all three languages. */}
        <thead>
          <tr>
            <td className="px-1.5" />
            <th scope="colgroup" colSpan={2} className={`${th} border-b`}>
              {t.colDawa}
            </th>
            <th scope="col" className={`${th} border-b`}>
              {t.colBase}
            </th>
          </tr>
          <tr>
            <th scope="col" className={th}>
              {t.colField}
            </th>
            <th scope="col" className={th}>
              {t.readRight}
            </th>
            <th scope="col" className={th}>
              {t.readWrong}
            </th>
            <th scope="col" className={th}>
              {t.readRight}
            </th>
          </tr>
        </thead>
        <tbody>
          {/* A field no test photo shows (total 0) has nothing to score: leave it out. */}
          {reader.fields
            .filter((f) => f.total > 0)
            .map((f) => (
              <tr key={f.field}>
                <th scope="row" className={`${td} font-normal`}>
                  {tScan[f.field]}
                </th>
                <td className={td}>{of(f.correct, f.total)}</td>
                <td className={td}>{of(f.wrong, f.total)}</td>
                <td className={td}>{of(f.baseCorrect, f.total)}</td>
              </tr>
            ))}
        </tbody>
      </ScrollTable>
      <p className="text-base text-muted-foreground">{t.readNote}</p>
      <p className="text-base">
        {fill(t.speed, {
          median: (reader.medianMs / 1000).toFixed(1),
          p95: (reader.p95Ms / 1000).toFixed(1),
        })}
      </p>
    </div>
  );
}
