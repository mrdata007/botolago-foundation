import type { TranslationKey } from "@/i18n/dictionaries";
import { fr } from "@/i18n/dictionary-fr";
import { PUBLIC_SITE_ORIGIN } from "@/lib/site-origin";

/**
 * The `head()` of every Fantasy page (audit A17), and its title and
 * description in the reader's language.
 *
 * Only the rankings, the top players and a player's page used to name
 * themselves; every other screen inherited the layout's "Fantasy — BotolaGO",
 * so a search result, a shared link, a browser tab and the history all read
 * the same for the rules, the fixture grid and the help. Each page now says
 * what it is, in copy held in both dictionaries (`fantasy.meta.*`). `head()`
 * has no reader language, so it serves the French, as every page head does:
 * that is what the server renders and what a crawler reads. Once mounted, the
 * Fantasy layout (`src/routes/fantasy.tsx`) sets the reader's own title and
 * description for the page shown (`fantasyShownCopy`), as the legal pages and
 * Pronostics do.
 *
 * Two kinds of page:
 *
 *   - Public ones read the same for every visitor, and declare their
 *     canonical address. The players list is also the layout of the player
 *     pages, and the router emits every matched route's links side by side,
 *     so it declares its canonical only while it is the page shown, never
 *     next to a player's own (`fantasyHead`'s `matches`).
 *   - Personal ones sit behind sign-in. A crawler only ever gets the sign-in
 *     gate there, the same on each of them, so they are kept out of the index
 *     with `noindex` and declare no canonical. They still get their own title:
 *     a signed-in manager's tabs and history should say which screen is which.
 *
 * The URLs themselves do not change.
 */

/** `t` from `useI18n()`, or the French dictionary for `head()`. */
type Translate = (key: TranslationKey) => string;

/** `head()` has no reader language: it reads the French dictionary. */
const french: Translate = (key) => fr[key];

export interface FantasyPageCopy {
  readonly title: string;
  readonly description: string;
}

interface FantasyPageHead {
  /**
   * In the language `t` reads. Each page spells its `fantasy.meta.*` key out
   * at its own call rather than handing a key from this table to `t`: the
   * i18n gate reads keys as string literals at the call, and a call whose
   * argument is a variable counts as drift (W4), as in `prize-presentation.ts`.
   */
  readonly title: (t: Translate) => string;
  readonly description: (t: Translate) => string;
  /** The page's own path when it is public, else `null`. */
  readonly canonicalPath: string | null;
  readonly personal: boolean;
}

export const FANTASY_PAGE_HEADS = {
  hub: {
    title: (t) => t("fantasy.meta.hub_title"),
    description: (t) => t("fantasy.meta.hub_description"),
    canonicalPath: "/fantasy",
    personal: false,
  },
  players: {
    title: (t) => t("fantasy.meta.players_title"),
    description: (t) => t("fantasy.meta.players_description"),
    canonicalPath: "/fantasy/players",
    personal: false,
  },
  topPlayers: {
    title: (t) => t("fantasy.meta.top_players_title"),
    description: (t) => t("fantasy.meta.top_players_description"),
    canonicalPath: "/fantasy/top-players",
    personal: false,
  },
  fixtures: {
    title: (t) => t("fantasy.meta.fixtures_title"),
    description: (t) => t("fantasy.meta.fixtures_description"),
    canonicalPath: "/fantasy/fixtures",
    personal: false,
  },
  rankings: {
    title: (t) => t("fantasy.meta.rankings_title"),
    description: (t) => t("fantasy.meta.rankings_description"),
    canonicalPath: "/fantasy/rankings",
    personal: false,
  },
  rules: {
    title: (t) => t("fantasy.meta.rules_title"),
    description: (t) => t("fantasy.meta.rules_description"),
    canonicalPath: "/fantasy/rules",
    personal: false,
  },
  help: {
    title: (t) => t("fantasy.meta.help_title"),
    description: (t) => t("fantasy.meta.help_description"),
    canonicalPath: "/fantasy/help",
    personal: false,
  },
  leagues: {
    title: (t) => t("fantasy.meta.leagues_title"),
    description: (t) => t("fantasy.meta.leagues_description"),
    canonicalPath: null,
    personal: true,
  },
  league: {
    title: (t) => t("fantasy.meta.league_title"),
    description: (t) => t("fantasy.meta.league_description"),
    canonicalPath: null,
    personal: true,
  },
  joinLeague: {
    title: (t) => t("fantasy.meta.join_league_title"),
    description: (t) => t("fantasy.meta.join_league_description"),
    canonicalPath: null,
    personal: true,
  },
  create: {
    title: (t) => t("fantasy.meta.create_title"),
    description: (t) => t("fantasy.meta.create_description"),
    canonicalPath: null,
    personal: true,
  },
  team: {
    title: (t) => t("fantasy.meta.team_title"),
    description: (t) => t("fantasy.meta.team_description"),
    canonicalPath: null,
    personal: true,
  },
  transfers: {
    title: (t) => t("fantasy.meta.transfers_title"),
    description: (t) => t("fantasy.meta.transfers_description"),
    canonicalPath: null,
    personal: true,
  },
  points: {
    title: (t) => t("fantasy.meta.points_title"),
    description: (t) => t("fantasy.meta.points_description"),
    canonicalPath: null,
    personal: true,
  },
  profile: {
    title: (t) => t("fantasy.meta.profile_title"),
    description: (t) => t("fantasy.meta.profile_description"),
    canonicalPath: null,
    personal: true,
  },
} as const satisfies Record<string, FantasyPageHead>;

