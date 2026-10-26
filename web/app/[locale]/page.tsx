import Link from "next/link";
import { notFound } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import {
  ArrowRight,
  Ban,
  BookOpen,
  Camera,
  Check,
  ImageUp,
  IndianRupee,
  Keyboard,
  MapPin,
  PiggyBank,
  ShieldCheck,
} from "lucide-react";
import { HomeChecks } from "@/components/home-checks";
import { CountUp, Reveal, ScrollLetters, Spotlight } from "@/components/motion";
import { buttonVariants } from "@/components/ui/button";
import { refreshDates } from "@/lib/data-sources";
import { isLocale } from "@/lib/i18n/config";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { formatRupees } from "@/lib/savings";
import { splitHighlight, words } from "@/lib/segment";

// Numbers on this page come from DawaCheck's own data, never typed in for effect:
// - the price example: Telmikind 40 at ₹38.59 for 10 (2022 brand dataset) and the Jan Aushadhi
//   product with exactly the same composition at ₹12.38 for 10 (docs/report.md, section 1.1);
// - the saving in the live-check card is what the app shows for the Telmikind demo strip at one
//   tablet a day (₹78.63 a month, rounded here to whole rupees);
// - the counts come from the `data_sources` table, written by the monthly refresh.
const EXAMPLE = { brandPerTablet: 3.86, genericPerTablet: 1.24, savePerMonth: 79 };

