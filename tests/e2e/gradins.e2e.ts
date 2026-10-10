import { expect, test, type Page } from "@playwright/test";

import { dictionaries } from "../../src/i18n/dictionaries";
import {
  expectNoHorizontalOverflow,
  gotoHydrated,
  initializeLanguage,
  observePage,
} from "./support";

/**
 * Gradins with the section switched ON, on the development server's preview:
 *
 *   VITE_MANAGER_CARD_PREVIEW=1 VITE_MANAGER_CARD_DATA_MODE=mock VITE_AUTH_MODE=mock \
 *   VITE_FANTASY_DATA_MODE=mock VITE_FOOTBALL_DATA_MODE=mock VITE_PEPITES_DATA_MODE=mock \
 *   bun run dev -- --host 127.0.0.1 --port 4186 --strictPort
 *   E2E_GRADINS_PREVIEW=1 E2E_BASE_URL=http://127.0.0.1:4186 bunx playwright test tests/e2e/gradins.e2e.ts
 *
 * The cards are the development fixtures (`?mc=<id>`, remembered for the session). The account is
 * the mock auth's demo user, signed in through storage. What the section does with the switch
 * off is `gradins-off.e2e.ts`; the pixel and server-HTML identity against the base tree is
 * `docs/product/manager-card-section/wp1/compare-off.mjs`.
 *
 * Plan section 9: the bar and the Pépites moves (5, 6), every screen without a console error or a
 * failed request (7), the switch read as off (8), nothing past the edge (9), 44 px targets and 48 px
 * rows (10), Arabic (12), reduced motion (13), the number never held back (14), the words (16, 17)
 * and one hero per session, acknowledged once (18), plus the finish-review checks: the team page's
 * born panel leaves the pitch's first row on screen, and G1 says the next round under the identity.
 */
test.skip(
  process.env.E2E_GRADINS_PREVIEW !== "1",
  "needs a development server started with VITE_MANAGER_CARD_PREVIEW=1 and the mock data modes (E2E_GRADINS_PREVIEW=1)",
);

type Language = "fr" | "ar";
type Key = keyof typeof dictionaries.fr;
const copy = (lang: Language, key: Key) => dictionaries[lang][key];
const LANGS: Language[] = ["fr", "ar"];

/** The mock auth's demo account, as a signed-in session (no form). */
async function signIn(page: Page, lang: Language) {
  await page.addInitScript((language) => {
    const demo = {
      id: "usr_demo",
      email: "demo@botolago.ma",
      displayName: "Rachid Demo",
      username: "rachid_demo",
      language,
      notifications: { matchAlerts: true, breakingNews: true, fantasyDeadlines: true },
      profileComplete: true,
      createdAt: "2026-09-01T00:00:00Z",
      verified: true,
      provider: "email",
      favoriteClubId: "war",
      passwordDigest: "x",
    };
    localStorage.setItem("botolago.auth.users", JSON.stringify([demo]));
    localStorage.setItem(
      "botolago.auth.session",
      JSON.stringify({ kind: "user", userId: demo.id, createdAt: demo.createdAt }),
    );
  }, lang);
}

async function setTheme(page: Page, theme: "light" | "dark") {
  await page.addInitScript((value) => localStorage.setItem("botolago.theme", value), theme);
}

/** The URL the app loaded the card service from (it carries a `?t=` after a hot update). */
const serviceUrls = new WeakMap<Page, string>();

async function start(
  page: Page,
  lang: Language,
  { signedIn = true, theme = "light" }: { signedIn?: boolean; theme?: "light" | "dark" } = {},
) {
  page.on("request", (request) => {
    if (/\/src\/services\/manager-card\.ts(\?|$)/.test(request.url()))
      serviceUrls.set(page, request.url());
  });
  await initializeLanguage(page, lang);
  await setTheme(page, theme);
  if (signedIn) await signIn(page, lang);
}

const bar = (page: Page, lang: Language) =>
  page.getByRole("navigation", { name: copy(lang, "nav.primary") });

async function barLabels(page: Page, lang: Language): Promise<string[]> {
  return bar(page, lang)
    .getByRole("link")
    .evaluateAll((links) =>
      links.map((link) => link.getAttribute("aria-label") ?? (link.textContent ?? "").trim()),
    );
}

/** Development server only: counts the calls to the acknowledgement RPC's one entry point. */
async function spyAcks(page: Page) {
  const url = serviceUrls.get(page) ?? new URL("/src/services/manager-card.ts", page.url()).href;
  await page.evaluate(async (moduleUrl) => {
    const { managerCardService } = await import(/* @vite-ignore */ moduleUrl);
    const holder = window as unknown as { __acks?: string[][] };
    if (holder.__acks) return;
    holder.__acks = [];
    const original = managerCardService.ackMoments.bind(managerCardService);
    managerCardService.ackMoments = (keys: string[]) => {
      holder.__acks!.push([...keys]);
      return original(keys);
    };
  }, url);
}
const acks = (page: Page) =>
  page.evaluate(() => (window as unknown as { __acks?: string[][] }).__acks ?? []);
const heroFlag = (page: Page) =>
  page.evaluate(() => sessionStorage.getItem("botolago.card.hero_session.v1"));

/**
 * Element rectangles, not `scrollWidth` (`html, body { overflow-x: clip }` hides overflow): nothing
 * under `main` may lie past either side of the window. There is no exemption for the stage: its rail
 * is gone (plan section 10), and the card's shadow and its tilt stay inside the stage's own padding.
 */
async function expectNothingPastTheEdge(page: Page) {
  const found = await page.evaluate(() => {
    const viewport = document.documentElement.clientWidth;
    const out: string[] = [];
    for (const node of document.querySelectorAll("main, main *")) {
      const box = node.getBoundingClientRect();
      if (box.width === 0 || box.height === 0) continue;
      if (box.left >= -1 && box.right <= viewport + 1) continue;
      if (node.closest("[data-swipe-row]")) continue;
      // Inside an SVG that clips its overflow (the founder's crop of the card holds the whole card's
      // markup and shows a corner of it) an element outside the SVG's own box is never painted. The
      // SVG's rectangle is what counts, and it is checked as every other element is.
      const owner = (node as SVGElement).ownerSVGElement;
      if (owner && getComputedStyle(owner).overflow !== "visible") continue;
      const label = (node.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 24);
      out.push(
        `${node.tagName.toLowerCase()} "${label}" spans ${Math.round(box.left)}..${Math.round(box.right)} in a ${viewport}px window`,
      );
    }
    return out;
  });
  expect(found, "content past the edge of the window").toEqual([]);
}

