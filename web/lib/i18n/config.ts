// Supported interface languages. The URL always starts with one of these,
// e.g. /hi/scan, so every page knows which dictionary to load.
export const locales = ["en", "hi", "ta"] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = "en";

// Each language's name written in its own script, for the language switcher.
export const localeNames: Record<Locale, string> = {
  en: "English",
  hi: "हिन्दी",
  ta: "தமிழ்",
};

export function isLocale(value: string): value is Locale {
  return (locales as readonly string[]).includes(value);
}

/**
 * Picks the best supported locale from a browser's Accept-Language header,
 * e.g. "ta-IN,ta;q=0.9,en;q=0.8" -> "ta".
 *
 * Each entry may carry a quality weight (q=0..1, default 1). We sort by weight
 * and return the first entry whose base language ("ta" from "ta-IN") we support.
 */
export function pickLocale(acceptLanguage: string | null | undefined): Locale {
  if (!acceptLanguage) return defaultLocale;

  const ranked = acceptLanguage
    .split(",")
    .map((part, index) => {
      const [tag, ...params] = part.trim().split(";");
      const qParam = params.find((p) => p.trim().startsWith("q="));
      const q = qParam ? Number(qParam.trim().slice(2)) : 1;
      return { base: tag.trim().toLowerCase().split("-")[0], q, index };
    })
    .filter((entry) => entry.base && Number.isFinite(entry.q) && entry.q > 0)
    // Higher weight first; ties keep the browser's original order.
    .sort((a, b) => b.q - a.q || a.index - b.index);

  for (const { base } of ranked) {
    if (isLocale(base)) return base;
  }
  return defaultLocale;
}
