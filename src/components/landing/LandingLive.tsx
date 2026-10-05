import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";

import { ClubCrest } from "@/components/common/ClubCrest";
import { MatchCard } from "@/components/common/MatchCard";
import { MatchCardSkeleton } from "@/components/common/Skeletons";
import { PlayerPhoto } from "@/components/common/PlayerPhoto";
import { clubLabel, findClub } from "@/components/fantasy/club-identity";
import { useOnLiveMatchEnd } from "@/components/matches/use-live-matches";
import { ui, UiCard, UiSkeleton } from "@/components/ui-kit";
import type { TranslationKey } from "@/i18n/dictionaries";
import { useI18n } from "@/i18n/provider";
import { matchesRefetchInterval } from "@/lib/match-refresh";
import { cn } from "@/lib/utils";
import { fantasyService } from "@/services/fantasy-runtime";
import { defaultSeason, footballService } from "@/services/football";
import type { FantasyPlayer } from "@/types/fantasy";

/**
 * The landing page's live football: what is being played in the Botola Pro
 * right now, where the clubs stand, and the players worth picking. Real
 * fixtures, the real table and the real player list, read through the same
 * queries (and cache entries) as Home, the Classement tab and the players
 * list, so a visitor who goes on into the app finds them already loaded.
 *
 * Nothing here is ever an empty frame. Each block shows its skeleton while it
 * loads and is left out entirely when it has nothing to say (the season not
 * started, a read that failed): the page around it reads the same without it.
 * A block that fails is not an error panel either; the landing page is not
 * where a visitor should meet one.
 */

/** "En ce moment": this round's matches beside the top of the table. */
export function LandingBotolaNow({
  heading: H,
  onLeave,
}: {
  heading: "h2" | "h3";
  onLeave?: () => void;
}) {
  const { t, tr, lang } = useI18n();
  const queryClient = useQueryClient();

  // Same cadence as Home: keeps refreshing while a match is live or about to
  // kick off, so the score a visitor reads here is not frozen.
  const matchesQ = useQuery({
    queryKey: ["football", "home-matches", lang],
    queryFn: () => footballService.getHomeMatches(lang),
    refetchInterval: (query) => matchesRefetchInterval(query.state.data?.matches, Date.now()),
    refetchIntervalInBackground: false,
  });
  const seasonsQ = useQuery({
    queryKey: ["football", "seasons", lang],
    queryFn: () => footballService.getSeasons(lang),
  });
  const season = seasonsQ.data ? defaultSeason(seasonsQ.data) : undefined;
  const standingsQ = useQuery({
    queryKey: ["football", "standings", season?.id, lang],
    queryFn: () => footballService.getStandings(season!, lang),
    enabled: season !== undefined,
  });
  // A match that ends while the page is open moves the table: read it again.
  useOnLiveMatchEnd(() => {
    void queryClient.invalidateQueries({ queryKey: ["football", "standings"] });
  });

  // Live first, then what is still to come: four rows at most.
  const matches = [...(matchesQ.data?.matches ?? [])]
    .sort(
      (a, b) =>
        Number(b.status === "live") - Number(a.status === "live") ||
        a.kickoff.localeCompare(b.kickoff),
    )
    .slice(0, 4);
  const matchClubs = matchesQ.data?.clubs ?? [];
  const table = standingsQ.data?.overall.slice(0, 5) ?? [];
  const tableClubs = standingsQ.data?.clubs ?? [];

  const matchesLoading = matchesQ.isPending;
  const tableLoading = seasonsQ.isPending || (season !== undefined && standingsQ.isPending);
  const showMatches = matchesLoading || matches.length > 0;
  const showTable = tableLoading || table.length > 0;
  if (!showMatches && !showTable) return null;

  return (
    <section
      aria-labelledby="landing-now"
      className={cn("mx-auto w-full max-w-6xl pb-2 pt-12 lg:pb-4 lg:pt-16", ui.space.gutter)}
      data-testid="landing-now"
    >
      <p className={cn("flex items-center gap-2", ui.text.label, ui.tone.ink)}>
        <span
          aria-hidden
          className={cn("live-breathe h-2 w-2 bg-[color:var(--ui-live)]", ui.radius.full)}
        />
        {t("landing.now_kicker")}
      </p>
      <H id="landing-now" className={cn("mt-2 text-balance", ui.display.title)}>
        {t("landing.now_title")}
      </H>

      <div
        className={cn(
          "mt-8 grid gap-8",
          showMatches && showTable && "lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]",
        )}
      >
        {showMatches ? (
          <div className="min-w-0">
            <BlockHeader
              title={t("landing.now_matches")}
              link={{ to: "/matches", label: t("landing.now_matches_link") }}
              onLeave={onLeave}
            />
            <UiCard
              padding="none"
              className="divide-y divide-[color:var(--ui-rule)] overflow-hidden"
            >
              {matchesLoading
                ? [0, 1, 2].map((index) => <MatchCardSkeleton key={index} flat />)
                : matches.map((match) => {
                    const home = matchClubs.find((club) => club.id === match.homeClubId);
                    const away = matchClubs.find((club) => club.id === match.awayClubId);
                    if (!home || !away) return null;
                    return (
                      <div key={match.id} className="min-w-0" onClickCapture={onLeave}>
                        <MatchCard match={match} home={home} away={away} variant="list" showDate />
                      </div>
                    );
                  })}
            </UiCard>
          </div>
        ) : null}

        {showTable ? (
          <div className="min-w-0">
            <BlockHeader
              title={t("landing.now_table")}
              link={{ to: "/matches/standings", label: t("landing.now_table_link") }}
              onLeave={onLeave}
            />
            <UiCard padding="none" className="overflow-hidden">
              <div
                aria-hidden
                className={cn(
                  "grid grid-cols-[2rem_minmax(0,1fr)_2.25rem_2.75rem] items-center gap-2 px-4 py-2",
                  ui.surface.sunken,
                  ui.text.label,
                  ui.tone.muted,
                )}
              >
                <span className="text-center">#</span>
                <span>{t("matches.table.team")}</span>
                <span className="text-center">{t("matches.table.played_short")}</span>
                <span className="text-end">{t("matches.table.points_short")}</span>
              </div>
              <ol className="divide-y divide-[color:var(--ui-rule)]">
                {tableLoading
                  ? [0, 1, 2, 3, 4].map((index) => (
                      <li key={index} className="px-4 py-3">
                        <UiSkeleton className="h-6" />
                      </li>
                    ))
                  : table.map((row) => {
                      const club = tableClubs.find((candidate) => candidate.id === row.clubId);
                      if (!club) return null;
                      return (
                        <li key={row.clubId}>
                          <Link
                            to="/clubs/$clubId"
                            params={{ clubId: club.id }}
                            onClick={onLeave}
                            className={cn(
                              "grid min-h-[var(--ui-tap-min)] grid-cols-[2rem_minmax(0,1fr)_2.25rem_2.75rem] items-center gap-2 px-4 py-2",
                              "transition-colors hover:bg-[color:var(--ui-surface-sunken)] active:bg-[color:var(--ui-surface-sunken)]",
                              ui.focus,
                              "focus-visible:ring-inset focus-visible:ring-offset-0",
                            )}
                          >
                            <span className={cn("text-center", ui.stat.sm, ui.tone.muted)}>
                              {row.position}
                            </span>
                            <span className="flex min-w-0 items-center gap-2.5">
                              <ClubCrest club={club} size="sm" />
                              <span
                                className={cn(
                                  "min-w-0 truncate",
                                  ui.text.secondary,
                                  "[font-weight:var(--ui-weight-strong)]",
                                  ui.tone.default,
                                )}
                              >
                                {clubLabel(club, tr)}
                              </span>
                            </span>
                            <span className={cn("text-center", ui.stat.sm, ui.tone.muted)}>
                              {row.played}
                            </span>
                            <span className={cn("text-end", ui.stat.md, ui.tone.default)}>
                              {row.points}
                            </span>
                          </Link>
                        </li>
                      );
                    })}
              </ol>
            </UiCard>
          </div>
        ) : null}
      </div>
    </section>
  );
}