/** A session in which the hero has already been shown: only the stage is on the first screen. */
async function withoutHero(page: Page) {
  await page.addInitScript(() => sessionStorage.setItem("botolago.card.hero_session.v1", "1"));
}

/** Two frames, so that a layout the window's new size asks for is the one measured. */
async function settle(page: Page) {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
}

/**
 * The headings under `main` whose text is wider than the box it is in, as « text: the box, what the
 * text needs ». Not `scrollWidth > clientWidth` (the text of `truncate` and of `overflow: clip` is
 * laid out whole and only painted short, and a page that clips its overflow hides the difference):
 * a `Range` over the heading's contents has the width its text needs, and that is compared with the
 * width of the box (less its padding and border). A heading that wraps onto a second line is whole.
 */
async function cutHeadings(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const found: string[] = [];
    for (const heading of document.querySelectorAll(
      "main h1, main h2, main h3, main [role='heading']",
    )) {
      const box = heading.getBoundingClientRect();
      if (box.width === 0 || box.height === 0) continue;
      const style = getComputedStyle(heading);
      const room =
        box.width -
        parseFloat(style.paddingLeft) -
        parseFloat(style.paddingRight) -
        parseFloat(style.borderLeftWidth) -
        parseFloat(style.borderRightWidth);
      const range = document.createRange();
      range.selectNodeContents(heading);
      const need = range.getBoundingClientRect().width;
      if (need > room + 0.5) {
        const label = (heading.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 28);
        found.push(
          `« ${label} »: a box of ${room.toFixed(1)} px, the text needs ${need.toFixed(1)}`,
        );
      }
    }
    return found;
  });
}

/**
 * Asks the page for less motion, and checks that it took. The project's `reducedMotion: "reduce"`
 * (playwright.config.ts) did not reach the page's media query in the sandbox's Chromium (the page
 * read `matchMedia("(prefers-reduced-motion: reduce)")` as false, with the option set in the config
 * and again through `test.use`), so a spec that claims reduced motion asks for it itself.
 */
async function emulateReducedMotion(page: Page) {
  await page.emulateMedia({ reducedMotion: "reduce" });
  expect(
    await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches),
    "the page reads the reduced-motion preference",
  ).toBe(true);
}

/**
 * Reduced motion: nothing runs once the page has settled (`document.getAnimations()` is empty).
 * A loading skeleton or a transition that is still finishing as the card arrives is given a few
 * seconds to end; what is left is named in the failure.
 */
async function expectNoAnimations(page: Page, where: string) {
  await expect
    .poll(
      () =>
        page.evaluate(() =>
          document.getAnimations().map((animation) => {
            const target =
              animation.effect instanceof KeyframeEffect ? animation.effect.target : null;
            const name =
              animation instanceof CSSAnimation
                ? animation.animationName
                : animation instanceof CSSTransition
                  ? animation.transitionProperty
                  : "script";
            return `${name} on ${target?.tagName.toLowerCase() ?? "?"}.${String(target?.getAttribute("class") ?? "").slice(0, 40)}`;
          }),
        ),
      { message: `animations still running at ${where}`, timeout: 6_000 },
    )
    .toEqual([]);
}

/** Every screen and state of plan section 4 that the mock fixtures can show. */
const SCREENS: { id: string; path: string; visitor?: boolean }[] = [
  { id: "g1 guest", path: "/gradins", visitor: true },
  { id: "g1 forming", path: "/gradins?mc=forming1" },
  { id: "g1 rated", path: "/gradins?mc=rated" },
  { id: "g1 founder", path: "/gradins?mc=founder" },
  { id: "g1 season closed", path: "/gradins?mc=seasonClosed" },
  { id: "g1 season started", path: "/gradins?mc=seasonStarted" },
  { id: "g1 born", path: "/gradins?mc=born0Serial" },
  { id: "g1 tier up", path: "/gradins?mc=tierUp" },
  { id: "g2 rated", path: "/gradins/carte?mc=rated" },
  { id: "g2 insufficient", path: "/gradins/carte?mc=insufficient3" },
  { id: "g2 founder", path: "/gradins/carte?mc=founder" },
  { id: "g3 league", path: "/gradins/les-votres?mc=rated" },
  { id: "g6 seasons", path: "/gradins/saisons?mc=rated" },
  { id: "g6 empty", path: "/gradins/saisons?mc=born0" },
];

