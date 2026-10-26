"use client";

// The header on every page: brand, the four main destinations, language, large text and theme.
// On phones the destinations and settings move into a menu sheet (Base UI Dialog: focus is
// trapped inside while open, Escape closes it, focus returns to the Menu button).

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Dialog } from "@base-ui/react/dialog";
import { BookOpen, Camera, MapPin, Menu as MenuIcon, Pill, Search, X } from "lucide-react";
import { LanguageSwitcher } from "@/components/language-switcher";
import { LargeTextToggle } from "@/components/large-text-toggle";
import { ThemeMenu, ThemeSegmented } from "@/components/theme-toggle";
import type { Locale } from "@/lib/i18n/config";

export type HeaderText = {
  mainNav: string;
  home: string;
  navScan: string;
  navSearch: string;
  navKendras: string;
  navAbout: string;
  menu: string;
  closeMenu: string;
  settings: string;
  language: string;
  largeText: string;
  theme: string;
  themeLight: string;
  themeDark: string;
  themeSystem: string;
};

export function SiteHeader({ t, locale }: { t: HeaderText; locale: Locale }) {
  const pathname = usePathname() ?? `/${locale}`;
  const links = [
    { href: `/${locale}/scan`, label: t.navScan, icon: Camera },
    { href: `/${locale}/search`, label: t.navSearch, icon: Search },
    { href: `/${locale}/kendras`, label: t.navKendras, icon: MapPin },
    { href: `/${locale}/about`, label: t.navAbout, icon: BookOpen },
  ];
  const isCurrent = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/85 backdrop-blur-md supports-[not(backdrop-filter:blur(0))]:bg-background">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center gap-2 px-4 sm:px-6">
        <Link
          href={`/${locale}`}
          aria-label={`DawaCheck, ${t.home}`}
          className="-ml-2 flex min-h-12 items-center gap-2.5 rounded-lg px-2 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          <span className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Pill aria-hidden="true" className="size-5" />
          </span>
          <span className="text-lg font-bold tracking-tight">DawaCheck</span>
        </Link>

        <nav aria-label={t.mainNav} className="ml-4 hidden lg:block">
          <ul className="flex items-center gap-1">
            {links.map(({ href, label }) => (
              <li key={href}>
                <Link
                  href={href}
                  aria-current={isCurrent(href) ? "page" : undefined}
                  className="relative inline-flex min-h-12 items-center rounded-lg px-3 text-base font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none aria-[current=page]:text-foreground aria-[current=page]:after:absolute aria-[current=page]:after:inset-x-3 aria-[current=page]:after:-bottom-[9px] aria-[current=page]:after:h-0.5 aria-[current=page]:after:rounded-full aria-[current=page]:after:bg-brand"
                >
                  {label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className="ml-auto flex items-center gap-1">
          <div className="hidden lg:block">
            <LanguageSwitcher current={locale} label={t.language} size="sm" />
          </div>
          <div className="hidden lg:block">
            <LargeTextToggle label={t.largeText} variant="compact" />
          </div>
          <ThemeMenu t={t} />
          <MobileMenu t={t} locale={locale} links={links} isCurrent={isCurrent} />
        </div>
      </div>
    </header>
  );
}

function MobileMenu({
  t,
  locale,
  links,
  isCurrent,
}: {
  t: HeaderText;
  locale: Locale;
  links: { href: string; label: string; icon: typeof Camera }[];
  isCurrent: (href: string) => boolean;
}) {
  // Controlled, so a tap on a link closes the sheet; the links stay real links (not buttons).
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger className="inline-flex min-h-12 items-center gap-2 rounded-lg px-3 text-base font-medium hover:bg-accent hover:text-accent-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none lg:hidden">
        <MenuIcon aria-hidden="true" className="size-6" />
        {/* On the narrowest phones only the icon shows; the word stays for screen readers. */}
        <span className="max-[359px]:sr-only">{t.menu}</span>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-foreground/30 transition-opacity duration-200 data-ending-style:opacity-0 data-starting-style:opacity-0 motion-reduce:transition-none dark:bg-black/60" />
        <Dialog.Popup className="fixed inset-x-0 top-0 z-50 max-h-[100dvh] overflow-y-auto rounded-b-2xl border-b border-border bg-background pb-6 shadow-lift transition-[translate,opacity] duration-250 ease-out outline-none data-ending-style:-translate-y-4 data-ending-style:opacity-0 data-starting-style:-translate-y-4 data-starting-style:opacity-0 motion-reduce:transition-none">
          <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 sm:px-6">
            <div className="flex h-16 items-center justify-between">
              <Dialog.Title className="text-lg font-bold tracking-tight">{t.menu}</Dialog.Title>
              <Dialog.Close
                aria-label={t.closeMenu}
                className="inline-flex size-12 items-center justify-center rounded-lg hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
              >
                <X aria-hidden="true" className="size-6" />
              </Dialog.Close>
            </div>
            <nav aria-label={t.mainNav}>
              <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <li className="sm:col-span-2">
                  <Link
                    href={`/${locale}`}
                    onClick={close}
                    aria-current={
                      isCurrent(`/${locale}`) && links.every((l) => !isCurrent(l.href))
                        ? "page"
                        : undefined
                    }
                    className={mobileLink}
                  >
                    <Pill aria-hidden="true" className="size-5 text-brand" />
                    {t.home}
                  </Link>
                </li>
                {links.map(({ href, label, icon: Icon }) => (
                  <li key={href}>
                    <Link
                      href={href}
                      onClick={close}
                      aria-current={isCurrent(href) ? "page" : undefined}
                      className={mobileLink}
                    >
                      <Icon aria-hidden="true" className="size-5 text-brand" />
                      {label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
            <section
              aria-label={t.settings}
              className="flex flex-col gap-5 border-t border-border pt-5"
            >
              <div className="flex flex-col gap-2">
                <p className="text-base font-semibold">{t.language}</p>
                <LanguageSwitcher current={locale} label={t.language} />
              </div>
              <LargeTextToggle label={t.largeText} />
              <ThemeSegmented t={t} />
            </section>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

const mobileLink =
  "flex min-h-14 w-full items-center gap-3 rounded-xl border border-border bg-card px-4 text-lg font-medium hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none aria-[current=page]:border-brand aria-[current=page]:bg-accent";
