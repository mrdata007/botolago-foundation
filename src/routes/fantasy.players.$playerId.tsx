import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Star } from "lucide-react";
import { useId, type CSSProperties, type ReactNode } from "react";

import { ClubCrest } from "@/components/common/ClubCrest";
import { crestStyle } from "@/components/common/club-crest-style";
import { SectionHeader } from "@/components/common/SectionHeader";
import { FixtureCard } from "@/components/fantasy-lists/FixtureCard";
import { PointsChart } from "@/components/fantasy-lists/PointsChart";
import { ShareButton } from "@/components/fantasy-lists/ShareButton";
import { splitPlayerName, surnameStep } from "@/components/fantasy-lists/player-name";
import { recentPointsBars } from "@/components/fantasy-lists/points-chart";
import { clubLabel, findClub } from "@/components/fantasy/club-identity";
import { PlayerStatusBadge } from "@/components/fantasy/PlayerStatusBadge";
import { FantasyFrame } from "@/components/fpl/FantasyFrame";
import {
  ui,
  UiCard,
  UiDifficultyCell,
  UiEmptyState,
  UiErrorState,
  UiHeader,
  UiIconButton,
  UiLinkButton,
  UiSkeleton,
  UiStatePanel,
} from "@/components/ui-kit";
import { activeLanguage } from "@/i18n/active-language";
import { useI18n } from "@/i18n/provider";
import type { TranslationKey } from "@/i18n/dictionaries";
import { clubStyle } from "@/lib/club-palette";
import { moroccoDateTimeFormat } from "@/lib/morocco-time";
import { fantasyPlayerHead } from "@/lib/fantasy-meta";
import { useBackTo } from "@/lib/back-navigation";
import { prefetchInBrowser } from "@/lib/browser-prefetch";
import { useWatchlist } from "@/lib/fantasy-watchlist";
import { upcomingFixtures } from "@/lib/upcoming-fixtures";
import { cn } from "@/lib/utils";
import { fantasyPlayerQuery } from "@/services/fantasy-player-query";
import { fantasyService } from "@/services/fantasy-runtime";
import { clubsQuery } from "@/services/football-queries";

/** The page's reads beside the player, for the loader and the page alike. */
const playerHistoryQuery = (playerId: string) =>
  queryOptions({
    queryKey: ["fantasy-player-history", playerId],
    queryFn: () => fantasyService.getPlayerGameweekHistory(playerId),
  });
const fixtureDifficultyQuery = () =>
  queryOptions({
    queryKey: ["fixture-difficulty"],
    queryFn: () => fantasyService.getFixtureDifficulty(),
  });

export const Route = createFileRoute("/fantasy/players/$playerId")({
  /**
   * Named metadata for shared player links.
   *
   * The loader returns the whole player, not just its name, and the component
   * seeds its query with it. That is what fixes the hydration failure this
   * route used to throw on every single load (React #418, the only erroring
   * route in the product):
   *
   * `src/router.tsx` builds a fresh `QueryClient` on each side and wires no
   * SSR dehydrate/hydrate bridge, so the cache this loader warms exists ONLY
   * on the server. The server therefore rendered a fully populated player
   * page, while the browser's very first render — same component, empty cache
   * — rendered the loading state. Two different trees for the same HTML, so
   * React threw away the server tree and re-rendered from scratch, losing
   * exactly the server-rendered markup this route's metadata exists to serve.
   *
   * Router loader data, unlike query state, IS serialized to the client. Using
   * it as `initialData` makes both first renders identical, which is the
   * actual requirement; it also means the page paints from the server payload
   * instead of re-fetching what it already has.
   *
   * The player is read from the season's pool through the cache
   * (`fantasyPlayerQuery`): opened from the list, the page uses the pool the
   * list already holds instead of reading all of it again. In the browser,
   * what the page reads beside the player starts here too, without being
   * waited for (`prefetchInBrowser`): the history chart, the fixtures and the
   * club colours arrive with the player instead of after the page rendered.
   * None of it runs during the first page load (the router hydrates loader
   * data rather than running loaders), so the history stays client-only as
   * described below.
   */
  loader: async ({ params, context }) => {
    const { queryClient } = context;
    prefetchInBrowser(() =>
      Promise.all([
        queryClient.ensureQueryData(playerHistoryQuery(params.playerId)),
        queryClient.ensureQueryData(fixtureDifficultyQuery()),
        queryClient.ensureQueryData(clubsQuery(activeLanguage())),
      ]),
    );
    try {
      const player = await queryClient.ensureQueryData(
        fantasyPlayerQuery(queryClient, params.playerId),
      );
      return player ? { player } : null;
    } catch {
      return null;
    }
  },
  head: ({ params, loaderData }) => fantasyPlayerHead(params.playerId, loaderData?.player.name.fr),
  component: PlayerDetailFramed,
});

