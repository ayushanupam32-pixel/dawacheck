import { describe, expect, it } from "vitest";
import en from "@/messages/en.json";
import hi from "@/messages/hi.json";
import ta from "@/messages/ta.json";
import { isLocale, pickLocale } from "@/lib/i18n/config";

describe("pickLocale", () => {
  it("falls back to English when the header is missing", () => {
    expect(pickLocale(null)).toBe("en");
    expect(pickLocale("")).toBe("en");
  });

  it("matches on the base language, ignoring the region", () => {
    expect(pickLocale("ta-IN")).toBe("ta");
    expect(pickLocale("hi-IN,hi;q=0.9")).toBe("hi");
  });

  it("respects quality weights, not just order", () => {
    expect(pickLocale("en;q=0.5,hi;q=0.9")).toBe("hi");
  });

  it("skips unsupported languages", () => {
    expect(pickLocale("fr-FR,de;q=0.9,ta;q=0.3")).toBe("ta");
    expect(pickLocale("fr-FR,de;q=0.9")).toBe("en");
  });

  it("ignores languages the browser marks q=0 (not acceptable)", () => {
    expect(pickLocale("hi;q=0,ta;q=0.2")).toBe("ta");
  });

  it("keeps browser order when weights tie", () => {
    expect(pickLocale("ta,hi")).toBe("ta");
  });
});

describe("isLocale", () => {
  it("accepts only supported locales", () => {
    expect(isLocale("hi")).toBe(true);
    expect(isLocale("HI")).toBe(false);
    expect(isLocale("fr")).toBe(false);
  });
});

// Every key path in a nested object, e.g. "home.checks.batch".
function keyPaths(obj: object, prefix = ""): string[] {
  return Object.entries(obj).flatMap(([key, value]) =>
    typeof value === "object" && value !== null
      ? keyPaths(value, `${prefix}${key}.`)
      : [`${prefix}${key}`],
  );
}

describe("translations", () => {
  const reference = keyPaths(en).sort();

  it.each([
    ["hi", hi],
    ["ta", ta],
  ])("%s has exactly the same keys as English", (_name, dict) => {
    expect(keyPaths(dict).sort()).toEqual(reference);
  });

  it.each([
    ["en", en],
    ["hi", hi],
    ["ta", ta],
  ])("%s has no empty strings", (_name, dict) => {
    const values = JSON.stringify(dict).match(/""/g);
    expect(values).toBeNull();
  });
});
