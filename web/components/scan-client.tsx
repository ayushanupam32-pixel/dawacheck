"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  Camera,
  Check,
  ChevronDown,
  ImageUp,
  Loader2,
  Lock,
  RotateCcw,
  Search,
  Sparkles,
} from "lucide-react";
import { BrandButton, BrandResult, fill, Notice } from "@/components/generic-result";
import { ResultCard, type ResultCardInput } from "@/components/result-card";
import { Button, buttonVariants } from "@/components/ui/button";
import { inputClass, panelClass } from "@/components/ui/field";
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

/**
 * When the screen changes (the next photo, an error), move keyboard focus to the new screen's
 * heading: a screen reader reads it out, and Tab continues from there instead of from the top of
 * the page. Never on the first screen, so loading the page doesn't jump.
 */
function useFocusOnChange<E extends HTMLElement>(screen: string) {
  const ref = useRef<E>(null);
  const shown = useRef(screen);
  useEffect(() => {
    if (shown.current === screen) return;
    shown.current = screen;
    ref.current?.focus();
  }, [screen]);
  return ref;
}

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
          className="max-h-80 w-full rounded-2xl border border-border bg-muted object-contain shadow-soft"
        />
      ) : (
        // A strip-shaped guide frame, so people know what to fill the photo with.
        <div
          aria-hidden="true"
          className="flex aspect-[16/9] w-full items-center justify-center rounded-2xl border-2 border-dashed border-brand/50 bg-accent/40"
        >
          <span className="flex size-16 items-center justify-center rounded-2xl bg-card text-brand shadow-soft">
            <Camera className="size-8" />
          </span>
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
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <Button size="xl" onClick={() => camera.current?.click()}>
          <Camera aria-hidden="true" />
          {photo ? t.retake : t.takePhoto}
        </Button>
        <Button size="xl" variant="outline" onClick={() => gallery.current?.click()}>
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
  const screenHeading = useFocusOnChange<HTMLHeadingElement>(step.name);
  const [front, setFront] = useState<Blob | null>(null);
  const [back, setBack] = useState<Blob | null>(null);
  const [stamp, setStamp] = useState<Blob | null>(null);

  // The reading screen is much shorter than the photo screens: bring its top into view, or a phone
  // left scrolled down would show only the footer.
  const top = useRef<HTMLDivElement>(null);
  const startReading = () => {
    setStep({ name: "reading", stage: "loading-model" });
    requestAnimationFrame(() => top.current?.scrollIntoView({ block: "start" }));
  };

  async function read(stampPhoto: Blob | null) {
    if (!front) return;
    startReading();
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
    startReading();
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
    <details className="group rounded-2xl bg-muted px-4 text-base">
      <summary className="flex min-h-12 cursor-pointer list-none items-center gap-2 font-semibold [&::-webkit-details-marker]:hidden">
        <ChevronDown
          aria-hidden="true"
          className="size-5 transition-transform group-open:rotate-180 motion-reduce:transition-none"
        />
        {t.tipsTitle}
      </summary>
      <ul className="flex list-disc flex-col gap-1 pb-4 pl-7">
        <li>{t.tip1}</li>
        <li>{t.tip2}</li>
        <li>{t.tip3}</li>
      </ul>
    </details>
  );
  const privacy = (
    <p className="flex items-start gap-2 text-base">
      <Lock aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-brand" />
      {t.privacyPhoto}
    </p>
  );

  if (step.name === "front" || step.name === "back" || step.name === "stamp") {
    const page = {
      front: { title: t.stepFront, hint: t.frontHint, photo: front, setPhoto: setFront },
      back: { title: t.stepBack, hint: t.backHint, photo: back, setPhoto: setBack },
      stamp: { title: t.stepStamp, hint: t.stampHint, photo: stamp, setPhoto: setStamp },
    }[step.name];
    const stepIndex = { front: 0, back: 1, stamp: 2 }[step.name];
    return (
      <div className="flex flex-col gap-5">
        {/* Progress through the three photos. The heading says "Step 1 of 3" in words. */}
        <div aria-hidden="true" className="grid grid-cols-3 gap-2">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className={`h-1.5 rounded-full transition-colors motion-reduce:transition-none ${i <= stepIndex ? "bg-primary" : "bg-border"}`}
            />
          ))}
        </div>
        <div className="flex flex-col gap-1">
          <h2
            ref={screenHeading}
            tabIndex={-1}
            className="text-2xl font-bold tracking-tight outline-none"
          >
            {page.title}
          </h2>
          <p className="text-base text-muted-foreground">{page.hint}</p>
        </div>
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
          <div className="flex flex-col gap-3 rounded-2xl border border-dashed border-input p-4">
            <p className="flex items-center gap-2 text-base font-semibold">
              <Sparkles aria-hidden="true" className="size-5 text-brand" />
              {t.demoTitle}
            </p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
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
    // The four stages as a checklist, so a slow phone shows it is still working.
    const stages: Stage[] = ["loading-model", "preparing", "reading", "reading-more"];
    const at = stages.indexOf(step.stage === "done" ? "reading-more" : step.stage);
    const stageLabel = {
      "loading-model": t.loadingModel,
      preparing: t.preparing,
      reading: t.reading,
      "reading-more": t.readingMore,
    } as Record<string, string>;
    return (
      <div ref={top} className={panelClass("flex scroll-mt-24 flex-col gap-4 p-6")}>
        <p role="status" className="flex items-center gap-3 text-xl font-semibold">
          <Loader2
            aria-hidden="true"
            className="size-6 animate-spin text-brand motion-reduce:animate-none"
          />
          {label}
        </p>
        <ol aria-hidden="true" className="flex flex-col gap-2">
          {stages.map((stage, i) => (
            <li
              key={stage}
              className={`flex items-center gap-3 text-base ${i <= at ? "text-foreground" : "text-muted-foreground"}`}
            >
              <span
                className={`flex size-6 items-center justify-center rounded-full border ${i < at ? "border-brand bg-primary text-primary-foreground" : i === at ? "border-brand" : "border-border"}`}
              >
                {i < at && <Check className="size-4" />}
              </span>
              {stageLabel[stage]}
            </li>
          ))}
        </ol>
      </div>
    );
  }

  if (step.name === "error") {
    return (
      <div className="flex flex-col gap-3">
        <h2
          ref={screenHeading}
          tabIndex={-1}
          className="rounded-2xl border-2 border-status-warn bg-card p-4 text-base font-normal outline-none"
        >
          {t.error}
        </h2>
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
  // The confirm screen replaces the "Reading…" message: take keyboard focus to its heading.
  const confirmHeading = useRef<HTMLHeadingElement>(null);
  useEffect(() => confirmHeading.current?.focus(), []);
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
        <h2
          ref={confirmHeading}
          tabIndex={-1}
          className="text-2xl font-bold tracking-tight outline-none"
        >
          {t.confirmTitle}
        </h2>
        <p className="text-base text-muted-foreground">{t.confirmIntro}</p>
      </div>

      <div className={panelClass("grid grid-cols-1 gap-5 p-5 sm:grid-cols-2 sm:p-6")}>
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

      <div className="flex flex-col gap-2 sm:flex-row">
        <Button
          size="xl"
          onClick={findMedicine}
          disabled={
            !(values.brand.trim() || (nameAsRead && guesses.length)) || match.step === "matching"
          }
        >
          <Search aria-hidden="true" />
          {t.lookUp}
        </Button>
        <Button size="xl" variant="outline" onClick={onStartOver}>
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
      <details className={panelClass("group px-5 text-base")}>
        <summary className="flex min-h-14 cursor-pointer list-none items-center gap-2 font-semibold [&::-webkit-details-marker]:hidden">
          <ChevronDown
            aria-hidden="true"
            className="size-5 transition-transform group-open:rotate-180 motion-reduce:transition-none"
          />
          {t.howWeRead}
        </summary>
        <div className="flex flex-col gap-2 pb-5">
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
                  {label}: {field ? `${Math.round(field.confidence * 100)}%` : "-"}
                  {source && ` · ${t.variantUsed}: ${source.front} / ${source.back}`}
                </li>
              );
            })}
          </ul>
          <p className="font-medium">{t.rawText}</p>
          <pre className="max-h-64 overflow-auto rounded-xl bg-muted p-3 font-mono text-sm whitespace-pre-wrap">
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
        <div className="flex flex-col gap-2 rounded-2xl border-2 border-brand/50 bg-card p-5 shadow-soft motion-safe:animate-in motion-safe:slide-in-from-bottom-2">
          <p className="text-base text-muted-foreground">{auto ? t.matchedTitle : t.youChose}</p>
          <p className="text-2xl font-bold tracking-tight">{chosen.name}</p>
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
          <h3 className="text-xl font-semibold">{t.pickFromThese}</h3>
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
    <details className="group text-base">
      <summary className="flex min-h-12 cursor-pointer list-none items-center gap-2 font-semibold [&::-webkit-details-marker]:hidden">
        <ChevronDown
          aria-hidden="true"
          className="size-5 transition-transform group-open:rotate-180 motion-reduce:transition-none"
        />
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
  const className = inputClass({ warn: unsure });
  return (
    <div className={`flex flex-col gap-1.5 ${props.multiline ? "sm:col-span-2" : ""}`}>
      <label htmlFor={id} className="flex flex-wrap items-center gap-2 text-base font-semibold">
        {props.label}
        {unsure && (
          // Never colour alone: the amber border always comes with these words.
          <span className="rounded-full border border-status-warn/50 bg-status-warn/15 px-2.5 py-0.5 text-sm font-medium text-foreground">
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
          className={className}
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
