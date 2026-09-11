import { defineConfig } from "@playwright/test";

const externalBaseUrl = process.env.E2E_BASE_URL;
const isProtectedStaging = Boolean(process.env.E2E_STAGING_FIRST_EMAIL);
const useBuiltPreview = process.env.E2E_USE_BUILT_PREVIEW === "1";

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "**/*.e2e.ts",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: process.env.CI ? 1 : 2,
  timeout: 45_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI
    ? isProtectedStaging
      ? [["line"]]
      : [["line"], ["html", { open: "never" }]]
    : "list",
  outputDir: "test-results/playwright",
  use: {
    baseURL: externalBaseUrl ?? "http://127.0.0.1:4173",
    trace: isProtectedStaging ? "off" : "retain-on-failure",
    screenshot: isProtectedStaging ? "off" : "only-on-failure",
    video: "off",
    reducedMotion: "reduce",
  },
  webServer: externalBaseUrl
    ? undefined
    : {
        command: useBuiltPreview
          ? "bun run preview -- --host 127.0.0.1 --port 4173"
          : "bun run dev -- --host 127.0.0.1 --port 4173",
        url: "http://127.0.0.1:4173",
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
});
