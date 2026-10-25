"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Camera, ChevronDown, ImageUp, Loader2, Lock, RotateCcw, Search } from "lucide-react";
import { BrandButton, BrandResult, fill, Notice } from "@/components/generic-result";
import { ResultCard, type ResultCardInput } from "@/components/result-card";
import { Button, buttonVariants } from "@/components/ui/button";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import { extractIngredients, type ExtractedFields, type Ingredient } from "@/lib/ai/extract";
import { brandGuesses, type FieldKey } from "@/lib/ai/merge";
import { buildMatchInput, type Features } from "@/lib/ai/rerank";
import type { Stage, StripReading } from "@/lib/ai/ocr";
import type { BrandCandidate, ScanMatchResponse, ScanOption } from "@/lib/match";

type T = Dictionary["scan"];
type TSearch = Dictionary["search"];
type TChecks = Dictionary["checks"];
/** What the result card needs besides the chosen brand. */
type StripFacts = Omit<ResultCardInput, "brandId">;
type Step =
  | { name: "front" }
  | { name: "back" }
  | { name: "stamp" }
  | { name: "reading"; stage: Stage }
  | { name: "confirm"; reading: StripReading }
  | { name: "error" };

/** Confidence below which a field is marked "Please check" on the confirm screen. */
const CHECK_BELOW = 0.6;

/** Picks a photo from the camera (capture) or the gallery, and shows a preview. */
function PhotoPicker({
  t,
  photo,
  onPhoto,
}: {
  t: T;
  photo: Blob | null;
  onPhoto: (photo: Blob | null) => void;
}) {
  const camera = useRef<HTMLInputElement>(null);
  const gallery = useRef<HTMLInputElement>(null);
  const preview = useMemo(() => (photo ? URL.createObjectURL(photo) : null), [photo]);
  // Free the preview's memory when the photo changes or the page is left.
  useEffect(() => () => void (preview && URL.revokeObjectURL(preview)), [preview]);

  const pick = (e: React.ChangeEvent<HTMLInputElement>) => {
    onPhoto(e.target.files?.[0] ?? null);
    e.target.value = ""; // allow picking the same file again
  };

  return (
    <div className="flex flex-col gap-3">
      {preview ? (
        // eslint-disable-next-line @next/next/no-img-element -- a local blob: preview, not an asset
        <img
          src={preview}
          alt=""
          className="max-h-72 w-full rounded-xl border border-border object-contain"
        />
      ) : (
        // A strip-shaped guide frame, so people know what to fill the photo with.
        <div
          aria-hidden="true"
          className="flex aspect-[16/9] w-full items-center justify-center rounded-xl border-4 border-dashed border-primary/50 bg-muted/40"
        >
          <Camera className="size-12 text-primary/60" />
        </div>
      )}
      <input
        ref={camera}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={pick}
      />
      <input ref={gallery} type="file" accept="image/*" hidden onChange={pick} />
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => camera.current?.click()}>
          <Camera aria-hidden="true" />
          {photo ? t.retake : t.takePhoto}
        </Button>
        <Button variant="outline" onClick={() => gallery.current?.click()}>
          <ImageUp aria-hidden="true" />
          {t.choosePhoto}
        </Button>
      </div>
    </div>
  );
}

