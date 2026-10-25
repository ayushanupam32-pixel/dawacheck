import { defineConfig, devices } from "@playwright/test";

// End-to-end tests (the brief's "sample photos -> confirm -> result card"), plus automated
// accessibility checks (axe) on the screens Lighthouse can't reach: the confirm screen and the
// result card only appear after you interact.
//
// They run against the PRODUCTION build: `pnpm build` first, then `pnpm test:e2e`. The server
// needs web/.env.local (or the same variables in CI), because matching and the checks read the
// database. The browser is the installed Google Chrome (`channel: "chrome"`), so nothing extra is
// downloaded; GitHub's Ubuntu runners have Chrome too.
const PORT = 3100;

export default defineConfig({
  testDir: "e2e",
  // Reading a strip with OCR takes a few seconds, on a slow CI machine much longer.
  timeout: 120_000,
  expect: { timeout: 60_000 },
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    ...devices["Pixel 7"], // a phone-sized screen, like most users
    channel: "chrome",
    trace: "retain-on-failure",
  },
  webServer: {
    command: `pnpm start --port ${PORT}`,
    url: `http://localhost:${PORT}/en`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
