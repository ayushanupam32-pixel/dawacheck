"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Camera, ChevronDown, ImageUp, Loader2, Lock, RotateCcw, Search } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import type { ExtractedFields, Ingredient } from "@/lib/ai/extract";
import type { FieldKey } from "@/lib/ai/merge";
import type { Stage, StripReading } from "@/lib/ai/ocr";

type T = Dictionary["scan"];
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

export function ScanClient({ t, locale }: { t: T; locale: string }) {
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

  // Demo mode: the same reader, on two sample photos shipped with the site (public/demo).
  // Lets the app be demonstrated without depending on the light in the exam hall.
  async function readDemo() {
    setStep({ name: "reading", stage: "loading-model" });
    try {
      const [demoFront, demoBack] = await Promise.all(
        ["/demo/front.jpg", "/demo/back.jpg"].map((url) => fetch(url).then((r) => r.blob())),
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
            <Button variant="outline" onClick={readDemo} className="w-fit">
              {t.demoButton}
            </Button>
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

  return <Confirm t={t} locale={locale} reading={step.reading} onStartOver={startOver} />;
}

// ------------------------------------------------------------------ confirm screen

const formatIngredients = (list: Ingredient[] | undefined) =>
  (list ?? []).map((i) => `${i.salt} ${i.value} ${i.unit}`).join("\n");

const toMonthYear = (yyyyMm: string | undefined) =>
  yyyyMm ? `${yyyyMm.slice(5, 7)}/${yyyyMm.slice(0, 4)}` : "";

function Confirm({
  t,
  locale,
  reading,
  onStartOver,
}: {
  t: T;
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
          />
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        <Link
          href={`/${locale}/search?q=${encodeURIComponent(values.brand)}`}
          aria-disabled={!values.brand.trim()}
          className={buttonVariants({ variant: "default" })}
        >
          <Search aria-hidden="true" />
          {t.lookUp}
        </Link>
        <Button variant="outline" onClick={onStartOver}>
          <RotateCcw aria-hidden="true" />
          {t.startOver}
        </Button>
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

function ConfirmField(props: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  confidence: number | null;
  multiline?: boolean;
  placeholder?: string;
  t: T;
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
    </div>
  );
}
