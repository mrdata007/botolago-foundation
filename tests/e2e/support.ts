import { expect, type Page, type TestInfo } from "@playwright/test";

const SECRET_PATTERN =
  /(sb_(?:secret|publishable)_[A-Za-z0-9_-]+|eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+|Bearer\s+\S+)/gi;

export function sanitize(value: string): string {
  return value.replace(SECRET_PATTERN, "[REDACTED]");
}

type ObservationOptions = {
  allowResponse?: (status: number, url: URL) => boolean;
  allowExpectedResourceConsoleError?: boolean;
  allowConsoleError?: (message: string, pageUrl: URL) => boolean;
};

export function observePage(page: Page, options: ObservationOptions = {}) {
  const consoleErrors: string[] = [];
  const failedRequests: string[] = [];
  const expectedNavigationAborts: string[] = [];
  const badResponses: string[] = [];

  page.on("console", (message) => {
    if (message.type() === "error") {
      const pageUrl = new URL(page.url());
      if (options.allowConsoleError?.(message.text(), pageUrl)) return;
      if (
        options.allowExpectedResourceConsoleError &&
        /failed to load resource/i.test(message.text())
      ) {
        return;
      }
      const location = message.location();
      const source = location.url ? ` ${new URL(location.url).pathname}` : "";
      consoleErrors.push(
        `[${pageUrl.pathname}] ${sanitize(message.text()).slice(0, 500)}${source}`,
      );
    }
  });
  page.on("pageerror", (error) =>
    consoleErrors.push(
      `[${new URL(page.url()).pathname}] ${sanitize(error.message).slice(0, 500)}`,
    ),
  );
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
    window.localStorage.setItem("botolago.language", lang);
    window.localStorage.setItem("botolago.fantasy.onboarded", "1");
    window.sessionStorage.setItem("botolago.splashShown", "1");
  }, language);
}

export async function gotoHydrated(page: Page, path: string, language: "fr" | "ar") {
  await page.goto(path);
  await expect(page.locator("html")).toHaveAttribute("data-lang", language, { timeout: 20_000 });
}

export async function reloadHydrated(page: Page, language: "fr" | "ar") {
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-lang", language, { timeout: 20_000 });
}

export async function expectNoHorizontalOverflow(page: Page) {
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1))
    .toBe(true);
}

export async function expectHealthyDocument(page: Page) {
  await expect(page.locator("body")).toBeVisible();
  await expect(page.locator("body")).not.toBeEmpty();
  await expect(
    page.locator(
      "vite-error-overlay, #webpack-dev-server-client-overlay, [data-nextjs-dialog-overlay]",
    ),
  ).toHaveCount(0);
  await expectNoHorizontalOverflow(page);
  await expect
    .poll(() =>
      page.evaluate(() =>
        [...document.images]
          .filter((image) => image.getClientRects().length > 0)
          .every((image) => image.complete && image.naturalWidth > 0),
      ),
    )
    .toBe(true);
}

export async function expectInteractiveControlsInsideViewport(page: Page) {
  const clipped = await page.locator("a, button, input, select, textarea").evaluateAll((elements) =>
    elements
      .filter((element) => {
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return (
          style.visibility !== "hidden" &&
          style.display !== "none" &&
          rect.width > 0 &&
          rect.height > 0
        );
      })
      .filter((element) => {
        const rect = element.getBoundingClientRect();
        return rect.left < -1 || rect.right > window.innerWidth + 1;
      })
      .filter((element) => {
        let ancestor = element.parentElement;
        while (ancestor && ancestor !== document.body) {
          const style = getComputedStyle(ancestor);
          if (
            (style.overflowX === "auto" || style.overflowX === "scroll") &&
            ancestor.scrollWidth > ancestor.clientWidth
          ) {
            return false;
          }
          ancestor = ancestor.parentElement;
        }
        return true;
      })
      .map((element) => ({
        tag: element.tagName.toLowerCase(),
        label:
          element.getAttribute("aria-label") ??
          element.getAttribute("title") ??
          element.textContent?.trim().slice(0, 80) ??
          "",
      })),
  );
  expect(clipped, "interactive controls clipped outside the horizontal viewport").toEqual([]);
}

export function projectLanguage(testInfo: TestInfo): "fr" | "ar" {
  return testInfo.project.metadata.language === "ar" ? "ar" : "fr";
}

export function isDeepFunctionalProject(testInfo: TestInfo): boolean {
  return testInfo.project.name === "mobile-fr";
}
