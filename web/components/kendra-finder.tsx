"use client";

import { useId, useState } from "react";
import dynamic from "next/dynamic";
import { Lock, LocateFixed, Map as MapIcon, Navigation, Phone } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { inputClass, panelClass, Skeleton } from "@/components/ui/field";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import { cellsAround } from "@/lib/geo/geohash";
import {
  directionsUrl,
  nearestKendras,
  parseKendraFile,
  type Kendra,
  type KendraFile,
  type NearestResult,
} from "@/lib/geo/nearest";

// The map (and Leaflet with it) is only downloaded if the user asks for it.
const KendraMap = dynamic(() => import("./kendra-map").then((m) => m.KendraMap), {
  ssr: false,
});

type T = Dictionary["kendras"];
type Origin = { lat: number; lng: number; approximate: boolean };
type State =
  | { step: "idle" }
  | { step: "locating" }
  | { step: "loading" }
  | { step: "result"; origin: Origin; result: NearestResult; updated: string | null }
  | { step: "message"; text: string };

const fill = (template: string, values: Record<string, string>) =>
  template.replace(/\{(\w+)\}/g, (_, key: string) => values[key] ?? "");

/**
 * Downloads the static Kendra files for the 3 × 3 block of map cells around the point.
 * The server only learns which ~156 km cells were requested, never the exact point.
 */
async function loadKendrasAround(lat: number, lng: number) {
  const indexRes = await fetch("/data/kendras/index.json");
  if (!indexRes.ok) throw new Error(`Kendra index: ${indexRes.status}`);
  const index = (await indexRes.json()) as { updated: string; cells: string[] };
  const existing = new Set(index.cells);

  // Cells with no Kendras (sea, borders, deserts) have no file, so they are skipped.
  const files = await Promise.all(
    cellsAround(lat, lng)
      .filter((cell) => existing.has(cell))
      .map(async (cell) => {
        const res = await fetch(`/data/kendras/${cell}.json`);
        if (!res.ok) throw new Error(`Kendra file ${cell}: ${res.status}`);
        return (await res.json()) as KendraFile;
      }),
  );
  return { kendras: files.flatMap(parseKendraFile) as Kendra[], updated: index.updated };
}

/** "0.78" km, or "< 0.1" when the Kendra is practically next door. */
function formatKm(km: number, locale: string): string {
  if (km < 0.1) return `< ${(0.1).toLocaleString(`${locale}-IN`)}`;
  return km.toLocaleString(`${locale}-IN`, { maximumFractionDigits: 1 });
}

