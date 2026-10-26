import { notFound } from "next/navigation";
import { MapPin } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { KendraFinder } from "@/components/kendra-finder";
import { isLocale } from "@/lib/i18n/config";
import { getDictionary } from "@/lib/i18n/dictionaries";

export async function generateMetadata({ params }: PageProps<"/[locale]/kendras">) {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const dict = await getDictionary(locale);
  return { title: `${dict.kendras.title} | Medicheck` };
}

export default async function KendrasPage({ params }: PageProps<"/[locale]/kendras">) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const dict = await getDictionary(locale);

  return (
    <main
      id="main"
      tabIndex={-1}
      className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-4 py-10 outline-none sm:px-6 lg:py-14"
    >
      <PageHeader icon={MapPin} title={dict.kendras.title} intro={dict.kendras.intro} />

      <KendraFinder t={dict.kendras} locale={locale} />
    </main>
  );
}
