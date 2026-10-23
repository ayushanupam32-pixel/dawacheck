import Link from "next/link";
import { localeNames, locales, type Locale } from "@/lib/i18n/config";

export function LanguageSwitcher({ current, label }: { current: Locale; label: string }) {
  return (
    <nav aria-label={label} className="flex flex-wrap gap-2">
      {locales.map((locale) => (
        <Link
          key={locale}
          href={`/${locale}`}
          lang={locale}
          hrefLang={locale}
          aria-current={locale === current ? "page" : undefined}
          className="inline-flex min-h-12 min-w-12 items-center justify-center rounded-lg border border-border px-3 text-base font-medium hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none aria-[current=page]:border-primary aria-[current=page]:bg-primary aria-[current=page]:text-primary-foreground"
        >
          {localeNames[locale]}
        </Link>
      ))}
    </nav>
  );
}
