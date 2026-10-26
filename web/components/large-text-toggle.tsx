"use client";

import { useSyncExternalStore } from "react";

const STORAGE_KEY = "dc-large-text";

// The <html data-text="large"> attribute is the single source of truth; the
// inline script in the layout sets it before paint. We watch it for changes.
function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-text"] });
  return () => observer.disconnect();
}

const isLarge = () => document.documentElement.dataset.text === "large";

function toggle(large: boolean) {
  const next = !large;
  if (next) document.documentElement.dataset.text = "large";
  else delete document.documentElement.dataset.text;
  try {
    localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
  } catch {
    // Storage can be blocked (private mode); the toggle still works for this visit.
  }
}

/** "Aa" glyph: a small and a big A, so the meaning shows without words. */
const Glyph = () => (
  <span aria-hidden="true" className="leading-none font-bold">
    <span className="text-sm">A</span>
    <span className="text-xl">A</span>
  </span>
);

/**
 * `compact`: a 48 px icon button for the header (the label is its accessible name and tooltip).
 * `full`: a labelled row with a visible switch, for the mobile menu.
 */
export function LargeTextToggle({
  label,
  variant = "full",
}: {
  label: string;
  variant?: "compact" | "full";
}) {
  const large = useSyncExternalStore(subscribe, isLarge, () => false);

  if (variant === "compact") {
    return (
      <button
        type="button"
        role="switch"
        aria-checked={large}
        aria-label={label}
        title={label}
        onClick={() => toggle(large)}
        className="inline-flex size-12 items-center justify-center rounded-lg text-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none active:scale-[0.97] aria-checked:bg-accent aria-checked:text-accent-foreground"
      >
        <Glyph />
      </button>
    );
  }

  return (
    <button
      type="button"
      role="switch"
      aria-checked={large}
      onClick={() => toggle(large)}
      className="flex min-h-12 w-full items-center gap-3 rounded-xl bg-muted px-4 text-base font-medium hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
    >
      <Glyph />
      <span className="flex-1 text-left">{label}</span>
      <span
        aria-hidden="true"
        className={`inline-block h-7 w-12 rounded-full p-0.5 transition-colors motion-reduce:transition-none ${large ? "bg-primary" : "bg-input"}`}
      >
        <span
          className={`block size-6 rounded-full bg-card shadow-soft transition-transform motion-reduce:transition-none ${large ? "translate-x-5" : ""}`}
        />
      </span>
    </button>
  );
}
