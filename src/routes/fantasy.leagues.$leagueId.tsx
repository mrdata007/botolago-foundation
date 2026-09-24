import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { CupInfo } from "@/components/fantasy-lists/CupInfo";
import { LeagueInviteCard } from "@/components/fantasy-lists/LeagueInviteCard";
import {
  compactMoveFormat,
  formatMove,
  rankFigure,
  STANDINGS_FIGURE_CELL,
  STANDINGS_NAME_CELL,
} from "@/components/fantasy-lists/standings";
import { FantasyFrame } from "@/components/fpl/FantasyFrame";
import { FantasyScreenGate } from "@/components/fpl/FantasyScreenGate";
import { useFantasyScreen } from "@/components/fpl/useFantasyScreen";
import {
  ui,
  UiButton,
  UiCard,
  UiEmptyState,
  UiErrorState,
  UiHeader,
  UiPill,
  UiRankMovement,
  UiSkeleton,
  UiTable,
  UiTabs,
  UiTBody,
  UiTD,
  UiTH,
  UiTHead,
  UiTR,
} from "@/components/ui-kit";
import { useI18n } from "@/i18n/provider";
import { MATCH_TIME_ZONE } from "@/lib/match-kickoff";
import { cn } from "@/lib/utils";
import { useFantasyDataSource } from "@/services/fantasy-data-source";
import { fantasyService } from "@/services/fantasy-runtime";

export const Route = createFileRoute("/fantasy/leagues/$leagueId")({
  component: LeagueDetailPage,
});

/**
 * League detail: the league's name in the header, underline tabs (Ligue |
 * Coupe), the "last updated" line and the standings.
 *
 * The standings are the A-Rankings table: one card, a transparent head of
 * kicker labels, rank / team over manager / gameweek / total, and the quiet
 * ▲/▼ movement. Rank, gameweek and total are scanned one column at a time, so
 * they are tabular figures aligned to the inline-end edge, and the column
 * order mirrors with the document rather than by hand. The gameweek column
 * says "J.14" in both languages; it used to be an English "GW14".
 */
function LeagueDetailPage() {
  return (
    <FantasyFrame bottomNav>
      <LeagueDetailBody />
    </FantasyFrame>
  );
}

