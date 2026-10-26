"use client";

// Theme menu: Light, Dark or "Same as phone". The choice is saved on the phone (localStorage) and
// applied before the first paint by `themeScript` (lib/theme.ts), so there is no flash.
//
// Adapted from Skiper UI (https://skiper-ui.com, free tier, attribution in the footer):
// - the sun/moon icon is skiper04's ThemeToggleButton2 (same SVG and motion);
// - switching uses skiper26's idea: run the change inside a View Transition so the new theme
//   grows as a circle, here centred on the button (CSS in globals.css). Skiper26 relies on
//   next-themes; this project keeps its own 20-line store instead, like the large-text switch.

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Menu } from "@base-ui/react/menu";
import { Check, Monitor, Moon, Sun } from "lucide-react";
import { parsePreference, resolveTheme, THEME_KEY, type ThemePreference } from "@/lib/theme";

type T = { theme: string; themeLight: string; themeDark: string; themeSystem: string };

const DARK_QUERY = "(prefers-color-scheme: dark)";
const CHANGE_EVENT = "dc-theme-change";

function readPreference(): ThemePreference {
  try {
    return parsePreference(localStorage.getItem(THEME_KEY));
  } catch {
    return "system"; // storage blocked (private mode): follow the phone
  }
}

// The saved preference and the <html class="dark"> flag are the two sources of truth; both are
// watched so every toggle on the page (header and mobile menu) stays in step.
function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener("storage", onChange); // another tab changed it
  return () => {
    observer.disconnect();
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

const isDarkNow = () => document.documentElement.classList.contains("dark");

function apply(preference: ThemePreference) {
  const dark = resolveTheme(preference, matchMedia(DARK_QUERY).matches) === "dark";
  document.documentElement.classList.toggle("dark", dark);
}

export function useTheme() {
  const preference = useSyncExternalStore(subscribe, readPreference, () => "system" as const);
  const dark = useSyncExternalStore(subscribe, isDarkNow, () => false);

  // "Same as phone": follow the operating system live, e.g. when it switches at sunset.
  useEffect(() => {
    if (preference !== "system") return;
    const media = matchMedia(DARK_QUERY);
    const follow = () => apply("system");
    media.addEventListener("change", follow);
    return () => media.removeEventListener("change", follow);
  }, [preference]);

  return { preference, dark };
}

/** Saves and applies a preference, with the circular reveal when motion is welcome. */
function useSetTheme() {
  const reduceMotion = useReducedMotion();
  return useCallback(
    (preference: ThemePreference, origin?: HTMLElement | null) => {
      const change = () => {
        try {
          localStorage.setItem(THEME_KEY, preference);
        } catch {
          // The theme still changes for this visit.
        }
        apply(preference);
        window.dispatchEvent(new Event(CHANGE_EVENT));
      };
      const willChange =
        (resolveTheme(preference, matchMedia(DARK_QUERY).matches) === "dark") !== isDarkNow();
      if (!willChange || reduceMotion || !document.startViewTransition) {
        change();
        return;
      }
      if (origin) {
        const box = origin.getBoundingClientRect();
        const root = document.documentElement.style;
        root.setProperty("--reveal-x", `${box.left + box.width / 2}px`);
        root.setProperty("--reveal-y", `${box.top + box.height / 2}px`);
      }
      // The theme changes even if the browser skips the animation (e.g. the tab is hidden or the
      // window resizes mid-way); only the animation's promises reject then, so ignore those.
      const transition = document.startViewTransition(change);
      transition.ready.catch(() => {});
      transition.finished.catch(() => {});
    },
    [reduceMotion],
  );
}

/** skiper04 ThemeToggleButton2: a sun whose rays fold away as a bite turns it into a moon. */
function SunMoonIcon({ dark }: { dark: boolean }) {
  const reduce = useReducedMotion();
  // The server can't know the theme, so the first render is a guess. Until the browser has
  // settled the real value, jump to it without animating and keep the icon hidden; animate only
  // later changes (the user's own clicks).
  const [settled, setSettled] = useState(false);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setSettled(true));
    return () => cancelAnimationFrame(frame);
  }, []);
  const transition = { ease: "easeInOut" as const, duration: reduce || !settled ? 0 : 0.35 };
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 32 32"
      fill="currentColor"
      strokeLinecap="round"
      className={`size-6 transition-opacity duration-150 ${settled ? "opacity-100" : "opacity-0"}`}
    >
      <clipPath id="dc-sun-moon">
        <motion.path
          initial={false}
          animate={{ y: dark ? 10 : 0, x: dark ? -12 : 0 }}
          transition={transition}
          d="M0-5h30a1 1 0 0 0 9 13v24H0Z"
        />
      </clipPath>
      <g clipPath="url(#dc-sun-moon)">
        <motion.circle
          initial={false}
          animate={{ r: dark ? 10 : 8 }}
          transition={transition}
          cx="16"
          cy="16"
        />
        <motion.g
          initial={false}
          animate={{ rotate: dark ? -100 : 0, scale: dark ? 0.5 : 1, opacity: dark ? 0 : 1 }}
          transition={transition}
          stroke="currentColor"
          strokeWidth="1.5"
        >
          <path d="M16 5.5v-4" />
          <path d="M16 30.5v-4" />
          <path d="M1.5 16h4" />
          <path d="M26.5 16h4" />
          <path d="m23.4 8.6 2.8-2.8" />
          <path d="m5.7 26.3 2.9-2.9" />
          <path d="m5.8 5.8 2.8 2.8" />
          <path d="m23.4 23.4 2.9 2.9" />
        </motion.g>
      </g>
    </svg>
  );
}

