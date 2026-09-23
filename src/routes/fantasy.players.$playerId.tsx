import { stadiumPhotoFor } from "@/lib/stadium-photo";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { ClubCrest } from "@/components/common/ClubCrest";
import { DifficultyBadge } from "@/components/fantasy/DifficultyBadge";
import { JerseyVisual } from "@/components/fantasy/JerseyVisual";
import { PlayerStatusBadge } from "@/components/fantasy/PlayerStatusBadge";
import { FantasyFrame } from "@/components/fpl/FantasyFrame";
import {
  ui,
  UiBadge,
  UiCard,
  UiEmptyState,
  UiHeader,
  UiStatBlock,
  UiStatePanel,
} from "@/components/ui-kit";
import { useI18n } from "@/i18n/provider";
import type { TranslationKey } from "@/i18n/dictionaries";
import { PUBLIC_SITE_ORIGIN } from "@/lib/article-meta";
import { getKitForClub } from "@/lib/kits";
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
  head: ({ params, loaderData }) => {
    const canonical = `${PUBLIC_SITE_ORIGIN}/fantasy/players/${encodeURIComponent(params.playerId)}`;
    const playerName = loaderData?.player.name.fr;
    const title = playerName ? `${playerName} — BotolaGO Fantasy` : "Joueur — BotolaGO Fantasy";
    const description = playerName
      ? `Statistiques, forme, prix et prochains matchs de ${playerName} pour votre équipe BotolaGO Fantasy.`
      : "Statistiques, forme, prix et prochains matchs du joueur pour votre équipe BotolaGO Fantasy.";
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:type", content: "profile" },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:url", content: canonical },
        { name: "twitter:card", content: "summary_large_image" },
        { name: "twitter:title", content: title },
        { name: "twitter:description", content: description },
      ],
      links: [{ rel: "canonical", href: canonical }],
    };
  },
  component: PlayerDetailFramed,
});

type Tab = "overview" | "history" | "fixtures" | "stats";
const tabs: { key: Tab; label: TranslationKey }[] = [
  { key: "overview", label: "fantasy.players.tab.overview" },
  { key: "history", label: "fantasy.players.tab.history" },
  { key: "fixtures", label: "fantasy.players.tab.fixtures" },
  { key: "stats", label: "fantasy.players.tab.stats" },
];

function PlayerDetailFramed() {
  const { t } = useI18n();
  return (
    <FantasyFrame>
      <UiHeader title={t("fpl.player_info")} tone="gradient" backTo="/fantasy/players" />
      <PlayerDetailPage />
    </FantasyFrame>
  );
}

