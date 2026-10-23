import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Info } from "lucide-react";
import { KendraFinder } from "@/components/kendra-finder";
import { isLocale } from "@/lib/i18n/config";
import { getDictionary } from "@/lib/i18n/dictionaries";

export async function generateMetadata({ params }: PageProps<"/[locale]/kendras">) {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const dict = await getDictionary(locale);
  return { title: `${dict.kendras.title} — DawaCheck` };
}

export default async function KendrasPage({ params }: PageProps<"/[locale]/kendras">) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const dict = await getDictionary(locale);

  return (
    <div className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-6 px-4 py-6">
      <Link
        href={`/${locale}`}
        className="inline-flex min-h-12 w-fit items-center gap-2 text-base font-medium underline-offset-4 hover:underline"
      >
        <ArrowLeft aria-hidden="true" className="size-5" />
        DawaCheck
      </Link>
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight">{dict.kendras.title}</h1>
        <p className="text-lg text-muted-foreground">{dict.kendras.intro}</p>
      </div>

      <main>
        <KendraFinder t={dict.kendras} locale={locale} />
      </main>

      <footer className="mt-auto flex gap-3 rounded-xl border border-border bg-muted/40 p-4 text-base leading-relaxed">
        <Info aria-hidden="true" className="mt-1 size-5 shrink-0" />
        <p>{dict.common.disclaimer}</p>
      </footer>
    </div>
  );
}
