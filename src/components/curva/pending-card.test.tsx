import { afterAll, describe, expect, it, mock } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

import { FIXTURES } from "@/backend/manager-card/fixtures";
import { STAT_NULL_REASONS, type MyCardDto } from "@/backend/manager-card/contracts";
import { dictionaries, type TranslationKey } from "@/i18n/dictionaries";
import type { Language } from "@/types/domain";

import { statWaitText } from "@/components/manager-card/copy";
import { roundBlock } from "./curva-state";
import { hasFacts, ownStanding, pendingFacts, showsPendingPanel } from "./pending-card";
import type { PeopleRow } from "./people";

/**
 * The strip under a card with no number: the model (pure) and the markup in French and Arabic. The
 * markup is rendered on the server in the language under test, the way `lastreet.render.test.tsx`
 * stands `useI18n` in; the module is put back once the file is done.
 */
const realI18n = { ...(await import("@/i18n/provider")) };
let language: Language = "fr";
mock.module("@/i18n/provider", () => ({
  ...realI18n,
  useI18n: () => ({
    ...realI18n.useI18n(),
    lang: language,
    dir: language === "ar" ? "rtl" : "ltr",
    t: (key: TranslationKey) => dictionaries[language][key],
  }),
}));
afterAll(() => {
  mock.module("@/i18n/provider", () => realI18n);
});
const { PendingCardPanel } = await import("./PendingCardPanel");

const two: MyCardDto = {
  ...FIXTURES.insufficient3.card!,
  stats: {
    cap: { value: null, nullReason: "pre_captain_fix" },
    sel: { value: 99, nullReason: null },
    trf: { value: null, nullReason: "no_transfers" },
    con: { value: 99, nullReason: null },
  },
};
const zero = FIXTURES.born0.card!;
const rated = FIXTURES.rated.card!;
const block = (card: MyCardDto) => roundBlock(card, { gameweek: null, now: Date.now() });

const row = (rank: number, total: number, own: boolean): PeopleRow => ({
  standing: {
    managerId: own ? "me" : `m${rank}`,
    managerName: "M",
    teamName: "T",
    rank,
    previousRank: rank,
    gameweekScore: 1,
    totalScore: total,
  },
  card: null,
  own,
  name: "M",
});

const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

describe("when the panel is drawn", () => {
  it("draws it for a card with no number, and not for a rated one", () => {
    expect(showsPendingPanel(two, block(two))).toBe(true);
    expect(showsPendingPanel(zero, block(zero))).toBe(true);
    expect(showsPendingPanel(rated, block(rated))).toBe(false);
  });
  it("draws none for a season that is over or a new season showing last season's number", () => {
    expect(showsPendingPanel({ ...two, seasonClosed: true }, block(two))).toBe(false);
    const started = FIXTURES.seasonStarted.card!;
    expect(showsPendingPanel(started, block(started))).toBe(false);
  });
});

describe("short reasons", () => {
  const wait = { counted: 1, min: 3, listed: [5, 6, 7] };
  for (const lang of ["fr", "ar"] as const) {
    const t = (key: TranslationKey) => dictionaries[lang][key];
    it(`has a non-empty reason for every cause, in ${lang}`, () => {
      for (const reason of [...STAT_NULL_REASONS, null]) {
        const out = statWaitText(reason, wait, lang, t);
        expect(out.trim().length).toBeGreaterThan(0);
        expect(out).not.toContain("{");
      }
    });
  }
  const fr = (key: TranslationKey) => dictionaries.fr[key];
  it("names the journée that completes the count only while it is still to come", () => {
    expect(statWaitText("pending_minimum", wait, "fr", fr)).toBe("après J7");
    expect(statWaitText("pending_minimum", { ...wait, counted: 3 }, "fr", fr)).toBe("en attente");
    expect(statWaitText("pending_minimum", { ...wait, listed: [5] }, "fr", fr)).toBe("en attente");
  });
  it("never invents a number", () => {
    expect(statWaitText("no_transfers", wait, "fr", fr)).not.toMatch(/\d/);
  });
});

