import { expect, test, type Page } from "@playwright/test";
import { initializeLanguage } from "./support";

/**
 * BG-0076 — the branded plate that replaces an empty hero block.
 *
 * Run against the real production dataset, where published French editions
 * have no `hero_asset_id` at all and roughly a third of the Arabic ones do
 * not either. The assertions are measurements, not screenshots:
 *
 *   1. zero empty media boxes — every hero-sized box either shows a decoded
 *      photo or shows the plate with its category photo actually painted in it;
 *   2. zero layout shift — the same page is loaded twice, once normally and
 *      once with every remote image aborted so that *every* hero falls back,
 *      and each card's and each media box's computed box must be identical;
 *   3. no horizontal overflow — `scrollWidth === clientWidth`, and, because
 *      `html, body { overflow-x: clip }` hides an overflow from scrollWidth
 *      entirely, also no element box reaching past the viewport (deliberate
 *      `overflow-x-auto` rails excluded);
 *   4. Arabic genuinely mirrors — the side-by-side card puts its media at the
 *      inline end, the left edge under `dir="rtl"`, not in the middle.
 *
 * The pull-request gate runs it against the mock data of a server without a
 * `.env`; pass B's aborted images make every hero fall back there too.
 */

const VIEWPORTS = [
  { name: "390", width: 390, height: 844 },
  { name: "1280", width: 1280, height: 900 },
] as const;

const LANGUAGES = ["fr", "ar"] as const;
const THEMES = ["light", "dark"] as const;
const ROUTES = ["/", "/news"] as const;

type MediaProbe = {
  state: string;
  box: [number, number, number, number];
  /** Whether anything is actually painted: a decoded photo or the plate. */
  painted: boolean;
  /** Why not, when `painted` is false — carried into the failure message. */
  reason: string;
};

async function applyTheme(page: Page, theme: (typeof THEMES)[number]) {
  await page.evaluate((mode) => {
    document.documentElement.classList.toggle("dark", mode === "dark");
  }, theme);
}

async function settle(page: Page) {
  await page.waitForLoadState("networkidle");
  await page.locator("main").first().waitFor({ state: "visible" });
  // One frame after the last paint, so freshly decoded images report a
  // naturalWidth and the fallback has been laid out.
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
}

/** Every hero-sized media box on the page, with what is actually painted in it. */
async function probeMedia(page: Page): Promise<MediaProbe[]> {
  return page.evaluate(() => {
    const round = (value: number) => Math.round(value * 100) / 100;
    return [...document.querySelectorAll("main [data-media-state]")].map((node) => {
      const box = node.getBoundingClientRect();
      const state = node.getAttribute("data-media-state") ?? "";
      const photo = node.querySelector("img:not([data-article-hero-photo])");
      const plate = node.querySelector("[data-article-hero-fallback]");
      const platePhoto = node.querySelector("img[data-article-hero-photo]");

      let painted = false;
      let reason = "";
      if (state === "image") {
        const decoded = photo instanceof HTMLImageElement && photo.naturalWidth > 0;
        painted = decoded;
        reason = decoded ? "" : "state=image but no decoded photo";
      } else {
        const plateBox = plate?.getBoundingClientRect();
        const markBox = platePhoto?.getBoundingClientRect();
        const marked =
          platePhoto instanceof HTMLImageElement &&
          platePhoto.naturalWidth > 0 &&
          !!markBox &&
          markBox.width > 0 &&
          markBox.height > 0;
        const grounded =
          !!plateBox &&
          plateBox.width > 0 &&
          plateBox.height > 0 &&
          getComputedStyle(plate!).backgroundImage.includes("linear-gradient");
        painted = marked && grounded;
        if (!plate) reason = "placeholder with no plate: an empty block";
        else if (!grounded) reason = "plate present but not filled/painted";
        else if (!marked) reason = "plate painted but its category photo did not render";
      }

      return {
        state,
        box: [round(box.x), round(box.y), round(box.width), round(box.height)] as [
          number,
          number,
          number,
          number,
        ],
        painted,
        reason,
      };
    });
  });
}

/** Card and media geometry, in DOM order — the layout-shift fingerprint. */
async function probeGeometry(page: Page) {
  return page.evaluate(() => {
    const round = (value: number) => Math.round(value * 100) / 100;
    const boxOf = (node: Element) => {
      const box = node.getBoundingClientRect();
      return [round(box.width), round(box.height)] as const;
    };
    return {
      cards: [...document.querySelectorAll('main a[href^="/news/"]')].map((node) => ({
        href: node.getAttribute("href"),
        size: boxOf(node),
      })),
      media: [...document.querySelectorAll("main [data-media-state]")].map((node) => boxOf(node)),
    };
  });
}

async function findOverflow(page: Page) {
  return page.evaluate(() => {
    const viewport = document.documentElement.clientWidth;
    const offenders: string[] = [];
    const inScroller = (node: Element) => {
      for (let parent = node.parentElement; parent; parent = parent.parentElement) {
        const overflowX = getComputedStyle(parent).overflowX;
        if (overflowX === "auto" || overflowX === "scroll") return true;
      }
      return false;
    };
    for (const node of document.querySelectorAll("main *")) {
      const box = node.getBoundingClientRect();
      if (box.width === 0 || box.height === 0) continue;
      if (box.left >= -1 && box.right <= viewport + 1) continue;
      if (inScroller(node)) continue;
      offenders.push(
        `${node.tagName.toLowerCase()}.${(node.className || "").toString().slice(0, 40)} spans ` +
          `${Math.round(box.left)}..${Math.round(box.right)} in ${viewport}px`,
      );
    }
    return offenders;
  });
}

