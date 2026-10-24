import Link from "next/link";
import { notFound } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import {
  Ban,
  Camera,
  ImageUp,
  IndianRupee,
  Info,
  Keyboard,
  Lock,
  MapPin,
  PiggyBank,
  Pill,
  ShieldAlert,
  Users,
} from "lucide-react";
import { LanguageSwitcher } from "@/components/language-switcher";
import { LargeTextToggle } from "@/components/large-text-toggle";
import { isLocale } from "@/lib/i18n/config";
import { getDictionary, type Dictionary } from "@/lib/i18n/dictionaries";

type CheckKey = keyof Dictionary["home"]["checks"];

const checkIcons: Record<CheckKey, LucideIcon> = {
  generic: PiggyBank,
  batch: ShieldAlert,
  price: IndianRupee,
  banned: Ban,
  duplicates: Users,
  kendra: MapPin,
};

export default async function HomePage({ params }: PageProps<"/[locale]">) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const dict = await getDictionary(locale);
  const t = dict.home;

  // What you can do from the home page. Scanning and uploading share one page: it offers both the
  // camera and the gallery.
  const actions: { icon: LucideIcon; title: string; body: string; href?: string }[] = [
    { icon: Camera, title: t.scanTitle, body: t.scanBody, href: `/${locale}/scan` },
    { icon: ImageUp, title: t.uploadTitle, body: t.uploadBody, href: `/${locale}/scan` },
    { icon: Keyboard, title: t.typeTitle, body: t.typeBody, href: `/${locale}/search` },
    { icon: MapPin, title: t.kendraTitle, body: t.kendraBody, href: `/${locale}/kendras` },
  ];

  return (
    <div className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-8 px-4 py-6">
      <header className="flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <span className="flex size-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Pill aria-hidden="true" className="size-7" />
          </span>
          <h1 className="text-3xl font-bold tracking-tight">DawaCheck</h1>
        </div>
        <p className="text-lg leading-relaxed text-muted-foreground">{t.tagline}</p>
        <div className="flex flex-wrap items-center gap-2">
          <LanguageSwitcher current={locale} label={dict.common.language} />
          <LargeTextToggle label={dict.common.largeText} />
        </div>
      </header>

      <main className="flex flex-col gap-8">
        <ul className="flex flex-col gap-3">
          {actions.map(({ icon: Icon, title, body, href }) => {
            const content = (
              <>
                <Icon aria-hidden="true" className="size-8 shrink-0 text-primary" />
                {/* min-w-0 lets long Tamil words wrap instead of pushing the card wider */}
                <div className="flex min-w-0 flex-1 flex-col items-start gap-1">
                  <span className="text-lg font-semibold">{title}</span>
                  <span className="text-base text-muted-foreground">{body}</span>
                  {!href && (
                    <span className="rounded-full bg-muted px-3 py-1 text-sm font-medium text-muted-foreground">
                      {t.comingSoon}
                    </span>
                  )}
                </div>
              </>
            );
            const box = "flex min-h-20 items-center gap-4 rounded-xl border bg-card p-4";
            return (
              <li key={title}>
                {href ? (
                  <Link
                    href={href}
                    className={`${box} border-primary hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none`}
                  >
                    {content}
                  </Link>
                ) : (
                  <div className={`${box} border-border`}>{content}</div>
                )}
              </li>
            );
          })}
        </ul>

        <section aria-labelledby="checks-title" className="flex flex-col gap-3">
          <h2 id="checks-title" className="text-xl font-semibold">
            {t.checksTitle}
          </h2>
          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {(Object.keys(checkIcons) as CheckKey[]).map((key) => {
              const Icon = checkIcons[key];
              return (
                <li
                  key={key}
                  className="flex items-center gap-3 rounded-lg bg-muted/60 px-3 py-3 text-base"
                >
                  <Icon aria-hidden="true" className="size-6 shrink-0 text-primary" />
                  {t.checks[key]}
                </li>
              );
            })}
          </ul>
        </section>

        <p className="flex items-center gap-3 text-base font-medium">
          <Lock aria-hidden="true" className="size-5 shrink-0 text-primary" />
          {t.privacy}
        </p>
      </main>

      <footer className="mt-auto flex gap-3 rounded-xl border border-border bg-muted/40 p-4 text-base leading-relaxed">
        <Info aria-hidden="true" className="mt-1 size-5 shrink-0" />
        <p>{dict.common.disclaimer}</p>
      </footer>
    </div>
  );
}