export default async function HomePage({ params }: PageProps<"/[locale]">) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const dict = await getDictionary(locale);
  const t = dict.home;
  const rupees = (x: number) => formatRupees(x, `${locale}-IN`);
  const rows = await refreshDates();
  const count = (source: string) => rows?.find((r) => r.source === source)?.rows_loaded ?? null;

  const title = splitHighlight(t.heroTitle, t.heroHighlight);
  // Each word is its own masked piece, so the headline can rise in word by word.
  let wordIndex = 0;
  const renderWords = (text: string) =>
    words(text, locale).map((word, i) =>
      word.trim() ? (
        <span key={i} className="inline-block overflow-hidden pb-[0.12em] align-bottom">
          <span className="rise-word" style={{ "--i": wordIndex++ } as React.CSSProperties}>
            {word}
          </span>
        </span>
      ) : (
        word
      ),
    );
  const [saveBefore, saveAfter = ""] = dict.search.saveMonth.split("{amount}");

  const live: { icon: LucideIcon; title: string; text: React.ReactNode }[] = [
    {
      icon: PiggyBank,
      title: dict.checks.genericTitle,
      text: (
        <span className="font-semibold text-[oklch(0.86_0.15_80)]">
          {saveBefore}
          <CountUp
            value={EXAMPLE.savePerMonth}
            locale={locale}
            format={{ style: "currency", currency: "INR", maximumFractionDigits: 0 }}
          />
          {saveAfter}
        </span>
      ),
    },
    { icon: ShieldCheck, title: dict.checks.batchTitle, text: t.live.batch },
    { icon: IndianRupee, title: dict.checks.priceTitle, text: t.live.price },
    { icon: Ban, title: dict.checks.bannedTitle, text: t.live.banned },
    { icon: MapPin, title: dict.checks.kendraTitle, text: t.live.kendra },
  ];

  const stats = [
    { value: count("kendras"), label: t.statKendras },
    { value: count("cdsco_alerts"), label: t.statAlerts },
    { value: count("brands"), label: t.statBrands },
    { value: count("nppa"), label: t.statCeilings },
  ].filter((s): s is { value: number; label: string } => s.value !== null);

  const sources = {
    generic: "PMBI",
    batch: "CDSCO",
    price: "NPPA",
    banned: "CDSCO",
    kendra: "PMBI",
  };
  const checks = (["generic", "batch", "price", "banned", "kendra"] as const).map((key) => ({
    key,
    title: t.checks[key],
    body: t.checkBodies[key],
    source: sources[key],
  }));

  const actions: { icon: LucideIcon; title: string; body: string; href: string }[] = [
    { icon: Camera, title: t.scanTitle, body: t.scanBody, href: `/${locale}/scan` },
    { icon: ImageUp, title: t.uploadTitle, body: t.uploadBody, href: `/${locale}/scan` },
    { icon: Keyboard, title: t.typeTitle, body: t.typeBody, href: `/${locale}/search` },
    { icon: MapPin, title: t.kendraTitle, body: t.kendraBody, href: `/${locale}/kendras` },
  ];

  return (
    <main id="main" tabIndex={-1} className="flex flex-1 flex-col outline-none">
      {/* Hero: a deep-ink stage (the same in both themes) with drifting marigold and indigo light,
          a glow that follows the mouse, the headline rising word by word, and a live check. */}
      <div className="mx-auto w-full max-w-7xl px-3 pt-3 sm:px-5 sm:pt-5">
        <section className="relative isolate overflow-hidden rounded-[2rem] bg-brand-surface text-brand-surface-foreground ring-1 ring-white/10">
          <div aria-hidden="true" className="absolute inset-0 -z-10">
            <div className="aurora absolute -top-1/3 -left-1/4 size-[42rem] rounded-full bg-[radial-gradient(circle,oklch(0.8_0.16_72/0.42),transparent_62%)] blur-2xl" />
            <div className="aurora-2 absolute -right-1/4 -bottom-1/2 size-[46rem] rounded-full bg-[radial-gradient(circle,oklch(0.55_0.2_280/0.55),transparent_62%)] blur-2xl" />
            {/* Fine dot grid, faded towards the edges. */}
            <div className="absolute inset-0 bg-[radial-gradient(oklch(1_0_0/0.09)_1px,transparent_1px)] [mask-image:radial-gradient(ellipse_at_center,black_35%,transparent_75%)] bg-[size:22px_22px]" />
          </div>
          <Spotlight />

          <div className="grid items-center gap-12 px-6 pt-16 pb-14 sm:px-12 sm:pt-20 lg:grid-cols-[1.25fr_1fr] lg:gap-10 lg:px-16 lg:pt-24 lg:pb-20">
            <div className="flex min-w-0 flex-col gap-7">
              <h1 className="text-[clamp(1.9rem,8.4vw,2.6rem)] leading-[1.08] font-bold tracking-tight sm:text-6xl lg:text-[3.2rem] xl:text-[3.45rem]">
                {renderWords(title.before)}
                {title.highlight && (
                  <span className="relative inline-block text-[oklch(0.86_0.155_78)]">
                    {renderWords(title.highlight)}
                    <svg
                      aria-hidden="true"
                      viewBox="0 0 300 20"
                      preserveAspectRatio="none"
                      className="absolute -bottom-1 left-0 h-[0.32em] w-full overflow-visible"
                    >
                      <path
                        className="draw-line"
                        pathLength={1}
                        d="M3 14 C 60 4, 120 4, 170 10 S 260 17, 297 6"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="5"
                        strokeLinecap="round"
                      />
                    </svg>
                  </span>
                )}
                {renderWords(title.after)}
              </h1>
              <p
                className="rise max-w-[46ch] text-lg leading-relaxed text-brand-surface-foreground/80 sm:text-xl"
                style={{ "--i": 6 } as React.CSSProperties}
              >
                {t.tagline}
              </p>
              <div
                className="rise flex flex-col gap-3 sm:flex-row"
                style={{ "--i": 8 } as React.CSSProperties}
              >
                <Link
                  href={`/${locale}/scan`}
                  className={`${buttonVariants({ size: "xl" })} shadow-[0_10px_40px_-10px_oklch(0.8_0.16_72/0.7)] hover:shadow-[0_14px_50px_-10px_oklch(0.8_0.16_72/0.9)]`}
                >
                  <Camera aria-hidden="true" />
                  {t.scanCta}
                </Link>
                <Link
                  href={`/${locale}/search`}
                  className={`${buttonVariants({ size: "xl", variant: "ghost" })} border-white/25 text-brand-surface-foreground hover:border-white/50 hover:bg-white/10 hover:text-brand-surface-foreground`}
                >
                  <Keyboard aria-hidden="true" />
                  {t.typeCta}
                </Link>
              </div>
            </div>

            {/* The live check: the real results for the demo strip, ticking in one by one. */}
            <figure className="rise relative min-w-0" style={{ "--i": 4 } as React.CSSProperties}>
              <div className="rounded-3xl border border-white/12 bg-white/[0.06] p-5 shadow-[0_30px_80px_-30px_oklch(0.1_0.05_272/0.9)] backdrop-blur-md sm:p-6">
                <div className="flex items-center justify-between gap-3 border-b border-white/10 pb-4">
                  <div>
                    <p className="font-heading text-xl font-bold">{t.live.medicine}</p>
                    <p className="text-sm text-brand-surface-foreground/70">{t.live.maker}</p>
                  </div>
                  <span className="rounded-full bg-primary px-3 py-1 text-sm font-bold text-primary-foreground">
                    DEMO
                  </span>
                </div>
                <ul className="flex flex-col gap-1 pt-3">
                  {live.map(({ icon: Icon, title: rowTitle, text }, i) => (
                    <li
                      key={rowTitle}
                      className="tick-in flex items-center gap-3 rounded-xl px-2 py-2.5"
                      style={{ "--i": i } as React.CSSProperties}
                    >
                      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-white/[0.08]">
                        <Icon aria-hidden="true" className="size-5 text-[oklch(0.86_0.155_78)]" />
                      </span>
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="text-sm text-brand-surface-foreground/70">{rowTitle}</span>
                        <span className="text-base leading-snug">{text}</span>
                      </span>
                      <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-[oklch(0.78_0.15_155)] text-brand-surface">
                        <Check aria-hidden="true" className="size-4" strokeWidth={3} />
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
              <figcaption className="pt-3 text-center text-sm text-brand-surface-foreground/70">
                {t.live.label}
              </figcaption>
            </figure>
          </div>
        </section>
      </div>

      {/* Real counts from the latest data refresh, counting up as they come into view. */}
      {stats.length > 0 && (
        <section
          aria-labelledby="stats-title"
          className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6"
        >
          <h2 id="stats-title" className="sr-only">
            {t.statsTitle}
          </h2>
          <Reveal as="ul" group className="grid grid-cols-2 gap-x-6 gap-y-10 lg:grid-cols-4">
            {stats.map(({ value, label }, i) => (
              <li
                key={label}
                className="flex flex-col gap-1 border-l-2 border-brand pl-4"
                style={{ "--i": i } as React.CSSProperties}
              >
                <CountUp
                  value={value}
                  locale={locale}
                  className="font-heading text-4xl font-bold tracking-tight sm:text-5xl"
                />
                <span className="text-base text-muted-foreground">{label}</span>
              </li>
            ))}
          </Reveal>
          <p className="pt-8 text-sm text-muted-foreground">{t.statsNote}</p>
        </section>
      )}

      {/* The five checks as a stack that builds up while scrolling. */}
      <section
        aria-labelledby="checks-title"
        className="mx-auto w-full max-w-4xl px-4 pt-8 sm:px-6"
      >
        <Reveal>
          <h2
            id="checks-title"
            className="pb-10 text-4xl font-bold tracking-tight text-balance sm:text-5xl"
          >
            {t.checksTitle}
          </h2>
        </Reveal>
        <HomeChecks items={checks} />
      </section>

      {/* One line that assembles as you scroll, then the price example it is about. */}
      <section
        aria-labelledby="example-title"
        className="mx-auto flex w-full max-w-6xl flex-col items-center gap-12 overflow-hidden px-4 py-24 text-center sm:px-6"
      >
        <ScrollLetters
          text={t.bandLine}
          locale={locale}
          className="font-heading text-5xl leading-tight font-bold tracking-tight text-balance sm:text-7xl"
        />
        <Reveal className="w-full max-w-3xl">
          <h2 id="example-title" className="pb-6 text-xl font-semibold">
            {t.exampleTitle}
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col items-center gap-2 rounded-2xl border border-border bg-card p-8 shadow-soft">
              <span className="text-base text-muted-foreground">{t.exampleBrand}</span>
              <span className="font-heading text-5xl font-bold tracking-tight">
                {rupees(EXAMPLE.brandPerTablet)}
              </span>
            </div>
            <div className="flex flex-col items-center gap-2 rounded-2xl bg-primary p-8 text-primary-foreground shadow-lift">
              <span className="text-base">{t.exampleGeneric}</span>
              <CountUp
                value={EXAMPLE.genericPerTablet}
                locale={locale}
                format={{ style: "currency", currency: "INR", minimumFractionDigits: 2 }}
                className="font-heading text-5xl font-bold tracking-tight"
              />
            </div>
          </div>
          <p className="pt-4 text-sm text-muted-foreground">{t.exampleNote}</p>
        </Reveal>
      </section>

      {/* Ways to start: rows that arrive one after another. */}
      <section
        aria-labelledby="ways-title"
        className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 pb-20 sm:px-6"
      >
        <Reveal>
          <h2 id="ways-title" className="text-4xl font-bold tracking-tight sm:text-5xl">
            {t.waysTitle}
          </h2>
        </Reveal>
        <Reveal as="ul" group className="grid grid-cols-1 gap-x-10 md:grid-cols-2">
          {actions.map(({ icon: Icon, title: actionTitle, body, href }, i) => (
            <li
              key={actionTitle}
              className="border-b border-border"
              style={{ "--i": i } as React.CSSProperties}
            >
              <Link
                href={href}
                className="group flex min-h-24 items-center gap-5 rounded-lg py-5 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
              >
                <span className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-accent text-accent-foreground transition-[background-color,color,rotate] duration-300 group-hover:-rotate-6 group-hover:bg-primary group-hover:text-primary-foreground motion-reduce:transition-none">
                  <Icon aria-hidden="true" className="size-6" />
                </span>
                {/* min-w-0 lets long Tamil words wrap instead of pushing the row wider */}
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="text-xl font-semibold">{actionTitle}</span>
                  <span className="text-base text-muted-foreground">{body}</span>
                </span>
                <ArrowRight
                  aria-hidden="true"
                  className="size-6 shrink-0 text-muted-foreground transition-transform duration-300 group-hover:translate-x-1.5 group-hover:text-brand motion-reduce:transition-none"
                />
              </Link>
            </li>
          ))}
        </Reveal>
        <Link
          href={`/${locale}/about`}
          className="inline-flex min-h-12 w-fit items-center gap-2 text-base font-medium text-brand underline underline-offset-4 hover:decoration-2 focus-visible:rounded-sm focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          <BookOpen aria-hidden="true" className="size-5 shrink-0" />
          {t.aboutLink}
        </Link>
      </section>
    </main>
  );
}