function PlayerDetailFramed() {
  return (
    // A detail page: no tab bar, and one sticky action bar in its place,
    // which has to stick from `md` too (a phone turned sideways is `md`).
    <FantasyFrame stickyBottomBar>
      <PlayerDetailPage />
    </FantasyFrame>
  );
}

/**
 * The player page (A-Player), one scroll instead of four tabs:
 *
 * - a hero in the player's club colour — "position · club", the first name
 *   light over the family name in the display face, the price on a white
 *   pill, the club's disc;
 * - the four key numbers on a lifted card that overlaps the hero;
 * - the last six gameweeks as bars ("Dernières journées");
 * - the next fixtures with their difficulty ("Prochains matchs");
 * - the actions: follow (the watchlist) and share in the header; "Comparer"
 *   and "Recruter" at the foot.
 *
 * Only what the data has. The board also shows a shirt number (the giant
 * faded "9" and "N°9"), season goals, assists, minutes and bonus, and a live
 * dot on the current gameweek: `FantasyPlayer` carries none of them, so none
 * of them is drawn.
 *
 * The per-gameweek history used to load only when its tab was opened. The
 * chart is on the page now, so it loads with the page — one read per player.
 * It is a client-only query: the server and the browser's first render both
 * show its skeleton, so the loader's hydration fix above is unaffected.
 */
