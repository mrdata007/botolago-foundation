import { describe, expect, it } from "bun:test";
import { PUBLIC_SITE_ORIGIN } from "@/lib/article-meta";
import { SITEMAP_STATIC_PATHS } from "@/lib/sitemap";

/**
 * The per-route SEO checklist: every public page's `head()`, merged over the
 * root's the way the router merges them (tag by tag, the deeper route
 * winning), must carry a title, a description, a canonical address that is
 * its own, and a share picture (`og:image` and `twitter:image`).
 *
 * The routes come from two places: `SITEMAP_STATIC_PATHS` (so a page added to
 * the sitemap is checked, or the test says which route it cannot find) and the
 * dynamic pages, with a representative loader result each.
 */

interface Tag {
  title?: string;
  name?: string;
  property?: string;
  content?: string;
}
interface Head {
  meta?: Tag[];
  links?: { rel: string; href: string }[];
}
type HeadFn = (context: unknown) => Head;

const UUID = "11111111-2222-4333-8444-555555555555";

/** Route files by public path (the sitemap's static paths first). */
const MODULES: Record<string, () => Promise<{ Route: { options: { head?: HeadFn } } }>> = {
  "/": () => import("./index"),
  "/matches": () => import("./matches.index"),
  "/matches/standings": () => import("./matches.standings"),
  "/clubs": () => import("./clubs.index"),
  "/fantasy": () => import("./fantasy.index"),
  "/jouer": () => import("./jouer"),
  "/fantasy/players": () => import("./fantasy.players"),
  "/fantasy/top-players": () => import("./fantasy.top-players"),
  "/fantasy/fixtures": () => import("./fantasy.fixtures"),
  "/fantasy/rankings": () => import("./fantasy.rankings"),
  "/fantasy/rules": () => import("./fantasy.rules"),
  "/fantasy/help": () => import("./fantasy.help"),
  "/privacy": () => import("./privacy"),
  "/terms": () => import("./terms"),
  "/suppression-compte": () => import("./suppression-compte"),
  "/prizes": () => import("./prizes.index"),
  "/prizes/terms": () => import("./prizes.terms"),
  "/pronostics": () => import("./pronostics.index"),
  "/pepites": () => import("./pepites.index"),
  "/pepites/classement": () => import("./pepites.classement"),
  "/pepites/methode": () => import("./pepites.methode"),
  "/news": () => import("./news"),
  "/curva": () => import("./curva.index"),
};

const club = {
  id: UUID,
  name: { fr: "Raja Club Athletic", ar: "الرجاء" },
  crestUrl: "https://example.supabase.co/storage/v1/object/public/football-media/crest.png",
};
const away = {
  ...club,
  id: "99999999-2222-4333-8444-555555555555",
  name: { fr: "Wydad AC", ar: "الوداد" },
};
const match = {
  homeClubId: club.id,
  awayClubId: away.id,
  kickoff: "2026-11-01T18:00:00.000Z",
  status: "scheduled",
};

const DYNAMIC: {
  path: string;
  load: MODULES_LOADER;
  params: Record<string, string>;
  loaderData: unknown;
}[] = [
  {
    path: `/clubs/${UUID}`,
    load: () => import("./clubs.$clubId"),
    params: { clubId: UUID },
    loaderData: { club, fetchedAt: 0 },
  },
  {
    path: `/matches/${UUID}`,
    load: () => import("./matches.$matchId"),
    params: { matchId: UUID },
    loaderData: { detail: { clubs: [club, away], match }, fetchedAt: 0 },
  },
];
type MODULES_LOADER = () => Promise<{ Route: { options: { head?: HeadFn } } }>;

/** Tag-by-tag merge, the later head replacing the earlier on the same key. */
function merge(...heads: Head[]): { tags: Map<string, string>; canonical?: string } {
  const tags = new Map<string, string>();
  let canonical: string | undefined;
  for (const head of heads) {
    for (const tag of head.meta ?? []) {
      if (tag.title !== undefined) tags.set("title", tag.title);
      else if (tag.name) tags.set(`name:${tag.name}`, tag.content ?? "");
      else if (tag.property) tags.set(`property:${tag.property}`, tag.content ?? "");
    }
    for (const link of head.links ?? []) if (link.rel === "canonical") canonical = link.href;
  }
  return { tags, canonical };
}

async function rootHead(): Promise<Head> {
  const root = await import("./__root");
  return (root.Route.options as { head: HeadFn }).head({ params: {}, loaderData: undefined });
}

async function headOf(
  load: MODULES_LOADER,
  params: Record<string, string>,
  loaderData: unknown,
): Promise<Head> {
  const route = (await load()).Route;
  const id = "/route";
  return route.options.head!({ params, loaderData, match: { id }, matches: [{ id }], search: {} });
}

function expectChecklist(path: string, merged: ReturnType<typeof merge>) {
  const { tags, canonical } = merged;
  const label = `${path}:`;
  expect(tags.get("title"), `${label} title`).toBeTruthy();
  expect(tags.get("name:description"), `${label} description`).toBeTruthy();
  expect(canonical, `${label} canonical`).toBe(`${PUBLIC_SITE_ORIGIN}${path === "/" ? "/" : path}`);
  const image = tags.get("property:og:image");
  expect(image, `${label} og:image`).toMatch(/^https?:\/\//);
  expect(tags.get("name:twitter:image"), `${label} twitter:image`).toMatch(/^https?:\/\//);
  expect(tags.get("name:twitter:card"), `${label} twitter:card`).toBeTruthy();
  expect(tags.get("property:og:image:alt"), `${label} og:image:alt`).toBeTruthy();
}

describe("the sitemap's pages are all in the checklist", () => {
  it("has a route module for every static path", () => {
    const missing = SITEMAP_STATIC_PATHS.filter((path) => !(path in MODULES));
    expect(missing).toEqual([]);
  });
});

describe("static public routes", () => {
  for (const [path, load] of Object.entries(MODULES)) {
    it(`${path} has a title, description, canonical and share picture`, async () => {
      const head = await headOf(load, {}, path === "/news" ? { isNewsIndex: true } : undefined);
      expectChecklist(path, merge(await rootHead(), head));
    });
  }
});

describe("dynamic public routes", () => {
  for (const { path, load, params, loaderData } of DYNAMIC) {
    it(`${path} has the checklist, with its own crest as the share picture`, async () => {
      const merged = merge(await rootHead(), await headOf(load, params, loaderData));
      expectChecklist(path, merged);
      expect(merged.tags.get("property:og:image")).toBe(club.crestUrl);
      expect(merged.tags.get("name:twitter:image")).toBe(club.crestUrl);
    });

    it(`${path} falls back to the root's picture when the crest is unusable`, async () => {
      const unusable = JSON.parse(JSON.stringify(loaderData).replaceAll("crest.png", "crest.svg"));
      const merged = merge(await rootHead(), await headOf(load, params, unusable));
      expectChecklist(path, merged);
      expect(merged.tags.get("property:og:image")).toBe(`${PUBLIC_SITE_ORIGIN}/og-image.jpg`);
      expect(merged.tags.has("property:og:image:width")).toBe(false);
    });
  }
});
