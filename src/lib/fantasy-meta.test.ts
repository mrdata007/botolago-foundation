import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { dictionaries, type TranslationKey } from "@/i18n/dictionaries";
import {
  FANTASY_PAGE_HEADS,
  FANTASY_PLAYER_ROUTE_ID,
  FANTASY_ROUTE_PAGES,
  fantasyHead,
  fantasyPageCopy,
  fantasyPlayerHead,
  fantasyShownCopy,
  shownHeadTitle,
  type FantasyPage,
} from "./fantasy-meta";

type Tag = Record<string, string | undefined>;
const PAGES = Object.keys(FANTASY_PAGE_HEADS) as FantasyPage[];
/** `t` as `useI18n()` gives it, in each language. */
const translate = {
  fr: (key: TranslationKey) => dictionaries.fr[key],
  ar: (key: TranslationKey) => dictionaries.ar[key],
} as const;

const tag = (head: { meta: Tag[] }, key: string, value: string) =>
  head.meta.find((entry) => entry[key] === value);
const titleOf = (head: { meta: Tag[] }) => head.meta.find((entry) => entry.title)?.title;
const contentOf = (head: { meta: Tag[] }, key: string, value: string) =>
  tag(head, key, value)?.content;

describe("Fantasy page heads (audit A17)", () => {
  test("every page has its own title and description, in both languages", () => {
    for (const language of ["fr", "ar"] as const) {
      const copies = PAGES.map((page) => fantasyPageCopy(page, translate[language]));
      const titles = copies.map((copy) => copy.title);
      const descriptions = copies.map((copy) => copy.description);
      expect(new Set(titles).size).toBe(PAGES.length);
      expect(new Set(descriptions).size).toBe(PAGES.length);
      for (const title of titles) {
        expect(title).toContain("BotolaGO");
        // The generic title every screen used to inherit from the layout.
        expect(title).not.toBe("Fantasy — BotolaGO");
      }
      for (const description of descriptions) {
        expect(description.length).toBeGreaterThan(50);
        expect(description.length).toBeLessThanOrEqual(200);
      }
    }
    for (const page of PAGES) {
      expect(fantasyPageCopy(page, translate.ar).title).toMatch(/[؀-ۿ]/);
      expect(fantasyPageCopy(page, translate.ar).description).toMatch(/[؀-ۿ]/);
    }
  });

  test("the head serves the French copy in the title, description and social tags", () => {
    const head = fantasyHead("rules");
    const title = dictionaries.fr["fantasy.meta.rules_title"];
    const description = dictionaries.fr["fantasy.meta.rules_description"];
    expect(titleOf(head)).toBe(title);
    for (const [key, value] of [
      ["property", "og:title"],
      ["name", "twitter:title"],
    ]) {
      expect(contentOf(head, key, value)).toBe(title);
    }
    for (const [key, value] of [
      ["name", "description"],
      ["property", "og:description"],
      ["name", "twitter:description"],
    ]) {
      expect(contentOf(head, key, value)).toBe(description);
    }
  });

  test("a public page declares its own canonical address", () => {
    for (const [page, path] of [
      ["hub", "/fantasy"],
      ["topPlayers", "/fantasy/top-players"],
      ["fixtures", "/fantasy/fixtures"],
      ["rankings", "/fantasy/rankings"],
      ["rules", "/fantasy/rules"],
      ["help", "/fantasy/help"],
    ] as const) {
      const head = fantasyHead(page);
      expect(head.links).toEqual([{ rel: "canonical", href: `https://botolago.com${path}` }]);
      expect(contentOf(head, "property", "og:url")).toBe(`https://botolago.com${path}`);
      expect(tag(head, "name", "robots")).toBeUndefined();
    }
  });

  test("the players list declares its canonical while it is the page shown", () => {
    // The list is the deepest match on /fantasy/players and on its
    // `?compare=` views, which all name the list's address.
    const list = { id: "/fantasy/players" };
    const head = fantasyHead("players", {
      match: list,
      matches: [{ id: "__root__" }, { id: "/fantasy" }, list],
    });
    expect(head.links).toEqual([
      { rel: "canonical", href: "https://botolago.com/fantasy/players" },
    ]);
    expect(contentOf(head, "property", "og:url")).toBe("https://botolago.com/fantasy/players");
    expect(tag(head, "name", "robots")).toBeUndefined();
  });

  test("under a player's page, the players list declares none of its own", () => {
    // The router emits every matched route's links side by side: the list's
    // canonical would come out next to the player page's own.
    const list = { id: "/fantasy/players" };
    const head = fantasyHead("players", {
      match: list,
      matches: [{ id: "__root__" }, { id: "/fantasy" }, list, { id: "/fantasy/players/p7" }],
    });
    expect(head.links).toEqual([]);
    expect(tag(head, "property", "og:url")).toBeUndefined();
    expect(titleOf(head)).toBe(dictionaries.fr["fantasy.meta.players_title"]);
  });

  test("a page behind sign-in stays out of the index and declares no canonical", () => {
    for (const page of [
      "leagues",
      "league",
      "joinLeague",
      "create",
      "team",
      "transfers",
      "points",
      "profile",
    ] as const) {
      const head = fantasyHead(page);
      expect(contentOf(head, "name", "robots")).toBe("noindex");
      expect(head.links).toEqual([]);
      expect(titleOf(head)).toBe(fantasyPageCopy(page, translate.fr).title);
    }
  });

  test("a player's page is named after the player, with its own canonical", () => {
    const head = fantasyPlayerHead("player 7", "Ayoub El Kaabi");
    expect(titleOf(head)).toBe("Ayoub El Kaabi : prix, points et forme — BotolaGO Fantasy");
    expect(contentOf(head, "name", "description")).toStartWith("Ayoub El Kaabi : statistiques");
    expect(contentOf(head, "property", "og:type")).toBe("profile");
    expect(head.links).toEqual([
      { rel: "canonical", href: "https://botolago.com/fantasy/players/player%207" },
    ]);
  });

  test("a player the loader did not return still gets a truthful head, never a placeholder", () => {
    for (const name of [undefined, null, "  "]) {
      const head = fantasyPlayerHead("p1", name);
      expect(titleOf(head)).toBe(dictionaries.fr["fantasy.meta.player_unknown_title"]);
      expect(titleOf(head)).not.toContain("{name}");
    }
  });

  test("a name is inserted as written, even one with replacement patterns", () => {
    expect(titleOf(fantasyPlayerHead("p1", "A$&B"))).toStartWith("A$&B : ");
  });
});

