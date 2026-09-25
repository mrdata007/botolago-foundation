import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { dictionaries } from "@/i18n/dictionaries";
import {
  FANTASY_PAGE_HEADS,
  fantasyHead,
  fantasyPlayerHead,
  type FantasyPage,
} from "./fantasy-meta";

type Tag = Record<string, string | undefined>;
const PAGES = Object.keys(FANTASY_PAGE_HEADS) as FantasyPage[];

const tag = (head: { meta: Tag[] }, key: string, value: string) =>
  head.meta.find((entry) => entry[key] === value);
const titleOf = (head: { meta: Tag[] }) => head.meta.find((entry) => entry.title)?.title;
const contentOf = (head: { meta: Tag[] }, key: string, value: string) =>
  tag(head, key, value)?.content;

describe("Fantasy page heads (audit A17)", () => {
  test("every page has its own title and description, in both languages", () => {
    for (const language of ["fr", "ar"] as const) {
      const dictionary = dictionaries[language];
      const titles = PAGES.map((page) => dictionary[FANTASY_PAGE_HEADS[page].title]);
      const descriptions = PAGES.map((page) => dictionary[FANTASY_PAGE_HEADS[page].description]);
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
      expect(dictionaries.ar[FANTASY_PAGE_HEADS[page].title]).toMatch(/[؀-ۿ]/);
      expect(dictionaries.ar[FANTASY_PAGE_HEADS[page].description]).toMatch(/[؀-ۿ]/);
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
      expect(titleOf(head)).toBe(dictionaries.fr[FANTASY_PAGE_HEADS[page].title]);
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
});