test.describe("the bar, Pépites inside Fantasy, the switch read as off", () => {
  for (const lang of LANGS) {
    test(`${lang}: the bar reads Accueil · Actualités · Fantasy · Matches · Gradins at 390 and as text links at 1440`, async ({
      page,
    }, testInfo) => {
      const diagnostics = observePage(page);
      await page.setViewportSize({ width: 390, height: 844 });
      await start(page, lang);
      await gotoHydrated(page, "/", lang);
      const expected = [
        copy(lang, "nav.home"),
        copy(lang, "nav.news"),
        copy(lang, "nav.fantasy"),
        copy(lang, "nav.matches"),
        copy(lang, "nav.gradins"),
      ];
      expect(await barLabels(page, lang)).toEqual(expected);
      await expect(page.locator("html")).toHaveAttribute("data-gradins", "live");
      // every item of the phone bar is a 44 px target
      for (const link of await bar(page, lang).getByRole("link").all()) {
        const box = (await link.boundingBox())!;
        expect(box.width).toBeGreaterThanOrEqual(44);
        expect(box.height).toBeGreaterThanOrEqual(44);
      }
      await page.setViewportSize({ width: 1440, height: 900 });
      await expect.poll(() => barLabels(page, lang)).toEqual(expected);
      await diagnostics.verify(testInfo);
    });

    test(`${lang}: on every Pépites page the Fantasy item is the current one`, async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await start(page, lang);
      for (const path of ["/pepites", "/pepites/classement", "/pepites/methode"]) {
        await gotoHydrated(page, path, lang);
        await expect(
          bar(page, lang).getByRole("link", { name: copy(lang, "nav.fantasy") }),
        ).toHaveAttribute("aria-current", "page");
        await expect(
          bar(page, lang).getByRole("link", { name: copy(lang, "nav.gradins") }),
        ).not.toHaveAttribute("aria-current", "page");
      }
      await gotoHydrated(page, "/gradins?mc=rated", lang);
      await expect(
        bar(page, lang).getByRole("link", { name: copy(lang, "nav.gradins") }),
      ).toHaveAttribute("aria-current", "page");
    });

    test(`${lang}: the hub shows the Pépites tile and Pépites keeps its address, its canonical and the way back`, async ({
      page,
    }, testInfo) => {
      const diagnostics = observePage(page, { allowExpectedResourceConsoleError: true });
      await page.setViewportSize({ width: 390, height: 844 });
      await start(page, lang, { signedIn: false });
      await gotoHydrated(page, "/fantasy", lang);
      const tile = page.getByTestId("fantasy-hub-pepites-tile");
      await expect(tile).toBeVisible();
      await expect(tile).toHaveAttribute("href", "/pepites");

      const response = await page.goto("/pepites");
      expect(response?.status()).toBe(200);
      await expect(page.locator("html")).toHaveAttribute("data-lang", lang);
      // the canonical is Pépites' own, never a Gradins or Fantasy address
      const canonical = await page.locator('link[rel="canonical"]').getAttribute("href");
      expect(canonical ?? "").toMatch(/\/pepites\/?$/);
      // the home band's pill leads back to Fantasy, labelled « Fantasy »
      const pill = page.getByTestId("pepites-back").first();
      await expect(pill.locator('a[href="/fantasy"]')).toBeVisible();
      await expect(pill).toContainText(copy(lang, "nav.fantasy"));
      await diagnostics.verify(testInfo);
    });
  }

  test("a status that reads off gives today's bar, sends /gradins home, and logs nothing", async ({
    page,
  }, testInfo) => {
    const diagnostics = observePage(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await start(page, "fr");
    await gotoHydrated(page, "/?mc=featureOff", "fr");
    expect(await barLabels(page, "fr")).toEqual(
      ["nav.home", "nav.news", "nav.fantasy", "nav.matches", "nav.pepites"].map((key) =>
        copy("fr", key as Key),
      ),
    );
    await expect(page.locator("html")).not.toHaveAttribute("data-gradins", /.*/);
    await page.goto("/gradins?mc=featureOff");
    await expect(page).toHaveURL(/\/fantasy\/?(\?|$)/);
    await diagnostics.verify(testInfo);
  });
});

test.describe("every screen and state", () => {
  const cases = [
    ...LANGS.flatMap((lang) =>
      SCREENS.map((screen) => ({ lang, screen, theme: "light" as const })),
    ),
    // dark: the home, the card page and the league, where the card's art meets the page
    ...LANGS.flatMap((lang) =>
      SCREENS.filter((screen) => /^(g1 rated|g2 rated|g3 league)$/.test(screen.id)).map(
        (screen) => ({
          lang,
          screen,
          theme: "dark" as const,
        }),
      ),
    ),
  ];
  for (const { lang, screen, theme } of cases) {
    test(`${lang} ${theme} ${screen.id}: no console error or failed request, nothing past the edge, 44 px targets and 48 px rows`, async ({
      page,
    }, testInfo) => {
      const diagnostics = observePage(page);
      await page.setViewportSize({ width: 390, height: 844 });
      await start(page, lang, { signedIn: !screen.visitor, theme });
      await gotoHydrated(page, screen.path, lang);
      await expect(page.locator("main").first()).toBeVisible();
      // the card is drawn on the client, after the page's own content
      await page.waitForTimeout(1_200);
      await expectNoHorizontalOverflow(page);
      await expectNothingPastTheEdge(page);
      const small = await page.evaluate(() => {
        const found: string[] = [];
        const root = document.querySelector("main") ?? document.body;
        for (const element of root.querySelectorAll(
          'a[href], button, [role="button"], input:not([type=hidden]), select, textarea',
        )) {
          // the report flag is painted 32 px with a 44 px hit area behind it
          if (element.closest("svg") || element.hasAttribute("data-report-trigger")) continue;
          const box = element.getBoundingClientRect();
          if (box.width < 2 || box.height < 2 || getComputedStyle(element).visibility === "hidden")
            continue;
          if (box.width < 43.5 || box.height < 43.5) {
            const name = element.getAttribute("aria-label") ?? element.textContent ?? "";
            found.push(
              `${element.tagName.toLowerCase()} "${name.trim().slice(0, 30)}" ${Math.round(box.width)}x${Math.round(box.height)}`,
            );
          }
        }
        for (const row of root.querySelectorAll("tbody tr")) {
          if (row.getBoundingClientRect().height < 47.5) found.push("a table row under 48 px");
        }
        return found;
      });
      expect(small, "targets under 44 px").toEqual([]);
      await diagnostics.verify(testInfo);
    });
  }

  test("an offline card read shows the error panel and a retry, not a stale number", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await start(page, "fr");
    await gotoHydrated(page, "/gradins?mc=offline", "fr");
    await expect(page.getByRole("button", { name: copy("fr", "state.retry") })).toBeVisible();
    await expect(page.getByTestId("gradins-rating-line")).toHaveCount(0);
  });

  test("a card read that says « not available » shows the unavailable line and the way to Profil", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await start(page, "fr");
    await gotoHydrated(page, "/gradins?mc=noCard", "fr");
    await expect(page.getByText(copy("fr", "gradins.unavailable"))).toBeVisible();
  });
});

