import { expect, type Page, type TestInfo } from "@playwright/test";

const SECRET_PATTERN =
  /(sb_(?:secret|publishable)_[A-Za-z0-9_-]+|eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+|Bearer\s+\S+)/gi;

export function sanitize(value: string): string {
  return value.replace(SECRET_PATTERN, "[REDACTED]");
}

type ObservationOptions = {
  allowResponse?: (status: number, url: URL) => boolean;
  allowExpectedResourceConsoleError?: boolean;
};

export function observePage(page: Page, options: ObservationOptions = {}) {
  const consoleErrors: string[] = [];
  const failedRequests: string[] = [];
  const expectedNavigationAborts: string[] = [];
  const badResponses: string[] = [];

  page.on("console", (message) => {
    if (message.type() === "error") {
      if (
        options.allowExpectedResourceConsoleError &&
        /failed to load resource/i.test(message.text())
      ) {
        return;
      }
      const location = message.location();
      const source = location.url ? ` ${new URL(location.url).pathname}` : "";
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
    // The Fantasy hub's prize welcome (PrizeWelcome, once prizes are on) is
    // an arrival dialog; journeys that are not about it start past it.
    window.localStorage.setItem("botolago.prizes.welcome.v1", "1");
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

/**
 * `html, body { overflow-x: clip }` in styles.css means content pushed past
 * the viewport produces no horizontal scrollbar at all, so the check above
 * stays green while that content is clipped away and unreachable --
 * `document.documentElement.scrollWidth` reads exactly the viewport width.
 *
 * That is how a match card shipped 452px wide inside a 366px content box at
 * 390px: the single-column `grid` sized its implicit `auto` track to the
 * card's min-content width (the full, untruncated club name), putting the
 * away crest and name past the right gutter in French and the matchday chip
 * past the left one in Arabic. So assert on the boxes a reader can actually
 * reach, not just on the document's scroll width. A short local club name
 * hides this, which is why the assertion matters most against real data.
 */
/**
 * The same measure for every visible box under `scope`: what the document's
 * scroll width cannot see behind `overflow-x: clip`, a box can.
 *
 * `scrollRails: true` lets through what sits inside a horizontal rail -- an
 * `overflow-x: auto | scroll` box under `scope` -- since a reader reaches it by
 * swiping the rail. The rail itself must still fit, and a scroller around the
 * whole scope excuses nothing.
 *
 * A row marked `data-swipe-row` (the match page's prediction deck) holds cards
 * a reader swipes to: the ones waiting beside the viewport are reachable, not
 * clipped. The row itself is still measured; what each card holds is measured
 * against the card instead (`expectSwipeSlidesFit`).
 */
export async function expectNothingOffScreen(
  page: Page,
  scope = "main",
  { scrollRails = false }: { scrollRails?: boolean } = {},
) {
  const offscreen = await page.evaluate(
    ([selector, skipRails]) => {
      const viewport = document.documentElement.clientWidth;
      const found: string[] = [];
      const inRail = (node: Element, root: Element) => {
        for (let parent = node.parentElement; parent && parent !== root; ) {
          const overflowX = getComputedStyle(parent).overflowX;
          if (overflowX === "auto" || overflowX === "scroll") return true;
          parent = parent.parentElement;
        }
        return false;
      };
      for (const root of document.querySelectorAll(selector)) {
        for (const node of [root, ...root.querySelectorAll("*")]) {
          if (node.parentElement?.closest("[data-swipe-row]")) continue;
          const box = node.getBoundingClientRect();
          if (box.width === 0 || box.height === 0) continue;
          if (box.left >= -1 && box.right <= viewport + 1) continue;
          if (skipRails && inRail(node, root)) continue;
          const label = (node.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 24);
          found.push(
            `${node.tagName.toLowerCase()} "${label}" spans ${Math.round(box.left)}..${Math.round(box.right)} in a ${viewport}px viewport`,
          );
        }
      }
      return found;
    },
    [scope, scrollRails] as const,
  );
  expect(offscreen, `content outside the viewport under ${scope}`).toEqual([]);
}

export async function expectNoClippedMatchCards(page: Page) {
  const clipped = await page.evaluate(() => {
    const viewport = document.documentElement.clientWidth;
    const offscreen: string[] = [];
    for (const card of document.querySelectorAll('main a[href^="/matches/"]')) {
      for (const node of [card, ...card.querySelectorAll("*")]) {
        const box = node.getBoundingClientRect();
        if (box.width === 0 || box.height === 0) continue;
        if (box.left >= -1 && box.right <= viewport + 1) continue;
        const label = (node.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 24);
        offscreen.push(
          `${node.tagName.toLowerCase()} "${label}" spans ${Math.round(box.left)}..${Math.round(box.right)} in a ${viewport}px viewport`,
        );
      }
    }
    return offscreen;
  });
  expect(clipped, "match-card content clipped outside the viewport").toEqual([]);
}

/** Every card of a `data-swipe-row` keeps what it holds inside its own box. */
export async function expectSwipeSlidesFit(page: Page) {
  const spilled = await page.evaluate(() => {
    const found: string[] = [];
    for (const slide of document.querySelectorAll("[data-swipe-row] > *")) {
      const frame = slide.getBoundingClientRect();
      for (const node of slide.querySelectorAll("*")) {
        const box = node.getBoundingClientRect();
        if (box.width === 0 || box.height === 0) continue;
        if (box.left >= frame.left - 1 && box.right <= frame.right + 1) continue;
        const label = (node.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 24);
        found.push(
          `${node.tagName.toLowerCase()} "${label}" spans ${Math.round(box.left - frame.left)}..${Math.round(box.right - frame.left)} in a ${Math.round(frame.width)}px card`,
        );
      }
    }
    return found;
  });
  expect(spilled, "content spilling out of a swiped card").toEqual([]);
}
