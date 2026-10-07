import { describe, expect, it } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { seasonsQuery, standingsQuery } from "@/services/football-queries";

/**
 * The article and Pronostics loaders read in the reader's language in the
 * browser (French on the server), so an Arabic reader's page finds its own
 * copy instead of waiting on a French one, then showing a skeleton while the
 * Arabic one loads. Source-level, like the match and club pins
 * (`match-page.option-a.test.tsx`): the routes need a router and a DOM.
 */
const code = (file: string) =>
  readFileSync(join(import.meta.dir, "..", file), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");

describe("the article page", () => {
  const route = code("routes/news.$articleId.tsx");

  it("reads an edition that is the same in every language in the reader's", () => {
    expect(route).toMatch(/const lang: NewsLanguage = sameEdition \? activeLanguage\(\) : "fr";/);
    expect(route).toContain('EDITION_ID.test(articleId) && getNewsDataMode() === "supabase"');
    expect(route).toContain("return { article, lang };");
  });

  it("seeds a page in the loader's language, or in either for the same edition", () => {
    expect(route).toMatch(
      /\(loaderData\.lang \?\? "fr"\) === lang \|\| sameEditionInEveryLanguage\(articleId\)/,
    );
    expect(route).toContain("initialData: initialArticle,");
  });

  it("starts the related rail on the navigation only, keyed by the edition alone", () => {
    expect(route).toContain("if (sameEdition && !preload) {");
    expect(route).toContain('queryKey: ["news", "related", articleId],');
    expect(route).not.toMatch(/\["news", "related", lang/);
  });
});

describe("the Pronostics page", () => {
  it("reads the journée in the reader's language and seeds only that language", () => {
    const route = code("routes/pronostics.index.tsx");
    expect(route).toContain("const options = roundQueryOptions(deps.journee, lang);");
    expect(route).toContain("lang: loaderData.lang");
    const hook = code("components/predictions/use-predictions-round.ts");
    expect(hook).toContain('const serverSeed = (seed?.lang ?? "fr") === lang ? seed : undefined;');
  });
});

describe("the top players page", () => {
  it("waits for the current gameweek before reading a stand-in one", () => {
    const route = code("routes/fantasy.top-players.tsx");
    expect(route).toContain("...topPlayersOfWeekQuery(currentGw),");
    expect(route).toContain(
      "enabled: currentGw > 0 && (gw !== null || !gwQ.isPending || gwQ.failureCount > 0),",
    );
  });
});

describe("the Classement tab", () => {
  it("warms the table in the browser, in the reader's language, for the season the page opens on", () => {
    const route = code("routes/matches.standings.tsx");
    expect(route).toContain("prefetchInBrowser(async () => {");
    expect(route).toContain("const lang = activeLanguage();");
    expect(route).toContain("await queryClient.ensureQueryData(seasonsQuery(lang));");
    // The same choice the page makes: the season asked for, else the current one, else the first.
    expect(route).toMatch(
      /seasons\.find\(\(candidate\) => candidate\.id === deps\.season\) \?\?\s*seasons\.find\(\(candidate\) => candidate\.isCurrent\) \?\?\s*seasons\[0\];\s*if \(season\) await queryClient\.ensureQueryData\(standingsQuery\(season, lang\)\);/,
    );
    // Under the keys the page reads: the builders' keys are the page's own.
    expect(route).toContain('queryKey: ["football", "seasons", lang]');
    expect(route).toContain('queryKey: ["football", "standings", season?.id, lang]');
    expect(seasonsQuery("ar").queryKey).toEqual(["football", "seasons", "ar"]);
    expect(standingsQuery({ id: "s1", competitionId: "c1" }, "ar").queryKey).toEqual([
      "football",
      "standings",
      "s1",
      "ar",
    ]);
  });
});

describe("Fantasy reads that are the same for everyone", () => {
  const read = (file: string) => readFileSync(join(import.meta.dir, "..", file), "utf8");
  const sources = (dir: string): string[] =>
    readdirSync(join(import.meta.dir, "..", dir), { withFileTypes: true }).flatMap((entry) => {
      const path = `${dir}/${entry.name}`;
      if (entry.isDirectory()) return sources(path);
      return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [path] : [];
    });

  it("are asked for under one key each, from one place", () => {
    const callers = (method: string) =>
      sources("routes")
        .concat(sources("components"), sources("services"), sources("lib"))
        .filter((file) => code(file).includes(`fantasyService.${method}(`));
    expect(callers("getFixtureDifficulty")).toEqual(["services/fantasy-queries.ts"]);
    expect(callers("getAvailableTopGameweeks")).toEqual(["services/fantasy-queries.ts"]);
    const queries = read("services/fantasy-queries.ts");
    expect(queries).toContain('queryKey: ["fantasy-fixture-difficulty"]');
    expect(queries).toContain('queryKey: ["fantasy-gameweeks-available"]');
  });

  it("are no longer kept under the old per-screen keys", () => {
    for (const file of sources("routes").concat(sources("components"))) {
      const source = code(file);
      expect({
        file,
        old: /"fixture-difficulty"|"top-gws"|key\("fixture-difficulty"\)/.test(source),
      }).toEqual({
        file,
        old: false,
      });
    }
  });
});
