import { defineConfig, devices } from "@playwright/test";

// E2E smoke tests. These exercise client-only behavior (routing + form validation),
// so they need NO backend — just the Vite dev server, which Playwright starts below.
// Not part of the lightweight CI gate (browsers must be installed via
// `npx playwright install`); run locally with `npm run e2e`.
const PORT = 8080;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "on-first-retry",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: {
    command: "npm run dev",
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
