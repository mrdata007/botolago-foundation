import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

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
  UiSegmented,
  UiSkeleton,
  UiTable,
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
 * League detail: the league name in the header, a League / Cup control, the
 * "last updated" line and the Pos / Team / GW / Total standings.
 *
 * The standings are a `UiTable`: rank, team, gameweek score, total and
 * movement are scanned one column at a time, the numeric columns carry
 * tabular figures aligned to the inline-end edge, and the column order
 * mirrors with the document direction rather than being mirrored by hand.
 */
function LeagueDetailPage() {
  return (
    <FantasyFrame>
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

  return (
    <>
      <UiHeader
        title={leagueQ.data?.name ?? t("fpl.league")}
        tone="gradient"
        backTo="/fantasy/leagues"
      >
        <UiSegmented
          className="mt-3"
          tone="onGradient"
          value={tab}
          onChange={setTab}
          label={t("fpl.league")}
          options={[
            { value: "league", label: t("fpl.league") },
            { value: "cup", label: t("fpl.cups") },
          ]}
        />
      </UiHeader>
      <FantasyScreenGate state={screen} next={`/fantasy/leagues/${leagueId}`}>
        {tab === "league" ? (
          <div className={ui.surface.page}>
            <p className={cn("px-4 py-3 text-center", ui.rule.block, ui.text.meta, ui.tone.muted)}>
              {t("fpl.last_updated")}:{" "}
              <strong className={cn(ui.tone.default, "[font-weight:var(--ui-weight-heavy)]")}>
                {updated}
              </strong>
            </p>

            {standingsQ.isPending ? (
              <div role="status" aria-label={t("state.loading")} className="m-4 space-y-2">
                <UiSkeleton className="h-10" />
                <UiSkeleton className="h-10" />
                <UiSkeleton className="h-10" />
                <UiSkeleton className="h-10" />
              </div>
            ) : standingsQ.isError ? (
              <div className="p-4">
                <UiErrorState onRetry={() => void standingsQ.refetch()} />
              </div>
            ) : rows.length === 0 ? (
              <div className="p-4">
                <UiEmptyState
                  title={t("fpl.no_data_yet")}
                  body={t("fantasy.leagues.no_standings")}
                />
              </div>
            ) : (
              // `table-fixed`: header-sized columns, so a long team name
              // truncates in its own cell instead of pushing Total off a
              // 390px screen.
              <UiTable caption={t("fantasy.leagues.standings")} tableClassName="table-fixed">
                <UiTHead>
                  <UiTR>
                    <UiTH numeric className="w-10">
                      {t("fpl.pos")}
                    </UiTH>
                    <UiTH>{t("fpl.team")}</UiTH>
                    <UiTH numeric className="w-12" title={t("fpl.gameweek")}>
                      {gw ? `GW${gw}` : t("fantasy.leagues.gw")}
                    </UiTH>
                    <UiTH numeric className="w-14">
                      {t("fpl.total")}
                    </UiTH>
                    <UiTH numeric className="w-9">
                      <span className="sr-only">{t("fantasy.leagues.movement")}</span>
                    </UiTH>
                  </UiTR>
                </UiTHead>
                <UiTBody>
                  {rows.map((row) => (
                    <UiTR key={row.managerId}>
                      <UiTD numeric strong>
                        {nf.format(row.rank)}
                      </UiTD>
                      <UiTD>
                        <span
                          dir="auto"
                          className={cn(
                            "block truncate",
                            ui.text.body,
                            "[font-weight:var(--ui-weight-heavy)]",
                          )}
                        >
                          {row.teamName}
                        </span>
                        {row.managerName && row.managerName !== row.teamName ? (
                          <span
                            dir="auto"
                            className={cn("block truncate", ui.text.micro, ui.tone.muted)}
                          >
                            {row.managerName}
                          </span>
                        ) : null}
                      </UiTD>
                      <UiTD numeric className={ui.tone.muted}>
                        {nf.format(row.gameweekScore)}
                      </UiTD>
                      <UiTD numeric strong>
                        {nf.format(row.totalScore)}
                      </UiTD>
                      <UiTD numeric>
                        <UiRankMovement
                          rank={row.rank}
                          previousRank={row.previousRank}
                          labels={movementLabels}
                        />
                      </UiTD>
                    </UiTR>
                  ))}
                </UiTBody>
              </UiTable>
            )}

            {leagueQ.data?.type === "private" ? (
              <div className="p-4">
                <UiButton variant="outline" onClick={() => void leave()} disabled={busy}>
                  {t("fpl.leave_league")}
                </UiButton>
              </div>
            ) : null}
          </div>
        ) : (
          <section className="mx-3 mt-3">
            <UiCard>
              <div className="text-center">
                <UiPill>{t("fpl.cup_not_started").replace("{n}", String((gw ?? 1) + 1))}</UiPill>
              </div>
              <p className={cn("mt-3", ui.text.body, ui.tone.default)}>
                {t("fpl.cup_not_qualified")}
              </p>
              <h2 className={cn("mt-3", ui.text.section, ui.tone.default)}>
                {t("fpl.cup_how_title")}
              </h2>
              <p className={cn("mt-2", ui.text.secondary, ui.tone.muted)}>
                {t("fpl.cup_how_body")}
              </p>
              <p className={cn("mt-2", ui.text.secondary, ui.tone.muted)}>
                {t("fpl.cup_tiebreak")}
              </p>
              <ul className={cn("mt-1 space-y-0.5", ui.text.secondary, ui.tone.muted)}>
                <li>{t("fpl.cup_tb1")}</li>
                <li>{t("fpl.cup_tb2")}</li>
                <li>{t("fpl.cup_tb3")}</li>
              </ul>
            </UiCard>
          </section>
        )}
      </FantasyScreenGate>
    </>
  );
}
