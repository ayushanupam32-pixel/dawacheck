"use client";

// The five checks as a scroll card stack (Skiper UI skiper16, via StickyStack). Each card has its
// own surface so the stack reads as five distinct things: marigold, ink, then three quieter cards.

import type { LucideIcon } from "lucide-react";
import { Ban, IndianRupee, MapPin, PiggyBank, ShieldAlert } from "lucide-react";
import { StickyStack } from "@/components/motion";

type Item = { key: string; title: string; body: string; source: string };

const icons: Record<string, LucideIcon> = {
  generic: PiggyBank,
  batch: ShieldAlert,
  price: IndianRupee,
  banned: Ban,
  kendra: MapPin,
};

// Card surfaces in stack order. The text colour is set with each surface so contrast holds in
// both themes (the first two are the same in light and dark on purpose).
const surfaces = [
  "bg-primary text-primary-foreground",
  "bg-brand-surface text-brand-surface-foreground ring-1 ring-white/12",
  "bg-card text-card-foreground border border-border",
  "bg-accent text-accent-foreground",
  "bg-card text-card-foreground border border-border",
];

export function HomeChecks({ items }: { items: Item[] }) {
  return (
    <StickyStack
      items={items}
      renderCard={(item, i) => {
        const Icon = icons[item.key];
        return (
          <article
            className={`flex min-h-64 flex-col justify-between gap-8 rounded-2xl p-7 shadow-lift sm:min-h-72 sm:p-10 ${surfaces[i % surfaces.length]}`}
          >
            <div className="flex items-start justify-between gap-4">
              <span className="flex size-16 items-center justify-center rounded-2xl bg-current/10 sm:size-20">
                <Icon aria-hidden="true" className="size-8 sm:size-10" />
              </span>
              <span className="rounded-full border border-current/30 px-3 py-1 text-sm font-semibold">
                {item.source}
              </span>
            </div>
            <div className="flex flex-col gap-3">
              <h3 className="text-2xl font-bold tracking-tight sm:text-4xl">{item.title}</h3>
              <p className="max-w-[46ch] text-lg leading-relaxed opacity-90">{item.body}</p>
            </div>
          </article>
        );
      }}
    />
  );
}
