// The brief's privacy promise, checked from the browser's network log (what the "Network" tab
// shows): photos and location never leave the device.
//
// - A real photo scan (a demo strip chosen from the gallery, front + back + stamp): the only
//   uploads are the small JSON requests to /api/match and /api/checks with the medicine
//   details. No image bytes anywhere; the only other host is the CDN serving the OCR program
//   and model (downloads only).
// - The nearest Kendra by GPS: the position stays on the phone. No request carries the
//   coordinates; the phone only downloads static Kendra files for its area.

import { resolve } from "node:path";
import { expect, test, type Request } from "@playwright/test";

const STRIP = resolve(__dirname, "..", "..", "demo", "1-everyday", "01-telmikind-40");
const OCR_CDN = "cdn.jsdelivr.net"; // Tesseract.js program, WebAssembly core and English model

type Logged = { method: string; url: URL; body: Buffer | null; type: string };

function recorder(page: import("@playwright/test").Page) {
  const log: Logged[] = [];
  page.on("request", (r: Request) =>
    log.push({
      method: r.method(),
      url: new URL(r.url()),
      body: r.postDataBuffer(),
      type: r.headers()["content-type"] ?? "",
    }),
  );
  return log;
}

test("a photo scan uploads no image: only small JSON to our own API", async ({ page, baseURL }) => {
  const log = recorder(page);
  const ownHost = new URL(baseURL!).host;

  await page.goto("/en/scan");
  for (const photo of ["front.jpg", "back.jpg", "stamp.jpg"]) {
    await page.locator('input[type="file"]:not([capture])').setInputFiles(resolve(STRIP, photo));
    await page.getByRole("button", { name: "Next", exact: true }).click();
  }
  await expect(page.getByRole("heading", { name: "Check what we read" })).toBeVisible();
  await page.getByRole("button", { name: "Find a cheaper generic" }).click();
  await expect(page.getByRole("heading", { name: "Checks for this strip" })).toBeVisible();
  await expect(page.getByText("Telmikind 40 Tablet").first()).toBeVisible();

  const hosts = new Set(log.map((r) => r.url.host).filter((h) => h)); // blob:/data: have no host
  expect([...hosts].sort()).toEqual([ownHost, OCR_CDN].sort());

  // The OCR CDN only ever serves downloads.
  expect(log.filter((r) => r.url.host === OCR_CDN && r.method !== "GET")).toEqual([]);

  // Everything sent upwards: exactly the two API calls, small JSON, no picture inside.
  const uploads = log.filter((r) => r.method !== "GET" && r.method !== "HEAD" && r.url.host);
  const paths = uploads.map((r) => r.url.pathname).filter((p) => p.startsWith("/api/"));
  expect(new Set(paths)).toEqual(new Set(["/api/match", "/api/checks"]));
  for (const r of uploads.filter((u) => u.url.pathname.startsWith("/api/"))) {
    expect(r.type).toContain("application/json");
    expect(r.body?.length ?? 0).toBeLessThan(4_000);
    const text = r.body?.toString("utf8") ?? "";
    expect(text).not.toMatch(/data:image|base64/i);
    expect(r.body?.includes(Buffer.from([0xff, 0xd8, 0xff]))).toBeFalsy(); // JPEG signature
  }
  // Any other non-GET (Next.js page navigation) carries no body of note.
  for (const r of uploads.filter((u) => !u.url.pathname.startsWith("/api/"))) {
    expect(r.body?.length ?? 0).toBeLessThan(4_000);
  }
});

test("the nearest Kendra by GPS never sends the position", async ({ browser, baseURL }) => {
  // Connaught Place, New Delhi.
  const lat = 28.631456;
  const lon = 77.216721;
  const context = await browser.newContext({
    baseURL,
    geolocation: { latitude: lat, longitude: lon },
    permissions: ["geolocation"],
  });
  const page = await context.newPage();
  const log = recorder(page);
  const ownHost = new URL(baseURL!).host;

  await page.goto("/en/kendras");
  await page.getByRole("button", { name: "Use my location" }).click();
  await expect(page.getByText(/km away/)).toHaveCount(3);

  // Only our own site; the map (OpenStreetMap tiles) loads only after "Show on map".
  expect(new Set(log.map((r) => r.url.host).filter((h) => h))).toEqual(new Set([ownHost]));
  // Nothing is uploaded, and no URL or body contains the coordinates in any usual form.
  expect(log.filter((r) => r.method !== "GET" && r.method !== "HEAD")).toEqual([]);
  const fragments = [
    lat.toFixed(2),
    lon.toFixed(2),
    String(lat).slice(0, 6),
    String(lon).slice(0, 6),
  ];
  for (const r of log) {
    const sent = `${r.url.href} ${r.body?.toString("utf8") ?? ""}`;
    for (const f of fragments) expect(sent, r.url.href).not.toContain(f);
  }
  // What was fetched for "nearest": static files for the ~156 km geohash squares only.
  const data = log.filter((r) => r.url.pathname.startsWith("/data/"));
  expect(data.length).toBeGreaterThan(0);
  for (const r of data)
    expect(r.url.pathname).toMatch(/^\/data\/kendras\/(index|[0-9a-z]{3})\.json$/);
  await context.close();
});
