import { Link } from "@tanstack/react-router";

import { ClubCrest } from "@/components/common/ClubCrest";
import { SectionHeader } from "@/components/common/SectionHeader";
import { clubLabel, findClub } from "@/components/fantasy/club-identity";
import { ui, UiCard, UiDifficultyCell, UiLivePill, UiSkeleton } from "@/components/ui-kit";
import { useI18n } from "@/i18n/provider";
import { hubRound } from "@/lib/hub-round";
import { moroccoDateTimeFormat } from "@/lib/morocco-time";
import { pointsUnit } from "@/lib/points-unit";
import { cn } from "@/lib/utils";
import type { Club, FantasySummary, Gameweek } from "@/types/domain";
import type { FantasyPlayer, FantasyTeam, FixtureDifficulty } from "@/types/fantasy";

/**
 * The owner's round, under the team card: three figures (value, bank, rank),
 * "Mes points", and "Mes joueurs": one row per match that involves the
 * manager's players, and a dashed "Pas de match" chip for each club of theirs
 * that has none.
 *
 * Nothing is claimed that is not known. Rank is an en dash until the manager
 * is ranked. Before the round's first kickoff the points section says when
 * points start to count instead of showing a zero; without the round's
 * fixtures it says only that, and the players section shows no rows and no
 * "no match" chips (a club is "without a match" only when the round's fixtures
 * are known).
 */
