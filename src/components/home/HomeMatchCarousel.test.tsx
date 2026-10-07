import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToString } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";

import { AuthProvider } from "@/auth/AuthProvider";
import { dictionaries } from "@/i18n/dictionaries";
import { I18nProvider } from "@/i18n/provider";
import type { Club, Match } from "@/types/domain";
import { CAROUSEL_MAX_DOTS, HomeMatchCarousel, type BandCard } from "./HomeMatchCarousel";

/**
 * The gameweek band's carousel (BG-0155), rendered the way the server renders
 * it (a memory router, the French dictionary, a signed-out reader, no votes
 * read yet), plus the house rules it must keep, read from its source.
 */

const ROOT = join(import.meta.dir, "..", "..", "..");
const fr = dictionaries.fr;
const ar = dictionaries.ar;

const club = (id: string, name: string): Club => ({
  id,
  name: { fr: name, ar: name },
  shortName: { fr: name, ar: name },
  city: { fr: "", ar: "" },
  primaryColor: "var(--ui-ink)",
  crestPlaceholder: name.slice(0, 3).toUpperCase(),
});
const HOME = club("uts", "UTS Rabat");
const AWAY = club("rsb", "RSB Berkane");

const card = (n: number, status: Match["status"] = "scheduled"): BandCard => ({
  match: {
    id: `00000020-0000-4000-8000-00000000000${n}`,
    gameweek: 3,
    homeClubId: HOME.id,
    awayClubId: AWAY.id,
    kickoff: `2026-10-0${n}T16:00:00.000Z`,
    status,
    minute: status === "live" ? 37 : undefined,
    homeScore: status === "live" ? 1 : undefined,
    awayScore: status === "live" ? 0 : undefined,
    venue: { fr: "", ar: "" },
  },
  home: HOME,
  away: AWAY,
});
const round = (count: number) => Array.from({ length: count }, (_, i) => card(i + 1));

/** The page was rendered before every card's kick-off. */
const RENDERED_AT = Date.parse("2026-10-01T00:00:00.000Z");