function LeagueDetailBody() {
  const { leagueId } = Route.useParams();
  const { t, lang } = useI18n();
  const qc = useQueryClient();
  const screen = useFantasyScreen();
  const { key } = useFantasyDataSource();
  const [tab, setTab] = useState<"league" | "cup">("league");
  const [busy, setBusy] = useState(false);

  const leagueQ = useQuery({
    queryKey: key("league", leagueId),
    queryFn: () => fantasyService.getLeague(leagueId),
    enabled: screen.phase === "ready",
  });
  const standingsQ = useQuery({
    queryKey: key("standings", leagueId),
    queryFn: () => fantasyService.getLeagueStandings(leagueId),
    enabled: screen.phase === "ready",
  });
  const gw = screen.gameweek?.number ?? null;
  const nf = new Intl.NumberFormat(lang === "ar" ? "ar-MA" : "fr-FR");
  // The owner cannot leave their own league (api.leave_fantasy_league refuses
  // the owner role), so the owner gets the invite code card where everyone
  // else gets the Leave button. `creator` is the mock store's name for owner.
  const isOwner = leagueQ.data?.role === "owner" || leagueQ.data?.role === "creator";

  const leave = async () => {
    if (!leagueQ.data || busy) return;
    setBusy(true);
    try {
      await fantasyService.leaveLeague(leagueQ.data.id);
      await qc.invalidateQueries({ queryKey: key("leagues", "private") });
      toast.success(t("fantasy.leagues.left"));
      window.history.back();
    } catch {
      toast.error(t("state.error"));
    } finally {
      setBusy(false);
    }
  };

  // BG-0100: pinned to the competition calendar, never the viewer's. A
  // formatter without `timeZone` disagrees with every other time on the page.
  const updated = new Intl.DateTimeFormat(lang === "ar" ? "ar-MA" : "fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: MATCH_TIME_ZONE,
  }).format(new Date());

  const movementLabels = {
    up: t("fantasy.rank.up"),
    down: t("fantasy.rank.down"),
    same: t("fantasy.rank.same"),
  };
  const rows = standingsQ.data ?? [];
  // A public league can be thousands strong: a five-digit rank takes the
  // small stat step, and a move of a thousand places or more is compact.
  const rankStep = rankFigure(Math.max(1, ...rows.map((row) => row.rank)));
  const compactNf = compactMoveFormat(lang === "ar" ? "ar-MA" : "fr-FR");

  return (
    <>
      <UiHeader
        kicker={t("nav.fantasy")}
        title={leagueQ.data?.name ?? t("fpl.league")}
        backTo="/fantasy/leagues"
      />
      <FantasyScreenGate state={screen} next={`/fantasy/leagues/${leagueId}`}>
        <UiTabs
          value={tab}
          onChange={setTab}
          label={t("fpl.league")}
          idBase="league"
          className="px-2"
          options={[
            { value: "league", label: t("fpl.league"), panelId: "league-panel-league" },
            { value: "cup", label: t("fpl.cups"), panelId: "league-panel-cup" },
          ]}
        />
        <section
          role="tabpanel"
          id={`league-panel-${tab}`}
          aria-labelledby={`league-tab-${tab}`}
          className={cn("px-4 pb-8 pt-4", ui.surface.page)}
        >
          {tab === "league" ? (
            <>
              <p className={cn("text-center", ui.text.meta, ui.tone.muted)}>
                {t("fpl.last_updated")}:{" "}
                <strong className={cn(ui.tone.default, "[font-weight:var(--ui-weight-heavy)]")}>
                  {updated}
                </strong>
              </p>

              <div className="mt-4">
                {standingsQ.isPending ? (
                  <div role="status" aria-label={t("state.loading")} className="space-y-2">
                    <UiSkeleton className="h-12" />
                    <UiSkeleton className="h-12" />
                    <UiSkeleton className="h-12" />
                    <UiSkeleton className="h-12" />
                  </div>
                ) : standingsQ.isError ? (
                  <UiErrorState onRetry={() => void standingsQ.refetch()} />
                ) : rows.length === 0 ? (
                  <UiEmptyState
                    title={t("fpl.no_data_yet")}
                    body={t("fantasy.leagues.no_standings")}
                  />
                ) : (
                  <UiCard padding="none" className="overflow-hidden">
                    {/* The figure columns size to their content and the name
                        column takes the rest without being able to widen the
                        table (see `standings.ts`), so a long team name wraps
                        in its own cell instead of pushing Total off-screen. */}
                    <UiTable caption={t("fantasy.leagues.standings")}>
                      <UiTHead className="bg-transparent">
                        <UiTR>
                          <UiTH className={cn("ps-4", STANDINGS_FIGURE_CELL)}>{t("fpl.pos")}</UiTH>
                          <UiTH className={STANDINGS_NAME_CELL}>{t("fpl.team")}</UiTH>
                          <UiTH numeric className={STANDINGS_FIGURE_CELL} title={t("fpl.gameweek")}>
                            {gw
                              ? `${t("fantasy.leagues.gw")}${nf.format(gw)}`
                              : t("fantasy.leagues.gw")}
                          </UiTH>
                          <UiTH numeric className={STANDINGS_FIGURE_CELL}>
                            {t("fpl.total")}
                          </UiTH>
                          <UiTH numeric className={cn("pe-4", STANDINGS_FIGURE_CELL)}>
                            <span aria-hidden>+/−</span>
                            <span className="sr-only">{t("fantasy.leagues.movement")}</span>
                          </UiTH>
                        </UiTR>
                      </UiTHead>
                      <UiTBody>
                        {rows.map((row, index) => (
                          <UiTR
                            key={row.managerId}
                            className={cn(index === rows.length - 1 && "border-b-0")}
                          >
                            <UiTD
                              className={cn(
                                "ps-4",
                                STANDINGS_FIGURE_CELL,
                                rankStep,
                                row.rank <= 3 ? ui.tone.default : ui.tone.muted,
                              )}
                            >
                              <bdi>{nf.format(row.rank)}</bdi>
                            </UiTD>
                            <UiTD className={cn("py-2.5", STANDINGS_NAME_CELL)}>
                              <span
                                dir="auto"
                                className={cn(
                                  "line-clamp-2 break-words",
                                  ui.text.secondary,
                                  "[font-weight:var(--ui-weight-strong)]",
                                  ui.tone.default,
                                )}
                              >
                                {row.teamName}
                              </span>
                              {row.managerName && row.managerName !== row.teamName ? (
                                <span
                                  dir="auto"
                                  className={cn("block truncate", ui.text.meta, ui.tone.muted)}
                                >
                                  {row.managerName}
                                </span>
                              ) : null}
                            </UiTD>
                            <UiTD numeric className={cn(STANDINGS_FIGURE_CELL, ui.tone.muted)}>
                              {nf.format(row.gameweekScore)}
                            </UiTD>
                            <UiTD
                              numeric
                              strong
                              className={cn(STANDINGS_FIGURE_CELL, ui.stat.md, ui.tone.default)}
                            >
                              {nf.format(row.totalScore)}
                            </UiTD>
                            <UiTD numeric className={cn("pe-4", STANDINGS_FIGURE_CELL)}>
                              <UiRankMovement
                                variant="quiet"
                                rank={row.rank}
                                previousRank={row.previousRank}
                                labels={movementLabels}
                                formatDelta={(places) => formatMove(places, nf, compactNf)}
                              />
                            </UiTD>
                          </UiTR>
                        ))}
                      </UiTBody>
                    </UiTable>
                  </UiCard>
                )}
              </div>

              {leagueQ.data?.type === "private" ? (
                isOwner ? (
                  <LeagueInviteCard leagueId={leagueQ.data.id} hint={leagueQ.data.inviteCodeHint} />
                ) : (
                  <UiButton
                    variant="outline"
                    className={cn("mt-6 border-[color:var(--ui-rule-strong)]", ui.tone.default)}
                    onClick={() => void leave()}
                    disabled={busy}
                  >
                    {t("fpl.leave_league")}
                  </UiButton>
                )
              ) : null}
            </>
          ) : (
            <CupInfo
              lead={
                <UiPill>{t("fpl.cup_not_started").replace("{n}", String((gw ?? 1) + 1))}</UiPill>
              }
            />
          )}
        </section>
      </FantasyScreenGate>
    </>
  );
}