test.describe("Arabic, motion and the number", () => {
  test("ar: right to left, no letter-spacing, the back pill and the own-row bar at the right", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await start(page, "ar");
    for (const path of [
      "/gradins?mc=rated",
      "/gradins/carte?mc=rated",
      "/gradins/les-votres?mc=rated",
    ]) {
      await gotoHydrated(page, path, "ar");
      await page.waitForTimeout(800);
      await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
      const spaced = await page.evaluate(() => {
        const found: string[] = [];
        for (const element of document.querySelectorAll("main *")) {
          if (element.closest("svg")) continue;
          const own = [...element.childNodes].some(
            (node) => node.nodeType === 3 && (node.textContent ?? "").trim(),
          );
          if (!own) continue;
          const spacing = getComputedStyle(element).letterSpacing;
          if (spacing !== "normal" && parseFloat(spacing) !== 0) {
            found.push(`${element.tagName.toLowerCase()} ${spacing}`);
          }
        }
        return found;
      });
      expect(spaced, `letter-spacing on Arabic text at ${path}`).toEqual([]);
    }
    // G2 and G3 carry the kit's back pill: at the right edge in Arabic
    const back = page.getByRole("link", { name: copy("ar", "common.back") }).first();
    const box = (await back.boundingBox())!;
    expect(box.x + box.width / 2).toBeGreaterThan(195);
  });

  for (const lang of LANGS) {
    test(`${lang}: the card's Latin runs keep their tracking under the app's stylesheet, and its Arabic runs have none`, async ({
      page,
    }) => {
      // `html[dir="rtl"] * { letter-spacing: normal }` (src/styles.css) outranks a presentation
      // attribute: the card sets its tracking as an inline style, so LASTREET, « OVR », the serial
      // and the wordmark are tracked in the Arabic interface too, and the plaque was sized for it
      await page.setViewportSize({ width: 390, height: 844 });
      await start(page, lang);
      await gotoHydrated(page, "/gradins/carte?mc=homa", lang);
      const stage = page.getByTestId("gradins-stage");
      await expect(stage).toHaveAttribute("data-mc-ready", "1");
      await expect(page.locator("html")).toHaveAttribute("dir", lang === "ar" ? "rtl" : "ltr");
      const runs = await stage.evaluate((root) =>
        [...root.querySelectorAll("svg text")].map((node) => ({
          text: node.textContent ?? "",
          tier: node.hasAttribute("data-tier"),
          ovrLabel: node.hasAttribute("data-ovrlabel"),
          serial: node.getAttribute("data-meta") === "serial",
          spacing: parseFloat(getComputedStyle(node).letterSpacing) || 0,
        })),
      );
      const only = (pick: (run: (typeof runs)[number]) => boolean, what: string) => {
        const found = runs.filter(pick);
        expect(found.length, what).toBeGreaterThan(0);
        return found;
      };
      for (const run of only((r) => r.tier, "the tier word")) {
        expect(run.text).toBe("LASTREET");
        expect(run.spacing, "LASTREET is tracked").toBeGreaterThan(0);
      }
      for (const run of only((r) => r.ovrLabel, "« OVR »")) {
        expect(run.spacing, "« OVR » is tracked").toBeGreaterThan(0);
      }
      for (const run of only((r) => r.serial, "the serial")) {
        expect(run.spacing, "the serial is tracked").toBeGreaterThan(0);
      }
      for (const run of only((r) => r.text === "BOTOLAGO", "the wordmark")) {
        expect(run.spacing, "the wordmark is tracked").toBeGreaterThan(0);
      }
      // Arabic script is never tracked: spacing breaks the joins
      for (const run of runs.filter((r) => /\p{Script=Arabic}/u.test(r.text))) {
        expect(run.spacing, `Arabic run ${run.text}`).toBe(0);
      }
    });
  }

  test("with motion reduced nothing runs, there is no replay beat button, and the hero still shows and acknowledges", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await start(page, "fr");
    await emulateReducedMotion(page);
    // the hero first: one per session, so before any other Gradins page is opened
    await gotoHydrated(page, "/gradins?mc=rated", "fr");
    const hero = page.locator("[data-hero-kind]");
    await expect(hero).toHaveCount(1);
    await expect(page.getByTestId("hero-card")).toBeVisible();
    await expectNoAnimations(page, "/gradins");
    await spyAcks(page);
    await page
      .getByRole("button", { name: copy("fr", "common.close") })
      .first()
      .click();
    await expect.poll(() => acks(page)).toHaveLength(1);
    for (const path of ["/gradins/carte?mc=rated", "/gradins/saisons?mc=rated"]) {
      await gotoHydrated(page, path, "fr");
      await page.waitForTimeout(1_000);
      expect(
        await page.evaluate(() => document.getAnimations().length),
        `animations at ${path}`,
      ).toBe(0);
    }
    // the replay « beat » buttons are for motion; the list of moments (« Vos moments ») stays
    await expect(
      page.getByRole("button", {
        name: copy("fr", "card.onboarding.m4.sheet.replay"),
        exact: true,
      }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("heading", { name: copy("fr", "gradins.revoir.title") }),
    ).toBeVisible();
  });

  test.describe("with motion on", () => {
    test.use({ reducedMotion: "no-preference" });

    test("the number is never held back: at every frame its element is opaque and on top", async ({
      page,
    }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await start(page, "fr");
      // sample every frame from the first one: the opacity of the number and what lies at its centre
      await page.addInitScript(() => {
        const frames: { opacity: number; onTop: boolean }[] = [];
        (window as unknown as { __frames: typeof frames }).__frames = frames;
        const sample = () => {
          const number = [...document.querySelectorAll('[data-mc="ovr"]')].find(
            (node) => node.getBoundingClientRect().width > 60,
          );
          if (number) {
            let opacity = 1;
            for (
              let node: Element | null = number;
              node && node !== document.body;
              node = node.parentElement
            ) {
              opacity *= Number(getComputedStyle(node).opacity);
            }
            const box = number.getBoundingClientRect();
            const hit = document.elementFromPoint(
              box.left + box.width / 2,
              box.top + box.height / 2,
            );
            frames.push({ opacity, onTop: !!hit && (hit === number || number.contains(hit)) });
          }
          requestAnimationFrame(sample);
        };
        requestAnimationFrame(sample);
      });
      // the first rating's beat on the hero, then the guest's `make` beat on the stage
      await gotoHydrated(page, "/gradins?mc=rated", "fr");
      await page.waitForTimeout(2_500);
      const frames = await page.evaluate(
        () => (window as unknown as { __frames: { opacity: number; onTop: boolean }[] }).__frames,
      );
      expect(frames.length, "frames with the card drawn").toBeGreaterThan(10);
      expect(frames.filter((frame) => frame.opacity < 1)).toEqual([]);
      expect(frames.filter((frame) => !frame.onTop)).toEqual([]);
    });
  });

  test("an unknown number is a dash that is announced, never a 0", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await start(page, "fr");
    await gotoHydrated(page, "/gradins?mc=forming1", "fr");
    const line = page.getByTestId("gradins-rating-line");
    await expect(line).toBeVisible();
    expect(await line.innerText()).not.toMatch(/\b0\b/);
    await expect(page.getByLabel(/pas encore de note/i).first()).toBeAttached();
  });
});

