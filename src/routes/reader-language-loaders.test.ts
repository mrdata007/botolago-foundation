import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

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
