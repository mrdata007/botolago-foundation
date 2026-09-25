import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
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
  UiEmptyState,
  UiErrorState,
  UiHeader,
  UiIconButton,
  UiLinkButton,
  UiSkeleton,
  UiStatePanel,
} from "@/components/ui-kit";
import { useI18n } from "@/i18n/provider";
import type { TranslationKey } from "@/i18n/dictionaries";
import { clubStyle } from "@/lib/club-palette";
import { fantasyPlayerHead } from "@/lib/fantasy-meta";
import { useWatchlist } from "@/lib/fantasy-watchlist";
import { cn } from "@/lib/utils";
import { fantasyService } from "@/services/fantasy-runtime";
import { footballService } from "@/services/football";

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
   */
  loader: async ({ params, context }) => {
    try {
      const player = await context.queryClient.ensureQueryData({
        queryKey: ["fantasy-player", params.playerId],
        queryFn: () => fantasyService.getPlayer(params.playerId),
      });
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
    <FantasyFrame bottomNav>
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
  const nameId = useId();
  const watchlist = useWatchlist();
  const locale = lang === "ar" ? "ar-MA" : "fr-FR";
  const nf = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 });
  const priceNf = new Intl.NumberFormat(locale, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
  const pctNf = new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 1 });

  const playerQ = useQuery({
    queryKey: ["fantasy-player", playerId],
    queryFn: () => fantasyService.getPlayer(playerId),
    // Identical on the server and on the client's first render — see the
    // loader comment. Without this the two trees disagree and React #418.
    initialData: loaderData?.player,
  });
  const clubsQ = useQuery({
    queryKey: ["football", "clubs", lang],
    queryFn: () => footballService.getClubs(lang),
  });
  const fixturesQ = useQuery({
    queryKey: ["fixture-difficulty"],
    queryFn: () => fantasyService.getFixtureDifficulty(),
  });
  // BG-0071 — the real per-gameweek rows from api.fantasy_player_gameweek_history.
  const historyQ = useQuery({
    queryKey: ["fantasy-player-history", playerId],
    queryFn: () => fantasyService.getPlayerGameweekHistory(playerId),
  });

  const p = playerQ.data;
  const watched = p ? watchlist.isWatched(p.id) : false;

  const header = (
    <UiHeader
      kicker={t("nav.fantasy")}
      title={t("fpl.player")}
      backTo="/fantasy/players"
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
  // Whatever the service returns for this club, unfiltered: a gameweek's
  // fixture set is the backend's answer, and a postponed match that has been
  // deferred out of a gameweek must not be re-added by a frontend assumption.
  const playerFixtures = (fixturesQ.data ?? []).filter((f) => f.clubId === p.clubId).slice(0, 5);
  const bars = recentPointsBars(historyQ.data ?? []);

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
      <div className="pb-6">
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
              label={t("fantasy.ownership")}
              value={<Percent parts={pctNf.formatToParts(p.ownership / 100)} />}
              divided
            />
            <KeyNumber
              label={t("fantasy.expected_points")}
              value={orNone(p.expectedPoints)}
              divided
            />
          </dl>
        </UiCard>

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

        {/* The actions sit above the bottom navigation while the page scrolls,
            on a fade of the page colour (`to bottom`, so it reads the same in
            Arabic). "Comparer" opens the players list with this player already
            picked for comparison; "Recruter" opens the transfer flow, as it
            does on the top players screen — bringing a player in always means
            choosing who goes out first. */}
        <div
          className="sticky bottom-[var(--bottomnav-h)] z-20 mt-2 flex gap-2.5 px-4 pb-3 pt-6 md:bottom-0"
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
            {t("fantasy.top.transfer_in")}
          </UiLinkButton>
        </div>
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
