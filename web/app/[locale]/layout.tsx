import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
import { Anek_Devanagari, Anek_Tamil, Inter } from "next/font/google";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { themeScript } from "@/lib/theme";
import { isLocale, locales } from "@/lib/i18n/config";
import "../globals.css";

// English: Inter (Rasmus Andersson; SIL OFL), the closest free relative of Apple's San Francisco.
// Its optical-size axis gives big headings tighter "display" shapes automatically, as SF Pro
// Display does. Hindi and Tamil: Anek (Ek Type, Mumbai; SIL OFL), which San Francisco and Inter
// don't cover. next/font downloads the files at build time and serves them from our own site:
// no request to Google from the visitor's browser.
const inter = Inter({ subsets: ["latin"], axes: ["opsz"], variable: "--font-inter" });
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
      className={`${inter.variable} ${anekDevanagari.variable} ${anekTamil.variable} h-full antialiased`}
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
