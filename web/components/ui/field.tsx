import { cn } from "cn";

/**
 * One look for every text box in the app (it used to be copied into five files). 48 px tall,
 * 18 px text, a border with 3:1 contrast in both themes, and a clear focus ring.
 * `warn` adds the amber border used for "Please check"; it always comes with words.
 */
export function inputClass({ warn = false, className }: { warn?: boolean; className?: string } = {}) {
  return cn(
    "min-h-12 w-full rounded-lg border bg-card px-3.5 py-2 text-lg text-foreground shadow-[inset_0_1px_2px_hsl(var(--shadow-color)/0.06)] transition-[border-color,box-shadow] placeholder:text-muted-foreground hover:border-foreground/50 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40 focus-visible:outline-none disabled:opacity-60 motion-reduce:transition-none",
    warn ? "border-status-warn border-2" : "border-input",
    className,
  );
}

/** A surface that groups related content: the one card style (16 px corners, soft shadow). */
export function panelClass(className?: string) {
  return cn("rounded-2xl border border-border bg-card text-card-foreground shadow-soft", className);
}

/** Skeleton block for loading states: same shape as what will appear, shimmer-free when reduced. */
export function Skeleton({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn("block animate-pulse rounded-lg bg-muted motion-reduce:animate-none", className)}
    />
  );
}
