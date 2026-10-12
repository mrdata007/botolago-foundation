import { afterAll, describe, expect, it, mock } from "bun:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import type { ReactElement } from "react";
import { renderToString } from "react-dom/server";

import { dictionaries, type TranslationKey } from "@/i18n/dictionaries";
import type { Language } from "@/types/domain";

/**
 * The ranking, rendered on the server in each language the way `lastreet.render.test.tsx` does it:
 * `useI18n` answers in the language under test. The module is put back once the file is done.
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

const { RankingView } = await import("./RankingView");
const { buildRanking, RANKING_LIMIT } = await import("./ranking");
const { SAMPLE_CARDS, SAMPLE_OWN_ID } = await import("./sample-data");

import type { RankingViewProps } from "./RankingView";

const BIDI_CONTROLS = /[⁦-⁩]/g;
const sample = buildRanking(SAMPLE_CARDS, SAMPLE_OWN_ID);
const LEAGUES = [
  { id: "league-1", name: "Les Aigles" },
  { id: "league-2", name: "Bureau" },
];

async function render(props: Partial<RankingViewProps> = {}): Promise<string> {
  const node: ReactElement = (
    <div dir={language === "ar" ? "rtl" : "ltr"}>
      <RankingView
        scope="league"
        onScope={() => {}}
        leagues={LEAGUES}
        leagueId="league-1"
        onLeague={() => {}}
        ranking={sample}
        status="ready"
        limit={RANKING_LIMIT}
        onRetry={() => {}}
        {...props}
      />
    </div>
  );
  const router = createRouter({
    routeTree: createRootRoute({ component: () => node }),
    history: createMemoryHistory({ initialEntries: ["/curva/classement"] }),
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

const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
const rows = (html: string) => [...html.matchAll(/<li [^>]*data-team="[^"]+"[^>]*>/g)];

for (const lang of ["fr", "ar"] as const) {
  describe(`ranking, ${lang}`, () => {
    const dir = lang === "ar" ? "rtl" : "ltr";

    it(`draws inside a ${dir} box with the title-less list in order`, async () => {
      language = lang;
      const html = await render();
      expect(html).toContain(`dir="${dir}"`);
      expect(rows(html)).toHaveLength(8);
      const ranks = [...html.matchAll(/data-rank="(\d+)"/g)].map((match) => Number(match[1]));
      expect(ranks).toEqual([1, 1, 3, 4, 5, 5]);
    });

    it("lists the rated managers before the unrated ones", async () => {
      language = lang;
      const html = await render();
      const rated = html.indexOf('data-testid="curva-ranking-rated"');
      const unrated = html.indexOf('data-testid="curva-ranking-unrated"');
      expect(rated).toBeGreaterThan(-1);
      expect(unrated).toBeGreaterThan(rated);
      expect(html.slice(unrated)).toContain("Mehdi");
      expect(html.slice(0, unrated)).not.toContain("Mehdi");
    });

    it("shows the filled-statistics count of an unrated card as 2/4", async () => {
      language = lang;
      expect(text(await render()).replace(/\s*\/\s*/g, "/")).toContain("2/4");
    });

    it("shows the provisional badge once and highlights the reader's own row", async () => {
      language = lang;
      const html = await render();
      expect(text(html).split(dictionaries[lang]["card.provisional"]).length - 1).toBe(1);
      const own = html.match(/<li [^>]*data-own="true"[^>]*>/g) ?? [];
      expect(own).toHaveLength(1);
      expect(own[0]).toContain(`data-team="${SAMPLE_OWN_ID}"`);
      expect(text(html)).toContain(dictionaries[lang]["curva.people.you"]);
    });

    it("shows names as given, with the club, the tier and the OVR", async () => {
      language = lang;
      const body = text(await render());
      expect(body).toContain("Youssef Benali");
      expect(body).toContain(lang === "ar" ? "الرجاء" : "Raja");
      expect(body).toContain(dictionaries[lang]["card.ovr"]);
      expect(body).toContain("91");
    });

    it("marks a missing statistic as waiting, never with a dash", async () => {
      language = lang;
      const html = await render();
      // Mehdi has 2 empty stats, Nadia 4, Hamza 1; Nadia and Mehdi also have no rank.
      expect((html.match(/data-waiting/g) ?? []).length).toBe(2 + 4 + 1 + 2);
      expect(html).toContain(dictionaries[lang]["curva_ranking.waiting"]);
      expect(text(html)).not.toMatch(/[—–]/);
    });

    it("never prints a team id or an e-mail", async () => {
      language = lang;
      const body = text(await render());
      expect(body).not.toMatch(/00000000-0000-4000/);
      expect(body).not.toContain("@");
    });

    it("uses logical properties only", async () => {
      language = lang;
      const html = await render();
      expect(html).not.toMatch(/class="[^"]*\b(?:pl|pr|ml|mr|left|right|text-left|text-right)-/);
    });

    it("has a view control and, with several leagues, the league chips", async () => {
      language = lang;
      const html = await render();
      expect(html).toContain('role="tablist"');
      expect(text(html)).toContain(dictionaries[lang]["curva_ranking.view.league"]);
      expect(text(html)).toContain(dictionaries[lang]["curva_ranking.view.all"]);
      expect(text(html)).toContain("Les Aigles");
      const single = await render({ leagues: [LEAGUES[0]!] });
      expect(text(single)).not.toContain("Bureau");
    });

    it("says how many managers « Tous » ranks", async () => {
      language = lang;
      const html = await render({ scope: "all" });
      expect(html).toContain('data-testid="ranking-all-note"');
      expect(text(html)).toContain("100");
      expect(await render()).not.toContain("ranking-all-note");
    });

    it("draws the loading, error, off, empty and no-league states", async () => {
      language = lang;
      const empty = buildRanking([], null);
      expect(await render({ status: "loading" })).toContain("curva-ranking-loading");
      expect(await render({ status: "error" })).toContain("curva-ranking-error");
      const off = await render({ status: "off" });
      expect(off).toContain("curva-ranking-off");
      expect(text(off)).toContain(dictionaries[lang]["curva_ranking.off"]);
      expect(await render({ ranking: empty })).toContain("curva-ranking-empty");
      expect(await render({ status: "no_league" })).toContain("curva-ranking-empty");
      expect(await render({ scope: "all", ranking: empty })).toContain(
        dictionaries[lang]["curva_ranking.empty.all"].slice(0, 12),
      );
    });

    it("keeps the unrated group when nobody is rated yet", async () => {
      language = lang;
      const noneRated = buildRanking(
        SAMPLE_CARDS.filter((card) => card.ovr === null),
        null,
      );
      const html = await render({ ranking: noneRated });
      expect(html).not.toContain("curva-ranking-rated");
      expect(html).toContain("curva-ranking-unrated");
      expect(text(html)).toContain(dictionaries[lang]["curva_ranking.none_rated"].slice(0, 12));
    });
  });
}