const OPTIONS = [
  { value: "light", icon: Sun, label: (t: T) => t.themeLight },
  { value: "dark", icon: Moon, label: (t: T) => t.themeDark },
  { value: "system", icon: Monitor, label: (t: T) => t.themeSystem },
] as const;

/** Header button: the icon shows the current theme; the menu offers the three choices. */
export function ThemeMenu({ t }: { t: T }) {
  const { preference, dark } = useTheme();
  const setTheme = useSetTheme();
  const trigger = useRef<HTMLButtonElement>(null);
  const current = OPTIONS.find((o) => o.value === preference)!;

  return (
    <Menu.Root>
      <Menu.Trigger
        ref={trigger}
        aria-label={`${t.theme}: ${current.label(t)}`}
        className="inline-flex size-12 items-center justify-center rounded-lg text-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none active:scale-[0.97] data-popup-open:bg-accent"
      >
        <SunMoonIcon dark={dark} />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner sideOffset={8} align="end" className="z-50 outline-none">
          <Menu.Popup className="min-w-52 origin-[var(--transform-origin)] rounded-xl border border-border bg-popover p-1.5 text-popover-foreground shadow-lift transition-[scale,opacity] duration-150 ease-out outline-none data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0 motion-reduce:transition-none">
            <Menu.Group>
              <Menu.GroupLabel className="px-3 pt-1.5 pb-1 text-sm font-semibold text-muted-foreground">
                {t.theme}
              </Menu.GroupLabel>
              <Menu.RadioGroup
                value={preference}
                onValueChange={(value: string) => setTheme(parsePreference(value), trigger.current)}
              >
                {OPTIONS.map(({ value, icon: Icon, label }) => (
                  <Menu.RadioItem
                    key={value}
                    value={value}
                    closeOnClick
                    className="grid min-h-12 cursor-default grid-cols-[1.25rem_1fr_1.25rem] items-center gap-3 rounded-lg px-3 text-base outline-none select-none data-highlighted:bg-accent data-highlighted:text-accent-foreground"
                  >
                    <Icon aria-hidden="true" className="size-5" />
                    <span>{label(t)}</span>
                    <Menu.RadioItemIndicator className="flex">
                      <Check aria-hidden="true" className="size-5 text-brand" />
                    </Menu.RadioItemIndicator>
                  </Menu.RadioItem>
                ))}
              </Menu.RadioGroup>
            </Menu.Group>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}

/** The same three choices as a segmented control, for the mobile menu (no menu-in-a-menu). */
export function ThemeSegmented({ t }: { t: T }) {
  const { preference } = useTheme();
  const setTheme = useSetTheme();
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="pb-2 text-base font-semibold">{t.theme}</legend>
      <div className="grid grid-cols-3 gap-1 rounded-xl bg-muted p-1">
        {OPTIONS.map(({ value, icon: Icon, label }) => (
          <label
            key={value}
            className="relative flex min-h-12 cursor-pointer flex-col items-center justify-center gap-0.5 rounded-lg px-1 text-center text-sm font-medium text-muted-foreground transition-colors has-checked:bg-card has-checked:text-foreground has-checked:shadow-soft has-focus-visible:ring-3 has-focus-visible:ring-ring/50"
          >
            <input
              type="radio"
              name="dc-theme"
              value={value}
              checked={preference === value}
              onChange={(e) => setTheme(value, e.currentTarget.parentElement)}
              className="sr-only"
            />
            <Icon aria-hidden="true" className="size-5" />
            {label(t)}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
