import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Settings } from "lucide-react";
import { useState } from "react";

import { useAuth } from "@/auth/AuthProvider";
import { FantasyFrame } from "@/components/fpl/FantasyFrame";
import { FantasyScreenGate } from "@/components/fpl/FantasyScreenGate";
import {
  FplKeyValueRow,
  FplHeader,
  FplLinkButton,
  FplPill,
  FplSegmented,
  FplStateBadge,
} from "@/components/fpl/primitives";
import { useFantasyScreen } from "@/components/fpl/useFantasyScreen";
import { chipDisplayState, type ChipKey } from "@/lib/fantasy-engine";
import { useI18n } from "@/i18n/provider";
import { useFantasyDataSource } from "@/services/fantasy-data-source";
import { useFantasyOwned } from "@/services/fantasy-owned-provider";
import { fantasyService } from "@/services/fantasy-runtime";
import { fantasyStateStore } from "@/services/fantasy-state";

export const Route = createFileRoute("/fantasy/profile")({
  component: TeamProfilePage,
});

const CHIPS: ChipKey[] = ["bench_boost", "free_hit", "triple_captain", "wildcard"];

/**
 * FPL-026/027 "Team profile": Current Season (Team Overview rows + chip
 * states + Gameweek History button) and Manager Profile (name, Manage
 * Account, Season History).
 */
function TeamProfilePage() {
  return (
    <FantasyFrame>
      <TeamProfileBody />
    </FantasyFrame>
  );
}

function TeamProfileBody() {
  const { t, lang } = useI18n();
  const { user } = useAuth();
  const screen = useFantasyScreen();
  const owned = useFantasyOwned();
  const { key } = useFantasyDataSource();
  const [tab, setTab] = useState<"season" | "manager">("season");
  const nf = new Intl.NumberFormat(lang === "ar" ? "ar-MA" : "fr-FR", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });

  const summaryQ = useQuery({
    queryKey: key("summary"),
    queryFn: () => fantasyService.getSummary(),
    enabled: screen.phase === "ready",
  });
  const historyQ = useQuery({
    queryKey: key("gw-history"),
    queryFn: () => fantasyService.getGameweekHistory(),
    enabled: screen.phase === "ready",
  });

  const team = screen.team;
  const gw = screen.gameweek?.number ?? null;
  const chips =
    owned.source === "cloud"
      ? (owned.snapshot?.lifecycle.chips ?? { active: null, used: [] })
      : fantasyStateStore.read().chips;
  const summary = summaryQ.data ?? null;
  const gwPoints =
    historyQ.data?.find((h) => h.gameweek === gw)?.totalPoints ?? summary?.gameweekPoints ?? 0;

  return (
    <>
      <FplHeader title={team?.teamName ?? t("fpl.your_team")} backTo="/fantasy">
        <FplSegmented
          className="mt-3"
          value={tab}
          onChange={setTab}
          options={[
            { value: "season", label: t("fpl.current_season") },
            { value: "manager", label: t("fpl.manager_profile") },
          ]}
        />
      </FplHeader>
      <FantasyScreenGate state={screen} next="/fantasy/profile">
        {tab === "season" && team ? (
          <section className="mx-3 mt-3 rounded-[6px] bg-white p-4 shadow-sm">
            <FplPill>{t("fpl.team_overview")}</FplPill>
            <div className="mt-2">
              <FplKeyValueRow
                label={t("fpl.gw_points").replace("{n}", String(gw ?? ""))}
                value={gwPoints}
              />
              <FplKeyValueRow label={t("fpl.overall_points")} value={summary?.totalPoints ?? 0} />
              <FplKeyValueRow label={t("fpl.overall_rank")} value={summary?.overallRank ?? "-"} />
              <FplKeyValueRow
                label={t("fpl.free_transfers")}
                value={chips.active === "wildcard" ? t("fpl.unlimited") : team.freeTransfers}
              />
              <FplKeyValueRow label={t("fpl.gw_transfers_made")} value={team.pendingTransfers} />
              <FplKeyValueRow label={t("fpl.bank")} value={nf.format(team.bank)} />
              <FplKeyValueRow
                label={t("fpl.team_value")}
                value={nf.format(summary?.teamValue ?? 0)}
              />
              {CHIPS.map((chip) => (
                <FplKeyValueRow
                  key={chip}
                  label={t(`fantasy.chip.${chip}` as never)}
                  value={<FplStateBadge state={chipDisplayState(chips, chip)} />}
                />
              ))}
            </div>
            <div className="mt-4">
              <FplLinkButton to="/fantasy/points">{t("fpl.gameweek_history")}</FplLinkButton>
            </div>
          </section>
        ) : (
          <section className="px-3 pt-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 text-[20px] font-extrabold text-foreground">
                <span aria-hidden className="text-[28px]">
                  🇲🇦
                </span>
                {user?.displayName ?? ""}
              </div>
              <Link
                to="/profile"
                className="inline-flex min-h-11 items-center gap-1 rounded-[4px] bg-white px-3 text-[14px] font-extrabold text-[color:var(--fpl-ink-deep)] shadow-[0_1px_4px_rgba(0,0,0,0.15)]"
              >
                <Settings className="h-4 w-4" aria-hidden /> {t("fpl.manage_account")}
              </Link>
            </div>
            <div className="mt-4 rounded-[6px] bg-white p-4 shadow-sm">
              <FplPill>{t("fpl.season_history")}</FplPill>
              <table className="mt-2 w-full text-[13px]">
                <thead>
                  <tr className="text-[color:var(--fpl-grey-text)]">
                    <th className="py-1 text-start font-semibold">{t("fpl.season")}</th>
                    <th className="py-1 text-start font-semibold">{t("fpl.points")}</th>
                    <th className="py-1 text-start font-semibold">{t("fpl.rank")}</th>
                  </tr>
                </thead>
              </table>
              <p className="py-4 text-center text-[14px] text-[color:var(--fpl-grey-text)]">
                {t("fpl.season_history_empty")}
              </p>
            </div>
          </section>
        )}
      </FantasyScreenGate>
    </>
  );
}
