import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
import { Noto_Sans, Noto_Sans_Devanagari, Noto_Sans_Tamil } from "next/font/google";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { isLocale, locales } from "@/lib/i18n/config";
import "../globals.css";

// One font family per script. The browser picks the right one per character,
// so English, Hindi and Tamil text all render with matching Noto fonts.
const notoLatin = Noto_Sans({ subsets: ["latin"], variable: "--font-noto-latin" });
const notoDevanagari = Noto_Sans_Devanagari({
  subsets: ["devanagari"],
  variable: "--font-noto-devanagari",
});
const notoTamil = Noto_Sans_Tamil({ subsets: ["tamil"], variable: "--font-noto-tamil" });

// Pre-render /en, /hi and /ta at build time so pages are served as static files.
export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: LayoutProps<"/[locale]">): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const dict = await getDictionary(locale);
  return { title: dict.meta.title, description: dict.meta.description };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0f6b5c",
};

// Applies the saved "large text" preference before the first paint, so the page
// doesn't flash at normal size and then jump. Reads localStorage only.
const largeTextScript = `try{if(localStorage.getItem("dc-large-text")==="1")document.documentElement.dataset.text="large"}catch(e){}`;

export default async function LocaleLayout({ children, params }: LayoutProps<"/[locale]">) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();

  return (
    <html
      lang={locale}
      className={`${notoLatin.variable} ${notoDevanagari.variable} ${notoTamil.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: largeTextScript }} />
      </head>
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