/**
 * The collectible's tilt and depth (plan 8.2 and 8.3). The card is flat 2D at rest, so its text and
 * hairlines are rasterised once and stay crisp; with a mouse over it the layers lift into depth
 * (`preserve-3d`, the number layer on its own height) and the light follows the pointer; away from
 * it the card settles back to the flat stack. Under reduced motion none of it happens.
 */
test.describe("the card's tilt and depth", () => {
  const stageCard = (page: Page) => page.getByTestId("gradins-stage").locator(".mc-eclat");

  async function openCard(page: Page, { reduced = false }: { reduced?: boolean } = {}) {
    await page.setViewportSize({ width: 1280, height: 900 });
    await start(page, "fr");
    if (reduced) await emulateReducedMotion(page);
    await gotoHydrated(page, "/gradins/carte?mc=rated", "fr");
    const root = stageCard(page);
    await expect(root).toBeVisible();
    return root;
  }

  /** What the card computes right now: the stack's transforms and the light. */
  const depth = (page: Page) =>
    stageCard(page).evaluate((root) => {
      const style = (node: Element | null) => (node ? getComputedStyle(node) : null);
      const rims = [...root.querySelectorAll(".mc-rim")];
      return {
        light: getComputedStyle(root).getPropertyValue("--mc-ax").trim(),
        inline: (root as HTMLElement).style.getPropertyValue("--mc-ax"),
        classes: root.className,
        tilt: style(root.querySelector(".mc-eclat__tilt"))?.transform,
        tiltStyle: style(root.querySelector(".mc-eclat__tilt"))?.transformStyle,
        layers: [...root.querySelectorAll(".mc-l:not(.mc-rim)")].map(
          (layer) => getComputedStyle(layer).transform,
        ),
        rim: rims[0] ? getComputedStyle(rims[0]).transform : null,
        number: style(root.querySelector(".mc-l--num"))?.transform,
      };
    });

  /** The z translation of a computed `matrix3d(…)`, or null when the transform is not 3D. */
  const translateZ = (transform: string | undefined) => {
    const match = /^matrix3d\((.*)\)$/.exec(transform ?? "");
    return match ? Number(match[1]!.split(",")[14]) : null;
  };

  test.describe("with motion on", () => {
    test.use({ reducedMotion: "no-preference" });

    test("flat at rest, in depth under a mouse with the number still on top, flat again once it leaves", async ({
      page,
    }) => {
      const root = await openCard(page);
      await expectNoAnimations(page, "the card at rest, before any pointer");

      // at rest: no 3D tree, every layer plain, the first rim a 2D offset (the card's thickness)
      const rest = await depth(page);
      expect(rest.tilt).toBe("none");
      expect(rest.tiltStyle).not.toBe("preserve-3d");
      expect(rest.layers.length).toBeGreaterThanOrEqual(4);
      expect(rest.layers.filter((transform) => transform !== "none")).toEqual([]);
      expect(rest.rim).toMatch(/^matrix\(/);
      expect(rest.classes).not.toMatch(/mc-eclat--(active|idle|settle)/);

      // a mouse over the card: the light follows it, the tree is 3D, the number layer has height
      const box = (await root.boundingBox())!;
      await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.25);
      await page.mouse.move(box.x + box.width * 0.25, box.y + box.height * 0.3, { steps: 4 });
      await expect.poll(async () => (await depth(page)).tiltStyle).toBe("preserve-3d");
      await expect
        .poll(async () => translateZ((await depth(page)).number), { timeout: 4_000 })
        .toBeGreaterThan(0);
      const over = await depth(page);
      expect(over.classes).toContain("mc-eclat--active");
      expect(Number(over.inline)).toBeLessThan(0); // the pointer is on the leading half
      expect(over.tilt).toMatch(/^matrix3d\(/);

      // the number is still what a click at its centre lands on, in depth
      const hit = await page.evaluate(() => {
        const number = document.querySelector('[data-testid="gradins-stage"] [data-mc="ovr"]')!;
        const rect = number.getBoundingClientRect();
        const found = document.elementFromPoint(
          rect.left + rect.width / 2,
          rect.top + rect.height / 2,
        );
        return !!found && (found === number || number.contains(found));
      });
      expect(hit, "the number answers at its centre while the card is tilted").toBe(true);

      // away: it eases back to the flat stack
      await page.mouse.move(2, 2, { steps: 3 });
      await expect.poll(async () => (await depth(page)).tilt, { timeout: 4_000 }).toBe("none");
      const after = await depth(page);
      expect(after.layers.filter((transform) => transform !== "none")).toEqual([]);
      expect(after.classes).not.toMatch(/mc-eclat--(active|settle)/);
      await expectNoAnimations(page, "the card after the pointer has left");
    });
  });

  test("under reduced motion the card stays where it is: no light written, no 3D, no animation", async ({
    page,
  }) => {
    const root = await openCard(page, { reduced: true });
    const box = (await root.boundingBox())!;
    const before = await depth(page);
    await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.25);
    await page.mouse.move(box.x + box.width * 0.7, box.y + box.height * 0.6, { steps: 6 });
    await page.waitForTimeout(700);
    const after = await depth(page);
    expect(after.inline).toBe("");
    expect(after.light).toBe(before.light);
    expect(after.tilt).toBe("none");
    expect(after.classes).not.toMatch(/mc-eclat--(active|idle|settle)/);
    expect(after.layers.filter((transform) => transform !== "none")).toEqual([]);
    await expectNoAnimations(page, "the card with a pointer over it, reduced motion");
  });
});

