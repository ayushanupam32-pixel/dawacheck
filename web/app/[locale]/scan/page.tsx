import { notFound } from "next/navigation";
import { Camera } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { ScanClient } from "@/components/scan-client";
import { isLocale } from "@/lib/i18n/config";
import { getDictionary } from "@/lib/i18n/dictionaries";

export async function generateMetadata({ params }: PageProps<"/[locale]/scan">) {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const dict = await getDictionary(locale);
  return { title: `${dict.scan.title} | DawaCheck` };
}

export default async function ScanPage({ params }: PageProps<"/[locale]/scan">) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const dict = await getDictionary(locale);

  return (
    <main
      id="main"
      tabIndex={-1}
      className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-4 py-10 outline-none sm:px-6 lg:py-14"
    >
      <PageHeader icon={Camera} title={dict.scan.title} />

      <ScanClient
        t={dict.scan}
        tSearch={dict.search}
        tChecks={dict.checks}
        disclaimer={dict.common.disclaimer}
        locale={locale}
      />
    </main>
  );
}
