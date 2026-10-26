import type { LucideIcon } from "lucide-react";

/**
 * The top of every inner page: an icon, the page title and one line of introduction. They rise
 * into place one after another as the page opens (CSS only, so there is no wait for scripts;
 * still with reduced motion).
 */
export function PageHeader({
  icon: Icon,
  title,
  intro,
}: {
  icon: LucideIcon;
  title: string;
  intro?: string;
}) {
  return (
    <div className="relative flex flex-col gap-4 pb-2">
      {/* A soft marigold glow behind the icon gives each page a little warmth. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-16 -left-20 -z-10 size-72 rounded-full bg-[radial-gradient(circle,oklch(0.83_0.155_76/0.22),transparent_65%)]"
      />
      <span
        className="rise flex size-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-[0_10px_30px_-10px_oklch(0.8_0.16_72/0.7)]"
        style={{ "--i": 0 } as React.CSSProperties}
      >
        <Icon aria-hidden="true" className="size-7" />
      </span>
      <h1
        className="rise text-[clamp(1.75rem,8vw,2.25rem)] font-bold tracking-tight break-words sm:text-5xl"
        style={{ "--i": 1 } as React.CSSProperties}
      >
        {title}
      </h1>
      {intro && (
        <p
          className="rise max-w-[60ch] text-lg leading-relaxed text-muted-foreground"
          style={{ "--i": 2 } as React.CSSProperties}
        >
          {intro}
        </p>
      )}
    </div>
  );
}
