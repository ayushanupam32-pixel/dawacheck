import { NextResponse, type NextRequest } from "next/server";
import { isLocale, pickLocale } from "@/lib/i18n/config";

// Runs before each page request. If the URL has no language prefix
// (e.g. "/" or "/scan"), redirect to the browser's preferred language
// ("/hi" or "/hi/scan"). Everything else passes through untouched.
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const firstSegment = pathname.split("/")[1] ?? "";
  if (isLocale(firstSegment)) return;

  const locale = pickLocale(request.headers.get("accept-language"));
  const url = request.nextUrl.clone();
  url.pathname = `/${locale}${pathname === "/" ? "" : pathname}`;
  return NextResponse.redirect(url);
}

export const config = {
  // Skip API routes, Next.js internals and any path with a file extension
  // (favicon.ico, /data/kendras/*.json, images).
  matcher: ["/((?!api|_next|.*\\..*).*)"],
};