test.describe("words and names", () => {
  const BANNED = [
    /\bpull\b/i,
    /\bpack\b/i,
    /level up/i,
    /monter de niveau/i,
    /débloquer/i,
    /tirage/i,
    /révélation/i,
    /officiel/i,
    /\bVIP\b/,
    /exclusif/i,
    /\brare\b/i,
    /collectionner/i,
    /dernière chance/i,
    /meilleure carte/i,
    /classement des cartes/i,
  ];

  for (const lang of LANGS) {
    test(`${lang}: no banned word, no name in a heading, no leading-zero serial, ·26 only for the founder`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await start(page, lang);
      for (const screen of SCREENS.filter((entry) => !entry.visitor)) {
        await gotoHydrated(page, screen.path, lang);
        await page.waitForTimeout(900);
        const text = await page.locator("main").first().innerText();
        for (const word of BANNED) expect(text, `${screen.id}: ${word}`).not.toMatch(word);
        expect(text, `${screen.id}: serial with a leading zero`).not.toMatch(/BOT #0\d/);
        const headings = await page.locator("main h1, main h2, main h3").allInnerTexts();
        for (const heading of headings) {
          expect(heading, `${screen.id}: a name in a heading`).not.toMatch(/\bAli\b/i);
        }
        // the founder mark and ·26 belong to the founder fixture and to no one else
        const founderWord = copy(lang, "card.onboarding.m9.heading");
        const isFounder = screen.path.includes("mc=founder");
        expect(text.includes(founderWord), `${screen.id}: the founder part`).toBe(isFounder);
        if (!isFounder) expect(text, `${screen.id}: ·26`).not.toContain("·26");
      }
    });
  }
});

test.describe("the tier ladder", () => {
  for (const lang of LANGS) {
    test(`${lang}: draws the five tiers as five different materials, with a dash and no number`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await start(page, lang);
      await gotoHydrated(page, "/gradins/carte?mc=rated", lang);
      const ladder = page.getByTestId("gradins-tier-ladder");
      await ladder.scrollIntoViewIfNeeded();
      const tokens = ladder.locator("li .mc-tok");
      await expect(tokens).toHaveCount(5);
      await expect(ladder.locator("li [data-mc-ready]")).toHaveCount(5);
      const drawn = await tokens.evaluateAll((nodes) =>
        nodes.map((node) => ({
          // the markup without what is unique to a draw: the id scope and the spoken label
          markup: node.innerHTML
            .replace(/mc-t-\d+/g, "T")
            .replace(/-m\d+(?=["')])/g, "")
            .replace(/aria-label="[^"]*"/g, ""),
          label: node.getAttribute("aria-label") ?? "",
          foil: node.innerHTML.includes("-foil"),
          numbers: [...node.querySelectorAll("text")].map((t) => t.textContent),
          opacity: getComputedStyle(node.closest("li > span") ?? node).opacity,
        })),
      );
      // five different tokens: LASTREET, STADE, PRO, CHAMPION, LEGEND each in its own material
      expect(new Set(drawn.map((d) => d.markup)).size).toBe(5);
      // the foil is CHAMPION's and LEGEND's alone
      expect(drawn.map((d) => d.foil)).toEqual([false, false, false, true, true]);
      for (const d of drawn) {
        expect(new Set(d.numbers), "a dash, never a rating").toEqual(new Set(["—"]));
        // no dimmed token: a dash under opacity falls below 3:1 on its shirt
        expect(d.opacity).toBe("1");
      }
      expect(drawn[0]!.label).toContain("LASTREET");
    });
  }
});

/**
 * G1's first screen on a phone (plan section 10: the card is 296 px wide and the line for the next
 * round has to clear the bottom bar). The card's width follows the window's height, between 232 and
 * 296 px, so the line ends 16 px or more above the bar at 390 x 844 and, at 360 x 740 where the
 * card is at its smallest, above the bar. The states are the ones whose lines differ: no number yet,
 * a number with the provisional pill, a founder, a tier change, the top and the lowest tier, no club,
 * a long Latin name and an Arabic name.
 */
const FIRST_SCREEN_STATES = [
  "forming1",
  "rated",
  "founder",
  "tierUp",
  "legend",
  "homa",
  "clubNull",
  "longNameLatin",
  "arabicName",
];
const FIRST_SCREEN_PHONES = [
  { width: 390, height: 844, clearance: 16 },
  { width: 360, height: 740, clearance: 0 },
];

test.describe("G1 says what happens next", () => {
  for (const lang of LANGS) {
    for (const phone of FIRST_SCREEN_PHONES) {
      test(`${lang} at ${phone.width} x ${phone.height}: the rating, the identity and the next-round line clear the bottom bar by ${phone.clearance} px, in every state`, async ({
        page,
      }) => {
        await page.setViewportSize({ width: phone.width, height: phone.height });
        await start(page, lang);
        await withoutHero(page);
        for (const mc of FIRST_SCREEN_STATES) {
          const where = `${lang} ${phone.width} x ${phone.height} ${mc}`;
          await gotoHydrated(page, `/gradins?mc=${mc}`, lang);
          const glance = page.getByTestId("gradins-glance");
          await expect(glance, where).toBeVisible();
          await expect(glance, where).toHaveAttribute("href", "/fantasy/team");
          const box = (await glance.boundingBox())!;
          const nav = (await bar(page, lang).boundingBox())!;
          const rating = (await page.getByTestId("gradins-rating-line").boundingBox())!;
          const identity = (await page.getByTestId("gradins-identity-line").boundingBox())!;
          const people = (await page.getByTestId("gradins-people").boundingBox())!;
          const card = (await page.getByTestId("gradins-stage").boundingBox())!;
          // the line is one 44 px line, and clear of the bar: the card gave way for it
          expect(Math.round(box.height), where).toBe(44);
          expect(box.y + box.height, `${where}: the next-round line`).toBeLessThanOrEqual(
            nav.y - phone.clearance,
          );
          // the number, its tier and the pill are above it, and above the bar by as much
          expect(rating.y + rating.height, `${where}: the rating line`).toBeLessThanOrEqual(
            nav.y - phone.clearance,
          );
          expect(identity.y + identity.height, where).toBeLessThanOrEqual(box.y + 1);
          expect(box.y + box.height, where).toBeLessThanOrEqual(people.y + 1);
          // the card keeps its shape and stays between 232 and 296 px
          expect(card.width, `${where}: the card`).toBeGreaterThanOrEqual(231.5);
          expect(card.width, `${where}: the card`).toBeLessThanOrEqual(296.5);
          expect(card.height / card.width, `${where}: the card's shape`).toBeCloseTo(1.618, 1);
          if (mc === "rated") {
            // the state with a number and the provisional pill on its line
            await expect(page.getByTestId("gradins-rating-line"), where).toContainText(
              copy(lang, "card.provisional"),
            );
          }
        }
      });
    }
  }

  test("the card's width follows the window's height on a phone, between 232 and 296 px, and is 336 px from 768", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await start(page, "fr");
    await withoutHero(page);
    await gotoHydrated(page, "/gradins?mc=forming1", "fr");
    const stage = page.getByTestId("gradins-stage");
    const widthAt = async (width: number, height: number) => {
      await page.setViewportSize({ width, height });
      await settle(page);
      return (await stage.boundingBox())!.width;
    };
    // the plan's 296 px where the window has room for it, never wider
    expect(await widthAt(390, 1000)).toBeCloseTo(296, 0);
    expect(await widthAt(412, 915)).toBeCloseTo(296, 0);
    // less as the window gets shorter, down to 232 px, and no further
    const heights = [880, 844, 800, 760, 740, 700, 640, 568];
    const widths: number[] = [];
    for (const height of heights) widths.push(await widthAt(390, height));
    for (let i = 1; i < widths.length; i++) {
      expect(widths[i]!, `at ${heights[i]} px`).toBeLessThanOrEqual(widths[i - 1]! + 0.01);
    }
    expect(widths[0]!).toBeGreaterThan(widths[widths.length - 1]!);
    expect(widths[widths.length - 1]!).toBeCloseTo(232, 0);
    expect(await widthAt(390, 740)).toBeCloseTo(232, 0);
    // a narrow phone keeps 16 px each side, and a window as wide as a tablet's does not change it
    expect(await widthAt(320, 1000)).toBeCloseTo(288, 0);
    // from 768 px the card is 336 px whatever the height
    expect(await widthAt(768, 700)).toBeCloseTo(336, 0);
    expect(await widthAt(1440, 900)).toBeCloseTo(336, 0);
  });

  test("a season that is over has no such line", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await start(page, "fr");
    await gotoHydrated(page, "/gradins?mc=seasonClosed", "fr");
    await expect(page.getByTestId("gradins-owner")).toBeVisible();
    await expect(page.getByTestId("gradins-glance")).toHaveCount(0);
  });
});

