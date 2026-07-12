import { defineConfig } from "@playwright/test";

/**
 * E2E smoke tests — a handful of black-box checks against the BUILT app
 * (`next start`), run in CI after the build gate. They verify that the
 * app actually boots and serves its public surface; they do NOT log in
 * (no real Supabase in CI), so anything behind auth stays unit-tested.
 *
 * Run locally:
 *   npm run build   (placeholder env vars suffice, see README/CI)
 *   npm run test:e2e
 *
 * PW_CHROMIUM_PATH overrides the browser binary (e.g. a preinstalled
 * chromium at /opt/pw-browsers/chromium) instead of downloading one.
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: "http://localhost:3100",
    ...(process.env.PW_CHROMIUM_PATH
      ? { launchOptions: { executablePath: process.env.PW_CHROMIUM_PATH } }
      : {}),
  },
  webServer: {
    command: "npm run start -- --port 3100",
    url: "http://localhost:3100/login",
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