function PlayerDetailPage() {
  const { playerId } = Route.useParams();
  const loaderData = Route.useLoaderData();
  const { t, tr, lang } = useI18n();
  // A player is reached from the header search, a club's squad, the players
  // list, a Fantasy screen or a shared link: Retour goes back to whichever of
  // them it was, and a reader with no in-app history lands on the list.
  const goBack = useBackTo("/fantasy/players");
  const nameId = useId();
  const watchlist = useWatchlist();
  const locale = lang === "ar" ? "ar-MA" : "fr-FR";
  const nf = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 });
  const priceNf = new Intl.NumberFormat(locale, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
  const pctNf = new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 1 });

  const queryClient = useQueryClient();
  const playerQ = useQuery({
    ...fantasyPlayerQuery(queryClient, playerId),
    // Identical on the server and on the client's first render — see the
    // loader comment. Without this the two trees disagree and React #418.
    initialData: loaderData?.player,
  });
  const clubsQ = useQuery(clubsQuery(lang));
  const fixturesQ = useQuery(fixtureDifficultyQuery());
  // BG-0071 — the real per-gameweek rows from api.fantasy_player_gameweek_history.
  const historyQ = useQuery(playerHistoryQuery(playerId));

  const p = playerQ.data;
  const watched = p ? watchlist.isWatched(p.id) : false;

  const header = (
    <UiHeader
      kicker={t("nav.fantasy")}
      title={t("fpl.player")}
      onBack={goBack}
      trailing={
        p ? (
          <>
            <ShareButton title={tr(p.name)} />
            <UiIconButton
              aria-label={t("fantasy.players.watchlist")}
              aria-pressed={watched}
              variant={watched ? "ink" : "soft"}
              onClick={() => watchlist.toggle(p.id)}
            >
              <Star className={cn(watched && "fill-current")} aria-hidden />
            </UiIconButton>
          </>
        ) : undefined
      }
    />
  );

  if (!p) {
    return (
      <>
        {header}
        <div className={cn("px-4 pb-6 pt-4", ui.surface.page)}>
          {playerQ.isLoading ? (
            <UiStatePanel kind="loading" />
          ) : (
            <UiEmptyState
              title={t("fantasy.players.not_found")}
              body={t("fantasy.players.not_found_desc")}
            />
          )}
        </div>
      </>
    );
  }

  // The club list is decoration on this screen, not a precondition: blocking
  // the whole player behind it meant the server-rendered markup for a shared
  // link was an empty state. Until it arrives the hero is the brand ink.
  const clubs = clubsQ.data ?? [];
  const club = findClub(clubs, p.clubId);
  const colours = club ? crestStyle(club) : clubStyle(null);
  const name = splitPlayerName(tr(p.name));
  // The backend's answer for this club, minus matches that have already kicked
  // off (it returns the whole gameweek, played matches included). A fixture
  // with no kickoff time is kept, so a postponed match is not re-added or lost
  // by a frontend assumption.
  const playerFixtures = upcomingFixtures(
    (fixturesQ.data ?? []).filter((f) => f.clubId === p.clubId),
  ).slice(0, 5);
  const bars = recentPointsBars(historyQ.data ?? []);
  // Minutes over the whole season: the sum of the history rows, an en dash
  // while it loads or when the player has no scored round at all.
  const seasonMinutes =
    historyQ.data && historyQ.data.length > 0
      ? historyQ.data.reduce((sum, entry) => sum + entry.minutesPlayed, 0)
      : null;
  const nextFixture = playerFixtures[0];
  const nextOpponent = nextFixture ? findClub(clubs, nextFixture.opponentClubId) : undefined;

  /** An unknown figure is an en dash. A real zero is a zero. */
  const orNone = (value: number | null | undefined) =>
    value === null || value === undefined ? t("fantasy.stat.none") : nf.format(value);

  const facts = [
    t(`player.pos.${p.position}` as TranslationKey),
    club ? clubLabel(club, tr) : null,
  ].filter(Boolean);

  return (
    <>
      {header}

      {/* The hero: the club's fill with its measured foreground, the diagonal
          club stripes (their angle mirrors in Arabic) and nothing literal. */}
      <section
        aria-labelledby={nameId}
        data-club={colours["data-club"]}
        style={colours.style}
        className={cn(ui.club.fill, ui.club.stripes, "px-4 pb-12 pt-4")}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className={cn("truncate", ui.text.label)}>{facts.join(" · ")}</p>
            <h2 id={nameId} className="mt-1">
              {name.first ? (
                <span
                  dir="auto"
                  className={cn(
                    "block truncate",
                    ui.display.teamLg,
                    "[font-weight:var(--ui-weight-body)]",
                  )}
                >
                  {name.first}
                </span>
              ) : null}
              <span
                dir="auto"
                className={cn(
                  "block text-balance break-words",
                  surnameStep(name.last) === "hero" ? ui.display.hero : ui.display.title,
                )}
              >
                {name.last}
              </span>
            </h2>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span
                className={cn(
                  "inline-flex items-baseline gap-1.5 px-3 py-1",
                  ui.radius.full,
                  ui.surface.bar,
                  ui.shadow.card,
                )}
              >
                <span className={cn(ui.text.label, ui.tone.muted)}>{t("fantasy.price")}</span>
                <bdi className={ui.stat.md}>{priceNf.format(p.price)}</bdi>
                <span className={cn(ui.text.meta, "[font-weight:var(--ui-weight-heavy)]")}>
                  {t("fantasy.players.price_unit")}
                </span>
              </span>
              {p.status !== "available" ? <PlayerStatusBadge status={p.status} /> : null}
            </div>
          </div>
          {club ? <ClubCrest club={club} size="lg" tone="inverse" /> : null}
        </div>
      </section>

      {/* No fill of its own: the card's negative margin collapses through this
          wrapper, and a page-coloured wrapper would then paint over the
          hero's foot instead of letting the card overlap it. */}
      <div>
        {/* The key numbers: a row of different figures laid out as a grid,
            so the tabular stat ramp, not the display face. */}
        <UiCard
          padding="none"
          className={cn(
            "relative z-10 mx-4 -mt-8 overflow-hidden",
            ui.radius.sheet,
            ui.shadow.lifted,
          )}
        >
          <dl className="grid grid-cols-4 py-3.5">
            <KeyNumber label={t("fantasy.points.title")} value={nf.format(p.totalPoints)} />
            <KeyNumber label={t("fantasy.form")} value={orNone(p.form)} divided />
            <KeyNumber
              label={t("fantasy.players.minutes")}
              value={historyQ.isPending ? t("fantasy.stat.none") : orNone(seasonMinutes)}
              divided
            />
            <KeyNumber
              label={t("fantasy.ownership")}
              value={<Percent parts={pctNf.formatToParts(p.ownership / 100)} />}
              divided
            />
          </dl>
        </UiCard>

        {nextFixture && nextOpponent ? (
          <section className="mt-6 px-4" data-testid="player-next-match">
            <SectionHeader title={t("fantasy.players.next_match")} />
            <UiCard padding="md">
              <div className="flex items-center gap-3">
                <ClubCrest club={nextOpponent} size="md" />
                <div className="min-w-0 flex-1">
                  <p className={cn(ui.text.bodyStrong, ui.tone.default)}>
                    {t("matches.vs")} {clubLabel(nextOpponent, tr)}
                  </p>
                  <p className={cn(ui.text.meta, ui.tone.muted)}>
                    {nextFixture.isHome ? t("fantasy.players.home") : t("fantasy.players.away")}
                    {nextFixture.kickoffAt ? (
                      <>
                        {" · "}
                        <bdi>
                          {moroccoDateTimeFormat(locale, {
                            weekday: "short",
                            day: "numeric",
                            month: "short",
                            hour: "2-digit",
                            minute: "2-digit",
                          }).format(new Date(nextFixture.kickoffAt))}
                        </bdi>
                      </>
                    ) : null}
                  </p>
                  {p.expectedPoints !== undefined && p.expectedPoints !== null ? (
                    <p className={cn(ui.text.meta, ui.tone.muted)}>
                      {t("fantasy.players.next_xpts")}{" "}
                      <span className={ui.text.tabular}>{nf.format(p.expectedPoints)}</span>
                    </p>
                  ) : null}
                </div>
                <UiDifficultyCell difficulty={nextFixture.difficulty} className="min-w-12 shrink-0">
                  {t("fantasy.fixtures.difficulty")} {nf.format(nextFixture.difficulty)}
                </UiDifficultyCell>
              </div>
            </UiCard>
          </section>
        ) : null}

        <section className="mt-6 px-4">
          <SectionHeader
            title={t("fantasy.players.recent")}
            action={<Caption>{t("fantasy.points.title")}</Caption>}
          />
          {historyQ.isPending ? (
            <UiSkeleton className={cn("h-32", ui.radius.card)} />
          ) : historyQ.isError ? (
            <UiErrorState onRetry={() => void historyQ.refetch()} />
          ) : bars.length === 0 ? (
            // A player with no scored gameweek has no rows at all — which is
            // every player until GW1 closes. That is an empty state, not an
            // error, and not a row of zeros.
            <UiEmptyState
              title={t("fantasy.players.no_history")}
              body={t("fantasy.players.no_history_desc")}
            />
          ) : (
            <div data-club={colours["data-club"]} style={colours.style}>
              <UiCard padding="none" className="px-2.5 pb-2.5 pt-3">
                <PointsChart bars={bars} label={t("fantasy.players.recent")} />
              </UiCard>
            </div>
          )}
        </section>

        <section className="mt-6 px-4">
          <SectionHeader
            title={t("fantasy.players.upcoming")}
            action={
              <Caption>
                {t("fantasy.fixtures.difficulty")} <bdi dir="ltr">1–5</bdi>
              </Caption>
            }
          />
          {fixturesQ.isPending ? (
            <div className="grid grid-cols-3 gap-2">
              <UiSkeleton className={cn("h-28", ui.radius.card)} />
              <UiSkeleton className={cn("h-28", ui.radius.card)} />
              <UiSkeleton className={cn("h-28", ui.radius.card)} />
            </div>
          ) : playerFixtures.length === 0 ? (
            <UiEmptyState
              title={t("fantasy.players.no_fixtures")}
              body={t("fantasy.players.no_fixtures_desc")}
            />
          ) : (
            <ul className="grid grid-cols-3 gap-2">
              {playerFixtures.map((f) => (
                <FixtureCard
                  key={`${f.gameweek}-${f.opponentClubId}-${f.isHome ? "h" : "a"}`}
                  fixture={f}
                  opponent={findClub(clubs, f.opponentClubId)}
                />
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* The actions sit above the bottom navigation while the page scrolls,
          on a fade of the page colour (`to bottom`, so it reads the same in
          Arabic). "Comparer" opens the players list with this player already
          picked for comparison; "Recruter" opens the transfer flow, as it
          does on the top players screen — bringing a player in always means
          choosing who goes out first.

          A child of the column itself, not of the wrapper above (BG-0154): a
          sticky box only travels inside its parent, and the wrapper starts
          below the hero, so in a short window (a phone turned sideways) the
          bar could not reach the window's bottom edge at the top of the page
          and its buttons hung below it. `mb-6` is the wrapper's old `pb-6`,
          so the spacing is the same. */}
      <div
        // The page has no bottom navigation, so the bar is the bottom edge:
        // clear of the iPhone's home indicator, 12px where there is none.
        className="sticky bottom-0 z-20 mb-6 mt-2 flex gap-2.5 px-4 pb-[max(env(safe-area-inset-bottom),0.75rem)] pt-6"
        style={
          {
            backgroundImage:
              "linear-gradient(to bottom, color-mix(in srgb, var(--ui-page) 0%, transparent), var(--ui-page) 38%)",
          } as CSSProperties
        }
      >
        <UiLinkButton
          to="/fantasy/players"
          search={{ compare: p.id }}
          variant="outline"
          className={cn(
            "flex-1 border-[color:var(--ui-rule-strong)] bg-[color:var(--ui-surface)]",
            ui.tone.default,
          )}
        >
          {t("fantasy.players.compare")}
        </UiLinkButton>
        <UiLinkButton to="/fantasy/transfers" className="flex-[1.7]">
          <Plus className="h-5 w-5" aria-hidden />
          {t("fantasy.players.recruit_price").replace("{price}", priceNf.format(p.price))}
        </UiLinkButton>
      </div>
    </>
  );
}

function Caption({ children }: { children: ReactNode }) {
  return (
    <span className={cn(ui.text.meta, "[font-weight:var(--ui-weight-strong)]", ui.tone.muted)}>
      {children}
    </span>
  );
}

/** One key number: the figure over its label, divided from its neighbour by a logical rule. */
function KeyNumber({
  label,
  value,
  divided = false,
}: {
  label: string;
  value: ReactNode;
  divided?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex min-w-0 flex-col-reverse items-center justify-end gap-0.5 px-0.5 text-center",
        divided && ui.rule.inline,
      )}
    >
      <dt className={cn("max-w-full text-balance", ui.text.label, ui.tone.muted)}>{label}</dt>
      <dd className={cn("max-w-full truncate", ui.stat.lg, ui.tone.default)}>
        <bdi>{value}</bdi>
      </dd>
    </div>
  );
}

/**
 * A percentage with its sign set smaller than the figure, as the board draws
 * "51,2 %": the locale still decides where the sign goes and which spacing
 * and direction marks surround it; only the sign's size changes. At 320px a
 * full-size "31,5 %" did not fit a quarter of the card.
 */
function Percent({ parts }: { parts: Intl.NumberFormatPart[] }) {
  return (
    <>
      {parts.map((part, index) =>
        part.type === "percentSign" ? (
          <span
            key={index}
            className={cn(ui.text.secondary, "[font-weight:var(--ui-weight-heavy)]")}
          >
            {part.value}
          </span>
        ) : (
          part.value
        ),
      )}
    </>
  );
}