export function KendraFinder({ t, locale }: { t: T; locale: string }) {
  const [state, setState] = useState<State>({ step: "idle" });
  const [pin, setPin] = useState("");
  const [showMap, setShowMap] = useState(false);
  const pinId = useId();

  async function findNear(origin: Origin) {
    setState({ step: "loading" });
    setShowMap(false);
    try {
      const { kendras, updated } = await loadKendrasAround(origin.lat, origin.lng);
      const result = nearestKendras(origin.lat, origin.lng, kendras);
      setState(
        result.kendras.length
          ? { step: "result", origin, result, updated }
          : { step: "message", text: t.noneAtAll },
      );
    } catch {
      setState({ step: "message", text: t.error });
    }
  }

  function useMyLocation() {
    if (!("geolocation" in navigator)) {
      setState({ step: "message", text: t.locationDenied });
      return;
    }
    setState({ step: "locating" });
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        findNear({ lat: pos.coords.latitude, lng: pos.coords.longitude, approximate: false }),
      () => setState({ step: "message", text: t.locationDenied }),
      { enableHighAccuracy: false, timeout: 15000, maximumAge: 300000 },
    );
  }

  async function usePin(event: React.FormEvent) {
    event.preventDefault();
    if (!/^[1-9]\d{5}$/.test(pin)) {
      setState({ step: "message", text: t.pinInvalid });
      return;
    }
    setState({ step: "loading" });
    try {
      // Only the first 3 digits (the postal sorting district) decide which file is fetched.
      const res = await fetch(`/data/pins/${pin.slice(0, 3)}.json`);
      if (res.status === 404) {
        setState({ step: "message", text: t.pinUnknown });
        return;
      }
      const file = (await res.json()) as {
        prefix: [number, number];
        pins: Record<string, [number, number]>;
      };
      const exact = file.pins[pin];
      const [lat, lng] = exact ?? file.prefix;
      await findNear({ lat, lng, approximate: true });
    } catch {
      setState({ step: "message", text: t.error });
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4">
        <div className="grid items-stretch gap-3 sm:grid-cols-[1fr_auto_1fr]">
          <div className={panelClass("flex flex-col justify-center gap-3 p-5")}>
            <Button onClick={useMyLocation} size="xl" className="w-full">
              <LocateFixed aria-hidden="true" />
              {t.useLocation}
            </Button>
          </div>
          <p className="self-center text-center text-base font-medium text-muted-foreground">
            {t.or}
          </p>
          <form onSubmit={usePin} className={panelClass("flex flex-col gap-2 p-5")}>
            <label htmlFor={pinId} className="text-base font-semibold">
              {t.pinLabel}
            </label>
            <div className="flex gap-2">
              <input
                id={pinId}
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
                inputMode="numeric"
                autoComplete="postal-code"
                pattern="[1-9][0-9]{5}"
                maxLength={6}
                className={inputClass({ className: "tabular min-w-0 flex-1 tracking-widest" })}
              />
              <Button type="submit" variant="outline">
                {t.pinSubmit}
              </Button>
            </div>
          </form>
        </div>
        <p className="flex items-start gap-2 text-base">
          <Lock aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-brand" />
          {t.privacy}
        </p>
      </div>

      <div aria-live="polite" className="flex flex-col gap-4">
        {(state.step === "locating" || state.step === "loading") && (
          <div role="status" className="flex flex-col gap-3">
            <p className="text-base text-muted-foreground">
              {state.step === "locating" ? t.locating : t.loading}
            </p>
            {[0, 1, 2].map((i) => (
              <div key={i} className={panelClass("flex flex-col gap-2 p-5")}>
                <div className="flex justify-between gap-4">
                  <Skeleton className="h-6 w-1/2" />
                  <Skeleton className="h-6 w-20 rounded-full" />
                </div>
                <Skeleton className="h-4 w-4/5" />
                <Skeleton className="h-4 w-2/5" />
              </div>
            ))}
          </div>
        )}

        {state.step === "message" && (
          <p className="rounded-2xl border-2 border-status-warn bg-card p-4 text-base">
            {state.text}
          </p>
        )}

        {state.step === "result" && (
          <>
            {state.origin.approximate && <p className="text-base">{t.pinApprox}</p>}
            {!state.result.anyNearby && (
              <p className="rounded-2xl border-2 border-status-warn bg-card p-4 text-base font-medium">
                {t.noneNearby}
              </p>
            )}

            <ol className="flex flex-col gap-3 motion-safe:animate-in motion-safe:fade-in">
              {state.result.kendras.map((k, i) => (
                <li key={k.code} className={panelClass("flex flex-col gap-2 p-5")}>
                  <div className="flex items-start justify-between gap-3">
                    <span className="flex items-center gap-3 text-lg font-semibold">
                      <span
                        aria-hidden="true"
                        className="tabular flex size-8 shrink-0 items-center justify-center rounded-full bg-accent text-base font-bold text-accent-foreground"
                      >
                        {i + 1}
                      </span>
                      {t.kendraName}
                    </span>
                    <span className="tabular shrink-0 rounded-full bg-accent px-3 py-1 text-base font-bold text-accent-foreground">
                      {fill(t.km, { km: formatKm(k.km, locale) })}
                    </span>
                  </div>
                  <p className="text-base">{k.address}</p>
                  <p className="text-base text-muted-foreground">
                    {[k.district, k.state, k.pin].filter(Boolean).join(", ")} · {k.code}
                  </p>
                  {k.precision === "pincode" && (
                    <p className="text-sm text-muted-foreground">{t.approxLocation}</p>
                  )}
                  <div className="flex flex-wrap gap-2 pt-1">
                    {k.phone && (
                      <a
                        href={`tel:+91${k.phone}`}
                        className={buttonVariants({ variant: "default" })}
                      >
                        <Phone aria-hidden="true" />
                        {t.call}
                      </a>
                    )}
                    <a
                      href={directionsUrl(k)}
                      target="_blank"
                      rel="noreferrer"
                      className={buttonVariants({ variant: "outline" })}
                    >
                      <Navigation aria-hidden="true" />
                      {t.directions}
                    </a>
                  </div>
                </li>
              ))}
            </ol>

            <p className="text-sm text-muted-foreground">
              {t.stockNote} {t.straightLine}
            </p>

            {showMap ? (
              <KendraMap centre={state.origin} kendras={state.result.kendras} youLabel={t.you} />
            ) : (
              <div className="flex flex-col gap-2">
                <Button
                  variant="outline"
                  onClick={() => setShowMap(true)}
                  className="w-full sm:w-fit"
                >
                  <MapIcon aria-hidden="true" />
                  {t.showMap}
                </Button>
                <p className="text-sm text-muted-foreground">{t.mapNote}</p>
              </div>
            )}

            <p className="text-sm text-muted-foreground">
              {t.source}:{" "}
              <a
                href="https://janaushadhi.gov.in/near-by-kendra"
                target="_blank"
                rel="noreferrer"
                className="underline"
              >
                janaushadhi.gov.in
              </a>
              {state.updated &&
                ` · ${t.updated}: ${new Date(state.updated).toLocaleDateString(`${locale}-IN`)}`}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
