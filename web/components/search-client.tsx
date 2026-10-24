"use client";

import { useEffect, useId, useState } from "react";
import { Loader2, Search } from "lucide-react";
import { BrandButton, BrandResult, Notice } from "@/components/generic-result";
import { Button } from "@/components/ui/button";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import type { BrandCandidate, SearchResponse } from "@/lib/match";

type T = Dictionary["search"];

type State =
  | { step: "idle" }
  | { step: "searching" }
  | { step: "candidates"; candidates: BrandCandidate[] }
  | { step: "no_match" }
  | { step: "result"; brand: BrandCandidate }
  | { step: "error" };

export function SearchClient({ t, locale }: { t: T; locale: string }) {
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

        {state.step === "result" && <BrandResult t={t} locale={locale} brandId={state.brand.id} />}
      </div>

      <p className="text-sm text-muted-foreground">{t.brandCredit}</p>
    </div>
  );
}
