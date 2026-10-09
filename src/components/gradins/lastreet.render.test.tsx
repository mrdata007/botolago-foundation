import { afterAll, describe, expect, it, mock } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import type { ReactElement, ReactNode } from "react";
import { renderToStaticMarkup, renderToString } from "react-dom/server";

import type { MyCardDto } from "@/backend/manager-card/contracts";
import { FIXTURE_IDS, FIXTURES, type FixtureId } from "@/backend/manager-card/fixtures";
import { dictionaries, type TranslationKey } from "@/i18n/dictionaries";
import type { Gameweek, Language } from "@/types/domain";

import { cardLabel, cardStrings } from "@/components/manager-card/copy";
import { tierNode } from "@/components/manager-card/tier-node";
import { TIER_CODES, type HeroSpec, type ReplayItem } from "@/components/manager-card/types";
import { fromMyCard } from "@/components/manager-card/to-profile";

/**
 * LASTREET, the lowest tier's word (collectible-design plan section 11). The tier code stays `homa`; the
 * word reads « LASTREET » in both languages, never « HOMA » or «حومة», and in the Arabic interface
 * it sits in its own left-to-right box, so the Arabic text around it cannot move it.
 *
 * The screens are rendered on the server in the language under test: `useI18n` answers in that
 * language, the way `inline.test.tsx` stands it in. The module is put back once the file is done
 * (`src/test-isolation.test.ts`).
 */

const realI18n = { ...(await import("@/i18n/provider")) };
let language: Language = "fr";
mock.module("@/i18n/provider", () => ({
  ...realI18n,
  useI18n: () => {
    const real = realI18n.useI18n();
    const dictionary = dictionaries[language];
    return {
      ...real,
      lang: language,
      dir: language === "ar" ? "rtl" : "ltr",
      t: (key: TranslationKey) => dictionary[key],
    };
  },
}));
afterAll(() => {
  mock.module("@/i18n/provider", () => realI18n);
});

const { AuthProvider } = await import("@/auth/AuthProvider");
const { FantasyOwnedProvider } = await import("@/services/fantasy-owned-provider");
const { RatingLine } = await import("./CardStage");
const { TierLadder } = await import("./TierLadder");
const { LeagueRows } = await import("./LeagueRows");
const { buildRows } = await import("./people");
const { HistoryTable } = await import("./HistoryTable");
const { SeasonRack } = await import("./SeasonRack");
const { RevoirList } = await import("./RevoirList");
const { ThisRoundBlock } = await import("./ThisRoundBlock");
const { deriveReplayItems } = await import("./replay-items");
const { HubCardBlockView } = await import("@/components/manager-card/inline/HubCardBlock");
const { heroText, lineText, momentWords, replayView } =
  await import("@/components/manager-card/moments/moment-text");
const { TierWord } = await import("@/components/manager-card/tier-word");

const ROOT = join(import.meta.dir, "..", "..", "..");
const LANGUAGES: Language[] = ["fr", "ar"];
const BANNED_WORD = /HOMA|حومة/;
const BIDI_CONTROLS = /[⁦-⁩]/g;

async function render(node: ReactElement): Promise<string> {
  const router = createRouter({
    routeTree: createRootRoute({
      component: () => (
        <AuthProvider>
          <FantasyOwnedProvider>{node}</FantasyOwnedProvider>
        </AuthProvider>
      ),
    }),
    history: createMemoryHistory({ initialEntries: ["/gradins"] }),
  });
  await router.load();
  return renderToString(
    <QueryClientProvider client={new QueryClient()}>
      <realI18n.I18nProvider>
        <RouterProvider router={router} />
      </realI18n.I18nProvider>
    </QueryClientProvider>,
  )
    .replace(/<!-- -->/g, "")
    .replace(BIDI_CONTROLS, "");
}

