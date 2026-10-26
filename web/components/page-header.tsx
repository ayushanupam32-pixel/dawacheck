import type { LucideIcon } from "lucide-react";

/** The top of every inner page: an icon, the page title and one line of introduction. */
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
    <div className="flex flex-col gap-3 pb-2">
      <span className="flex size-12 items-center justify-center rounded-xl bg-accent text-accent-foreground">
        <Icon aria-hidden="true" className="size-6" />
      </span>
      <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{title}</h1>
      {intro && (
        <p className="max-w-[60ch] text-lg leading-relaxed text-muted-foreground">{intro}</p>
      )}
    </div>
  );
}
