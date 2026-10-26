// Light / dark / system theme. Pure helpers (unit-tested) plus the tiny script that applies the
// saved choice before the first paint, so the page never flashes in the wrong theme.

export const THEME_KEY = "dc-theme";
export const themePreferences = ["light", "dark", "system"] as const;
export type ThemePreference = (typeof themePreferences)[number];

/** A stored value we don't recognise (or none) means "follow the phone's setting". */
export function parsePreference(value: string | null | undefined): ThemePreference {
  return themePreferences.includes(value as ThemePreference)
    ? (value as ThemePreference)
    : "system";
}

/** The theme actually shown: "system" follows the operating system's dark-mode setting. */
export function resolveTheme(preference: ThemePreference, systemDark: boolean): "light" | "dark" {
  return preference === "system" ? (systemDark ? "dark" : "light") : preference;
}

/**
 * Runs in <head> before the page paints (layout.tsx). Same logic as the two functions above,
 * written out because it must be a plain string. Reads localStorage only; nothing leaves the phone.
 * It also marks the page with the class "js": scroll-reveal styles only hide content when the
 * script that will reveal it can run.
 */
export const themeScript = `try{var p=localStorage.getItem("${THEME_KEY}");if(p!=="light"&&p!=="dark")p="system";var d=p==="dark"||(p==="system"&&matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.classList.toggle("dark",d)}catch(e){}document.documentElement.classList.add("js")`;