export function ScanClient({
  t,
  tSearch,
  tChecks,
  disclaimer,
  locale,
}: {
  t: T;
  tSearch: TSearch;
  tChecks: TChecks;
  disclaimer: string;
  locale: string;
}) {
  const [step, setStep] = useState<Step>({ name: "front" });
  const [front, setFront] = useState<Blob | null>(null);
  const [back, setBack] = useState<Blob | null>(null);
  const [stamp, setStamp] = useState<Blob | null>(null);

  async function read(stampPhoto: Blob | null) {
    if (!front) return;
    setStep({ name: "reading", stage: "loading-model" });
    try {
      // Loaded only now, so people who never scan don't download the OCR code.
      const { readStrip } = await import("@/lib/ai/ocr");
      const reading = await readStrip(
        front,
        back,
        (stage) => setStep({ name: "reading", stage }),
        stampPhoto,
      );
      setStep({ name: "confirm", reading });
    } catch {
      setStep({ name: "error" });
    }
  }

  // Demo mode: the same reader, on sample photos shipped with the site (public/demo, made by
  // eval/make_demo_images.py). Lets the app be demonstrated without depending on the light in the
  // exam hall. Two strips: a blood-pressure medicine with a cheaper generic, and a strip whose
  // batch is in a real CDSCO quality alert.
  async function readDemo(name: "telmikind" | "omee") {
    setStep({ name: "reading", stage: "loading-model" });
    try {
      const [demoFront, demoBack] = await Promise.all(
        [`/demo/${name}-front.jpg`, `/demo/${name}-back.jpg`].map((url) =>
          fetch(url).then((r) => r.blob()),
        ),
      );
      setFront(demoFront);
      const { readStrip } = await import("@/lib/ai/ocr");
      const reading = await readStrip(demoFront, demoBack, (stage) =>
        setStep({ name: "reading", stage }),
      );
      setStep({ name: "confirm", reading });
    } catch {
      setStep({ name: "error" });
    }
  }

  function startOver() {
    setFront(null);
    setBack(null);
    setStamp(null);
    setStep({ name: "front" });
  }

  const tips = (
    <details className="rounded-xl bg-muted/50 p-3 text-base">
      <summary className="min-h-12 cursor-pointer content-center font-semibold">
        {t.tipsTitle}
      </summary>
      <ul className="list-inside list-disc pt-1">
        <li>{t.tip1}</li>
        <li>{t.tip2}</li>
        <li>{t.tip3}</li>
      </ul>
    </details>
  );
  const privacy = (
    <p className="flex items-start gap-2 text-base">
      <Lock aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-primary" />
      {t.privacyPhoto}
    </p>
  );

  if (step.name === "front" || step.name === "back" || step.name === "stamp") {
    const page = {
      front: { title: t.stepFront, hint: t.frontHint, photo: front, setPhoto: setFront },
      back: { title: t.stepBack, hint: t.backHint, photo: back, setPhoto: setBack },
      stamp: { title: t.stepStamp, hint: t.stampHint, photo: stamp, setPhoto: setStamp },
    }[step.name];
    return (
      <div className="flex flex-col gap-4">
        <h2 className="text-xl font-semibold">{page.title}</h2>
        <p className="text-base">{page.hint}</p>
        <PhotoPicker t={t} photo={page.photo} onPhoto={page.setPhoto} />
        <div className="flex flex-wrap gap-2">
          {step.name === "front" && (
            <Button disabled={!front} onClick={() => setStep({ name: "back" })}>
              {t.next}
            </Button>
          )}
          {step.name === "back" && (
            <>
              <Button disabled={!back} onClick={() => setStep({ name: "stamp" })}>
                {t.next}
              </Button>
              <Button variant="outline" onClick={() => setStep({ name: "stamp" })}>
                {t.skipBack}
              </Button>
            </>
          )}
          {step.name === "stamp" && (
            <>
              <Button disabled={!stamp} onClick={() => read(stamp)}>
                {t.next}
              </Button>
              <Button variant="outline" onClick={() => read(null)}>
                {t.skipStamp}
              </Button>
            </>
          )}
        </div>
        {tips}
        {privacy}
        {step.name === "front" && (
          <div className="flex flex-col gap-1 rounded-xl border border-dashed border-border p-3">
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => readDemo("telmikind")}>
                {t.demoBp}
              </Button>
              <Button variant="outline" onClick={() => readDemo("omee")}>
                {t.demoAlert}
              </Button>
            </div>
            <p className="text-sm text-muted-foreground">{t.demoNote}</p>
          </div>
        )}
      </div>
    );
  }

  if (step.name === "reading") {
    const label = {
      "loading-model": t.loadingModel,
      preparing: t.preparing,
      reading: t.reading,
      "reading-more": t.readingMore,
      done: t.reading,
    }[step.stage];
    return (
      <p role="status" className="flex items-center gap-3 text-lg">
        <Loader2 aria-hidden="true" className="size-6 animate-spin" />
        {label}
      </p>
    );
  }

  if (step.name === "error") {
    return (
      <div className="flex flex-col gap-3">
        <p className="rounded-xl border-2 border-status-warn p-4 text-base">{t.error}</p>
        <div className="flex flex-wrap gap-2">
          <Button onClick={startOver}>
            <RotateCcw aria-hidden="true" />
            {t.startOver}
          </Button>
          <Link href={`/${locale}/search`} className={buttonVariants({ variant: "outline" })}>
            {t.typeInstead}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <Confirm
      t={t}
      tSearch={tSearch}
      tChecks={tChecks}
      disclaimer={disclaimer}
      locale={locale}
      reading={step.reading}
      onStartOver={startOver}
    />
  );
}