describe("facts", () => {
  it("are taken from the reader's own standing and nothing else", () => {
    const rows = [row(1, 300, false), row(2, 214, true), row(3, 100, false)];
    expect(ownStanding(rows)?.rank).toBe(2);
    expect(pendingFacts(two, rows)).toEqual({ points: 214, rank: 2, of: 3, counted: 3 });
  });
  it("leave out what is not known: no standings, no points and no rank", () => {
    const facts = pendingFacts(zero, []);
    expect(facts).toEqual({ points: null, rank: null, of: null, counted: null });
    expect(hasFacts(facts)).toBe(false);
  });
  it("do not repeat the journée counter while the card is still forming", () => {
    expect(pendingFacts(FIXTURES.forming1.card!, [row(1, 5, true)]).counted).toBeNull();
  });
});

describe("markup", () => {
  const facts = pendingFacts(two, [row(3, 214, true), row(1, 300, false)]);
  it("French: codes with their words, values, short reasons and facts", () => {
    language = "fr";
    const html = renderToStaticMarkup(
      <realI18n.I18nProvider>
        <PendingCardPanel card={two} facts={facts} />
      </realI18n.I18nProvider>,
    );
    const t = text(html);
    for (const word of ["Capitaine", "Titulaires", "Transferts", "Régularité"]) {
      expect(t).toContain(word);
    }
    expect(t).toContain("pas de transfert");
    expect(t).toContain("capitaine par défaut");
    expect(html).toContain('data-stat="sel"');
    // an empty statistic has no bare dash and no zero
    const cap = html.match(/data-stat="cap"[\s\S]*?<\/li>/)![0];
    expect(text(cap)).not.toContain("—");
    expect(text(cap)).not.toMatch(/\b0\b/);
    // the screen reader gets the full sentence for it
    expect(text(cap)).toContain("Capitaine : pas encore de valeur, journées au capitaine attribué");
    expect(t).toContain("Points Fantasy");
    expect(t).toContain("214");
  });
  it("Arabic: the same keys, the same cells, and no code said twice", () => {
    language = "ar";
    const html = renderToStaticMarkup(
      <realI18n.I18nProvider>
        <PendingCardPanel card={two} facts={facts} />
      </realI18n.I18nProvider>,
    );
    const t = text(html);
    for (const word of ["القائد", "التشكيلة", "الانتقالات", "الثبات"]) expect(t).toContain(word);
    expect(t).toContain("لا انتقالات");
    expect(html).not.toContain(">CAP<");
    expect(html.match(/data-stat=/g)).toHaveLength(4);
    expect(t).toContain("نقاط الفانتازي");
  });
  it("a new manager: four short reasons and no figure in the strip", () => {
    language = "fr";
    const html = renderToStaticMarkup(
      <realI18n.I18nProvider>
        <PendingCardPanel card={zero} facts={pendingFacts(zero, [])} />
      </realI18n.I18nProvider>,
    );
    expect(html).not.toContain("curva-pending-facts");
    const waits = [...html.matchAll(/data-testid="curva-pending-wait"[^>]*>([^<]*)</g)].map(
      (m) => m[1],
    );
    expect(waits).toHaveLength(4);
    for (const w of waits) expect(w).toBe(`après J${zero.ratingGameweeks![zero.minRated - 1]}`);
    expect(text(html)).not.toContain("—");
  });
  it("French and Arabic carry the same new keys", () => {
    const keys = Object.keys(dictionaries.fr).filter(
      (k) =>
        k.startsWith("card.wait.") ||
        k.startsWith("card.pending.") ||
        k.startsWith("card.stat_word."),
    );
    expect(keys.length).toBe(18);
    for (const k of keys) {
      expect(dictionaries.ar[k as TranslationKey]?.trim()).toBeTruthy();
      expect(dictionaries.fr[k as TranslationKey].trim()).toBeTruthy();
    }
  });
});