async function render(
  cards: readonly BandCard[],
  withVote = true,
  renderedAt = RENDERED_AT,
): Promise<string> {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const node = <HomeMatchCarousel cards={cards} withVote={withVote} renderedAt={renderedAt} />;
  // The auth provider sits inside the router, as in `__root.tsx`.
  const router = createRouter({
    routeTree: createRootRoute({ component: () => <AuthProvider>{node}</AuthProvider> }),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  await router.load();
  return renderToString(
    <QueryClientProvider client={client}>
      <I18nProvider>
        <RouterProvider router={router} />
      </I18nProvider>
    </QueryClientProvider>,
  ).replace(/<!-- -->/g, "");
}

const groups = (html: string) =>
  [...html.matchAll(/role="group" aria-roledescription="([^"]+)" aria-label="([^"]+)"/g)].map(
    (found) => ({ role: found[1], label: found[2] }),
  );
const indicator = (html: string) =>
  /data-testid="home-match-carousel-indicator"[^>]*>([\s\S]*?)<\/div>/.exec(html)?.[1] ?? "";

describe("HomeMatchCarousel — as the server renders it", () => {
  it("is a region named in the reader's language, described as a carousel", async () => {
    const html = await render(round(3));
    expect(html).toContain(
      `role="region" aria-roledescription="${fr["home.carousel.role"]}" aria-label="${fr["home.carousel.label"]}"`,
    );
  });

  it("makes each match a group that says where it stands: Match 2 sur 3", async () => {
    const html = await render(round(3));
    expect(groups(html)).toEqual([
      { role: fr["home.carousel.slide_role"], label: "Match 1 sur 3" },
      { role: fr["home.carousel.slide_role"], label: "Match 2 sur 3" },
      { role: fr["home.carousel.slide_role"], label: "Match 3 sur 3" },
    ]);
  });

  it("opens on the first card: one dot current, previous unavailable, next not", async () => {
    const html = await render(round(3));
    const dots = indicator(html).match(/<span class="block h-2[^"]*"/g) ?? [];
    expect(dots).toHaveLength(3);
    expect(dots.filter((dot) => dot.includes("w-5"))).toHaveLength(1);
    expect(dots[0]).toContain("w-5");
    // aria-disabled rather than disabled: the button keeps the focus it holds
    // when it reaches either end (review of 2026-10-06).
    expect(html).toMatch(
      new RegExp(`aria-label="${fr["home.carousel.previous"]}" aria-disabled="true"`),
    );
    expect(html).toMatch(
      new RegExp(`aria-label="${fr["home.carousel.next"]}" aria-disabled="false"`),
    );
    expect(html).not.toMatch(/<button[^>]* disabled=""/);
  });

  it("counts many cards as '1 / 8' instead of dots", async () => {
    const html = await render(round(8));
    expect(8).toBeGreaterThan(CAROUSEL_MAX_DOTS);
    const shown = indicator(html);
    expect(shown).not.toContain("block h-2");
    expect(shown.replace(/<[^>]+>/g, "")).toBe("1/8");
    // Numbers stay left to right inside Arabic lines (PRODUCT.md, Numbers):
    // the count is its own left-to-right run, so Arabic shows "1 / 8" too.
    expect(shown).toMatch(/^<span dir="ltr"/);
    expect(
      groups(html)
        .map((group) => group.label)
        .at(-1),
    ).toBe("Match 8 sur 8");
  });

  it("offers a way past the round: a skip link first, landing at the carousel's end", async () => {
    const html = await render(round(8));
    const skip = /<a href="#([^"]+)" class="sr-only focus:not-sr-only[^"]*">([^<]+)<\/a>/.exec(
      html,
    );
    expect(skip?.[2]).toBe(fr["home.carousel.skip"]);
    // Before the first card...
    expect(html.indexOf(skip![0])).toBeLessThan(html.indexOf('role="group"'));
    // ...landing after the last control, on a target the focus can take.
    const target = `<div id="${skip![1]}" tabindex="-1" class="outline-none"></div>`;
    expect(html).toContain(target);
    expect(html.indexOf(target)).toBeGreaterThan(
      html.indexOf(`aria-label="${fr["home.carousel.next"]}"`),
    );
  });

  it("has an empty polite status, ready to say which match previous or next brought", async () => {
    const html = await render(round(3));
    expect(html).toContain('<p aria-live="polite" aria-atomic="true" class="sr-only"></p>');
  });

  it("keeps the indicator for the eye only: each card's label carries the position", async () => {
    const html = await render(round(3));
    expect(html).toMatch(/<div aria-hidden="true" data-testid="home-match-carousel-indicator"/);
  });

  it("draws a live match as the split card and a match to come as the pick card", async () => {
    const html = await render([card(1, "live"), card(2), card(3)]);
    const slides = html.split('role="group"').slice(1);
    expect(slides).toHaveLength(3);
    // The live card: the hero frame (filling its slide), the live state, no vote.
    expect(slides[0]).toContain("relative h-full overflow-hidden");
    expect(slides[0]).toContain(fr["matches.status.live"]);
    expect(slides[0]).not.toContain("home-next-match");
    // The cards to come: the pick card filling its slide, its vote row held.
    for (const slide of slides.slice(1)) {
      expect(slide).toContain('data-testid="home-next-match"');
      expect(slide).toContain("flex flex-1 flex-col");
      expect(slide).toContain('data-testid="home-vote-hold"');
    }
  });

  it("holds no vote row on a card that cannot have a vote: kick-off past, or no journée", async () => {
    const noRound = card(3);
    const html = await render(
      [card(1), card(2), { ...noRound, match: { ...noRound.match, gameweek: 0 } }],
      true,
      // Rendered after the first card's kick-off (it has not gone live yet).
      Date.parse("2026-10-01T17:00:00.000Z"),
    );
    const slides = html.split('role="group"').slice(1);
    expect(slides[0]).not.toContain("home-vote-hold");
    expect(slides[1]).toContain("home-vote-hold");
    expect(slides[2]).not.toContain("home-vote-hold");
  });

  it("offers no vote row when the caller offers no vote", async () => {
    const html = await render(round(3), false);
    expect(html).not.toContain("home-vote-hold");
    expect(html).not.toContain("aria-pressed");
  });

  it("snaps natively, each card 88% wide so the next one peeks", async () => {
    const html = await render(round(3));
    expect(html).toContain("snap-x snap-mandatory");
    expect(groups(html)).toHaveLength(3);
    expect(html.match(/basis-\[88%\] snap-start/g)).toHaveLength(3);
    // Home's narrow centre column (lg to xl): a whole card, no peek.
    expect(html.match(/lg:basis-full xl:basis-\[88%\]/g)).toHaveLength(3);
  });
});

describe("HomeMatchCarousel — house rules", () => {
  const source = readFileSync(join(ROOT, "src/components/home/HomeMatchCarousel.tsx"), "utf8");
  const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

  it("uses no physical direction, so Arabic mirrors by itself", () => {
    expect(code).not.toMatch(
      /["'`\s](?:-?m[lr]|p[lr]|border-[lr]|rounded-[lr]|rounded-(?:tl|tr|bl|br)|text-(?:left|right)|float-(?:left|right)|left|right)-/,
    );
    expect(code).not.toMatch(/\brtl:/);
  });

  it("never moves on its own", () => {
    expect(code).not.toMatch(/setInterval|setTimeout|requestAnimationFrame/);
  });

  it("scrolls instantly under reduced motion, and never through CSS smooth scrolling", () => {
    expect(code).toContain('behavior: prefersReducedMotion() ? "auto" : "smooth"');
    expect(code.match(/"smooth"/g)).toHaveLength(1);
    expect(code).not.toContain("scroll-smooth");
  });

  it("brings the card that takes the focus into view", () => {
    expect(code).toContain("onFocus={() => bringIntoView(index)}");
  });

  it("reads votes for the card in view and its neighbours first, every card once idle or focused", () => {
    // Review of 2026-10-06: cards further on had no vote buttons in the tab
    // order or under a screen reader's cursor until swiped near.
    expect(code).toContain("votesEnabled={readAll || Math.abs(index - current) <= 1}");
    expect(code).toContain("useEffect(() => whenIdle(() => setReadAll(true)), []);");
    expect(code).toContain("onFocus={() => setReadAll(true)}");
  });

  it("holds a card's vote row only while a vote is expected", () => {
    // Once any read finds the game closed (or fails), no card holds it.
    expect(code).toContain("holdVote={!gameClosed && voteMayOpen(match, renderedAt)}");
    expect(code).toContain("onGameClosed={onGameClosed}");
  });

  it("announces the match a step brought, from the buttons only", () => {
    expect(code.match(/setAnnounced\(/g)).toHaveLength(1);
    const step = code.slice(code.indexOf("const step = (by"), code.indexOf("return (\n    <div"));
    expect(step).toContain("setAnnounced(");
    expect(step).toContain('t("home.carousel.announce")');
  });

  it("keeps previous and next focusable at either end, unavailable but not disabled", () => {
    // A disabled button drops the focus it holds, to the page's body.
    expect(code).not.toMatch(/(?<![-\w])disabled=\{/);
    expect(code).toContain("aria-disabled={current === 0}");
    expect(code).toContain("aria-disabled={current === count - 1}");
    expect(code).toContain('"aria-disabled:cursor-not-allowed aria-disabled:opacity-50"');
    // Pressed at either end, a step does nothing.
    expect(code).toMatch(/if \(target < 0 \|\| target >= count\) return;/);
  });

  it("shows previous and next from lg, and wherever the pointer is a mouse", () => {
    expect(code).toContain('"hidden lg:inline-grid pointer-fine:inline-grid"');
    expect(code).toContain("<ChevronLeft aria-hidden />");
    expect(code).toContain("<ChevronRight aria-hidden />");
  });

  it("describes its roles from the dictionaries, in French and Arabic", () => {
    expect(code).not.toMatch(/aria-roledescription="/);
    expect(code).toContain('aria-roledescription={t("home.carousel.role")}');
    expect(code).toContain('aria-roledescription={t("home.carousel.slide_role")}');
    for (const dictionary of [fr, ar]) {
      for (const key of [
        "home.carousel.label",
        "home.carousel.slide",
        "home.carousel.previous",
        "home.carousel.next",
        "home.carousel.role",
        "home.carousel.slide_role",
        "home.carousel.skip",
        "home.carousel.announce",
      ] as const) {
        expect(dictionary[key]).toBeTruthy();
      }
      expect(dictionary["home.carousel.slide"]).toContain("{n}");
      expect(dictionary["home.carousel.slide"]).toContain("{total}");
      expect(dictionary["home.carousel.role"]).not.toMatch(/^carousel$/i);
      for (const slot of ["{slide}", "{home}", "{away}"]) {
        expect(dictionary["home.carousel.announce"]).toContain(slot);
      }
    }
    expect(ar["home.carousel.slide"]).toMatch(/[؀-ۿ]/);
  });
});
