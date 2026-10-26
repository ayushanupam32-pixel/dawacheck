"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { localeNames, locales, type Locale } from "@/lib/i18n/config";

/** The same page in another language: /hi/kendras -> /ta/kendras. */
export function swapLocale(pathname: string, locale: Locale) {
  const [, , ...rest] = pathname.split("/");
  return `/${[locale, ...rest].filter(Boolean).join("/")}`;
}

/**
 * Language buttons. Switching keeps the user on the same page (it used to go back to the home
 * page). `size="sm"` is the header version; every target is still at least 48 px.
 */
export function LanguageSwitcher({
  current,
  label,
  size = "md",
}: {
  current: Locale;
  label: string;
  size?: "sm" | "md";
}) {
  const pathname = usePathname() ?? `/${current}`;
  return (
    <nav aria-label={label}>
      <ul className={`flex gap-1 ${size === "md" ? "rounded-xl bg-muted p-1" : ""}`}>
        {locales.map((locale) => (
          <li key={locale} className={size === "md" ? "flex-1" : undefined}>
            <Link
              href={swapLocale(pathname, locale)}
              lang={locale}
              hrefLang={locale}
              aria-current={locale === current ? "true" : undefined}
              className={`inline-flex min-h-12 w-full min-w-12 items-center justify-center rounded-lg px-3 text-base font-medium transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none ${
                size === "md"
                  ? "text-muted-foreground hover:text-foreground aria-[current=true]:bg-card aria-[current=true]:text-foreground aria-[current=true]:shadow-soft"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground aria-[current=true]:text-foreground aria-[current=true]:underline aria-[current=true]:decoration-primary aria-[current=true]:decoration-2 aria-[current=true]:underline-offset-8"
              }`}
            >
              {localeNames[locale]}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