for (const language of LANGUAGES) {
  for (const viewport of VIEWPORTS) {
    for (const theme of THEMES) {
      test(`${language} ${viewport.name}px ${theme}: no empty hero blocks, no shift`, async ({
        page,
      }, testInfo) => {
        await page.setViewportSize(viewport);
        await initializeLanguage(page, language);

        for (const route of ROUTES) {
          // ---- Pass A: the page as a visitor gets it today -------------
          await page.goto(route);
          await applyTheme(page, theme);
          await settle(page);

          await expect(page.locator("html")).toHaveAttribute(
            "dir",
            language === "ar" ? "rtl" : "ltr",
          );

          const media = await probeMedia(page);
          expect(
            media.length,
            `${route}: no media boxes found — nothing was measured`,
          ).toBeGreaterThan(0);

          const empty = media.filter((probe) => !probe.painted);
          await testInfo.attach(`media-${route.replace(/\W/g, "_")}-${theme}`, {
            body: Buffer.from(JSON.stringify({ total: media.length, media }, null, 2)),
            contentType: "application/json",
          });
          expect(
            empty.map((probe) => probe.reason),
            `${route}: empty media blocks`,
          ).toEqual([]);

          const before = await probeGeometry(page);
          expect(await findOverflow(page), `${route}: content past the viewport`).toEqual([]);
          expect(
            await page.evaluate(
              () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
            ),
            `${route}: horizontal page scroll`,
          ).toBeLessThanOrEqual(1);

          // ---- Pass B: every remote image fails ------------------------
          // Forces the plate into *every* hero box, including the ones that
          // had a photo in pass A, so the comparison below measures the
          // fallback against a real hero rather than against itself.
          await page.route("**/*", (route_) => {
            const url = new URL(route_.request().url());
            const remote = url.hostname !== "127.0.0.1" && url.hostname !== "localhost";
            if (route_.request().resourceType() === "image" && remote) return route_.abort();
            return route_.fallback();
          });
          await page.goto(route);
          await applyTheme(page, theme);
          await settle(page);

          const forced = await probeMedia(page);
          expect(
            forced.filter((probe) => probe.state !== "placeholder"),
            `${route}: a hero survived an aborted image`,
          ).toEqual([]);
          expect(
            forced.filter((probe) => !probe.painted).map((probe) => probe.reason),
            `${route}: empty media blocks with every image failing`,
          ).toEqual([]);

          const after = await probeGeometry(page);
          expect(after.media, `${route}: media box changed size under fallback`).toEqual(
            before.media,
          );
          expect(after.cards, `${route}: card box changed size under fallback`).toEqual(
            before.cards,
          );
          expect(await findOverflow(page), `${route}: fallback pushed content off-screen`).toEqual(
            [],
          );

          await page.unroute("**/*");
        }
      });
    }
  }
}

test.describe("BG-0076: Arabic mirrors rather than centring", () => {
  for (const viewport of VIEWPORTS) {
    test(`${viewport.name}px: the side-by-side card mirrors its media`, async ({ page }) => {
      const sideBySide = async (language: "fr" | "ar") => {
        await page.setViewportSize(viewport);
        await initializeLanguage(page, language);
        await page.goto("/news");
        await settle(page);
        return page.evaluate(() => {
          const rows: { atLeft: boolean; atRight: boolean; rtl: boolean }[] = [];
          for (const node of document.querySelectorAll("main [data-media-state]")) {
            const card = node.closest('a[href^="/news/"]');
            if (!card) continue;
            const media = node.getBoundingClientRect();
            const box = card.getBoundingClientRect();
            // Side-by-side variants only: the media occupies a minority of
            // the card's width. Full-bleed variants have no side to be on.
            if (media.width > box.width * 0.6) continue;
            const rtl = getComputedStyle(document.documentElement).direction === "rtl";
            rows.push({
              atLeft: Math.abs(media.left - box.left) < box.width * 0.2,
              atRight: Math.abs(media.right - box.right) < box.width * 0.2,
              rtl,
            });
          }
          return rows;
        });
      };

      // The Option A row (ArticleCard, 2026-09-24) puts the thumbnail at the
      // inline end in both directions; this still expected it at the start,
      // the earlier card's side, and failed on every run since.
      const fr = await sideBySide("fr");
      expect(fr.length, "no side-by-side card found in French").toBeGreaterThan(0);
      expect(fr.every((row) => row.atRight && !row.atLeft)).toBe(true);

      const ar = await sideBySide("ar");
      expect(ar.length, "no side-by-side card found in Arabic").toBeGreaterThan(0);
      expect(ar.every((row) => row.rtl)).toBe(true);
      // Mirrored, not centred: the media sits against the left edge.
      expect(ar.every((row) => row.atLeft && !row.atRight)).toBe(true);
    });
  }
});