/** One literal call per position: the i18n gate reads keys statically. */
function positionName(
  position: FantasyPlayer["position"],
  t: (key: TranslationKey) => string,
): string {
  switch (position) {
    case "GK":
      return t("pepites.position.gk");
    case "DEF":
      return t("pepites.position.def");
    case "MID":
      return t("pepites.position.mid");
    case "FWD":
      return t("pepites.position.fwd");
  }
}

/** How many player cards the landing page shows. */
const PLAYERS_SHOWN = 6;

/**
 * The players to pick: the season's top scorers in Fantasy points, or —
 * before any gameweek has been scored, when every total is still 0 — the
 * players managers pick most. Each card opens the player.
 */
export function LandingPlayersToWatch({
  heading: H,
  onLeave,
}: {
  heading: "h2" | "h3";
  onLeave?: () => void;
}) {
  const { t, lang } = useI18n();
  const nf = new Intl.NumberFormat(lang === "ar" ? "ar-MA" : "fr-FR", {
    maximumFractionDigits: 1,
  });

  // The whole player list is a heavy read, and this block sits far down the
  // page: it is fetched only once the visitor scrolls near it (its skeleton
  // holds the place until then). Already in the cache, it shows at once.
  const sectionRef = useRef<HTMLElement>(null);
  const near = useNearViewport(sectionRef);
  const playersQ = useQuery({
    queryKey: ["fantasy-players"],
    queryFn: () => fantasyService.getPlayers(),
    enabled: near,
  });
  const clubsQ = useQuery({
    queryKey: ["football", "clubs", lang],
    queryFn: () => footballService.getClubs(lang),
  });

  const all = playersQ.data ?? [];
  const scored = all.some((player) => player.totalPoints > 0);
  const players = [...all]
    .filter((player) => player.status === "available" || player.status === "doubtful")
    .sort((a, b) =>
      scored
        ? b.totalPoints - a.totalPoints || b.ownership - a.ownership
        : b.ownership - a.ownership,
    )
    .slice(0, PLAYERS_SHOWN);

  if (!playersQ.isPending && players.length === 0) return null;

  return (
    <section
      ref={sectionRef}
      aria-labelledby="landing-players"
      className={cn("mx-auto w-full max-w-6xl pb-12 lg:pb-16", ui.space.gutter)}
      data-testid="landing-players"
    >
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
        <div className="min-w-0">
          <H id="landing-players" className={cn("text-balance", ui.display.title)}>
            {t("landing.players_title")}
          </H>
          <p className={cn("mt-2", ui.text.prose, ui.tone.muted)}>
            {scored ? t("landing.players_body_points") : t("landing.players_body_owned")}
          </p>
        </div>
        <InlineLink to="/fantasy/players" onLeave={onLeave}>
          {t("landing.players_link")}
        </InlineLink>
      </div>

      {/* A row that scrolls sideways on a phone, a grid from 768px. */}
      <ul
        className={cn(
          "-mx-[var(--ui-gutter)] mt-6 flex snap-x snap-mandatory gap-3 overflow-x-auto px-[var(--ui-gutter)] pb-2",
          "[scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
          "md:mx-0 md:grid md:grid-cols-3 md:overflow-visible md:px-0 lg:grid-cols-6",
        )}
      >
        {playersQ.isPending
          ? Array.from({ length: PLAYERS_SHOWN }, (_, index) => (
              <li key={index} className="w-40 shrink-0 snap-start md:w-auto">
                <UiSkeleton className={cn("h-48", ui.radius.card)} />
              </li>
            ))
          : players.map((player) => {
              const club = findClub(clubsQ.data, player.clubId);
              return (
                <li key={player.id} className="w-40 shrink-0 snap-start md:w-auto">
                  <Link
                    to="/fantasy/players/$playerId"
                    params={{ playerId: player.id }}
                    onClick={onLeave}
                    className={cn(
                      "flex h-full flex-col items-center px-3 pb-4 pt-5 text-center",
                      ui.surface.card,
                      "press-tile",
                      ui.focus,
                    )}
                  >
                    <PlayerPhoto photoUrl={player.photoUrl} club={club} size="lg" />
                    <span
                      className={cn(
                        "mt-3 line-clamp-2 text-balance",
                        ui.text.bodyStrong,
                        ui.tone.default,
                      )}
                    >
                      {player.name[lang]}
                    </span>
                    <span
                      className={cn("mt-1 flex items-center gap-1.5", ui.text.meta, ui.tone.muted)}
                    >
                      {club ? <ClubCrest club={club} size="xs" /> : null}
                      <span className="min-w-0 truncate">{positionName(player.position, t)}</span>
                    </span>
                    <span className={cn("mt-auto pt-3", ui.stat.md, ui.tone.ink)}>
                      {scored
                        ? t("landing.points_value").replace("{n}", nf.format(player.totalPoints))
                        : t("landing.players_owned").replace("{n}", nf.format(player.ownership))}
                    </span>
                  </Link>
                </li>
              );
            })}
      </ul>
    </section>
  );
}

