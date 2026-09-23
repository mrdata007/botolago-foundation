import managerCover from "@/assets/photos/manager-cover.webp";
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
import { ui, UiCard, UiTable, UiTBody, UiTD, UiTH, UiTHead, UiTR } from "@/components/ui-kit";
import { chipDisplayState, type ChipKey } from "@/lib/fantasy-engine";
import { useI18n } from "@/i18n/provider";
import { cn } from "@/lib/utils";
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
          <UiCard as="section" className="mx-3 mt-3 overflow-hidden" padding="md">
            <img
              src={managerCover}
              alt=""
              aria-hidden
              decoding="async"
              className="-mx-4 -mt-4 mb-4 h-24 w-[calc(100%+2rem)] max-w-none object-cover rtl:-scale-x-100"
            />
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
              {/* "Transfers made this gameweek" is deliberately not shown.
                  A signed-in manager reads through V2CloudFantasyRepository,
                  whose snapshot() sets `pendingTransfers: 0` on both of its
                  branches -- it has nothing else to set it from, since its
                  source FantasyTeamDto (src/backend/fantasy/contracts.ts)
                  carries no transfers-made field and api.confirm_fantasy_-
                  transfers takes no such argument. So this row could only ever
                  read 0, however many transfers a manager had made, and a
                  number that is always wrong is worse than no number.
                  The count does exist server-side, in
                  app.fantasy_transfer_batches.transfers_count. Restore the row
                  once the DTO carries it -- not before. */}
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
          </UiCard>
        ) : (
          <section className="px-3 pt-3">
            <div className="flex items-center justify-between gap-3">
              <div
                className={cn("flex min-w-0 items-center gap-3", ui.text.title, ui.tone.default)}
              >
                <span aria-hidden className="shrink-0 text-[28px] leading-none">
                  🇲🇦
                </span>
                <span className="min-w-0 truncate">{user?.displayName ?? ""}</span>
              </div>
              <Link
                to="/profile"
                className={cn(
                  "inline-flex min-h-[var(--ui-tap-min)] shrink-0 items-center gap-1 px-3",
                  ui.radius.control,
                  ui.surface.card,
                  ui.text.secondary,
                  "[font-weight:var(--ui-weight-heavy)]",
                  ui.tone.ink,
                  ui.focus,
                )}
              >
                <Settings className="h-4 w-4 shrink-0" aria-hidden />
                <span className="min-w-0 truncate">{t("fpl.manage_account")}</span>
              </Link>
            </div>
            <UiCard className="mt-4" padding="md">
              <FplPill>{t("fpl.season_history")}</FplPill>
              <UiTable caption={t("fpl.season_history")} className="mt-2">
                <UiTHead>
                  <UiTR>
                    <UiTH>{t("fpl.season")}</UiTH>
                    <UiTH numeric>{t("fpl.points")}</UiTH>
                    <UiTH numeric>{t("fpl.rank")}</UiTH>
                  </UiTR>
                </UiTHead>
                <UiTBody>
                  <UiTR>
                    <UiTD colSpan={3} className={cn("py-4 text-center", ui.tone.muted)}>
                      {t("fpl.season_history_empty")}
                    </UiTD>
                  </UiTR>
                </UiTBody>
              </UiTable>
            </UiCard>
          </section>
        )}
      </FantasyScreenGate>
    </>
  );
}