describe("ranking copy", () => {
  const keys = (Object.keys(dictionaries.fr) as TranslationKey[]).filter((key) =>
    key.startsWith("curva_ranking."),
  );

  it("exists in both languages under the same keys, none empty", () => {
    expect(keys.length).toBeGreaterThan(15);
    for (const key of keys) {
      expect(dictionaries.ar[key]?.trim()).toBeTruthy();
      expect(dictionaries.fr[key]?.trim()).toBeTruthy();
    }
    const arabicKeys = Object.keys(dictionaries.ar).filter((key) =>
      key.startsWith("curva_ranking."),
    );
    expect(arabicKeys.sort()).toEqual([...keys].sort());
  });

  it("keeps the same placeholders in both languages", () => {
    const placeholders = (value: string) =>
      [...value.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
    for (const key of keys) {
      expect(placeholders(dictionaries.ar[key]!)).toEqual(placeholders(dictionaries.fr[key]!));
    }
  });

  it("makes no claim about prizes or fun, and names no AI notice", () => {
    const banned =
      /prix|gagn|récompens|pour le fun|pour rire|juste pour|just for fun|no prize|جائز|مكاف|للمتعة|للتسلية|intelligence artificielle|\bIA\b|الذكاء الاصطناعي/i;
    for (const key of keys) {
      expect(dictionaries.fr[key]!).not.toMatch(banned);
      expect(dictionaries.ar[key]!).not.toMatch(banned);
    }
  });
});
