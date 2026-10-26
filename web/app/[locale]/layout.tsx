import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
import { Anek_Devanagari, Anek_Latin, Anek_Tamil } from "next/font/google";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { themeScript } from "@/lib/theme";
import { isLocale, locales } from "@/lib/i18n/config";
import "../globals.css";

// Anek (Ek Type, Mumbai; SIL Open Font License): one family designed together for Latin,
// Devanagari and Tamil, so English, Hindi and Tamil look like the same brand. Variable in weight
// and width: body text uses the normal width, headings a wider, heavier cut (globals.css).
// next/font downloads the files at build time and serves them from our own site: no request to
// Google from the visitor's browser.
const anekLatin = Anek_Latin({ subsets: ["latin"], axes: ["wdth"], variable: "--font-anek-latin" });
const anekDevanagari = Anek_Devanagari({
  subsets: ["devanagari"],
  axes: ["wdth"],
  variable: "--font-anek-devanagari",
});
const anekTamil = Anek_Tamil({ subsets: ["tamil"], axes: ["wdth"], variable: "--font-anek-tamil" });

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
  // The browser's toolbar colour follows the theme (the page background in each).
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fbfaf7" },
    { media: "(prefers-color-scheme: dark)", color: "#0b1022" },
  ],
};

// Applies the saved "large text" preference before the first paint, so the page
// doesn't flash at normal size and then jump. Reads localStorage only.
const largeTextScript = `try{if(localStorage.getItem("dc-large-text")==="1")document.documentElement.dataset.text="large"}catch(e){}`;

export default async function LocaleLayout({ children, params }: LayoutProps<"/[locale]">) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const dict = await getDictionary(locale);
  const common = dict.common;

  return (
    <html
      lang={locale}
      className={`${anekLatin.variable} ${anekDevanagari.variable} ${anekTamil.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: largeTextScript }} />
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="flex min-h-full flex-col">
        {/* First thing a keyboard user reaches: jump past the header to the page's content. */}
        <a
          href="#main"
          className="sr-only z-50 rounded-lg bg-primary px-4 py-3 font-semibold text-primary-foreground focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
        >
          {common.skipToContent}
        </a>
        <SiteHeader
          locale={locale}
          t={{
            mainNav: common.mainNav,
            home: common.home,
            navScan: common.navScan,
            navSearch: common.navSearch,
            navKendras: common.navKendras,
            navAbout: common.navAbout,
            menu: common.menu,
            closeMenu: common.closeMenu,
            settings: common.settings,
            language: common.language,
            largeText: common.largeText,
            theme: common.theme,
            themeLight: common.themeLight,
            themeDark: common.themeDark,
            themeSystem: common.themeSystem,
          }}
        />
        {children}
        <SiteFooter t={common} privacy={dict.home.privacy} locale={locale} />
      </body>
    </html>
  );
}