export function FantasyHubRound({
  team,
  players,
  clubs,
  fixtures,
  fixturesPending,
  gameweek,
  summary,
  summaryPending,
}: {
  team: FantasyTeam;
  players: readonly FantasyPlayer[];
  clubs: readonly Club[];
  fixtures: readonly FixtureDifficulty[];
  fixturesPending: boolean;
  gameweek: Gameweek;
  summary: FantasySummary | null;
  summaryPending: boolean;
}) {
  const { t, tr, lang } = useI18n();
  const locale = lang === "ar" ? "ar-MA" : "fr-FR";
  const nf = new Intl.NumberFormat(locale);
  const money = new Intl.NumberFormat(locale, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
  const none = t("fantasy.stat.none");
  const round = hubRound(team, players, fixtures, gameweek.number);
  const playerById = new Map(players.map((player) => [player.id, player] as const));
  const club = (id: string) => findClub(clubs, id);
  const nameOf = (id: string) => {
    const player = playerById.get(id);
    return player ? tr(player.name) : "";
  };

  const dayAndTime = (iso: string) =>
    moroccoDateTimeFormat(locale, { weekday: "short", hour: "2-digit", minute: "2-digit" }).format(
      new Date(iso),
    );

  // Points: live, before the first kickoff, or the figure.
  const live = gameweek.status === "live";
  const kickoffAhead = round.firstKickoff !== null && Date.parse(round.firstKickoff) > Date.now();
  const first = round.firstMatch;
  const firstHome = first ? club(first.homeClubId) : undefined;
  const firstAway = first ? club(first.awayClubId) : undefined;
  const matchLabel =
    firstHome && firstAway ? `${clubLabel(firstHome, tr)} – ${clubLabel(firstAway, tr)}` : null;

  const tile = (label: string, value: string) => (
    <div className={cn("flex flex-col items-center px-1 py-3 text-center", ui.surface.card)}>
      <dt className={cn(ui.text.label, ui.tone.muted)}>{label}</dt>
      <dd className={cn("mt-0.5", ui.stat.lg, ui.text.tabular, ui.tone.default)}>
        <bdi>{value}</bdi>
      </dd>
    </div>
  );

  return (
    <div className={cn("mt-4 grid gap-5", ui.space.gutter)} data-testid="fantasy-hub-round">
      <dl className="grid grid-cols-3 gap-2">
        {summaryPending ? (
          <>
            <UiSkeleton className={cn("h-[4.5rem]", ui.radius.card)} />
            <UiSkeleton className={cn("h-[4.5rem]", ui.radius.card)} />
            <UiSkeleton className={cn("h-[4.5rem]", ui.radius.card)} />
          </>
        ) : (
          <>
            {tile(t("fantasy.hub.stat_value"), summary ? money.format(summary.teamValue) : none)}
            {tile(t("fantasy.hub.stat_bank"), money.format(summary?.bankValue ?? team.bank))}
            {tile(
              t("fantasy.hub.stat_rank"),
              summary?.overallRank != null ? nf.format(summary.overallRank) : none,
            )}
          </>
        )}
      </dl>

      <section>
        <SectionHeader
          as="h3"
          title={t("fantasy.hub.my_points").replace("{gw}", nf.format(gameweek.number))}
        />
        <UiCard padding="md">
          {summaryPending ? (
            <UiSkeleton className="h-10 w-32" />
          ) : kickoffAhead && !live ? (
            <p className={cn(ui.text.secondary, ui.tone.muted)}>
              {matchLabel && round.firstKickoff
                ? t("fantasy.hub.points_before")
                    .replace("{match}", matchLabel)
                    .replace("{when}", dayAndTime(round.firstKickoff))
                : t("fantasy.hub.points_unknown")}
            </p>
          ) : (
            <div className="flex items-center justify-between gap-3">
              <p className="flex items-baseline gap-1.5">
                <bdi className={cn(ui.score.md, ui.tone.default)}>
                  {summary ? nf.format(summary.gameweekPoints) : none}
                </bdi>
                <span className={cn(ui.text.secondary, ui.tone.muted)}>
                  {pointsUnit(summary?.gameweekPoints, t)}
                </span>
              </p>
              {live ? <UiLivePill /> : null}
            </div>
          )}
        </UiCard>
      </section>

      <section>
        <SectionHeader
          as="h3"
          title={t("fantasy.hub.my_players").replace("{gw}", nf.format(gameweek.number))}
        />
        {fixturesPending ? (
          <UiSkeleton className={cn("h-24", ui.radius.card)} />
        ) : round.fixtures.length === 0 && round.noMatchClubIds.length === 0 ? (
          <UiCard padding="md">
            <p className={cn(ui.text.secondary, ui.tone.muted)}>{t("fantasy.hub.players_none")}</p>
          </UiCard>
        ) : (
          <UiCard padding="none" className="divide-y divide-[color:var(--ui-rule)] overflow-hidden">
            {round.fixtures.map((row) => {
              const mine = club(row.clubId);
              const opponent = club(row.opponentClubId);
              if (!mine || !opponent) return null;
              const marker = row.isHome ? t("fpl.home_short") : t("fpl.away_short");
              const names = [...row.playerIds, ...row.opponentPlayerIds]
                .map(nameOf)
                .filter(Boolean);
              return (
                <div key={row.key} className="flex items-center gap-3 px-3 py-2.5">
                  <ClubCrest club={mine} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className={cn(ui.text.bodyStrong, ui.tone.default)}>
                      {clubLabel(mine, tr)} {t("matches.vs")} {clubLabel(opponent, tr)}{" "}
                      <span className={ui.tone.muted}>({marker})</span>
                    </p>
                    <p className={cn(ui.text.meta, ui.tone.muted)}>
                      {row.kickoffAt ? <bdi>{dayAndTime(row.kickoffAt)}</bdi> : null}
                      {row.kickoffAt && names.length > 0 ? " · " : null}
                      {names.join(", ")}
                    </p>
                  </div>
                  <UiDifficultyCell
                    difficulty={row.difficulty}
                    className="min-h-8 min-w-8 shrink-0"
                  >
                    {nf.format(row.difficulty)}
                  </UiDifficultyCell>
                </div>
              );
            })}
            {round.noMatchClubIds.map((id) => {
              const mine = club(id);
              if (!mine) return null;
              const names = team.squad
                .filter((place) => playerById.get(place.playerId)?.clubId === id)
                .map((place) => nameOf(place.playerId))
                .filter(Boolean);
              return (
                <div key={id} className="flex items-center gap-3 px-3 py-2.5">
                  <ClubCrest club={mine} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className={cn(ui.text.bodyStrong, ui.tone.default)}>{clubLabel(mine, tr)}</p>
                    <p className={cn(ui.text.meta, ui.tone.muted)}>{names.join(", ")}</p>
                  </div>
                  <span
                    className={cn(
                      "shrink-0 border border-dashed border-[color:var(--ui-rule-strong)] px-2.5 py-1",
                      ui.radius.full,
                      ui.text.meta,
                      ui.tone.muted,
                    )}
                  >
                    {t("fantasy.hub.no_match")}
                  </span>
                </div>
              );
            })}
          </UiCard>
        )}
        <Link
          to="/fantasy/fixtures"
          className={cn(
            "mt-2 inline-flex min-h-[var(--ui-tap-min)] items-center",
            ui.text.meta,
            ui.tone.ink,
            ui.focus,
          )}
        >
          {t("fpl.fdr")} ›
        </Link>
      </section>
    </div>
  );
}
