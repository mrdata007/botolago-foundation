import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { FantasyFrame } from "@/components/fpl/FantasyFrame";
import { FantasyScreenGate } from "@/components/fpl/FantasyScreenGate";
import {
  FplButton,
  FplHeader,
  FplPill,
  FplRankMovement,
  FplSegmented,
} from "@/components/fpl/primitives";
import { useFantasyScreen } from "@/components/fpl/useFantasyScreen";
import { useI18n } from "@/i18n/provider";
import { useFantasyDataSource } from "@/services/fantasy-data-source";
import { fantasyService } from "@/services/fantasy-runtime";

export const Route = createFileRoute("/fantasy/leagues/$leagueId")({
  component: LeagueDetailPage,
});

/**
 * FPL-016/017 league detail: Back header with the league name, League / Cup
 * control, "Last Updated" line and the Pos / Team / GW / Total standings.
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

  const updated = new Intl.DateTimeFormat(lang === "ar" ? "ar-MA" : "fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Africa/Casablanca",
  }).format(new Date());

  return (
    <>
      <FplHeader title={leagueQ.data?.name ?? t("fpl.league")} backTo="/fantasy/leagues">
        <FplSegmented
          className="mt-3"
          value={tab}
          onChange={setTab}
          options={[
            { value: "league", label: t("fpl.league") },
            { value: "cup", label: t("fpl.cups") },
          ]}
        />
      </FplHeader>
      <FantasyScreenGate state={screen} next={`/fantasy/leagues/${leagueId}`}>
        {tab === "league" ? (
          <div className="bg-white">
            <p className="border-b border-[color:var(--fpl-grey)] px-4 py-3 text-center text-[14px] text-foreground">
              {t("fpl.last_updated")}: <strong className="font-extrabold">{updated}</strong>
            </p>
            {standingsQ.isPending ? (
              <div
                role="status"
                className="m-4 h-40 animate-pulse rounded bg-[color:var(--fpl-grey)] motion-reduce:animate-none"
              />
            ) : standingsQ.isError ? (
              <div className="p-4">
                <FplButton variant="ink" onClick={() => void standingsQ.refetch()}>
                  {t("state.retry")}
                </FplButton>
              </div>
            ) : (
              <table className="w-full">
                <thead>
                  <tr className="text-[12px] text-[color:var(--fpl-grey-text)]">
                    <th className="w-16 py-2 ps-4 text-start font-semibold">{t("fpl.pos")}</th>
                    <th className="py-2 text-start font-semibold">{t("fpl.team")}</th>
                    <th className="w-16 py-2 text-end font-semibold">
                      {gw ? `GW${gw}` : t("fpl.gameweek")}
                    </th>
                    <th className="w-20 py-2 pe-4 text-end font-semibold">{t("fpl.total")}</th>
                  </tr>
                </thead>
                <tbody>
                  {(standingsQ.data ?? []).map((row) => (
                    <tr key={row.managerId} className="border-t border-[color:var(--fpl-grey)]">
                      <td className="py-3 ps-4">
                        <span className="inline-flex items-center gap-2">
                          <FplRankMovement rank={row.rank} previousRank={row.previousRank} />
                          <span className="fpl-tabular text-[15px] font-bold">{row.rank}</span>
                        </span>
                      </td>
                      <td className="py-3">
                        <div className="text-[16px] font-extrabold text-foreground">
                          {row.teamName}
                        </div>
                        <div className="text-[13px] text-[color:var(--fpl-grey-text)]">
                          {row.managerName || " "}
                        </div>
                      </td>
                      <td className="fpl-tabular py-3 text-end text-[15px]">{row.gameweekScore}</td>
                      <td className="fpl-tabular py-3 pe-4 text-end text-[15px] font-extrabold">
                        {row.totalScore}
                      </td>
                    </tr>
                  ))}
                  {(standingsQ.data ?? []).length === 0 ? (
                    <tr>
                      <td
                        colSpan={4}
                        className="px-4 py-6 text-center text-[13px] text-[color:var(--fpl-grey-text)]"
                      >
                        {t("fpl.no_data_yet")}
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            )}
            {leagueQ.data?.type === "private" ? (
              <div className="p-4">
                <FplButton variant="outline" onClick={() => void leave()} disabled={busy}>
                  {t("fpl.leave_league")}
                </FplButton>
              </div>
            ) : null}
          </div>
        ) : (
          <section className="mx-3 mt-3 rounded-[6px] bg-white p-4 shadow-sm">
            <div className="text-center">
              <FplPill>{t("fpl.cup_not_started").replace("{n}", String((gw ?? 1) + 1))}</FplPill>
            </div>
            <p className="mt-3 text-[15px] text-foreground">{t("fpl.cup_not_qualified")}</p>
            <h3 className="mt-3 text-[20px] font-extrabold text-[color:var(--fpl-ink-deep)]">
              {t("fpl.cup_how_title")}
            </h3>
            <p className="mt-2 text-[14px] leading-relaxed text-foreground">
              {t("fpl.cup_how_body")}
            </p>
            <p className="mt-2 text-[14px] text-foreground">{t("fpl.cup_tiebreak")}</p>
            <ul className="mt-1 text-[14px] text-foreground">
              <li>{t("fpl.cup_tb1")}</li>
              <li>{t("fpl.cup_tb2")}</li>
              <li>{t("fpl.cup_tb3")}</li>
            </ul>
          </section>
        )}
      </FantasyScreenGate>
    </>
  );
}
