import Link from "next/link";
import { Info, Lock } from "lucide-react";
import { ExternalLink } from "@/components/ui/external-link";
import type { Locale } from "@/lib/i18n/config";

type T = {
  disclaimer: string;
  mainNav: string;
  navScan: string;
  navSearch: string;
  navKendras: string;
  navAbout: string;
  footerData: string;
  footerAnimations: string;
  sourceCode: string;
};

const REPO = "https://github.com/ayushanupam32-pixel/medicheck";

/**
 * The footer on every page: the medical disclaimer first, then links and credits. It is a deep-ink
 * stage like the home page's hero (same in both themes), so every page ends on the brand colours.
 */
export function SiteFooter({ t, privacy, locale }: { t: T; privacy: string; locale: Locale }) {
  const links = [
    { href: `/${locale}/scan`, label: t.navScan },
    { href: `/${locale}/search`, label: t.navSearch },
    { href: `/${locale}/kendras`, label: t.navKendras },
    { href: `/${locale}/about`, label: t.navAbout },
  ];
  return (
    <footer className="mx-auto mt-auto w-full max-w-7xl px-3 pt-10 pb-3 sm:px-5 sm:pb-5">
      <div className="relative isolate flex flex-col gap-8 overflow-hidden rounded-[2rem] bg-brand-surface px-6 py-10 text-brand-surface-foreground ring-1 ring-white/10 sm:px-12 sm:py-12">
        <div
          aria-hidden="true"
          className="absolute -right-40 -bottom-56 -z-10 size-[34rem] rounded-full bg-[radial-gradient(circle,oklch(0.8_0.16_72/0.28),transparent_62%)]"
        />
        <p className="font-heading text-3xl font-bold tracking-tight sm:text-4xl">Medicheck</p>
        <div className="grid gap-6 md:grid-cols-[1.4fr_1fr]">
          <p className="flex gap-3 text-base leading-relaxed">
            <Info aria-hidden="true" className="mt-1 size-5 shrink-0 text-[oklch(0.86_0.155_78)]" />
            {t.disclaimer}
          </p>
          <p className="flex gap-3 text-base leading-relaxed">
            <Lock aria-hidden="true" className="mt-1 size-5 shrink-0 text-[oklch(0.86_0.155_78)]" />
            {privacy}
          </p>
        </div>
        <div className="flex flex-col gap-4 border-t border-white/12 pt-6 md:flex-row md:items-center md:justify-between">
          <nav aria-label={`${t.mainNav}, footer`}>
            <ul className="flex flex-wrap gap-x-1">
              {links.map(({ href, label }) => (
                <li key={href}>
                  <Link
                    href={href}
                    className="inline-flex min-h-12 min-w-12 items-center justify-center rounded-lg px-2 text-base font-medium text-brand-surface-foreground underline-offset-4 hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none md:first:-ml-2"
                  >
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
          <ExternalLink href={REPO} className="text-base text-[oklch(0.86_0.155_78)]">
            {t.sourceCode}
          </ExternalLink>
        </div>
        <div className="flex flex-col gap-1 text-sm leading-relaxed text-brand-surface-foreground/75">
          <p>{t.footerData}</p>
          <p>
            {t.footerAnimations}{" "}
            <a
              href="https://skiper-ui.com"
              target="_blank"
              rel="noreferrer"
              className="-my-3 inline-block py-3 font-medium text-brand-surface-foreground underline underline-offset-4"
            >
              skiper-ui.com
            </a>
          </p>
        </div>
      </div>
    </footer>
  );
}