// `head()` serves the French; the Fantasy layout sets the reader's own title
// and description after mount, from the deepest matched route.
describe("the title in the reader's language", () => {
  const ROUTES = Object.keys(FANTASY_ROUTE_PAGES) as (keyof typeof FANTASY_ROUTE_PAGES)[];

  test("an Arabic reader gets each page's Arabic title and description", () => {
    for (const routeId of ROUTES) {
      const page = FANTASY_ROUTE_PAGES[routeId];
      const copy = fantasyShownCopy(routeId, null, translate.ar);
      expect(copy).toEqual(fantasyPageCopy(page, translate.ar));
      expect(copy!.title).toMatch(/[؀-ۿ]/);
      expect(copy!.title).not.toBe(fantasyPageCopy(page, translate.fr).title);
    }
    expect(fantasyShownCopy("/fantasy/rules", null, translate.ar)).toEqual({
      title: dictionaries.ar["fantasy.meta.rules_title"],
      description: dictionaries.ar["fantasy.meta.rules_description"],
    });
  });

  test("a French reader gets exactly what the server rendered", () => {
    // So the effect changes nothing on the page the server sent until the
    // reader's language is Arabic.
    for (const routeId of ROUTES) {
      const head = fantasyHead(FANTASY_ROUTE_PAGES[routeId]);
      expect(fantasyShownCopy(routeId, null, translate.fr)).toEqual({
        title: titleOf(head)!,
        description: contentOf(head, "name", "description")!,
      });
    }
    const player = fantasyPlayerHead("p7", "Ayoub El Kaabi");
    expect(fantasyShownCopy(FANTASY_PLAYER_ROUTE_ID, "Ayoub El Kaabi", translate.fr)).toEqual({
      title: titleOf(player)!,
      description: contentOf(player, "name", "description")!,
    });
  });

  test("a player's page is named after the player, in the reader's language", () => {
    expect(fantasyShownCopy(FANTASY_PLAYER_ROUTE_ID, "أيوب الكعبي", translate.ar)).toEqual({
      title: "أيوب الكعبي: السعر والنقاط والفورمة — BotolaGO Fantasy",
      description: dictionaries.ar["fantasy.meta.player_description"].replace(
        "{name}",
        "أيوب الكعبي",
      ),
    });
    // The name as written, surrounding space aside.
    expect(fantasyShownCopy(FANTASY_PLAYER_ROUTE_ID, " A$&B ", translate.ar)?.title).toStartWith(
      "A$&B: ",
    );
  });

  test("a player the loader did not return is still named truthfully", () => {
    for (const name of [null, undefined, "  "]) {
      expect(fantasyShownCopy(FANTASY_PLAYER_ROUTE_ID, name, translate.ar)).toEqual({
        title: dictionaries.ar["fantasy.meta.player_unknown_title"],
        description: dictionaries.ar["fantasy.meta.player_unknown_description"],
      });
    }
  });

  test("a route that is no Fantasy page is left to its own head", () => {
    for (const routeId of [undefined, "/fantasy", "__root__", "/news/", "constructor", "__proto__"])
      expect(fantasyShownCopy(routeId, "Ayoub El Kaabi", translate.ar)).toBeNull();
  });

  test("the router's own title is the one the shown page's head gave, once it has run", () => {
    const layout = { meta: [{ title: "Fantasy — BotolaGO" }] };
    const rules = { meta: fantasyHead("rules").meta };
    expect(shownHeadTitle([{}, layout, rules])).toBe(dictionaries.fr["fantasy.meta.rules_title"]);
    // The page is shown and its head has not run: nothing yet, not the
    // layout's title standing in for it.
    expect(shownHeadTitle([{}, layout, {}])).toBeUndefined();
    expect(shownHeadTitle([])).toBeUndefined();
  });
});