const markup = (node: ReactNode) => renderToStaticMarkup(<>{node}</>);
/** The sentences of a moment, each rendered on its own (they are an array of nodes). */
const markupAll = (nodes: readonly ReactNode[]) => nodes.map(markup).join("");
const text = (html: string) =>
  html
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .replace(/&#x27;/g, "'");
/** « <bdi dir="ltr" translate="no" …>LASTREET</bdi> »: the word in its own left-to-right box. */
const ISOLATED = /<bdi dir="ltr" translate="no"[^>]*>LASTREET<\/bdi>/;
const isolatedCount = (html: string) => html.match(new RegExp(ISOLATED.source, "g"))?.length ?? 0;

const homa = FIXTURES.homa;
const homaCard = homa.card as MyCardDto;
const words = (lang: Language) =>
  momentWords((key: TranslationKey) => dictionaries[lang][key], lang);

const GAMEWEEK: Gameweek = {
  number: 8,
  deadline: new Date(Date.now() + 30 * 3_600_000).toISOString(),
  isCurrent: true,
  averagePoints: null,
  highestPoints: null,
  status: "open",
};

describe("the word", () => {
  it("reads LASTREET in both dictionaries, and « HOMA » and «حومة» are in no value of either", () => {
    expect(dictionaries.fr["card.tier.homa"]).toBe("LASTREET");
    expect(dictionaries.ar["card.tier.homa"]).toBe("LASTREET");
    for (const lang of LANGUAGES) {
      const offenders = Object.entries(dictionaries[lang]).filter(([, value]) =>
        BANNED_WORD.test(value),
      );
      expect(offenders, lang).toEqual([]);
    }
  });

  it("is the same word on a card's accessible label, the renderer's strings and the share art's input", () => {
    const profile = fromMyCard(homaCard, { sample: false });
    for (const lang of LANGUAGES) {
      const strings = cardStrings((key: TranslationKey) => dictionaries[lang][key], lang);
      expect(strings.tiers.homa).toBe("LASTREET");
      expect(cardLabel(profile, strings)).toContain("LASTREET");
      expect(cardLabel(profile, strings)).not.toMatch(BANNED_WORD);
    }
  });
});

describe("tierNode and TierWord", () => {
  it("wraps LASTREET in its own left-to-right box in French: dir, and no translation", () => {
    expect(markup(tierNode("homa", "LASTREET", "fr"))).toBe(
      '<bdi dir="ltr" translate="no">LASTREET</bdi>',
    );
  });

  it("gives it the display face in Arabic, whose Latin glyphs are Changa's, and no tracking", () => {
    const html = markup(tierNode("homa", "LASTREET", "ar"));
    expect(html).toMatch(ISOLATED);
    expect(html).toContain("--ui-font-display");
    // `html[dir="rtl"] *` sets `letter-spacing: normal`, so the box asks for none.
    expect(html).not.toContain("tracking");
  });

  it("leaves the other four tiers as plain words, in either language", () => {
    for (const lang of LANGUAGES) {
      for (const tier of TIER_CODES.filter((code) => code !== "homa")) {
        const word = dictionaries[lang][`card.tier.${tier}` as TranslationKey];
        expect(tierNode(tier, word, lang)).toBe(word);
      }
    }
  });

  it("renders from the dictionary of the interface's language", async () => {
    for (const lang of LANGUAGES) {
      language = lang;
      const html = await render(<TierWord tier="homa" />);
      expect(html).toMatch(ISOLATED);
      expect(html).not.toMatch(BANNED_WORD);
    }
    language = "ar";
    expect(await render(<TierWord tier="stade" />)).toContain("ملعب");
    expect(await render(<TierWord tier="stade" />)).not.toContain("<bdi");
    language = "fr";
  });
});

describe("in Arabic, LASTREET sits in a bdi dir=ltr", () => {
  it("in the rating line under the card", async () => {
    language = "ar";
    const html = await render(
      <RatingLine
        ovr={61}
        tier="homa"
        provisional={false}
        counted={3}
        min={3}
        formingLabel={dictionaries.ar["gradins.card.tier_none"]}
      />,
    );
    expect(html).toMatch(ISOLATED);
    expect(text(html)).toContain("61");
    expect(text(html)).toContain("LASTREET");
    expect(html).not.toMatch(BANNED_WORD);
  });

  it("in « Votre palier »: the first of the five labels, and no other label is isolated", async () => {
    language = "ar";
    const html = await render(<TierLadder card={homaCard} />);
    const items = [...html.matchAll(/<li\b[\s\S]*?<\/li>/g)].map((match) => match[0]);
    expect(items).toHaveLength(5);
    expect(items[0]).toMatch(ISOLATED);
    for (const item of items.slice(1)) expect(item).not.toMatch(ISOLATED);
    expect(text(html)).toContain("LASTREET");
    expect(html).not.toMatch(BANNED_WORD);
  });

  it("in a moment's heading (the first rating folded into today's, and a first time at a tier)", () => {
    const ar = words("ar");
    const coalesced: HeroSpec = {
      kind: "first_coalesced",
      keys: [],
      beat: null,
      gameweekSeq: 7,
      tier: null,
      first: { ovr: 61, gameweekSeq: 3 },
    };
    const label = markup(heroText(coalesced, homaCard, ar).label);
    expect(label).toMatch(ISOLATED);
    expect(label).toContain('<bdi dir="ltr">61</bdi>');

    const item: ReplayItem = {
      kind: "tier",
      seasonId: homaCard.season.id,
      gameweekSeq: 7,
      tier: "homa",
      beat: "tier",
      row: null,
    };
    const title = markup(replayView(item, homaCard, ar).title);
    expect(title).toMatch(ISOLATED);
    expect(title).not.toMatch(BANNED_WORD);
  });

  it("in the lines that state a fall, the season's end and the replay's sentence", () => {
    const ar = words("ar");
    const fell = { ...homaCard, tier: "homa" as const, bestTier: "stade" as const };
    const down = markup(lineText("tier_down", fell, ar));
    expect(down).toMatch(ISOLATED);
    // The best tier is an Arabic word, plain.
    expect(down).toContain("ملعب");
    const closed: HeroSpec = {
      kind: "season_closed",
      keys: [],
      beat: null,
      gameweekSeq: null,
      tier: "homa",
      first: null,
    };
    expect(markupAll(heroText(closed, homaCard, ar).lines)).toMatch(ISOLATED);
  });

  it("on the hub block, the league table, the history table, the season rack and « Revoir »", async () => {
    language = "ar";
    const hub = await render(<HubCardBlockView card={homaCard} gameweek={GAMEWEEK} />);
    expect(isolatedCount(hub)).toBeGreaterThanOrEqual(1);

    const rated = FIXTURES.rated;
    const rows = buildRows(rated.league!.standings, rated.league!.members, rated.card!.teamId);
    const table = await render(<LeagueRows rows={rows} caption="x" head onOpen={() => {}} />);
    // HAMZA's card is LASTREET: the dot before the word stays outside the box.
    expect(table).toMatch(/OVR<\/bdi> · <bdi dir="ltr" translate="no"[^>]*>LASTREET<\/bdi>/);

    const history = await render(<HistoryTable rows={homa.history} caption="x" />);
    expect(isolatedCount(history)).toBeGreaterThanOrEqual(1);

    const rack = await render(<SeasonRack card={homaCard} seasons={homaCard.seasons} size={44} />);
    expect(rack).toMatch(/ · <bdi dir="ltr" translate="no"[^>]*>LASTREET<\/bdi>/);

    const items: ReplayItem[] = [
      ...deriveReplayItems(homaCard, homa.history),
      {
        kind: "tier",
        seasonId: homaCard.season.id,
        gameweekSeq: 7,
        tier: "homa",
        beat: "tier",
        row: null,
      },
    ];
    const revoir = await render(<RevoirList items={items} card={homaCard} onOpen={() => {}} />);
    expect(isolatedCount(revoir)).toBe(1);

    const round = await render(
      <ThisRoundBlock
        block={{ kind: "closed", season: "2026/27", ovr: 61, tier: "homa" }}
        composeLabel="x"
      />,
    );
    expect(round).toMatch(ISOLATED);
    expect(round).toContain('<bdi dir="ltr">61</bdi>');
  });
});

describe("in French, the same word, plain in the sentence", () => {
  it("shows « 63 OVR · LASTREET » and « Première fois LASTREET »", async () => {
    language = "fr";
    const rated = FIXTURES.rated;
    const rows = buildRows(rated.league!.standings, rated.league!.members, rated.card!.teamId);
    const table = await render(<LeagueRows rows={rows} caption="x" head onOpen={() => {}} />);
    expect(text(table)).toContain("63 OVR · LASTREET");
    const item: ReplayItem = {
      kind: "tier",
      seasonId: homaCard.season.id,
      gameweekSeq: 7,
      tier: "homa",
      beat: "tier",
      row: null,
    };
    expect(text(markup(replayView(item, homaCard, words("fr")).title))).toBe(
      "Première fois LASTREET · J7",
    );
  });
});

describe("no HOMA and no «حومة» in any rendered card copy", () => {
  it("not on any fixture's card, in either language: the ladder, the rating line, the hub, « Revoir », the round, the sentences", async () => {
    let words_ = 0;
    let isolated = 0;
    for (const lang of LANGUAGES) {
      language = lang;
      const w = words(lang);
      for (const id of FIXTURE_IDS as readonly FixtureId[]) {
        const fixture = FIXTURES[id];
        const card = fixture.card;
        if (!card) continue;
        const screens: string[] = [
          await render(<TierLadder card={card} />),
          await render(<HubCardBlockView card={card} gameweek={GAMEWEEK} />),
          await render(
            <RevoirList
              items={deriveReplayItems(card, fixture.history)}
              card={card}
              onOpen={() => {}}
            />,
          ),
          await render(
            <RatingLine
              ovr={card.ovr}
              tier={card.tier}
              provisional={card.provisional}
              counted={card.gameweeksCounted}
              min={card.minRated}
              formingLabel="x"
            />,
          ),
          await render(<HistoryTable rows={fixture.history} caption="x" />),
          await render(<SeasonRack card={card} seasons={card.seasons} size={44} />),
        ];
        if (fixture.league) {
          const rows = buildRows(fixture.league.standings, fixture.league.members, card.teamId);
          screens.push(await render(<LeagueRows rows={rows} caption="x" head />));
        }
        for (const tier of TIER_CODES) {
          const word = markup(w.tierWord(tier));
          screens.push(word);
          const item: ReplayItem = {
            kind: "tier",
            seasonId: card.season.id,
            gameweekSeq: 5,
            tier,
            beat: "tier",
            row: null,
          };
          screens.push(markup(replayView(item, card, w).title));
          screens.push(markupAll(replayView(item, card, w).lines));
          screens.push(
            markupAll(
              heroText(
                {
                  kind: "season_closed",
                  keys: [],
                  beat: null,
                  gameweekSeq: null,
                  tier,
                  first: null,
                },
                card,
                w,
              ).lines,
            ),
          );
        }
        screens.push(markup(lineText("tier_down", { ...card, tier: "homa", bestTier: "pro" }, w)));
        screens.push(
          cardLabel(
            fromMyCard(card, { sample: false }),
            cardStrings((key: TranslationKey) => dictionaries[lang][key], lang),
          ),
        );
        for (const [index, html] of screens.entries()) {
          expect(html, `${lang} ${id} #${index}`).not.toMatch(BANNED_WORD);
          words_ += 1;
          isolated += isolatedCount(html);
        }
      }
    }
    language = "fr";
    // Not vacuous: the sweep did draw LASTREET, and every drawn one is in its box.
    expect(words_).toBeGreaterThan(500);
    expect(isolated).toBeGreaterThan(50);
  });

  it("every LASTREET a screen draws is in its box (none bare in a node), in either language", async () => {
    for (const lang of LANGUAGES) {
      language = lang;
      const screens = [
        await render(<TierLadder card={homaCard} />),
        await render(<HubCardBlockView card={homaCard} gameweek={GAMEWEEK} />),
        await render(<HistoryTable rows={homa.history} caption="x" />),
        await render(<SeasonRack card={homaCard} seasons={homaCard.seasons} size={44} />),
      ];
      for (const html of screens) {
        // A card's accessible label (spoken, in an `aria-label` or an `sr-only` span) keeps the bare
        // word; every word laid out on the screen is in its box.
        const body = html
          .replace(/(?:aria-label|title)="[^"]*"/g, "")
          .replace(/<span class="sr-only">[^<]*<\/span>/g, "");
        const rest = body.replace(new RegExp(ISOLATED.source, "g"), "");
        const at = rest.indexOf("LASTREET");
        expect(at < 0 ? "" : rest.slice(Math.max(0, at - 160), at + 60), lang).toBe("");
      }
    }
    language = "fr";
  });
});

describe("the screens print a tier's word only through TierWord or tierNode", () => {
  function sourcesIn(directory: string, only?: RegExp): { name: string; text: string }[] {
    return readdirSync(join(ROOT, directory), { withFileTypes: true })
      .filter(
        (entry) => entry.isFile() && /\.tsx?$/.test(entry.name) && !/\.test\./.test(entry.name),
      )
      .filter((entry) => !only || only.test(entry.name))
      .map((entry) => ({
        name: `${directory}/${entry.name}`,
        text: readFileSync(join(ROOT, directory, entry.name), "utf8"),
      }));
  }
  const files = [
    ...sourcesIn("src/components/gradins"),
    ...sourcesIn("src/components/manager-card/inline"),
    ...sourcesIn("src/components/manager-card/moments", /^moment-text\.tsx$/),
  ];

  it("reads `.tier[…]` (the strings) only as the word handed to tierNode", () => {
    expect(files.length).toBeGreaterThan(20);
    for (const { name, text: source } of files) {
      const all = source.match(/\.tiers?\[/g)?.length ?? 0;
      const handed = source.match(/tierNode\(\s*[\w.]+,\s*[\w.]+\.tiers?\[[^\]]+\]/g)?.length ?? 0;
      expect(all, name).toBe(handed);
    }
  });
});
