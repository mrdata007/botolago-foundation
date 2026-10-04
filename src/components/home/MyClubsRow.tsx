import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Star } from "lucide-react";

import { ClubCrest } from "@/components/common/ClubCrest";
import { MatchCard } from "@/components/common/MatchCard";
import { SectionGroupHeader } from "@/components/common/SectionHeader";
import { MatchCardSkeleton } from "@/components/common/Skeletons";
import { rankOrdinal } from "@/components/fantasy-lists/rank-ordinal";
import { STRETCHED_LINK } from "@/components/clubs/stretched-link";
import { ui, UiBadge, UiButton, UiCard } from "@/components/ui-kit";
import { useI18n } from "@/i18n/provider";
import { rowClubName } from "@/lib/club-identity";
import { clubStyle } from "@/lib/club-palette";
import { sharedPositions } from "@/lib/league-table";
import { cn } from "@/lib/utils";
import { footballService, type FootballSeason } from "@/services/football";
import type { Club, Match, TableRow } from "@/types/domain";
import { clubSpotlight, type HomeClubTile } from "./my-clubs";

/**
 * "Mes clubs" on Home: one card per club the reader favours or follows, the
 * favourite first, in a row that swipes sideways.
 *
 * Each card says where the club stands in the table and shows its next match
 * (or, when nothing is left to play, its last result) as the same match card
 * the rest of the app uses, so a date still to be confirmed reads as it does
 * everywhere else. The club's name opens its page; the match opens the match.
 *
 * The matches are the club page's own query, under the same key, so opening a
 * club from here finds them already in the cache. The table is the one Home
 * already reads for its snapshot.
 *
 * Native scroll snapping, as the News carousel does it: it follows the page's
 * direction by itself (in Arabic the first card is on the right and the next
 * comes from the left), swipes without script, and keeps every card's links
 * reachable by keyboard. The next card peeks past the edge to say there is
 * more.
 */