describe("every Fantasy route declares its own head", () => {
  // A Fantasy route without a head inherits the layout's generic "Fantasy —
  // BotolaGO", which is how most of them read before audit A17.
  const routes = join(import.meta.dir, "..", "routes");
  const files = readdirSync(routes).filter(
    (file) => /^fantasy\..+\.tsx$/.test(file) && !file.endsWith(".test.tsx"),
  );

  test("the route files are all found", () => {
    expect(files.length).toBeGreaterThanOrEqual(PAGES.length);
  });

  test.each(files)("%s", (file) => {
    const source = readFileSync(join(routes, file), "utf8");
    const route = source.slice(source.indexOf("createFileRoute("));
    const options = route.slice(0, route.indexOf("\n});"));
    expect(options).toMatch(/\bhead: /);
    expect(options).toMatch(/fantasyHead\("\w+"[,)]|fantasyPlayerHead\(/);
  });

  test("each fixed page's head is used by exactly one route", () => {
    const used = files.flatMap((file) => [
      ...readFileSync(join(routes, file), "utf8").matchAll(/fantasyHead\("(\w+)"[,)]/g),
    ]);
    expect(used.map((match) => match[1]).sort()).toEqual([...PAGES].sort());
  });

  test("the players list, with pages beneath it, hands its head the router's matches", () => {
    const source = readFileSync(join(routes, "fantasy.players.tsx"), "utf8");
    expect(source).toContain('head: (context) => fantasyHead("players", context),');
  });

  test("the layout titles each route as the page its own head names", () => {
    // The reader's title comes from the route id; the French from the route's
    // `head()`. A route added, renamed or pointed at another page must move
    // both, or an Arabic reader would see another page's title.
    const named = Object.fromEntries(
      files.map((file) => {
        const source = readFileSync(join(routes, file), "utf8");
        const id = /createFileRoute\("([^"]+)"\)/.exec(source)?.[1];
        const page = source.includes("fantasyPlayerHead(")
          ? "(player)"
          : /fantasyHead\("(\w+)"[,)]/.exec(source)?.[1];
        return [id, page];
      }),
    );
    expect(named).toEqual({
      ...FANTASY_ROUTE_PAGES,
      [FANTASY_PLAYER_ROUTE_ID]: "(player)",
    });
  });
});