function PlayerDetailPage() {
  const { playerId } = Route.useParams();
  const loaderData = Route.useLoaderData();
  const { t, tr, lang } = useI18n();
  const nf = new Intl.NumberFormat(lang === "ar" ? "ar-MA" : "fr-FR", { maximumFractionDigits: 1 });

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
  const [tab, setTab] = useState<Tab>("overview");
  // BG-0071 — the History tab used to restate the Overview numbers in a
  // sentence. It now reads the real per-gameweek rows, and only when the tab is
  // actually opened: the RPC is one read per player and most visitors never
  // leave Overview.
  const historyQ = useQuery({
    queryKey: ["fantasy-player-history", playerId],
    queryFn: () => fantasyService.getPlayerGameweekHistory(playerId),
    enabled: tab === "history",
  });

  const p = playerQ.data;

  if (!p) {
    return (
      <div className={cn("px-4 pb-6 pt-3", ui.surface.page)}>
        {playerQ.isLoading ? (
          <UiStatePanel kind="loading" />
        ) : (
          <UiEmptyState
            title={t("fantasy.players.not_found")}
            body={t("fantasy.players.not_found_desc")}
          />
        )}
      </div>
    );
  }

  // The club list is decoration on this screen, not a precondition: blocking
  // the whole player behind it meant the server-rendered markup for a shared
  // link was an empty state.
  const clubs = clubsQ.data ?? [];
  const club = clubs.find((c) => c.id === p.clubId);
  const kit = getKitForClub(club, p.kitPattern);
  // Whatever the service returns for this club, unfiltered: a gameweek's
  // fixture set is the backend's answer, and a postponed match that has been
  // deferred out of a gameweek must not be re-added by a frontend assumption.
  const playerFixtures = (fixturesQ.data ?? []).filter((f) => f.clubId === p.clubId).slice(0, 5);

  /** An unknown figure is an en dash. A real zero is a zero. */
  const orNone = (value: number | null | undefined) =>
    value === null || value === undefined ? t("fantasy.stat.none") : nf.format(value);

  return (
    <div className={cn("px-4 pb-6 pt-3", ui.surface.page)}>
      <UiCard padding="none" className="overflow-hidden">
        {/* A stadium strip over the player's card, picked from the club so
            team-mates share a ground. Decorative. */}
        <img
          src={stadiumPhotoFor(p.clubId ?? p.id)}
          alt=""
          aria-hidden
          decoding="async"
          className="h-20 w-full object-cover rtl:-scale-x-100"
        />
        <div className="flex items-center gap-3 p-4">
          <JerseyVisual kit={kit} size={48} imageUrl={p.jerseyImageUrl} ariaLabel={tr(p.name)} />
          <div className="min-w-0 flex-1">
            {/* The heading follows the page direction, so in Arabic the name
                sits against the jersey like its subtitle does. The name is its
                own auto-direction block, shrunk to its width, so a long Latin
                name is cut at its end ("Abdelkarim Benh…"), not its start. */}
            <h2 className={cn(ui.text.section, ui.tone.default)}>
              <span dir="auto" className="block w-fit max-w-full truncate">
                {tr(p.name)}
              </span>
            </h2>
            <div className={cn("mt-0.5 flex flex-wrap items-center gap-1.5", ui.text.meta)}>
              <span className={ui.tone.muted}>
                {t(`player.pos.${p.position}` as TranslationKey)}
              </span>
              {club ? (
                <span className={cn("truncate", ui.tone.muted)}>
                  ·{" "}
                  <span dir="auto" className="truncate">
                    {tr(club.name)}
                  </span>
                </span>
              ) : null}
              {p.status !== "available" ? <PlayerStatusBadge status={p.status} /> : null}
            </div>
          </div>
          <UiStatBlock align="end" tone="ink" value={nf.format(p.price)} sub={t("fantasy.price")} />
        </div>
      </UiCard>

      {/* Four labels, so this is a real segmented control again rather than a
          scrolling strip. The strip existed for the fifth tab: "Aperçu ·
          Historique · Calendrier · Statistiques · Actualités" does not fit
          390px in French, so it scrolled rather than shrink under the tap
          floor. Without "Actualités" the four share the width evenly —
          `grid-cols-4` with `min-w-0` children, which is what makes the
          truncation below able to fire at all. */}
      <div
        role="tablist"
        aria-label={t("fpl.player_info")}
        className={cn("mt-3 grid grid-cols-4 gap-1 p-[3px]", ui.radius.track, ui.surface.sunken)}
      >
        {tabs.map((it) => {
          const active = it.key === tab;
          return (
            <button
              key={it.key}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setTab(it.key)}
              className={cn(
                // `min-w-0` so a grid track may be narrower than its content,
                // which is what lets `truncate` do anything; without it the
                // track sizes to the longest label and the row overflows.
                "min-w-0 truncate px-1.5 transition-colors",
                "min-h-[var(--ui-tap-min)]",
                ui.radius.segment,
                ui.text.meta,
                "[font-weight:var(--ui-weight-strong)]",
                ui.focus,
                // The selected tab paints exactly what `UiSegmented`'s does:
                // the surface fill, the card shadow and the brand foreground.
                // It used to borrow `ui.surface.card` for that — which also
                // carries `rounded-[var(--ui-radius-control)]`, and `cn()`
                // merged it over the `ui.radius.segment` two lines above, so
                // the selected tab rendered at 6px while the token set says a
                // selected tab is 8px. Spelling the fill keeps the radius the
                // one this element asked for.
                active
                  ? cn("bg-[color:var(--ui-surface)] shadow-[var(--ui-shadow-card)]", ui.tone.ink)
                  : ui.tone.muted,
              )}
            >
              {t(it.label)}
            </button>
          );
        })}
      </div>

      <div className="mt-3">
        {tab === "overview" ? (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <StatTile label={t("fantasy.total_points")} value={nf.format(p.totalPoints)} />
            <StatTile label={t("fantasy.form")} value={orNone(p.form)} />
            <StatTile label={t("fantasy.ownership")} value={`${nf.format(p.ownership)}%`} />
            <StatTile label={t("fantasy.expected_points")} value={orNone(p.expectedPoints)} />
          </div>
        ) : null}

        {tab === "history" ? (
          <div className="grid gap-1.5">
            {historyQ.isLoading ? <UiStatePanel kind="loading" /> : null}
            {/* A player with no scored gameweek has no rows at all — which is
                every player until GW1 closes. That is an empty state, not an
                error, and not a row of zeros. */}
            {!historyQ.isLoading && (historyQ.data ?? []).length === 0 ? (
              <UiEmptyState
                title={t("fantasy.players.no_history")}
                body={t("fantasy.players.no_history_desc")}
              />
            ) : null}
            {(historyQ.data ?? []).map((entry) => (
              <div
                key={entry.gameweekId}
                className={cn("flex items-center gap-2 py-2", ui.rule.block)}
              >
                <div className={cn("w-14 shrink-0", ui.text.micro, ui.tone.muted)}>
                  {entry.gameweekName}
                </div>
                <div className={cn("min-w-0 flex-1", ui.text.meta, ui.tone.default)}>
                  {/* `opponents` is an array: a club can play twice in one
                      gameweek after a fixture reassignment. */}
                  {entry.opponents.map((opponent) => (
                    <span key={opponent.teamId} className="me-1.5">
                      <bdi>{opponent.shortName}</bdi>{" "}
                      <span className={ui.tone.muted}>
                        ({opponent.home ? t("common.home") : t("common.away")})
                      </span>
                    </span>
                  ))}
                  {entry.state === "provisional" ? (
                    <UiBadge className="ms-1">{t("fantasy.points.status.provisional")}</UiBadge>
                  ) : null}
                </div>
                <div className={cn("w-14 shrink-0 text-end", ui.stat.sm, ui.tone.muted)}>
                  {nf.format(entry.minutesPlayed)} {t("home.minutes")}
                </div>
                <div className={cn("w-14 shrink-0 text-end", ui.stat.sm, ui.tone.default)}>
                  {nf.format(entry.points)} {t("fantasy.points.abbr")}
                </div>
              </div>
            ))}
          </div>
        ) : null}

        {tab === "fixtures" ? (
          <div className="grid gap-1.5">
            {playerFixtures.length === 0 ? (
              <UiEmptyState
                title={t("fantasy.players.no_fixtures")}
                body={t("fantasy.players.no_fixtures_desc")}
              />
            ) : null}
            {playerFixtures.map((f) => {
              const opp = clubs.find((c) => c.id === f.opponentClubId);
              return (
                <div
                  key={`${f.gameweek}-${f.opponentClubId}-${f.isHome ? "h" : "a"}`}
                  className={cn("flex items-center gap-2 py-2", ui.rule.block)}
                >
                  <div className={cn("w-14 shrink-0", ui.text.micro, ui.tone.muted)}>
                    GW {f.gameweek}
                  </div>
                  {opp ? <ClubCrest club={opp} size="sm" /> : null}
                  <div className={cn("min-w-0 flex-1", ui.text.meta, ui.tone.default)}>
                    <bdi>{opp ? tr(opp.shortName) : ""}</bdi>{" "}
                    <span className={ui.tone.muted}>
                      ({f.isHome ? t("common.home") : t("common.away")})
                    </span>
                    {f.isDouble ? (
                      <UiBadge tone="positive" className="ms-1">
                        {t("fantasy.fixtures.double")}
                      </UiBadge>
                    ) : null}
                    {f.isBlank ? (
                      <UiBadge className="ms-1">{t("fantasy.fixtures.blank")}</UiBadge>
                    ) : null}
                  </div>
                  <DifficultyBadge
                    difficulty={f.difficulty}
                    label={String(f.difficulty)}
                    className="w-11 shrink-0"
                  />
                </div>
              );
            })}
          </div>
        ) : null}

        {tab === "stats" ? (
          <dl className="grid grid-cols-2 gap-2">
            <StatRow k={t("fantasy.form")} v={orNone(p.form)} />
            <StatRow k={t("fantasy.total_points")} v={nf.format(p.totalPoints)} />
            <StatRow k={t("fantasy.expected_points")} v={orNone(p.expectedPoints)} />
            <StatRow k={t("fantasy.ownership")} v={`${nf.format(p.ownership)}%`} />
            <StatRow k={t("fantasy.price")} v={nf.format(p.price)} />
            <StatRow
              k={t("fantasy.picker.filter_status")}
              v={t(`player.status.${p.status}` as TranslationKey)}
            />
          </dl>
        ) : null}
      </div>
    </div>
  );
}

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <UiStatBlock
      align="center"
      tone="ink"
      label={label}
      value={value}
      className={cn("px-2 py-3", ui.radius.control, ui.rule.all)}
    />
  );
}

function StatRow({ k, v }: { k: string; v: string }) {
  return (
    <div className={cn("px-3 py-2", ui.radius.control, ui.surface.sunken)}>
      <dt className={cn(ui.text.label, ui.tone.muted)}>{k}</dt>
      <dd className={cn(ui.stat.sm, ui.tone.default)}>{v}</dd>
    </div>
  );
}
