import managerCover from "@/assets/photos/manager-cover.webp";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Settings, User } from "lucide-react";
import { useState, type ReactNode } from "react";

import { useAuth } from "@/auth/AuthProvider";
import { SectionHeader } from "@/components/common/SectionHeader";
import { FantasyFrame } from "@/components/fpl/FantasyFrame";
import { FantasyScreenGate } from "@/components/fpl/FantasyScreenGate";
import { FplChipInfo } from "@/components/fpl/FplChipInfo";
import { useFantasyScreen } from "@/components/fpl/useFantasyScreen";
import {
  ui,
  UiBadge,
  UiCard,
  UiHeader,
  UiKeyValueRow,
  UiLinkButton,
  UiTable,
  UiTabs,
  UiTBody,
  UiTD,
  UiTH,
  UiTHead,
  UiTR,
} from "@/components/ui-kit";
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
 *
 * This was the last screen on `components/fpl/primitives` — FplHeader,
 * FplSegmented, FplPill, FplKeyValueRow, FplLinkButton, FplStateBadge. Each
 * was a rename of a kit call, and each is now that kit call: `UiHeader` with
 * the Fantasy kicker, `UiTabs` for the two views, display section headings
 * instead of ink pills, `UiKeyValueRow` with the figures on the tabular stat
 * ramp, `UiLinkButton`, and `UiBadge` for the chip states. The flag emoji that
 * stood in for an avatar (sized off the ramp at 28px) is the manager's
 * initial on an ink disc.
 */
function TeamProfilePage() {
  return (
    <FantasyFrame bottomNav>
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
  const intNf = new Intl.NumberFormat(lang === "ar" ? "ar-MA" : "fr-FR");

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
  const displayName = user?.displayName?.trim() ?? "";

  return (
    <>
      <UiHeader
        kicker={t("nav.fantasy")}
        title={team?.teamName ?? t("fpl.your_team")}
        backTo="/fantasy"
      />
      <FantasyScreenGate state={screen} next="/fantasy/profile">
        <UiTabs
          value={tab}
          onChange={setTab}
          label={t("fpl.your_team")}
          idBase="profile"
          className="px-2"
          options={[
            { value: "season", label: t("fpl.current_season"), panelId: "profile-panel-season" },
            { value: "manager", label: t("fpl.manager_profile"), panelId: "profile-panel-manager" },
          ]}
        />
        <section
          role="tabpanel"
          id={`profile-panel-${tab}`}
          aria-labelledby={`profile-tab-${tab}`}
          className={cn("px-4 pb-8 pt-4", ui.surface.page)}
        >
          {tab === "season" && team ? (
            <UiCard padding="none" className={cn("overflow-hidden", ui.radius.sheet)}>
              <img
                src={managerCover}
                alt=""
                aria-hidden
                decoding="async"
                className="h-24 w-full object-cover rtl:-scale-x-100"
              />
              <div className="px-4 pb-4 pt-4">
                <SectionHeader title={t("fpl.team_overview")} />
                <div>
                  <UiKeyValueRow
                    label={t("fpl.gw_points").replace("{n}", String(gw ?? ""))}
                    value={<Figure>{intNf.format(gwPoints)}</Figure>}
                  />
                  <UiKeyValueRow
                    label={t("fpl.overall_points")}
                    value={<Figure>{intNf.format(summary?.totalPoints ?? 0)}</Figure>}
                  />
                  <UiKeyValueRow
                    label={t("fpl.overall_rank")}
                    value={
                      <Figure>
                        {summary?.overallRank ? intNf.format(summary.overallRank) : "-"}
                      </Figure>
                    }
                  />
                  <UiKeyValueRow
                    label={t("fpl.free_transfers")}
                    value={
                      chips.active === "wildcard" ? (
                        t("fpl.unlimited")
                      ) : (
                        <Figure>{intNf.format(team.freeTransfers)}</Figure>
                      )
                    }
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
                  <UiKeyValueRow
                    label={t("fpl.bank")}
                    value={<Figure>{nf.format(team.bank)}</Figure>}
                  />
                  <UiKeyValueRow
                    label={t("fpl.team_value")}
                    value={<Figure>{nf.format(summary?.teamValue ?? 0)}</Figure>}
                  />
                  {CHIPS.map((chip) => {
                    const name = t(`fantasy.chip.${chip}` as never);
                    return (
                      <UiKeyValueRow
                        key={chip}
                        label={
                          <span className="inline-flex items-center gap-1">
                            {name}
                            <FplChipInfo chip={chip} label={name} />
                          </span>
                        }
                        value={<ChipState state={chipDisplayState(chips, chip)} />}
                        className="last:border-b-0"
                      />
                    );
                  })}
                </div>
                <UiLinkButton to="/fantasy/points" className="mt-4">
                  {t("fpl.gameweek_history")}
                </UiLinkButton>
              </div>
            </UiCard>
          ) : (
            <>
              <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <span
                    aria-hidden
                    className={cn(
                      "grid h-12 w-12 shrink-0 place-items-center",
                      ui.radius.full,
                      ui.surface.inkPlain,
                      ui.display.team,
                    )}
                  >
                    {displayName ? (
                      Array.from(displayName)[0]?.toLocaleUpperCase()
                    ) : (
                      <User className="h-5 w-5" />
                    )}
                  </span>
                  <p
                    dir="auto"
                    className={cn("min-w-0 truncate", ui.display.team, ui.tone.default)}
                  >
                    {displayName}
                  </p>
                </div>
                <UiLinkButton to="/profile" size="sm" variant="soft" className="shrink-0">
                  <Settings className="h-4 w-4" aria-hidden />
                  {t("fpl.manage_account")}
                </UiLinkButton>
              </div>
              <section className="mt-6">
                <SectionHeader title={t("fpl.season_history")} />
                <UiCard padding="none" className="overflow-hidden">
                  <UiTable caption={t("fpl.season_history")}>
                    <UiTHead className="bg-transparent">
                      <UiTR>
                        <UiTH className="ps-4">{t("fpl.season")}</UiTH>
                        <UiTH numeric>{t("fpl.points")}</UiTH>
                        <UiTH numeric className="pe-4">
                          {t("fpl.rank")}
                        </UiTH>
                      </UiTR>
                    </UiTHead>
                    <UiTBody>
                      <UiTR className="border-b-0">
                        <UiTD colSpan={3} className={cn("py-5 text-center", ui.tone.muted)}>
                          {t("fpl.season_history_empty")}
                        </UiTD>
                      </UiTR>
                    </UiTBody>
                  </UiTable>
                </UiCard>
              </section>
            </>
          )}
        </section>
      </FantasyScreenGate>
    </>
  );
}

/** A figure in the key-value column: the tabular stat ramp. */
function Figure({ children }: { children: ReactNode }) {
  return <bdi className={cn(ui.stat.md, ui.tone.default)}>{children}</bdi>;
}

/**
 * A chip's state: ACTIVE on the action gradient, AVAILABLE outlined (it must
 * not read as spent), USED and UNAVAILABLE on the sunken fill this product
 * uses for "used up". Each label is its own literal key.
 */
function ChipState({ state }: { state: "active" | "unavailable" | "used" | "available" }) {
  const { t } = useI18n();
  const label =
    state === "active"
      ? t("fpl.state.active")
      : state === "unavailable"
        ? t("fpl.state.unavailable")
        : state === "used"
          ? t("fpl.state.used")
          : t("fpl.state.play");
  return (
    <UiBadge
      tone={state === "active" ? "action" : state === "available" ? "outline" : "neutral"}
      className="min-w-28"
    >
      {label}
    </UiBadge>
  );
}
