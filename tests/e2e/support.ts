import { expect, type Page, type TestInfo } from "@playwright/test";

const SECRET_PATTERN =
  /(sb_(?:secret|publishable)_[A-Za-z0-9_-]+|eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+|Bearer\s+\S+)/gi;

export function sanitize(value: string): string {
  return value.replace(SECRET_PATTERN, "[REDACTED]");
}

export function observePage(page: Page) {
  const consoleErrors: string[] = [];
  const failedRequests: string[] = [];
  const badResponses: string[] = [];

  page.on("console", (message) => {
    if (message.type() === "error") {
      const location = message.location();
      const source = location.url ? ` ${new URL(location.url).pathname}` : "";
      consoleErrors.push(`${sanitize(message.text()).slice(0, 500)}${source}`);
    }
  });
  page.on("pageerror", (error) => consoleErrors.push(sanitize(error.message).slice(0, 500)));
  page.on("requestfailed", (request) => {
    failedRequests.push(
      `${request.method()} ${new URL(request.url()).origin}${new URL(request.url()).pathname}: ${sanitize(request.failure()?.errorText ?? "failed")}`,
    );
  });
  page.on("response", (response) => {
    if (response.status() >= 400) {
      const url = new URL(response.url());
      badResponses.push(`${response.status()} ${url.origin}${url.pathname}`);
    }
  });

  return {
    async verify(testInfo: TestInfo) {
      const evidence = JSON.stringify({ consoleErrors, failedRequests, badResponses }, null, 2);
      await testInfo.attach("sanitized-browser-diagnostics", {
        body: Buffer.from(evidence),
        contentType: "application/json",
      });
      expect(consoleErrors, "unexpected console errors").toEqual([]);
      expect(failedRequests, "unexpected failed requests").toEqual([]);
      expect(badResponses, "unexpected API/server 5xx responses").toEqual([]);
    },
  };
}

export async function initializeLanguage(page: Page, language: "fr" | "ar") {
  await page.addInitScript((lang) => {
    window.localStorage.setItem("botolago.welcomed", "1");
    window.localStorage.setItem("botolago.language", lang);
  }, language);
}

export async function expectNoHorizontalOverflow(page: Page) {
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
    )
    .toBe(true);
}
