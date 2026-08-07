import { expect, type Page, type TestInfo } from "@playwright/test";

const SECRET_PATTERN =
  /(sb_(?:secret|publishable)_[A-Za-z0-9_-]+|eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+|Bearer\s+\S+)/gi;
const PROTECTED_E2E_VALUES = [
  process.env.E2E_STAGING_FIRST_EMAIL,
  process.env.E2E_STAGING_FIRST_PASSWORD,
  process.env.E2E_STAGING_SECOND_EMAIL,
  process.env.E2E_STAGING_SECOND_PASSWORD,
].filter((value): value is string => Boolean(value));

export function sanitize(value: string): string {
  let sanitized = value.replace(SECRET_PATTERN, "[REDACTED]");
  for (const protectedValue of PROTECTED_E2E_VALUES) {
    sanitized = sanitized.replaceAll(protectedValue, "[REDACTED]");
  }
  return sanitized;
}

type ObservationOptions = {
  allowResponse?: (status: number, url: URL) => boolean;
  allowConsoleError?: (message: string, sourceUrl: URL | null) => boolean;
  allowExpectedResourceConsoleError?: boolean;
};

export function observePage(page: Page, options: ObservationOptions = {}) {
  const consoleErrors: string[] = [];
  const failedRequests: string[] = [];
  const expectedNavigationAborts: string[] = [];
  const badResponses: string[] = [];

  page.on("console", (message) => {
    if (message.type() === "error") {
      const location = message.location();
      const sourceUrl = location.url ? new URL(location.url) : null;
      if (options.allowConsoleError?.(message.text(), sourceUrl)) return;
      if (
        options.allowExpectedResourceConsoleError &&
        /failed to load resource/i.test(message.text())
      ) {
        return;
      }
      const source = sourceUrl ? ` ${sourceUrl.pathname}` : "";
      consoleErrors.push(`${sanitize(message.text()).slice(0, 500)}${source}`);
    }
  });
  page.on("pageerror", (error) => consoleErrors.push(sanitize(error.message).slice(0, 500)));
  page.on("requestfailed", (request) => {
    const failure = sanitize(request.failure()?.errorText ?? "failed");
    const record = `${request.method()} ${new URL(request.url()).origin}${new URL(request.url()).pathname}: ${failure}`;
    if (failure.includes("ERR_ABORTED")) expectedNavigationAborts.push(record);
    else failedRequests.push(record);
  });
  page.on("response", (response) => {
    if (response.status() >= 400) {
      const url = new URL(response.url());
      if (options.allowResponse?.(response.status(), url)) return;
      badResponses.push(`${response.status()} ${url.origin}${url.pathname}`);
    }
  });

  return {
    async verify(testInfo: TestInfo) {
      const evidence = JSON.stringify(
        { consoleErrors, failedRequests, expectedNavigationAborts, badResponses },
        null,
        2,
      );
      await testInfo.attach("sanitized-browser-diagnostics", {
        body: Buffer.from(evidence),
        contentType: "application/json",
      });
      expect(consoleErrors, "unexpected console errors").toEqual([]);
      expect(failedRequests, "unexpected failed requests").toEqual([]);
      expect(badResponses, "unexpected API/server 4xx/5xx responses").toEqual([]);
    },
  };
}

export async function initializeLanguage(page: Page, language: "fr" | "ar") {
  await page.addInitScript((lang) => {
    window.localStorage.setItem("botolago.welcomed", "1");
    window.localStorage.setItem("botolago.fantasy.onboarded", "1");
    window.localStorage.setItem("botolago.language", lang);
    window.sessionStorage.setItem("botolago.splashShown", "1");
  }, language);
}

export async function gotoHydrated(page: Page, path: string, language: "fr" | "ar") {
  await page.goto(path);
  await expect(page.locator("html")).toHaveAttribute("data-lang", language);
}

export async function reloadHydrated(page: Page, language: "fr" | "ar") {
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-lang", language);
}

export async function expectNoHorizontalOverflow(page: Page) {
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1))
    .toBe(true);
}
