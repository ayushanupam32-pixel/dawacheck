"use client";

import { useId, useState } from "react";
import { AlertTriangle, CheckCircle2, CircleHelp, Loader2, PiggyBank, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import type { BrandCandidate, GenericResponse, Ingredient, SearchResponse } from "@/lib/match";
import { computeSavings, formatRupees } from "@/lib/savings";

type T = Dictionary["search"];

type State =
  | { step: "idle" }
  | { step: "searching" }
  | { step: "candidates"; candidates: BrandCandidate[] }
  | { step: "no_match" }
  | { step: "loading" }
  | { step: "result"; data: GenericResponse; confirmed: boolean | null }
  | { step: "error" };

const fill = (template: string, values: Record<string, string>) =>
  template.replace(/\{(\w+)\}/g, (_, key: string) => values[key] ?? "");

function formatIngredient(i: Ingredient) {
  return `${i.salt} ${Number(i.value)} ${i.unit}`;
}

export function SearchClient({ t, locale }: { t: T; locale: string }) {
  const [query, setQuery] = useState("");
  const [state, setState] = useState<State>({ step: "idle" });
  const inputId = useId();
  const hintId = useId();

  async function search(event: React.FormEvent) {
    event.preventDefault();
    if (query.trim().length < 3) return;
    setState({ step: "searching" });
    try {
      const res = await fetch(`/api/match?q=${encodeURIComponent(query.trim())}`);
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

  async function choose(brand: BrandCandidate) {
    setState({ step: "loading" });
    try {
      const res = await fetch(`/api/match?brand=${brand.id}`);
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as GenericResponse;
      // A 1-ingredient composition is known complete; otherwise the user must confirm it.
      setState({ step: "result", data, confirmed: data.brand.compositionComplete ? true : null });
    } catch {
      setState({ step: "error" });
    }
  }

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
        {(state.step === "searching" || state.step === "loading") && (
          <p className="flex items-center gap-2 text-base">
            <Loader2 aria-hidden="true" className="size-5 animate-spin" />
            {state.step === "searching" ? t.searching : t.loading}
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
                  <button
                    type="button"
                    onClick={() => choose(c)}
                    className="flex min-h-12 w-full flex-col items-start gap-1 rounded-xl border border-border bg-card p-4 text-left hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                  >
                    <span className="text-lg font-semibold">{c.name}</span>
                    {c.manufacturer && (
                      <span className="text-base text-muted-foreground">{c.manufacturer}</span>
                    )}
                    <span className="text-base">
                      {t.contains}: {c.ingredients.map(formatIngredient).join(" + ")}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        {state.step === "result" && (
          <Result
            t={t}
            locale={locale}
            data={state.data}
            confirmed={state.confirmed}
            onConfirm={(confirmed) => setState({ ...state, confirmed })}
          />
        )}
      </div>

      <p className="text-sm text-muted-foreground">{t.brandCredit}</p>
    </div>
  );
}

function Result({
  t,
  locale,
  data,
  confirmed,
  onConfirm,
}: {
  t: T;
  locale: string;
  data: GenericResponse;
  confirmed: boolean | null;
  onConfirm: (confirmed: boolean) => void;
}) {
  const { brand, generics } = data;
  const ingredientList = (
    <ul className="list-inside list-disc text-lg font-medium">
      {brand.ingredients.map((i) => (
        <li key={i.salt}>{formatIngredient(i)}</li>
      ))}
    </ul>
  );

  // Step 1: the dataset may have cut a 2-ingredient list short, so ask before answering.
  if (confirmed === null) {
    return (
      <section className="flex flex-col gap-3 rounded-xl border-2 border-status-warn p-4">
        <h2 className="flex items-center gap-2 text-xl font-semibold">
          <CircleHelp aria-hidden="true" className="size-6 text-status-warn" />
          {t.confirmTitle}
        </h2>
        <p className="text-base">
          <strong>{brand.name}</strong>
        </p>
        <p className="text-base">{t.confirmBody}</p>
        {ingredientList}
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => onConfirm(true)}>{t.confirmYes}</Button>
          <Button variant="outline" onClick={() => onConfirm(false)}>
            {t.confirmNo}
          </Button>
        </div>
      </section>
    );
  }

  if (confirmed === false) return <Notice kind="unknown">{t.notConfirmed}</Notice>;

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-xl font-semibold">{brand.name}</h2>
        {ingredientList}
      </div>

      {generics.length === 0 ? (
        <Notice kind="na">{t.noGeneric}</Notice>
      ) : (
        <GenericCard t={t} locale={locale} data={data} />
      )}

      <p className="flex gap-2 rounded-lg bg-muted/60 p-3 text-base font-medium">
        <AlertTriangle aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
        {t.askPharmacist}
      </p>
      <p className="text-sm text-muted-foreground">
        {t.source}:{" "}
        <a href={data.source.url} target="_blank" rel="noreferrer" className="underline">
          {data.source.name}
        </a>
        {data.source.updatedOn &&
          ` · ${t.updated}: ${new Date(data.source.updatedOn).toLocaleDateString(`${locale}-IN`)}`}
      </p>
    </section>
  );
}

function GenericCard({ t, locale, data }: { t: T; locale: string; data: GenericResponse }) {
  const { brand } = data;
  const generic = data.generics[0]; // cheapest exact match
  // Starting values come from the 2022 dataset; the user corrects them from their own strip.
  const [mrp, setMrp] = useState(brand.mrp2022 ? String(brand.mrp2022) : "");
  const [size, setSize] = useState(brand.packSize ? String(brand.packSize) : "");
  const [doses, setDoses] = useState("1");
  const ids = { mrp: useId(), size: useId(), doses: useId(), hint: useId() };

  const savings = computeSavings(
    { mrp: Number(mrp), size: Number(size), unit: brand.packUnit ?? "" },
    { mrp: generic.mrp, size: generic.packSize ?? Number.NaN, unit: generic.packUnit ?? "" },
    Number(doses),
  );
  const rupees = (amount: number) => formatRupees(amount, `${locale}-IN`);

  return (
    <div className="flex flex-col gap-4 rounded-xl border-2 border-status-ok p-4">
      <p className="flex items-start gap-2 text-base">
        <CheckCircle2 aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-status-ok" />
        {t.genericFound}
      </p>
      <div>
        <p className="text-lg font-semibold">{generic.name}</p>
        <p className="text-base">
          {rupees(generic.mrp)} · {fill(t.packOf, { size: generic.unitSize ?? "" })}
        </p>
      </div>

      <fieldset className="flex flex-col gap-3 rounded-lg bg-muted/50 p-3">
        <legend className="px-1 text-base font-semibold">{t.yourStrip}</legend>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <NumberField
            id={ids.mrp}
            label={t.mrpLabel}
            value={mrp}
            onChange={setMrp}
            describedBy={ids.hint}
          />
          <NumberField id={ids.size} label={t.sizeLabel} value={size} onChange={setSize} />
          {brand.packUnit === "unit" && (
            <NumberField id={ids.doses} label={t.dosesLabel} value={doses} onChange={setDoses} />
          )}
        </div>
        <p id={ids.hint} className="text-sm text-muted-foreground">
          {t.mrp2022Hint}
        </p>
      </fieldset>

      {!savings ? (
        <p className="text-base">{t.cannotCompare}</p>
      ) : savings.perUnit <= 0 ? (
        <p className="text-base font-medium">{t.notCheaper}</p>
      ) : (
        <div className="flex flex-col gap-1">
          <p className="flex items-center gap-2 text-3xl font-bold text-status-ok">
            <PiggyBank aria-hidden="true" className="size-8 shrink-0" />
            {savings.perMonth !== null
              ? fill(t.saveMonth, { amount: rupees(savings.perMonth) })
              : fill(t.savePack, { amount: rupees(savings.perPack) })}
          </p>
          {savings.perMonth !== null && (
            <p className="text-base">
              {fill(t.savePack, { amount: rupees(savings.perPack) })}
              <br />
              {fill(t.perUnit, {
                brand: rupees(savings.brandPerUnit),
                generic: rupees(savings.genericPerUnit),
              })}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function NumberField(props: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  describedBy?: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={props.id} className="text-base">
        {props.label}
      </label>
      <input
        id={props.id}
        type="number"
        inputMode="decimal"
        min="0"
        step="any"
        value={props.value}
        aria-describedby={props.describedBy}
        onChange={(e) => props.onChange(e.target.value)}
        className="min-h-12 rounded-lg border border-input bg-background px-3 text-lg focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
      />
    </div>
  );
}

// Coloured box that never relies on colour alone: it always has an icon and words.
function Notice({ kind, children }: { kind: "unknown" | "na"; children: React.ReactNode }) {
  return (
    <p
      className={`flex gap-2 rounded-xl border-2 p-4 text-base ${
        kind === "unknown" ? "border-status-warn" : "border-status-na"
      }`}
    >
      <CircleHelp aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
      {children}
    </p>
  );
}
