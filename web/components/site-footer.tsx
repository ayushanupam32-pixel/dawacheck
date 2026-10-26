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

const REPO = "https://github.com/ayushanupam32-pixel/dawacheck";

/** The footer on every page: the medical disclaimer first, then links and credits. */
export function SiteFooter({ t, privacy, locale }: { t: T; privacy: string; locale: Locale }) {
  const links = [
    { href: `/${locale}/scan`, label: t.navScan },
    { href: `/${locale}/search`, label: t.navSearch },
    { href: `/${locale}/kendras`, label: t.navKendras },
    { href: `/${locale}/about`, label: t.navAbout },
  ];
  return (
    <footer className="mt-auto border-t border-border bg-muted/50">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-10 sm:px-6">
        <div className="grid gap-6 md:grid-cols-[1.4fr_1fr]">
          <p className="flex gap-3 text-base leading-relaxed">
            <Info aria-hidden="true" className="mt-1 size-5 shrink-0 text-primary" />
            {t.disclaimer}
          </p>
          <p className="flex gap-3 text-base leading-relaxed">
            <Lock aria-hidden="true" className="mt-1 size-5 shrink-0 text-primary" />
            {privacy}
          </p>
        </div>
        <div className="flex flex-col gap-4 border-t border-border pt-6 md:flex-row md:items-center md:justify-between">
          <nav aria-label={`${t.mainNav}, footer`}>
            <ul className="flex flex-wrap gap-x-1">
              {links.map(({ href, label }) => (
                <li key={href}>
                  <Link
                    href={href}
                    className="inline-flex min-h-12 min-w-12 items-center justify-center rounded-lg px-2 text-base font-medium text-foreground underline-offset-4 hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none md:first:-ml-2"
                  >
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
          <ExternalLink href={REPO} className="text-base">
            {t.sourceCode}
          </ExternalLink>
        </div>
        <div className="flex flex-col gap-1 text-sm leading-relaxed text-muted-foreground">
          <p>{t.footerData}</p>
          <p>
            {t.footerAnimations}{" "}
            <a
              href="https://skiper-ui.com"
              target="_blank"
              rel="noreferrer"
              className="-my-3 inline-block py-3 font-medium text-foreground underline underline-offset-4"
            >
              skiper-ui.com
            </a>
          </p>
        </div>
      </div>
    </footer>
  );
}