test.describe("no heading is cut", () => {
  for (const lang of LANGS) {
    test(`${lang}: « ${copy(lang, "gradins.people.title")} » and the other headings of G1 are whole at 768, 1024, 1280 and 1440 px`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: 1440, height: 900 });
      await start(page, lang);
      await withoutHero(page);
      await gotoHydrated(page, "/gradins?mc=rated", lang);
      for (const width of [768, 1024, 1280, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        await settle(page);
        const title = page
          .getByTestId("gradins-people")
          .getByRole("heading", { name: copy(lang, "gradins.people.title") });
        await expect(title, `${lang} ${width}`).toBeVisible();
        const measured = await title.evaluate((heading) => {
          const range = document.createRange();
          range.selectNodeContents(heading);
          return {
            box: heading.getBoundingClientRect().width,
            need: range.getBoundingClientRect().width,
          };
        });
        expect(measured.need, `${lang} ${width}: the heading's text`).toBeLessThanOrEqual(
          measured.box + 0.5,
        );
        // and the way to the whole table is still there, whole, and a 44 px target
        const link = page.getByTestId("gradins-people").getByRole("link", {
          name: copy(lang, "gradins.people.view_league"),
        });
        const linkBox = (await link.boundingBox())!;
        const peopleBox = (await page.getByTestId("gradins-people").boundingBox())!;
        expect(linkBox.height, `${lang} ${width}`).toBeGreaterThanOrEqual(44);
        expect(linkBox.x, `${lang} ${width}: the link inside the block`).toBeGreaterThanOrEqual(
          peopleBox.x - 8.5,
        );
        expect(linkBox.x + linkBox.width, `${lang} ${width}`).toBeLessThanOrEqual(
          peopleBox.x + peopleBox.width + 0.5,
        );
        expect(await cutHeadings(page), `${lang} ${width}`).toEqual([]);
      }
    });

    for (const screen of SCREENS) {
      test(`${lang} ${screen.id}: no heading is cut at 320, 390, 768 and 1440 px`, async ({
        page,
      }) => {
        await page.setViewportSize({ width: 390, height: 900 });
        await start(page, lang, { signedIn: !screen.visitor });
        await gotoHydrated(page, screen.path, lang);
        await expect(page.locator("main").first()).toBeVisible();
        for (const width of [320, 390, 768, 1440]) {
          await page.setViewportSize({ width, height: 900 });
          await settle(page);
          expect(await cutHeadings(page), `${lang} ${width} ${screen.id}`).toEqual([]);
        }
      });
    }
  }
});

