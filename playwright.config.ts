import { defineConfig } from "@playwright/test";

const externalBaseUrl = process.env.E2E_BASE_URL;

/**
 * `E2E_BUILT_OUTPUT=1` serves the production build in `.output`, with its
 * stub backend, instead of starting the development server
 * (tests/e2e/built-output-serve.ts). Build it first with
 * `bun tests/e2e/built-output-build.ts`. Never reuses a running server: one
 * left over from another checkout would be measured in place of this one.
 * `--no-env-file`: Bun would otherwise load a local `.env` into the server,
 * and parts of the server code read SUPABASE_URL and the Supabase keys from
 * the environment rather than the build.
 *
 * The origin is written out rather than imported from built-output-env.ts:
 * this file runs as configuration on every Playwright run, the secret-holding
 * ones included, and check-config-integrity.mjs scans it but nothing it
 * imports. If the two drift apart, the server never answers here and the run
 * stops at start-up.
 */
const builtOutput = process.env.E2E_BUILT_OUTPUT === "1";
const BUILT_OUTPUT_ORIGIN = "http://127.0.0.1:4318";

/**
 * Some sandboxes route outbound HTTPS through a CA-terminating proxy that the
 * bundled Chromium does not trust, so every Supabase call fails with
 * ERR_CERT_AUTHORITY_INVALID and a run against real data silently measures an
 * empty page. `E2E_CHROMIUM_SPKI_ALLOW` takes that proxy CA's base64 SHA-256
 * SubjectPublicKeyInfo digest and trusts exactly that key — certificate
 * verification stays on for every other authority, unlike
 * `--ignore-certificate-errors`. Compute it with:
 *
 *   openssl x509 -in ca.crt -pubkey -noout | openssl pkey -pubin -outform der \
 *     | openssl dgst -sha256 -binary | base64
 */
const spkiAllowList = process.env.E2E_CHROMIUM_SPKI_ALLOW;
const chromiumArgs = [
  ...(process.env.E2E_CHROMIUM_PATH ? ["--ignore-certificate-errors"] : []),
  ...(spkiAllowList ? [`--ignore-certificate-errors-spki-list=${spkiAllowList}`] : []),
];

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "**/*.e2e.ts",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: process.env.CI ? 1 : 2,
  timeout: 45_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? [["line"], ["html", { open: "never" }]] : "list",
  outputDir: "test-results/playwright",
  use: {
    baseURL: externalBaseUrl ?? (builtOutput ? BUILT_OUTPUT_ORIGIN : "http://127.0.0.1:4173"),
    trace:
      process.env.E2E_STAGING_FIRST_EMAIL || process.env.E2E_FANTASY_EMAIL
        ? "off"
        : "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
    reducedMotion: "reduce",
    ignoreHTTPSErrors: process.env.E2E_IGNORE_HTTPS_ERRORS === "1",
    launchOptions:
      process.env.E2E_CHROMIUM_PATH || chromiumArgs.length > 0
        ? {
            ...(process.env.E2E_CHROMIUM_PATH
              ? { executablePath: process.env.E2E_CHROMIUM_PATH }
              : {}),
            args: chromiumArgs,
          }
        : undefined,
  },
  webServer: externalBaseUrl
    ? undefined
    : builtOutput
      ? {
          command: "bun --no-env-file tests/e2e/built-output-serve.ts",
          url: `${BUILT_OUTPUT_ORIGIN}/robots.txt`,
          reuseExistingServer: false,
          timeout: 60_000,
        }
      : {
          command: "bun run dev -- --host 127.0.0.1 --port 4173",
          url: "http://127.0.0.1:4173",
          reuseExistingServer: !process.env.CI,
          timeout: 120_000,
        },
});
