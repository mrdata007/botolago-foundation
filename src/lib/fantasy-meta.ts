import type { TranslationKey } from "@/i18n/dictionaries";
import { fr } from "@/i18n/dictionary-fr";
import { PUBLIC_SITE_ORIGIN } from "@/lib/site-origin";

/**
 * The `head()` of every Fantasy page (audit A17).
 *
 * Only the rankings, the top players and a player's page used to name
 * themselves; every other screen inherited the layout's "Fantasy — BotolaGO",
 * so a search result, a shared link, a browser tab and the history all read
 * the same for the rules, the fixture grid and the help. Each page now says
 * what it is, in copy held in both dictionaries (`fantasy.meta.*`). `head()`
 * has no reader language, so it serves the French, as every page head does.
 * The Arabic copy is not shown yet: pages that title themselves in the
 * reader's language set `document.title` after mount (the legal pages,
 * Pronostics), which no Fantasy screen does so far.
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
interface FantasyPageHead {
  readonly title: TranslationKey;
  readonly description: TranslationKey;
  /** The page's own path when it is public, else `null`. */
  readonly canonicalPath: string | null;
  readonly personal: boolean;
}

export const FANTASY_PAGE_HEADS = {
  hub: {
    title: "fantasy.meta.hub_title",
    description: "fantasy.meta.hub_description",
    canonicalPath: "/fantasy",
    personal: false,
  },
  players: {
    title: "fantasy.meta.players_title",
    description: "fantasy.meta.players_description",
    canonicalPath: "/fantasy/players",
    personal: false,
  },
  topPlayers: {
    title: "fantasy.meta.top_players_title",
    description: "fantasy.meta.top_players_description",
    canonicalPath: "/fantasy/top-players",
    personal: false,
  },
  fixtures: {
    title: "fantasy.meta.fixtures_title",
    description: "fantasy.meta.fixtures_description",
    canonicalPath: "/fantasy/fixtures",
    personal: false,
  },
  rankings: {
    title: "fantasy.meta.rankings_title",
    description: "fantasy.meta.rankings_description",
    canonicalPath: "/fantasy/rankings",
    personal: false,
  },
  rules: {
    title: "fantasy.meta.rules_title",
    description: "fantasy.meta.rules_description",
    canonicalPath: "/fantasy/rules",
    personal: false,
  },
  help: {
    title: "fantasy.meta.help_title",
    description: "fantasy.meta.help_description",
    canonicalPath: "/fantasy/help",
    personal: false,
  },
  leagues: {
    title: "fantasy.meta.leagues_title",
    description: "fantasy.meta.leagues_description",
    canonicalPath: null,
    personal: true,
  },
  league: {
    title: "fantasy.meta.league_title",
    description: "fantasy.meta.league_description",
    canonicalPath: null,
    personal: true,
  },
  joinLeague: {
    title: "fantasy.meta.join_league_title",
    description: "fantasy.meta.join_league_description",
    canonicalPath: null,
    personal: true,
  },
  create: {
    title: "fantasy.meta.create_title",
    description: "fantasy.meta.create_description",
    canonicalPath: null,
    personal: true,
  },
  team: {
    title: "fantasy.meta.team_title",
    description: "fantasy.meta.team_description",
    canonicalPath: null,
    personal: true,
  },
  transfers: {
    title: "fantasy.meta.transfers_title",
    description: "fantasy.meta.transfers_description",
    canonicalPath: null,
    personal: true,
  },
  points: {
    title: "fantasy.meta.points_title",
    description: "fantasy.meta.points_description",
    canonicalPath: null,
    personal: true,
  },
  profile: {
    title: "fantasy.meta.profile_title",
    description: "fantasy.meta.profile_description",
    canonicalPath: null,
    personal: true,
  },
} as const satisfies Record<string, FantasyPageHead>;

export type FantasyPage = keyof typeof FANTASY_PAGE_HEADS;

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
    title: fr[entry.title],
    description: fr[entry.description],
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
  const name = playerName?.trim();
  return head({
    title: name
      ? fr["fantasy.meta.player_title"].replace("{name}", () => name)
      : fr["fantasy.meta.player_unknown_title"],
    description: name
      ? fr["fantasy.meta.player_description"].replace("{name}", () => name)
      : fr["fantasy.meta.player_unknown_description"],
    canonical: `${PUBLIC_SITE_ORIGIN}/fantasy/players/${encodeURIComponent(playerId)}`,
    personal: false,
    type: "profile",
  });
}
