"use client";

import { useEffect, useId, useState } from "react";
import { Loader2, Search } from "lucide-react";
import { BrandButton, BrandResult, Notice } from "@/components/generic-result";
import { ResultCard } from "@/components/result-card";
import { Button } from "@/components/ui/button";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import type { BrandCandidate, SearchResponse } from "@/lib/match";

type T = Dictionary["search"];
type TChecks = Dictionary["checks"];

type State =
  | { step: "idle" }
  | { step: "searching" }
  | { step: "candidates"; candidates: BrandCandidate[] }
  | { step: "no_match" }
  | { step: "result"; brand: BrandCandidate }
  | { step: "error" };

export function SearchClient({
  t,
  tChecks,
  disclaimer,
  locale,
}: {
  t: T;
  tChecks: TChecks;
  disclaimer: string;
  locale: string;
}) {
  const [query, setQuery] = useState("");
  const [state, setState] = useState<State>({ step: "idle" });
  const inputId = useId();
  const hintId = useId();

  async function runSearch(text: string) {
    if (text.trim().length < 3) return;
    setState({ step: "searching" });
    try {
      const res = await fetch(`/api/match?q=${encodeURIComponent(text.trim())}`);
      if (!res.ok) throw new Error(String(res.status));
      const body = (await res.json()) as SearchResponse;
      setState(
        body.status === "ok"
          ? { step: "candidates", candidates: body.candidates }
          : { step: "no_match" },
      );
    } catch {
      setState({ step: "error" });
    }
  }

  function search(event: React.FormEvent) {
    event.preventDefault();
    runSearch(query);
  }

  // Arriving from the scan's confirm screen (/search?q=TELMA%2040): search straight away.
  // The page is static (same HTML for every visitor), so the URL can only be read in the
  // browser after it loads; the timer defers the state change until after this render.
  useEffect(() => {
    const fromScan = new URLSearchParams(window.location.search).get("q");
    if (!fromScan) return;
    const timer = setTimeout(() => {
      setQuery(fromScan);
      runSearch(fromScan);
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  const choose = (brand: BrandCandidate) => setState({ step: "result", brand });

  return (
    <div className="flex flex-col gap-6">
      <form onSubmit={search} className="flex flex-col gap-2" role="search">
        <label htmlFor={inputId} className="text-lg font-semibold">
          {t.label}
        </label>
        <div className="flex gap-2">
          <input
            id={inputId}
            aria-describedby={hintId}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoComplete="off"
            autoCapitalize="words"
            enterKeyHint="search"
            minLength={3}
            maxLength={60}
            className="min-h-12 min-w-0 flex-1 rounded-lg border border-input bg-background px-3 text-lg focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
          />
          <Button type="submit" disabled={query.trim().length < 3}>
            <Search aria-hidden="true" />
            {t.submit}
          </Button>
        </div>
        <p id={hintId} className="text-base text-muted-foreground">
          {query.length > 0 && query.trim().length < 3 ? t.tooShort : t.hint}
        </p>
      </form>

      {/* Screen readers announce every change in this region. */}
      <div aria-live="polite" className="flex flex-col gap-4">
        {state.step === "searching" && (
          <p className="flex items-center gap-2 text-base">
            <Loader2 aria-hidden="true" className="size-5 animate-spin" />
            {t.searching}
          </p>
        )}

        {state.step === "no_match" && <Notice kind="unknown">{t.noMatch}</Notice>}
        {state.step === "error" && <Notice kind="unknown">{t.error}</Notice>}

        {state.step === "candidates" && (
          <section className="flex flex-col gap-3">
            <h2 className="text-xl font-semibold">{t.pickOne}</h2>
            <ul className="flex flex-col gap-2">
              {state.candidates.map((c) => (
                <li key={c.id}>
                  <BrandButton t={t} brand={c} onChoose={() => choose(c)} />
                </li>
              ))}
            </ul>
          </section>
        )}

        {state.step === "result" && (
          <>
            <TypedChecks
              key={state.brand.id}
              t={t}
              tChecks={tChecks}
              disclaimer={disclaimer}
              locale={locale}
              brand={state.brand}
            />
            <BrandResult t={t} locale={locale} brandId={state.brand.id} />
          </>
        )}
      </div>

      <p className="text-sm text-muted-foreground">{t.brandCredit}</p>
    </div>
  );
}

/**
 * The five checks for a medicine found by typing its name (the brief: all checks work from a
 * photo, from a typed name and in Demo mode). With no photo there is no batch number, MRP or
 * date to read, so the user may type them; each check that needs one says so until it's typed.
 * What is typed is used for this check only and never stored.
 */
function TypedChecks({
  t,
  tChecks,
  disclaimer,
  locale,
  brand,
}: {
  t: T;
  tChecks: TChecks;
  disclaimer: string;
  locale: string;
  brand: BrandCandidate;
}) {
  const [batch, setBatch] = useState("");
  const [mrp, setMrp] = useState("");
  const [count, setCount] = useState("");
  const [mfg, setMfg] = useState("");
  const ids = { batch: useId(), mrp: useId(), count: useId(), mfg: useId() };
  const field =
    "min-h-12 w-full rounded-lg border border-input bg-background px-3 text-lg focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none";
  const mfgDate = /^(\d{2})\/(\d{4})$/.test(mfg.trim())
    ? mfg.trim().replace(/^(\d{2})\/(\d{4})$/, "$2-$1")
    : null;

  const inputs: [keyof typeof ids, string, string, (v: string) => void, string?][] = [
    ["batch", t.batchLabel, batch, setBatch],
    ["mrp", t.checkMrpLabel, mrp, setMrp, "decimal"],
    ["count", t.checkCountLabel, count, setCount, "numeric"],
    ["mfg", t.mfgLabel, mfg, setMfg],
  ];
  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 rounded-xl border border-border p-4">
        <h2 className="text-xl font-semibold">{t.stripTitle}</h2>
        <p className="text-base">{t.stripHint}</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {inputs.map(([key, label, value, set, mode]) => (
            <div key={key} className="flex flex-col gap-1">
              <label htmlFor={ids[key]} className="text-base font-semibold">
                {label}
              </label>
              <input
                id={ids[key]}
                value={value}
                inputMode={mode as React.HTMLAttributes<HTMLInputElement>["inputMode"]}
                placeholder={key === "mfg" ? "MM/YYYY" : undefined}
                autoComplete="off"
                onChange={(e) => set(e.target.value)}
                className={field}
              />
            </div>
          ))}
        </div>
      </div>
      <ResultCard
        t={tChecks}
        locale={locale}
        disclaimer={disclaimer}
        input={{
          brandId: brand.id,
          // No photo: the checks use the brand's own record of its ingredients.
          stripIngredients: [],
          batchNo: batch.trim(),
          // Typed by the user from the strip, so not an OCR guess.
          batchConfidence: batch.trim() ? 1 : 0,
          names: [brand.name],
          manufacturer: brand.manufacturer,
          mrp: Number(mrp.replace(/[^\d.]/g, "")) || null,
          packSize: Number(count.replace(/[^\d]/g, "")) || null,
          mfgDate,
        }}
      />
    </section>
  );
}