test.describe("the team page's born panel", () => {
  for (const lang of LANGS) {
    for (const mc of ["born0", "born0Serial"]) {
      test(`${lang} ${mc}: about 215 px, with the pitch's first row on the first screen at 390 x 844`, async ({
        page,
      }) => {
        await page.setViewportSize({ width: 390, height: 844 });
        await start(page, lang);
        await gotoHydrated(page, `/fantasy/team?mc=${mc}`, lang);
        const panel = page.getByTestId("card-born-panel");
        await expect(panel).toBeVisible();
        const measured = await page.evaluate(() => {
          const box = (selector: string) =>
            document.querySelector(selector)?.getBoundingClientRect() ?? null;
          const pitch = document.querySelector('[class*="--ui-pitch-bench"]');
          const first = pitch?.querySelector("button, a, [role='button']") ?? null;
          const nav = [...document.querySelectorAll("nav")]
            .map((node) => node.getBoundingClientRect())
            .find((rect) => rect.bottom >= innerHeight - 1 && rect.height > 40);
          return {
            panel: box('[data-testid="card-born-panel"]')?.height ?? 0,
            firstRowBottom: first?.getBoundingClientRect().bottom ?? Infinity,
            navTop: nav?.top ?? innerHeight,
          };
        });
        // the ceilings of the finish review: 295 px in French, 229 px in Arabic
        expect(measured.panel).toBeLessThanOrEqual(lang === "fr" ? 295 : 229);
        expect(measured.firstRowBottom).toBeLessThanOrEqual(measured.navTop);
        // the controls are 44 px, and the sentence on why now is the action's description
        for (const control of [
          page.getByTestId("card-born-panel-close"),
          page.getByTestId("invite-friends"),
        ]) {
          const box = (await control.boundingBox())!;
          expect(box.width).toBeGreaterThanOrEqual(44);
          expect(box.height).toBeGreaterThanOrEqual(44);
        }
        // the page's own round and the panel's rounds are the same story: 14, 15, 16
        await expect(panel).toContainText(lang === "fr" ? "J14, J15, J16" : "14");
      });
    }
  }
});

test.describe("one hero per session, acknowledged once", () => {
  test("the hub's « Nouveau », the M2 panel and a G1 hero in one session: only the panel expands, and it is acknowledged once", async ({
    page,
  }, testInfo) => {
    test.setTimeout(120_000);
    const diagnostics = observePage(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await start(page, "fr");

    // 1. the hub carries the badge for a moment that is waiting; it never opens it
    await gotoHydrated(page, "/fantasy?mc=born0", "fr");
    const block = page.getByTestId("hub-card-block");
    await expect(block).toContainText(copy("fr", "gradins.badge_new"));
    expect(await heroFlag(page), "the hub opens no hero").toBeNull();
    await spyAcks(page);

    // 2. the team page (by the app's own link): the M2 panel expands, the session flag is set
    await page.locator('a[href="/fantasy/team"]').first().click();
    const panel = page.getByTestId("card-born-panel");
    await expect(panel).toBeVisible();
    await expect(panel).not.toHaveAttribute("data-collapsed", "1");
    await expect.poll(() => heroFlag(page)).not.toBeNull();

    // two seconds with at least half of it on screen acknowledges it, in one call
    await expect.poll(() => acks(page), { timeout: 8_000 }).toEqual([["card_created"]]);

    // 3. Gradins, by the bottom bar: a hero was already shown, so none expands
    await bar(page, "fr")
      .getByRole("link", { name: copy("fr", "nav.gradins") })
      .click();
    await expect(page.getByTestId("gradins-owner")).toBeVisible();
    await expect(page.locator("[data-hero-kind]")).toHaveCount(0);
    await page.waitForTimeout(2_500);
    expect(await acks(page), "acknowledged once, however many surfaces met it").toEqual([
      ["card_created"],
    ]);

    // 4. back on the hub the badge is gone
    await bar(page, "fr")
      .getByRole("link", { name: copy("fr", "nav.fantasy") })
      .click();
    await expect(block).toBeVisible();
    await expect(block).not.toContainText(copy("fr", "gradins.badge_new"));
    await diagnostics.verify(testInfo);
  });

  test("Gradins first: the hero expands there, the × acknowledges once, and the team page then shows no panel", async ({
    page,
  }, testInfo) => {
    const diagnostics = observePage(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await start(page, "fr");
    await gotoHydrated(page, "/gradins?mc=born0", "fr");
    const hero = page.locator("[data-hero-kind]");
    await expect(hero).toHaveCount(1);
    await expect(hero).toHaveAttribute("data-hero-kind", "born_new");
    await spyAcks(page);
    expect(await acks(page)).toEqual([]);
    await page.getByTestId("card-born-panel-close").click();
    await expect.poll(() => acks(page)).toEqual([["card_created"]]);
    // the hero's label, lines and buttons collapse and the card stays
    await expect(page.getByTestId("card-born-panel")).toHaveAttribute("data-collapsed", "1");

    await bar(page, "fr")
      .getByRole("link", { name: copy("fr", "nav.fantasy") })
      .click();
    await page.locator('a[href="/fantasy/team"]').first().click();
    await expect(page).toHaveURL(/\/fantasy\/team/);
    await expect(page.getByTestId("card-born-panel")).toHaveCount(0);
    expect(await acks(page)).toEqual([["card_created"]]);
    await diagnostics.verify(testInfo);
  });

  test("a returning manager gets one coalesced hero and both keys are acknowledged in one call", async ({
    page,
  }, testInfo) => {
    const diagnostics = observePage(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await start(page, "fr");
    await gotoHydrated(page, "/gradins?mc=returning", "fr");
    const hero = page.locator("[data-hero-kind]");
    await expect(hero).toHaveCount(1);
    await expect(hero).toHaveAttribute("data-hero-kind", "first_coalesced");
    await spyAcks(page);
    await page
      .getByRole("button", { name: copy("fr", "common.close") })
      .first()
      .click();
    await expect.poll(() => acks(page)).toHaveLength(1);
    const [keys] = await acks(page);
    expect(keys).toHaveLength(2);
    expect(keys!.some((key) => key.startsWith("first_rating:"))).toBe(true);
    expect(keys!.some((key) => key.startsWith("provisional_cleared:"))).toBe(true);
    await diagnostics.verify(testInfo);
  });
});
