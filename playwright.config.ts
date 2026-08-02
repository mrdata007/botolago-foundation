import { defineConfig } from "@playwright/test";
import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.e2e.local", quiet: true });

const externalBaseUrl = process.env.E2E_BASE_URL;
const liveAuthPattern = "**/staging.acceptance.e2e.ts";

const matrixProjects = [
  { name: "mobile-fr", language: "fr", viewport: { width: 390, height: 844 } },
  { name: "desktop-fr", language: "fr", viewport: { width: 1440, height: 900 } },
  { name: "mobile-ar", language: "ar", viewport: { width: 390, height: 844 } },
  { name: "desktop-ar", language: "ar", viewport: { width: 1440, height: 900 } },
] as const;

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "**/*.e2e.ts",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: process.env.CI ? 1 : 2,
  timeout: 45_000,
  expect: { timeout: 10_000 },
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]],
  outputDir: "test-results/playwright",
  use: {
    baseURL: externalBaseUrl ?? "http://127.0.0.1:4173",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
    reducedMotion: "reduce",
  },
  projects: [
    ...matrixProjects.map((project) => ({
      name: project.name,
      metadata: { language: project.language },
      testIgnore: liveAuthPattern,
      use: { viewport: project.viewport },
    })),
    {
      name: "live-auth",
      metadata: { language: "fr" },
      testMatch: liveAuthPattern,
      use: { viewport: { width: 390, height: 844 } },
    },
  ],
  webServer: externalBaseUrl
    ? undefined
    : {
        command: "bun run dev -- --host 127.0.0.1 --port 4173",
        url: "http://127.0.0.1:4173",
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
});
