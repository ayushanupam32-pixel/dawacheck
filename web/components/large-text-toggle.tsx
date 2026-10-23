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

export function LargeTextToggle({ label }: { label: string }) {
  const large = useSyncExternalStore(subscribe, isLarge, () => false);

  function toggle() {
    const next = !large;
    if (next) document.documentElement.dataset.text = "large";
    else delete document.documentElement.dataset.text;
    try {
      localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
    } catch {
      // Storage can be blocked (private mode); the toggle still works for this visit.
    }
  }

  return (
    <button
      type="button"
      role="switch"
      aria-checked={large}
      onClick={toggle}
      className="inline-flex min-h-12 items-center gap-2 rounded-lg border border-border px-3 text-base font-medium hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
    >
      <span aria-hidden="true" className="text-lg font-bold">
        A<span className="text-2xl">A</span>
      </span>
      {label}
      <span
        aria-hidden="true"
        className={`ml-1 inline-block h-6 w-10 rounded-full p-0.5 transition-colors ${large ? "bg-primary" : "bg-muted-foreground/40"}`}
      >
        <span
          className={`block size-5 rounded-full bg-white transition-transform ${large ? "translate-x-4" : ""}`}
        />
      </span>
    </button>
  );
}
