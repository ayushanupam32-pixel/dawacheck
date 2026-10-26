import { describe, expect, it } from "vitest";
import { parsePreference, resolveTheme, themeScript, THEME_KEY } from "@/lib/theme";

describe("theme preference", () => {
  it("keeps a known choice and falls back to system", () => {
    expect(parsePreference("dark")).toBe("dark");
    expect(parsePreference("light")).toBe("light");
    expect(parsePreference("system")).toBe("system");
    expect(parsePreference(null)).toBe("system");
    expect(parsePreference("purple")).toBe("system");
  });

  it("resolves system from the operating system setting", () => {
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("system", false)).toBe("light");
    expect(resolveTheme("light", true)).toBe("light");
    expect(resolveTheme("dark", false)).toBe("dark");
  });

  it("the pre-paint script reads the same storage key", () => {
    expect(themeScript).toContain(`localStorage.getItem("${THEME_KEY}")`);
    expect(themeScript).toContain("prefers-color-scheme: dark");
  });
});