describe("the Fantasy layout sets the reader's title after mount", () => {
  const read = (file: string) => readFileSync(join(import.meta.dir, file), "utf8");
  const layout = read("../routes/fantasy.tsx");
  const component = layout.slice(layout.indexOf("function FantasyLayout"));

  test("from the deepest match, with the player's name on a player's page", () => {
    expect(component).toContain("state.matches.at(-1)?.routeId");
    expect(component).toContain("shown?.routeId === FANTASY_PLAYER_ROUTE_ID");
    expect(component).toContain("shown.loaderData?.player.name");
    expect(component).toContain("fantasyShownCopy(routeId, player ? tr(player) : null, t)");
  });

  test("in an effect, like the legal pages, so the server's HTML stays French", () => {
    // Title and description, set only in the browser, and again whenever the
    // page or the reader's language changes them, or the router puts the
    // head's French back in the tab.
    expect(component).toContain(
      "useRouterState({ select: (state) => shownHeadTitle(state.matches) })",
    );
    expect(component).toMatch(
      /useEffect\(\(\) => \{\s*if \(typeof window === "undefined" \|\| !title \|\| !description\) return;\s*window\.document\.title = title;\s*const meta = window\.document\.querySelector\('meta\[name="description"\]'\);\s*if \(meta\) meta\.setAttribute\("content", description\);\s*\}, \[title, description, headTitle\]\);/,
    );
    expect(component.match(/document\.title/g)).toHaveLength(1);
    expect(component).toContain("return <Outlet />;");
  });

  test("a page shown before its head has run gets the reader's title after the router's", async () => {
    // A route with a pending screen is shown once `pendingMs` has passed,
    // before its loader and head have run, and the router puts the head's
    // French in the tab in a later update. No Fantasy route has a pending
    // screen today. The layout's effect follows `shownHeadTitle`, which
    // changes in that update, so it runs again after the router's title.
    let release!: () => void;
    const loaded = new Promise<void>((resolve) => {
      release = resolve;
    });
    const rootRoute = createRootRoute();
    const fantasy = createRoute({ getParentRoute: () => rootRoute, path: "/fantasy" });
    const router = createRouter({
      routeTree: rootRoute.addChildren([
        fantasy.addChildren([
          createRoute({
            getParentRoute: () => fantasy,
            path: "/rules",
            head: () => fantasyHead("rules"),
          }),
          createRoute({
            getParentRoute: () => fantasy,
            path: "/help",
            loader: () => loaded,
            head: () => fantasyHead("help"),
            pendingComponent: () => null,
            pendingMs: 0,
            pendingMinMs: 0,
          }),
        ]),
      ]),
      history: createMemoryHistory({ initialEntries: ["/fantasy/rules"] }),
      // The browser's router, run without a browser.
      isServer: false,
      origin: "https://botolago.com",
    });
    const shownRoute = () => router.state.matches.at(-1)?.routeId;
    const settle = () => new Promise((resolve) => setTimeout(resolve, 5));

    await router.load();
    expect(shownHeadTitle(router.state.matches)).toBe(dictionaries.fr["fantasy.meta.rules_title"]);

    const navigation = router.navigate({ to: "/fantasy/help" });
    for (let tick = 0; tick < 200 && shownRoute() !== "/fantasy/help"; tick += 1) await settle();
    expect(shownRoute()).toBe("/fantasy/help");
    expect(shownHeadTitle(router.state.matches)).toBeUndefined();

    release();
    await navigation;
    expect(shownHeadTitle(router.state.matches)).toBe(dictionaries.fr["fantasy.meta.help_title"]);
  });

  test("without shipping the Arabic dictionary with the page", () => {
    // The Arabic copy is read through `t`, from the dictionary the language
    // provider loads on demand (src/i18n/provider.tsx).
    for (const source of [layout, read("fantasy-meta.ts")]) {
      expect(source).not.toMatch(/from "@\/i18n\/dictionary-ar"/);
      expect(source).not.toMatch(/^import \{[^}]*\} from "@\/i18n\/dictionaries"/m);
    }
  });
});
