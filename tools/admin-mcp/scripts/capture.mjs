// Repository browser evidence; run after the repository's Playwright install.
// The server has a fake backend. No real password, MFA factor or Supabase call.
import { chromium } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { fixture } from "../test/helpers.mjs";

const directory = fileURLToPath(
  new URL("../../../docs/engineering/evidence/admin-mcp/", import.meta.url),
);
mkdirSync(directory, { recursive: true });
const cleanups = [];
const f = await fixture({ after: (cleanup) => cleanups.push(cleanup) });
const callback = await fixture({ after: (cleanup) => cleanups.push(cleanup) });
const browser = await chromium.launch({ headless: true });
const results = [];
try {
  for (const lang of ["fr", "ar"])
    for (const width of [390, 1440]) {
      const context = await browser.newContext({ viewport: { width, height: 1000 }, locale: lang });
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      const url = f.oauth.pending({
        kind: "authorize",
        stage: "password",
        clientName: "Codex / ChatGPT",
        clientId: "test-client",
        redirectUri: `${callback.origin}/health`,
        codeChallenge: "test",
        state: "test",
      });
      await page.goto(`${url}&lang=${lang}`);
      for (const stage of ["password", "mfa"]) {
        if (stage === "mfa") {
          await page.locator("#email").fill("staff@example.test");
          await page.locator("#password").fill("fake-test-password");
          await page.locator('form[action="/session/login"] button').click();
          await page.locator("#code").waitFor();
        }
        const measurements = await page.evaluate(() => ({
          width: innerWidth,
          documentWidth: document.documentElement.scrollWidth,
          direction: document.documentElement.dir,
          overflowing: [...document.querySelectorAll("main, input, button, dl, dd")].filter(
            (node) => {
              const rect = node.getBoundingClientRect();
              return rect.left < 0 || rect.right > innerWidth;
            },
          ).length,
          labels: [...document.querySelectorAll("input:not([type=hidden])")].every((input) =>
            Boolean(document.querySelector(`label[for="${input.id}"]`)),
          ),
          tapTargets: [...document.querySelectorAll("input:not([type=hidden]),button")].every(
            (node) => node.getBoundingClientRect().height >= 44,
          ),
        }));
        if (
          measurements.overflowing ||
          measurements.documentWidth > width ||
          !measurements.labels ||
          !measurements.tapTargets ||
          errors.length
        )
          throw new Error("Browser acceptance check failed.");
        await page.screenshot({
          path: `${directory}/${stage}-${lang}-${width}.png`,
          fullPage: true,
        });
        results.push({ lang, width, stage, ...measurements, pageErrors: [...errors] });
      }
      await page.locator("#code").fill("123456");
      await page.locator('form[action="/session/verify"] button').click();
      await page.waitForURL((url) => url.origin === callback.origin && url.pathname === "/health");
      const returned = new URL(page.url());
      if (!returned.searchParams.get("code") || returned.searchParams.get("state") !== "test")
        throw new Error("Browser MFA callback failed.");
      await context.close();
    }
  // This is a new service; no previous sign-in screen exists to capture.
  writeFileSync(
    `${directory}/browser-checks.json`,
    JSON.stringify(
      {
        backend: "fake; no production calls",
        priorServiceScreen: "none; new standalone service",
        results,
      },
      null,
      2,
    ) + "\n",
  );
  console.log(`Captured ${results.length} browser checks in ${directory}`);
} finally {
  await browser.close();
  for (const cleanup of cleanups) await cleanup();
}
