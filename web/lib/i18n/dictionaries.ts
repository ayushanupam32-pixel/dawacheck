import "server-only";
import type en from "@/messages/en.json";
import type { Locale } from "./config";

// English is the reference shape; Hindi and Tamil must have the same keys,
// which TypeScript checks through the `satisfies` below.
export type Dictionary = typeof en;

const dictionaries = {
  en: () => import("@/messages/en.json").then((m) => m.default),
  hi: () => import("@/messages/hi.json").then((m) => m.default),
  ta: () => import("@/messages/ta.json").then((m) => m.default),
} satisfies Record<Locale, () => Promise<Dictionary>>;

// Runs only on the server, so translation files never ship to the browser.
export function getDictionary(locale: Locale): Promise<Dictionary> {
  return dictionaries[locale]();
}
