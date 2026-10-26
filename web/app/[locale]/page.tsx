import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import {
  ArrowRight,
  Ban,
  BookOpen,
  Camera,
  ImageUp,
  IndianRupee,
  Keyboard,
  MapPin,
  PiggyBank,
  ShieldAlert,
} from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { isLocale } from "@/lib/i18n/config";
import { getDictionary, type Dictionary } from "@/lib/i18n/dictionaries";
import { formatRupees } from "@/lib/savings";
import demoStrip from "@/public/demo/telmikind-front.jpg";

type CheckKey = keyof Dictionary["home"]["checks"];

const checkIcons: Record<CheckKey, LucideIcon> = {
  generic: PiggyBank,
  batch: ShieldAlert,
  price: IndianRupee,
  banned: Ban,
  kendra: MapPin,
};

// The price example on the home page, from DawaCheck's own data (docs/report.md, section 1.1):
// Telmikind 40 at ₹38.59 for 10 (2022 brand dataset) and the Jan Aushadhi product with exactly
// the same composition, telmisartan 40 mg, at ₹12.38 for 10. Per tablet, rounded to the paisa.
const EXAMPLE = { brandPerTablet: 3.86, genericPerTablet: 1.24 };

export default async function HomePage({ params }: PageProps<"/[locale]">) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const dict = await getDictionary(locale);
  const t = dict.home;
  const rupees = (x: number) => formatRupees(x, `${locale}-IN`);

  // What you can do from the home page. Scanning and uploading share one page: it offers both the
  // camera and the gallery.
  const actions: { icon: LucideIcon; title: string; body: string; href: string }[] = [
    { icon: Camera, title: t.scanTitle, body: t.scanBody, href: `/${locale}/scan` },
    { icon: ImageUp, title: t.uploadTitle, body: t.uploadBody, href: `/${locale}/scan` },
    { icon: Keyboard, title: t.typeTitle, body: t.typeBody, href: `/${locale}/search` },
    { icon: MapPin, title: t.kendraTitle, body: t.kendraBody, href: `/${locale}/kendras` },
  ];
  const smallChecks = (["batch", "price", "banned", "kendra"] as const).map((key) => ({
    key,
    Icon: checkIcons[key],
  }));

  return (
    <main id="main" tabIndex={-1} className="flex flex-1 flex-col outline-none">
      {/* Hero: the promise and the two main ways in on the left, a real demo strip on the right. */}
      <section className="mx-auto grid w-full max-w-6xl items-center gap-10 px-4 pt-10 pb-14 sm:px-6 md:pt-16 lg:grid-cols-[1.2fr_1fr] lg:gap-14 lg:pb-20">
        <div className="flex flex-col gap-6">
          <h1 className="text-4xl leading-[1.1] font-bold tracking-tight text-balance sm:text-5xl lg:text-[3.25rem]">
            {t.heroTitle}
          </h1>
          <p className="max-w-[52ch] text-lg leading-relaxed text-muted-foreground sm:text-xl">
            {t.tagline}
          </p>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Link href={`/${locale}/scan`} className={buttonVariants({ size: "xl" })}>
              <Camera aria-hidden="true" />
              {t.scanCta}
            </Link>
            <Link
              href={`/${locale}/search`}
              className={buttonVariants({ size: "xl", variant: "outline" })}
            >
              <Keyboard aria-hidden="true" />
              {t.typeCta}
            </Link>
          </div>
        </div>
        <figure className="flex flex-col gap-3">
          <div className="overflow-hidden rounded-2xl border border-border bg-muted shadow-lift">
            <Image
              src={demoStrip}
              alt={t.demoAlt}
              priority
              sizes="(min-width: 1024px) 540px, 100vw"
              className="h-auto w-full"
            />
          </div>
          <figcaption className="text-sm text-muted-foreground">{t.demoCaption}</figcaption>
        </figure>
      </section>

      {/* The five checks: the generic (with a real price example) leads, the other four follow. */}
      <section aria-labelledby="checks-title" className="border-y border-border bg-muted/40">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-14 sm:px-6 lg:py-20">
          <h2 id="checks-title" className="text-3xl font-bold tracking-tight sm:text-4xl">
            {t.checksTitle}
          </h2>
          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 lg:grid-rows-2">
            <li className="flex flex-col gap-5 rounded-2xl bg-accent p-6 text-accent-foreground sm:col-span-2 lg:row-span-2">
              <div className="flex items-center gap-3">
                <span className="flex size-11 items-center justify-center rounded-xl bg-primary text-primary-foreground">
                  <PiggyBank aria-hidden="true" className="size-6" />
                </span>
                <h3 className="text-xl font-semibold">{t.checks.generic}</h3>
              </div>
              <p className="text-base leading-relaxed">{t.checkBodies.generic}</p>
              <div className="mt-auto flex flex-col gap-3 rounded-xl bg-card p-5 text-card-foreground shadow-soft">
                <p className="text-base font-semibold">{t.exampleTitle}</p>
                <dl className="grid grid-cols-[1fr_auto] items-baseline gap-x-4 gap-y-2">
                  <dt className="text-base text-muted-foreground">{t.exampleBrand}</dt>
                  <dd className="tabular text-xl font-semibold">
                    {rupees(EXAMPLE.brandPerTablet)}
                  </dd>
                  <dt className="text-base text-muted-foreground">{t.exampleGeneric}</dt>
                  <dd className="tabular text-2xl font-bold text-primary">
                    {rupees(EXAMPLE.genericPerTablet)}
                  </dd>
                </dl>
                <p className="text-sm text-muted-foreground">{t.exampleNote}</p>
              </div>
            </li>
            {smallChecks.map(({ key, Icon }) => (
              <li
                key={key}
                className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-5 shadow-soft"
              >
                <Icon aria-hidden="true" className="size-7 text-primary" />
                <h3 className="text-lg font-semibold">{t.checks[key]}</h3>
                <p className="text-base leading-relaxed text-muted-foreground">
                  {t.checkBodies[key]}
                </p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Ways to start: plain rows with an arrow, a different shape from the grid above. */}
      <section
        aria-labelledby="ways-title"
        className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-14 sm:px-6 lg:py-20"
      >
        <h2 id="ways-title" className="text-3xl font-bold tracking-tight sm:text-4xl">
          {t.waysTitle}
        </h2>
        <ul className="grid grid-cols-1 gap-x-10 md:grid-cols-2">
          {actions.map(({ icon: Icon, title, body, href }) => (
            <li key={title} className="border-b border-border">
              <Link
                href={href}
                className="group flex min-h-20 items-center gap-4 rounded-lg py-4 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
              >
                <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-accent text-accent-foreground transition-colors group-hover:bg-primary group-hover:text-primary-foreground motion-reduce:transition-none">
                  <Icon aria-hidden="true" className="size-6" />
                </span>
                {/* min-w-0 lets long Tamil words wrap instead of pushing the row wider */}
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="text-lg font-semibold group-hover:underline group-hover:underline-offset-4">
                    {title}
                  </span>
                  <span className="text-base text-muted-foreground">{body}</span>
                </span>
                <ArrowRight
                  aria-hidden="true"
                  className="size-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-1 group-hover:text-primary motion-reduce:transition-none"
                />
              </Link>
            </li>
          ))}
        </ul>

        <Link
          href={`/${locale}/about`}
          className="inline-flex min-h-12 w-fit items-center gap-2 text-base font-medium text-primary underline underline-offset-4 hover:decoration-2 focus-visible:rounded-sm focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          <BookOpen aria-hidden="true" className="size-5 shrink-0" />
          {t.aboutLink}
        </Link>
      </section>
    </main>
  );
}
