import { notFound } from "next/navigation";
import { Search } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { SearchClient } from "@/components/search-client";
import { isLocale } from "@/lib/i18n/config";
import { getDictionary } from "@/lib/i18n/dictionaries";

export async function generateMetadata({ params }: PageProps<"/[locale]/search">) {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const dict = await getDictionary(locale);
  return { title: `${dict.search.title} | DawaCheck` };
}

export default async function SearchPage({ params }: PageProps<"/[locale]/search">) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const dict = await getDictionary(locale);

  return (
    <main
      id="main"
      tabIndex={-1}
      className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-4 py-10 outline-none sm:px-6 lg:py-14"
    >
      <PageHeader icon={Search} title={dict.search.title} />

      {/* Only the search texts are sent to the browser, not the whole dictionary. */}
      <SearchClient
        t={dict.search}
        tChecks={dict.checks}
        disclaimer={dict.common.disclaimer}
        locale={locale}
      />
    </main>
  );
}