/** How far below the screen a block starts loading: about two phone screens. */
const NEAR_VIEWPORT_MARGIN = "1200px 0px";

/** True once the element is on screen or within `NEAR_VIEWPORT_MARGIN` of it. */
function useNearViewport(ref: RefObject<HTMLElement | null>): boolean {
  const [near, setNear] = useState(false);
  useEffect(() => {
    if (near) return;
    const element = ref.current;
    if (!element || typeof IntersectionObserver === "undefined") {
      setNear(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) setNear(true);
      },
      { rootMargin: NEAR_VIEWPORT_MARGIN },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref, near]);
  return near;
}

function BlockHeader({
  title,
  link,
  onLeave,
}: {
  title: string;
  link: { to: string; label: string };
  onLeave?: () => void;
}) {
  return (
    <div className="mb-3 flex items-center justify-between gap-4">
      <p className={cn(ui.display.teamSm, ui.tone.default)}>{title}</p>
      <InlineLink to={link.to} onLeave={onLeave}>
        {link.label}
      </InlineLink>
    </div>
  );
}

function InlineLink({
  to,
  onLeave,
  children,
}: {
  to: string;
  onLeave?: () => void;
  children: ReactNode;
}) {
  return (
    <Link
      to={to}
      onClick={onLeave}
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5",
        ui.space.tap,
        ui.text.bodyStrong,
        ui.tone.ink,
        ui.focus,
      )}
    >
      {children}
      <ArrowRight className="h-4 w-4" aria-hidden />
    </Link>
  );
}