export function MyClubsRow({
  tiles,
  season,
  seasonReady,
  standings,
  clubById,
}: {
  tiles: ReadonlyArray<HomeClubTile<Club>>;
  /** The season the club page opens on, so the two share a cache entry. */
  season: FootballSeason | undefined;
  /** The seasons have loaded; before that the matches are not asked for. */
  seasonReady: boolean;
  standings: readonly TableRow[];
  clubById: (id: string) => Club | undefined;
}) {
  const { t } = useI18n();
  if (tiles.length === 0) return null;
  const shared = sharedPositions(standings);
  const several = tiles.length > 1;

  return (
    <div className="mb-4" data-testid="home-my-clubs">
      <SectionGroupHeader as="h3" title={t("profile.clubs.title")} />
      <ul
        className={cn(
          "flex snap-x snap-mandatory gap-2.5 overflow-x-auto overscroll-x-contain",
          "[scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        )}
      >
        {tiles.map(({ club, favorite }) => (
          <li
            key={club.id}
            className={cn(
              // A flex item, so every card takes the row's tallest height
              // instead of each ending where its own content does.
              "flex min-w-0 shrink-0 snap-start",
              several ? "basis-[88%] sm:basis-[72%]" : "basis-full",
            )}
          >
            <MyClubCard
              club={club}
              favorite={favorite}
              season={season}
              seasonReady={seasonReady}
              row={standings.find((line) => line.clubId === club.id)}
              shared={shared}
              clubById={clubById}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}

function MyClubCard({
  club,
  favorite,
  season,
  seasonReady,
  row,
  shared,
  clubById,
}: {
  club: Club;
  favorite: boolean;
  season: FootballSeason | undefined;
  seasonReady: boolean;
  row: TableRow | undefined;
  shared: ReadonlySet<number>;
  clubById: (id: string) => Club | undefined;
}) {
  const { t, tr, lang } = useI18n();
  const colours = clubStyle(club);
  const nf = new Intl.NumberFormat(lang === "ar" ? "ar-MA" : "fr-FR");

  // The club page's own query, key for key (`clubs.$clubId.tsx`).
  const matchesQ = useQuery({
    queryKey: ["football", "club-matches", club.id, season?.id ?? "none", lang],
    queryFn: () => footballService.getClubSeasonMatches(club.id, season ?? null, lang),
    enabled: seasonReady,
  });

  const lookup = (id: string) => matchesQ.data?.clubs.find((c) => c.id === id) ?? clubById(id);
  const spotlight = matchesQ.data ? clubSpotlight(matchesQ.data.matches, club.id) : undefined;

  // "3e" in French, "المركز 3" in Arabic; a place the club shares with clubs
  // level on every figure says so, as the club page's header does.
  const place = row ? rankOrdinal(row.position, lang, t, (n) => nf.format(n)) : null;
  const placeText = place ? `${place.before} ${place.figure}${place.after}`.trim() : null;
  const isShared = row ? shared.has(row.position) : false;

  const spotlightLabel =
    spotlight?.kind === "result" ? t("home.my_clubs.last_result") : t("club.next_match");

  return (
    <UiCard
      padding="none"
      className="flex min-w-0 flex-1 flex-col overflow-hidden"
      testId={`home-my-club-${club.id}`}
    >
      <div
        data-club={colours["data-club"]}
        style={colours.style}
        className={cn(
          "relative flex min-h-[var(--ui-row-min)] items-center gap-2.5 px-3.5 py-2.5",
          ui.club.tint,
          ui.edge.start,
        )}
      >
        <ClubCrest club={club} size="sm" />
        <div className="flex min-w-0 flex-1 flex-col">
          {/* The name is the link; its ::after makes the header the target. */}
          <Link
            to="/clubs/$clubId"
            params={{ clubId: club.id }}
            className={cn(
              "truncate",
              ui.text.body,
              "[font-weight:var(--ui-weight-heavy)]",
              ui.tone.default,
              STRETCHED_LINK,
            )}
          >
            {rowClubName(tr(club.shortName), tr(club.name))}
          </Link>
          {placeText ? (
            <span className={cn("truncate", ui.text.meta, ui.tone.muted)}>
              {isShared ? `${placeText} · ${t("standings.shared_rank")}` : placeText}
            </span>
          ) : null}
        </div>
        {favorite ? (
          <UiBadge tone="action" className="shrink-0 gap-1 px-2 py-0.5">
            <Star className="h-3 w-3 fill-current" aria-hidden />
            {t("profile.clubs.favorite")}
          </UiBadge>
        ) : null}
      </div>

      <div className="flex-1 border-t border-[color:var(--ui-rule)]">
        {matchesQ.isError ? (
          <div className="flex items-center justify-between gap-3 px-3.5 py-3">
            <span className={cn(ui.text.secondary, ui.tone.muted)}>{t("state.error")}</span>
            <UiButton variant="ink" size="sm" onClick={() => void matchesQ.refetch()}>
              {t("state.retry")}
            </UiButton>
          </div>
        ) : !spotlight ? (
          <MatchCardSkeleton flat />
        ) : spotlight.kind === "none" ? (
          <p className={cn("px-3.5 py-3", ui.text.secondary, ui.tone.muted)}>
            {t("club.season_empty")}
          </p>
        ) : (
          <>
            <p className={cn("px-3.5 pt-2.5", ui.text.label, ui.tone.muted)}>{spotlightLabel}</p>
            <SpotlightMatch match={spotlight.match} clubById={lookup} />
          </>
        )}
      </div>
    </UiCard>
  );
}

function SpotlightMatch({
  match,
  clubById,
}: {
  match: Match;
  clubById: (id: string) => Club | undefined;
}) {
  const home = clubById(match.homeClubId);
  const away = clubById(match.awayClubId);
  if (!home || !away) return <MatchCardSkeleton flat />;
  return <MatchCard match={match} home={home} away={away} variant="list" />;
}
