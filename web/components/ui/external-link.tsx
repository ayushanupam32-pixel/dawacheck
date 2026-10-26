import { cn } from "cn";

/**
 * A link to another website (a government source, the code on GitHub). Adapted from Skiper UI's
 * skiper40 "CssLink" (Link001): the underline is always visible here (links must not rely on
 * hover), it thickens on hover, and the arrow shows that the link leaves Medicheck. Pure CSS.
 */
export function ExternalLink({
  href,
  children,
  className,
}: {
  href: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className={cn(
        "group inline-flex min-h-12 items-center gap-1 font-medium text-brand underline decoration-1 underline-offset-4 transition-[text-decoration-thickness] hover:decoration-2 focus-visible:rounded-sm focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
        className,
      )}
    >
      {children}
      {/* skiper40's arrow; it lifts slightly on hover (no movement with reduced motion). */}
      <svg
        className="size-[0.6em] shrink-0 transition-transform duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 motion-reduce:transition-none"
        fill="none"
        viewBox="0 0 10 10"
        aria-hidden="true"
      >
        <path
          d="M1.004 9.166 9.337.833m0 0v8.333m0-8.333H1.004"
          stroke="currentColor"
          strokeWidth="1.25"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </a>
  );
}
