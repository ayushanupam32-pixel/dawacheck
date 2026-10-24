"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import type { Label } from "@/lib/ai/score";

type Photo = { id: string; front: string; back: string | null; label: Label | null };

const EMPTY = {
  brand: "",
  ingredients: "",
  mrp: "",
  packSize: "",
  batchNo: "",
  mfgDate: "",
  expDate: "",
  foil: false,
  lighting: "good" as "good" | "poor",
  notes: "",
  /** "?" = not labelled yet; empty = not in the brand database (abstaining is right). */
  matchBrand: "?",
};
type Form = typeof EMPTY;

const fromLabel = (l: Label | null): Form =>
  l
    ? {
        brand: l.brand,
        ingredients: l.ingredients,
        mrp: l.mrp === null ? "" : String(l.mrp),
        packSize: l.packSize === null ? "" : String(l.packSize),
        batchNo: l.batchNo,
        mfgDate: l.mfgDate,
        expDate: l.expDate,
        foil: l.foil,
        lighting: l.lighting,
        notes: l.notes ?? "",
        matchBrand: l.matchBrand === undefined ? "?" : (l.matchBrand ?? ""),
      }
    : EMPTY;

/**
 * Local labeling tool for the evaluation (see eval/README.md). The form starts EMPTY on purpose:
 * pre-filling it with DawaCheck's own reading would bias the person labelling towards accepting it,
 * which would make the measured accuracy look better than it is.
 */
export function LabelTool() {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [unpaired, setUnpaired] = useState<string[]>([]);
  const [index, setIndex] = useState(0);
  const [form, setForm] = useState<Form>(EMPTY);
  const [status, setStatus] = useState("");

  async function load(keepIndex = 0) {
    const res = await fetch("/api/eval");
    const body = (await res.json()) as { photos: Photo[]; unpaired: string[] };
    setPhotos(body.photos);
    setUnpaired(body.unpaired);
    setIndex(keepIndex);
    setForm(fromLabel(body.photos[keepIndex]?.label ?? null));
  }

  useEffect(() => {
    const timer = setTimeout(() => void load(), 0); // after first render (see search-client.tsx)
    return () => clearTimeout(timer);
  }, []);

  const photo = photos[index];
  const set =
    (key: keyof Form) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setForm((f) => ({
        ...f,
        [key]:
          e.target.type === "checkbox" ? (e.target as HTMLInputElement).checked : e.target.value,
      }));

  async function save(goNext: boolean) {
    if (!photo) return;
    const label: Label = {
      id: photo.id,
      split: photo.label?.split ?? "dev", // the server decides the split on first save
      front: photo.front,
      back: photo.back,
      brand: form.brand.trim(),
      ingredients: form.ingredients.trim(),
      mrp: form.mrp ? Number(form.mrp) : null,
      packSize: form.packSize ? Number(form.packSize) : null,
      batchNo: form.batchNo.trim(),
      mfgDate: form.mfgDate.trim(),
      expDate: form.expDate.trim(),
      foil: form.foil,
      lighting: form.lighting,
      notes: form.notes.trim() || undefined,
      matchBrand: form.matchBrand.trim() === "?" ? undefined : form.matchBrand.trim() || null,
    };
    const res = await fetch("/api/eval", { method: "POST", body: JSON.stringify(label) });
    const body = (await res.json()) as { saved?: Label; error?: string };
    setStatus(body.saved ? `Saved ${photo.id} (${body.saved.split})` : `Error: ${body.error}`);
    await load(goNext ? Math.min(index + 1, photos.length - 1) : index);
  }

  if (!photos.length) {
    return (
      <p className="text-base">
        No photos yet. Put them in <code>eval/photos/</code> named <code>&lt;id&gt;-front.jpg</code>{" "}
        and <code>&lt;id&gt;-back.jpg</code> (see eval/README.md), then reload.
        {unpaired.length > 0 && ` Not named that way: ${unpaired.join(", ")}`}
      </p>
    );
  }

  const done = photos.filter((p) => p.label).length;
  const tests = photos.filter((p) => p.label?.split === "test").length;
  const input = "min-h-12 w-full rounded-lg border border-input bg-background px-3 text-base";

  return (
    <div className="flex flex-col gap-4">
      <p className="text-base">
        {done} of {photos.length} labelled · {tests} in the frozen test set · now:{" "}
        <strong>{photo.id}</strong>
        {photo.label && ` (${photo.label.split})`}
      </p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {[photo.front, photo.back].filter(Boolean).map((name) => (
          // eslint-disable-next-line @next/next/no-img-element -- local development tool
          <img
            key={name}
            src={`/api/eval/photo?name=${encodeURIComponent(name!)}`}
            alt={name!}
            className="w-full rounded-lg border"
          />
        ))}
      </div>
      <p className="text-sm text-muted-foreground">
        Type exactly what is printed. Dates as YYYY-MM (e.g. 2027-08). Ingredients one per line,
        e.g. &quot;Telmisartan 40 mg&quot;. Leave a field empty if it is not visible in the photos;
        empty fields are not scored.
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {(["brand", "mrp", "packSize", "batchNo", "mfgDate", "expDate"] as const).map((key) => (
          <label key={key} className="flex flex-col gap-1 text-base">
            {key}
            <input className={input} value={form[key]} onChange={set(key)} />
          </label>
        ))}
      </div>
      <label className="flex flex-col gap-1 text-base">
        ingredients
        <textarea
          className={`${input} py-2`}
          rows={3}
          value={form.ingredients}
          onChange={set("ingredients")}
        />
      </label>
      <div className="flex flex-wrap items-center gap-4 text-base">
        <label className="flex min-h-12 items-center gap-2">
          <input type="checkbox" checked={form.foil} onChange={set("foil")} className="size-5" />
          Foil (shiny) pack
        </label>
        <label className="flex items-center gap-2">
          Lighting
          <select className={input} value={form.lighting} onChange={set("lighting")}>
            <option value="good">good</option>
            <option value="poor">poor</option>
          </select>
        </label>
      </div>
      <label className="flex flex-col gap-1 text-base">
        matchBrand (M4)
        <input className={input} value={form.matchBrand} onChange={set("matchBrand")} />
        <span className="text-sm text-muted-foreground">
          The exact brand name in the database (search it at /en/search, e.g. &quot;Telma 40
          Tablet&quot;). Empty = not in the database, so the right answer is to abstain. ? = not
          labelled yet.
        </span>
      </label>
      <label className="flex flex-col gap-1 text-base">
        notes
        <input className={input} value={form.notes} onChange={set("notes")} />
      </label>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" disabled={index === 0} onClick={() => load(index - 1)}>
          Previous
        </Button>
        <Button onClick={() => save(true)}>Save and next</Button>
        <Button variant="outline" onClick={() => save(false)}>
          Save
        </Button>
        <Button
          variant="outline"
          disabled={index >= photos.length - 1}
          onClick={() => load(index + 1)}
        >
          Skip
        </Button>
      </div>
      {status && <p className="text-base">{status}</p>}
    </div>
  );
}