export type FantasyPage = keyof typeof FANTASY_PAGE_HEADS;

/** A fixed page's title and description, in the language `t` reads. */
export function fantasyPageCopy(page: FantasyPage, t: Translate): FantasyPageCopy {
  const entry: FantasyPageHead = FANTASY_PAGE_HEADS[page];
  return { title: entry.title(t), description: entry.description(t) };
}

/**
 * A player's page, named after the player when there is one to name, and
 * inserted as written (a `$&` in a name stays `$&`). A read that failed still
 * gets a truthful title, never a placeholder: it is not proof the player is
 * gone.
 */
export function fantasyPlayerCopy(name: string | null | undefined, t: Translate): FantasyPageCopy {
  const named = name?.trim();
  return named
    ? {
        title: t("fantasy.meta.player_title").replace("{name}", () => named),
        description: t("fantasy.meta.player_description").replace("{name}", () => named),
      }
    : {
        title: t("fantasy.meta.player_unknown_title"),
        description: t("fantasy.meta.player_unknown_description"),
      };
}

/**
 * The page each Fantasy route shows, by route id. The layout titles the
 * deepest matched route in the reader's language; each route file names the
 * same page in its `head()`, and a test holds the two together.
 */
export const FANTASY_ROUTE_PAGES = {
  "/fantasy/": "hub",
  "/fantasy/players": "players",
  "/fantasy/top-players": "topPlayers",
  "/fantasy/fixtures": "fixtures",
  "/fantasy/rankings": "rankings",
  "/fantasy/rules": "rules",
  "/fantasy/help": "help",
  "/fantasy/leagues": "leagues",
  "/fantasy/leagues/$leagueId": "league",
  "/fantasy/leagues/join": "joinLeague",
  "/fantasy/create": "create",
  "/fantasy/team": "team",
  "/fantasy/transfers": "transfers",
  "/fantasy/points": "points",
  "/fantasy/profile": "profile",
} as const satisfies Record<string, FantasyPage>;

/** A player's page: named after its player, not one of the fixed pages. */
export const FANTASY_PLAYER_ROUTE_ID = "/fantasy/players/$playerId";

/**
 * The title and description of the Fantasy page on screen, in the language
 * `t` reads: the deepest matched route's page, or on a player's page the
 * player (`playerName`, in the reader's language). `null` when that route is
 * no Fantasy page, such as the layout itself under a page not found.
 */
export function fantasyShownCopy(
  routeId: string | undefined,
  playerName: string | null | undefined,
  t: Translate,
): FantasyPageCopy | null {
  if (routeId === FANTASY_PLAYER_ROUTE_ID) return fantasyPlayerCopy(playerName, t);
  if (routeId === undefined || !Object.hasOwn(FANTASY_ROUTE_PAGES, routeId)) return null;
  return fantasyPageCopy(FANTASY_ROUTE_PAGES[routeId as keyof typeof FANTASY_ROUTE_PAGES], t);
}

/**
 * The title the page on screen gave the router in its `head()` -- the French
 * the router puts in the tab -- or `undefined` while that head has not run.
 *
 * The router writes it into the tab each time it changes. Usually that is in
 * the same render as the page it names; but a route with a pending screen is
 * shown before its loader and head have run, and its title arrives in a later
 * update. The Fantasy layout follows this title, so it sets the reader's own
 * again after the router's.
 */
export function shownHeadTitle(
  matches: readonly { readonly meta?: readonly ({ readonly title?: string } | undefined)[] }[],
): string | undefined {
  return matches.at(-1)?.meta?.find((tag) => tag?.title)?.title;
}

function head({
  title,
  description,
  canonical,
  personal,
  type,
}: {
  readonly title: string;
  readonly description: string;
  readonly canonical: string | null;
  readonly personal: boolean;
  readonly type: "website" | "profile";
}) {
  return {
    meta: [
      { title },
      { name: "description", content: description },
      ...(personal ? [{ name: "robots", content: "noindex" }] : []),
      { property: "og:type", content: type },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      ...(canonical ? [{ property: "og:url", content: canonical }] : []),
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: title },
      { name: "twitter:description", content: description },
    ],
    links: canonical ? [{ rel: "canonical", href: canonical }] : [],
  };
}

/** The part of a route's `head()` context that says which page is shown. */
interface HeadMatches {
  readonly match: { readonly id: string };
  readonly matches: readonly { readonly id: string }[];
}

/**
 * The head of one of the fixed Fantasy pages. A route whose child pages
 * render beneath it passes its `head()` context: while a child is the page
 * shown (the deepest match is not this route's), the address is the child's
 * to declare, and this head declares none.
 */
export function fantasyHead(page: FantasyPage, context?: HeadMatches) {
  const entry: FantasyPageHead = FANTASY_PAGE_HEADS[page];
  const showingChild = context ? context.matches.at(-1)?.id !== context.match.id : false;
  return head({
    ...fantasyPageCopy(page, french),
    canonical:
      entry.canonicalPath && !showingChild ? `${PUBLIC_SITE_ORIGIN}${entry.canonicalPath}` : null,
    personal: entry.personal,
    type: "website",
  });
}

/**
 * A player's page, named after the player when the loader found them (their
 * French name: the page head is French). Always its own canonical address,
 * found or not: a failed read is not proof the player is gone.
 */
export function fantasyPlayerHead(playerId: string, playerName: string | null | undefined) {
  return head({
    ...fantasyPlayerCopy(playerName, french),
    canonical: `${PUBLIC_SITE_ORIGIN}/fantasy/players/${encodeURIComponent(playerId)}`,
    personal: false,
    type: "profile",
  });
}