// ------------------------------------------------------------------ confirm screen

const formatIngredients = (list: Ingredient[] | undefined) =>
  (list ?? []).map((i) => `${i.salt} ${i.value} ${i.unit}`).join("\n");

const toMonthYear = (yyyyMm: string | undefined) =>
  yyyyMm ? `${yyyyMm.slice(5, 7)}/${yyyyMm.slice(0, 4)}` : "";

function Confirm({
  t,
  tSearch,
  tChecks,
  disclaimer,
  locale,
  reading,
  onStartOver,
}: {
  t: T;
  tSearch: TSearch;
  tChecks: TChecks;
  disclaimer: string;
  locale: string;
  reading: StripReading;
  onStartOver: () => void;
}) {
  const f: ExtractedFields = reading.fields;
  // Every value is editable. Corrections are used for this scan only and never stored.
  const [values, setValues] = useState<Record<string, string>>({
    brand: f.brand?.value ?? "",
    ingredients: formatIngredients(f.ingredients?.value),
    mrp: f.mrp ? String(f.mrp.value) : "",
    packSize: f.packSize ? String(f.packSize.value) : "",
    batchNo: f.batchNo?.value ?? "",
    mfgDate: toMonthYear(f.mfgDate?.value),
    expDate: toMonthYear(f.expDate?.value),
  });
  const set = (key: string) => (value: string) => setValues((v) => ({ ...v, [key]: value }));

  const rows: { key: FieldKey; label: string; multiline?: boolean; placeholder?: string }[] = [
    { key: "brand", label: t.brand },
    { key: "ingredients", label: t.ingredients, multiline: true, placeholder: t.ingredientsHint },
    { key: "mrp", label: t.mrp },
    { key: "packSize", label: t.packSize },
    { key: "batchNo", label: t.batchNo },
    { key: "mfgDate", label: t.mfgDate, placeholder: t.datePlaceholder },
    { key: "expDate", label: t.expDate, placeholder: t.datePlaceholder },
  ];

  const best = [...reading.back, ...reading.front].sort((a, b) => b.confidence - a.confidence);

  // What the user confirmed, as the matcher's input (lib/ai/rerank.ts).
  const stripIngredients = useMemo(
    () => extractIngredients(values.ingredients)?.value ?? [],
    [values.ingredients],
  );
  // Other name guesses from the photo (the tallest plausible lines), tried by the matcher as well,
  // but only while the name field is as read: a name the user typed is the one to trust.
  const guesses = useMemo(() => brandGuesses(reading.front), [reading.front]);
  const nameAsRead = values.brand.trim() === (f.brand?.value ?? "").trim();
  const matchInput = () =>
    buildMatchInput({
      brand: values.brand,
      ingredients: stripIngredients,
      form: f.form?.value ?? null,
      manufacturer: f.manufacturer?.value ?? null,
      ocrText: [...reading.front, ...reading.back].map((r) => r.text).join("\n"),
    });

  // For the safety checks. A batch number the user typed or corrected counts as certain; one
  // left as read keeps the reader's confidence (low = "Please check" = not looked up).
  // The user can also tick "It matches my strip" under a batch marked "Please check": retyping
  // the same characters would otherwise leave it unsure, and the batch could never be checked.
  const readBatch = f.batchNo?.value ?? "";
  const [batchChecked, setBatchChecked] = useState(false);
  const facts: StripFacts = {
    stripIngredients: stripIngredients.map(({ salt, value, unit }) => ({ salt, value, unit })),
    batchNo: values.batchNo.trim(),
    batchConfidence:
      values.batchNo.trim() && (batchChecked || values.batchNo.trim() !== readBatch)
        ? 1
        : (f.batchNo?.confidence ?? 0),
    names: [values.brand.trim()].filter(Boolean),
    manufacturer: f.manufacturer?.value ?? null,
    // For the fair-price check: the MRP and the count as confirmed ("₹122.98", "15").
    mrp: Number(values.mrp.replace(/[^\d.]/g, "")) || null,
    packSize: Number(values.packSize.replace(/[^\d]/g, "")) || null,
    // "09/2025" on the confirm screen -> "2025-09": it decides the GST margin (12% before the
    // 22.09.2025 cut, 5% after).
    mfgDate: /^(\d{2})\/(\d{4})$/.test(values.mfgDate.trim())
      ? values.mfgDate.trim().replace(/^(\d{2})\/(\d{4})$/, "$2-$1")
      : null,
  };

  const [match, setMatch] = useState<
    | { step: "idle" | "matching" | "error" }
    | { step: "done"; response: ScanMatchResponse; chosen: BrandCandidate | null }
  >({ step: "idle" });

  async function findMedicine() {
    setMatch({ step: "matching" });
    try {
      // POST: the medicine details go in the body, not the URL.
      const res = await fetch("/api/match", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...matchInput(), brandGuesses: nameAsRead ? guesses : [] }),
      });
      if (!res.ok) throw new Error(String(res.status));
      const response = (await res.json()) as ScanMatchResponse;
      setMatch({
        step: "done",
        response,
        chosen: response.status === "match" ? response.brand : null,
      });
    } catch {
      setMatch({ step: "error" });
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <h2 className="text-xl font-semibold">{t.confirmTitle}</h2>
        <p className="text-base">{t.confirmIntro}</p>
      </div>

      <div className="flex flex-col gap-4">
        {rows.map(({ key, label, multiline, placeholder }) => (
          <ConfirmField
            key={key}
            label={label}
            value={values[key]}
            onChange={set(key)}
            confidence={f[key]?.confidence ?? null}
            multiline={multiline}
            placeholder={placeholder}
            t={t}
          >
            {key === "batchNo" &&
              values.batchNo.trim() === readBatch &&
              readBatch &&
              (f.batchNo?.confidence ?? 0) < CHECK_BELOW && (
                <label className="flex min-h-12 w-fit cursor-pointer items-center gap-3 text-base">
                  <input
                    type="checkbox"
                    checked={batchChecked}
                    onChange={(e) => setBatchChecked(e.target.checked)}
                    className="size-6 accent-primary"
                  />
                  {t.batchChecked}
                </label>
              )}
          </ConfirmField>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          onClick={findMedicine}
          disabled={
            !(values.brand.trim() || (nameAsRead && guesses.length)) || match.step === "matching"
          }
        >
          <Search aria-hidden="true" />
          {t.lookUp}
        </Button>
        <Button variant="outline" onClick={onStartOver}>
          <RotateCcw aria-hidden="true" />
          {t.startOver}
        </Button>
      </div>

      {/* Screen readers announce the matching result when it arrives. */}
      <div aria-live="polite" className="flex flex-col gap-4">
        {match.step === "matching" && (
          <p className="flex items-center gap-2 text-base">
            <Loader2 aria-hidden="true" className="size-5 animate-spin" />
            {t.matching}
          </p>
        )}
        {match.step === "error" && <Notice kind="unknown">{t.matchError}</Notice>}
        {match.step === "done" && (
          <MatchResult
            t={t}
            tSearch={tSearch}
            locale={locale}
            response={match.response}
            chosen={match.chosen}
            onChoose={(chosen) => setMatch({ ...match, chosen })}
            brandRead={values.brand}
            stripIngredients={stripIngredients}
            facts={facts}
            tChecks={tChecks}
            disclaimer={disclaimer}
          />
        )}
      </div>

      {/* Explainability: what the reader saw and which image version each field came from. */}
      <details className="rounded-xl border border-border p-3 text-base">
        <summary className="flex min-h-12 cursor-pointer items-center gap-2 font-semibold">
          <ChevronDown aria-hidden="true" className="size-5" />
          {t.howWeRead}
        </summary>
        <div className="flex flex-col gap-2 pt-2">
          <p>{t.readIn.replace("{seconds}", (reading.millis / 1000).toFixed(1))}</p>
          {(["front", "back"] as const).map((side) => {
            const deg = reading.skew[side];
            return deg ? (
              <p key={side}>
                {side === "front" ? t.frontPhoto : t.backPhoto}:{" "}
                {t.straightened.replace("{deg}", String(deg))}
              </p>
            ) : null;
          })}
          <ul className="text-sm">
            {rows.map(({ key, label }) => {
              const field = f[key];
              const source = reading.source[key];
              return (
                <li key={key}>
                  {label}: {field ? `${Math.round(field.confidence * 100)}%` : "—"}
                  {source && ` · ${t.variantUsed}: ${source.front} / ${source.back}`}
                </li>
              );
            })}
          </ul>
          <p className="font-medium">{t.rawText}</p>
          <pre className="max-h-64 overflow-auto rounded-lg bg-muted p-2 text-sm whitespace-pre-wrap">
            {best
              .map((r) => `[${r.variant}, ${Math.round(r.confidence)}%]\n${r.text}`)
              .join("\n\n")}
          </pre>
        </div>
      </details>
    </div>
  );
}

// ------------------------------------------------------------------ matching result

function MatchResult({
  t,
  tSearch,
  locale,
  response,
  chosen,
  onChoose,
  brandRead,
  stripIngredients,
  facts,
  tChecks,
  disclaimer,
}: {
  t: T;
  tSearch: TSearch;
  locale: string;
  response: ScanMatchResponse;
  chosen: BrandCandidate | null;
  onChoose: (brand: BrandCandidate | null) => void;
  brandRead: string;
  stripIngredients: Ingredient[];
  facts: StripFacts;
  tChecks: TChecks;
  disclaimer: string;
}) {
  const percent = (p: number) => `${Math.round(p * 100)}%`;
  const typeLink = (
    <Link
      href={`/${locale}/search?q=${encodeURIComponent(brandRead)}`}
      className={`${buttonVariants({ variant: "outline" })} w-fit`}
    >
      {t.typeInstead}
    </Link>
  );

  // A medicine is chosen (by the matcher, or by the user from the options).
  if (chosen) {
    const option = response.options.find((o) => o.brand.id === chosen.id);
    const auto = response.status === "match" && response.brand.id === chosen.id;
    return (
      <section className="flex flex-col gap-4">
        <div className="flex flex-col gap-2 rounded-xl border border-border p-4">
          <p className="text-base">{auto ? t.matchedTitle : t.youChose}</p>
          <p className="text-xl font-semibold">{chosen.name}</p>
          {chosen.manufacturer && <p className="text-base">{chosen.manufacturer}</p>}
          {auto && (
            <p className="text-base">
              {fill(t.matchSure, { percent: percent(response.confidence) })}
            </p>
          )}
          {chosen.discontinued && (
            <p className="text-sm text-muted-foreground">{t.discontinuedNote}</p>
          )}
          {option && <Evidence t={t} features={option.features} />}
          <Button variant="outline" className="w-fit" onClick={() => onChoose(null)}>
            {t.notThisOne}
          </Button>
        </div>
        <ResultCard
          t={tChecks}
          locale={locale}
          disclaimer={disclaimer}
          input={{ ...facts, brandId: chosen.id, names: [...facts.names, chosen.name] }}
        />
        <BrandResult
          t={tSearch}
          locale={locale}
          brandId={chosen.id}
          stripIngredients={stripIngredients}
        />
      </section>
    );
  }

  const reason = response.status === "abstain" ? response.reason : null;
  const message = {
    no_brand: t.abstainNoBrand,
    no_candidates: t.abstainNoCandidates,
    contradiction: t.abstainContradiction,
    strength_unknown: t.abstainStrength,
    unsure: t.abstainUnsure,
  }[reason ?? "unsure"];
  return (
    <section className="flex flex-col gap-3">
      {response.status === "abstain" && <Notice kind="unknown">{message}</Notice>}
      {response.options.length > 0 && (
        <>
          <h3 className="text-lg font-semibold">{t.pickFromThese}</h3>
          <ul className="flex flex-col gap-2">
            {response.options.map((o: ScanOption) => (
              <li key={o.brand.id}>
                <BrandButton
                  t={tSearch}
                  brand={o.brand}
                  onChoose={() => onChoose(o.brand)}
                  extra={fill(t.optionSure, { percent: percent(o.probability) })}
                />
              </li>
            ))}
          </ul>
        </>
      )}
      {typeLink}
    </section>
  );
}

/** "Why we think so": each piece of evidence in words, never colour alone. */
function Evidence({ t, features }: { t: T; features: Features }) {
  const word = (value: number) =>
    value > 0 ? t.evAgrees : value < 0 ? t.evContradicts : t.evUnknown;
  const rows: [string, string][] = [
    [t.evName, fill(t.evNameScore, { percent: `${Math.round(features.name * 100)}%` })],
    [t.evStrength, word(features.strength)],
    [t.evIngredients, word(features.ingredients)],
    [t.evForm, word(features.form)],
    [t.evRelease, word(features.release)],
    [t.evMaker, features.maker > 0 ? t.evAgrees : t.evUnknown],
  ];
  return (
    <details className="text-base">
      <summary className="flex min-h-12 cursor-pointer items-center gap-2 font-semibold">
        <ChevronDown aria-hidden="true" className="size-5" />
        {t.evidenceTitle}
      </summary>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 pt-1">
        {rows.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="text-muted-foreground">{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      <p className="pt-2 text-sm text-muted-foreground">{t.evidenceNote}</p>
    </details>
  );
}

function ConfirmField(props: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  confidence: number | null;
  multiline?: boolean;
  placeholder?: string;
  t: T;
  /** Extra controls under the field (the batch's "It matches my strip"). */
  children?: React.ReactNode;
}) {
  const id = useId();
  const hintId = useId();
  const unsure = props.confidence === null || props.confidence < CHECK_BELOW;
  const missing = props.confidence === null;
  const className = `w-full rounded-lg border-2 bg-background px-3 py-2 text-lg focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none ${
    unsure ? "border-status-warn" : "border-input"
  }`;
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="flex items-center gap-2 text-base font-semibold">
        {props.label}
        {unsure && (
          // Never colour alone: the amber border always comes with these words.
          <span className="rounded-full bg-status-warn/15 px-2 py-0.5 text-sm font-medium text-foreground">
            {props.t.lowConfidence}
          </span>
        )}
      </label>
      {props.multiline ? (
        <textarea
          id={id}
          rows={3}
          value={props.value}
          placeholder={props.placeholder}
          aria-describedby={missing ? hintId : undefined}
          onChange={(e) => props.onChange(e.target.value)}
          className={className}
        />
      ) : (
        <input
          id={id}
          value={props.value}
          placeholder={props.placeholder}
          aria-describedby={missing ? hintId : undefined}
          onChange={(e) => props.onChange(e.target.value)}
          className={`${className} min-h-12`}
        />
      )}
      {missing && (
        <p id={hintId} className="text-sm text-muted-foreground">
          {props.t.notRead}
        </p>
      )}
      {props.children}
    </div>
  );
}
