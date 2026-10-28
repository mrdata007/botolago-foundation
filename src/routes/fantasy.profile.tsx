import managerCover from "@/assets/photos/manager-cover.webp";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  Armchair,
  ArrowLeftRight,
  Crown,
  Gem,
  History,
  type LucideIcon,
  Medal,
  Settings,
  Sparkles,
  Trophy,
  User,
  Wallet,
  Zap,
} from "lucide-react";
import { useState, type CSSProperties, type ReactNode } from "react";

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
import { FantasyAmount } from "@/components/fantasy/FantasyAmount";
import { useI18n } from "@/i18n/provider";
import { fantasyHead } from "@/lib/fantasy-meta";
import { cn } from "@/lib/utils";
import { useFantasyDataSource } from "@/services/fantasy-data-source";
import { useFantasyOwned } from "@/services/fantasy-owned-provider";
import { fantasyService } from "@/services/fantasy-runtime";
import { fantasyStateStore } from "@/services/fantasy-state";

export const Route = createFileRoute("/fantasy/profile")({
  head: () => fantasyHead("profile"),
  component: TeamProfilePage,
});

const CHIPS: ChipKey[] = ["bench_boost", "free_hit", "triple_captain", "wildcard"];

/**
 * FPL-026/027 "Team profile": Current Season (Team Overview rows + chip
 * states + Gameweek History button) and Manager Profile (name, Manage
 * Account, Season History).
 *
 * The kit calls stand: `UiHeader` with the Fantasy kicker, `UiTabs` for the
 * two views, `UiLinkButton`, and `UiBadge` for the chip states. The season
 * view (2026-10-28, "needs more life") opens on a hero over the brand hero
 * gradient, puts the other figures in stat tiles, and gives each chip a
 * coloured card with its own icon; the chip states still come only from
 * `chipDisplayState`. The manager's initial sits on an ink disc ringed in
 * the action gradient, on the header gradient band.
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
          key={tab}
          role="tabpanel"
          id={`profile-panel-${tab}`}
          aria-labelledby={`profile-tab-${tab}`}
          className={cn("px-4 pb-8 pt-4", ui.surface.page)}
        >
          {tab === "season" && team ? (
            <div className="space-y-4">
              <SeasonHero
                kicker={t("fpl.team_overview")}
                teamName={team.teamName}
                figures={[
                  {
                    key: "total",
                    label: t("fpl.overall_points"),
                    icon: Trophy,
                    tone: "action",
                    value: intNf.format(summary?.totalPoints ?? 0),
                  },
                  {
                    key: "rank",
                    label: t("fpl.overall_rank"),
                    icon: Medal,
                    tone: "ink",
                    value: summary?.overallRank ? intNf.format(summary.overallRank) : "-",
                  },
                ]}
              />
              <div className="grid grid-cols-2 gap-3">
                <StatTile
                  featured
                  icon={Activity}
                  label={t("fpl.gw_points").replace("{n}", String(gw ?? ""))}
                  value={<bdi>{intNf.format(gwPoints)}</bdi>}
                />
                <StatTile
                  icon={ArrowLeftRight}
                  accent="var(--ui-accent-sky)"
                  label={t("fpl.free_transfers")}
                  value={
                    chips.active === "wildcard" ? (
                      t("fpl.unlimited")
                    ) : (
                      <bdi>{intNf.format(team.freeTransfers)}</bdi>
                    )
                  }
                />
                {/* "Transfers made this gameweek" is deliberately not shown.
                    A signed-in manager reads through V2CloudFantasyRepository,
                    whose snapshot() sets `pendingTransfers: 0` on both of its
                    branches -- it has nothing else to set it from, since its
                    source FantasyTeamDto (src/backend/fantasy/contracts.ts)
                    carries no transfers-made field and api.confirm_fantasy_-
                    transfers takes no such argument. So this tile could only
                    ever read 0, however many transfers a manager had made, and
                    a number that is always wrong is worse than no number.
                    The count does exist server-side, in
                    app.fantasy_transfer_batches.transfers_count. Restore the
                    tile once the DTO carries it -- not before. */}
                <StatTile
                  icon={Wallet}
                  accent="var(--ui-accent-spring)"
                  label={t("fpl.bank")}
                  value={<FantasyAmount value={team.bank} />}
                />
                <StatTile
                  icon={Gem}
                  accent="var(--ui-caution)"
                  label={t("fpl.team_value")}
                  value={<FantasyAmount value={summary?.teamValue ?? 0} />}
                />
              </div>
              <ul className="grid grid-cols-2 gap-3">
                {CHIPS.map((chip) => {
                  const name = t(`fantasy.chip.${chip}` as never);
                  return (
                    <ChipCard
                      key={chip}
                      chip={chip}
                      name={name}
                      state={chipDisplayState(chips, chip)}
                    />
                  );
                })}
              </ul>
              <UiLinkButton to="/fantasy/points">
                <History className="h-5 w-5" aria-hidden />
                {t("fpl.gameweek_history")}
              </UiLinkButton>
            </div>
          ) : (
            <>
              <div
                className={cn(
                  "flex items-center justify-between gap-3 p-4",
                  ui.radius.sheet,
                  ui.shadow.lifted,
                )}
                style={{ backgroundImage: "var(--ui-grad-header)" }}
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span
                    aria-hidden
                    className={cn("shrink-0 p-[3px]", ui.radius.full)}
                    style={{ backgroundImage: "var(--ui-grad-action)" }}
                  >
                    <span
                      className={cn(
                        "grid h-12 w-12 place-items-center",
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
                  </span>
                  <p
                    dir="auto"
                    className={cn("min-w-0 truncate", ui.display.team, ui.tone.onGradHeader)}
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

/**
 * The photo fades into the hero gradient instead of ending on a hard edge.
 * Only the mask's alpha matters, so `currentColor` (always opaque) stands in
 * for a colour literal; `to bottom` keeps it the same in Arabic.
 */
const PHOTO_FADE = "linear-gradient(to bottom, currentColor 30%, transparent 100%)";

type HeroFigureSpec = {
  key: string;
  label: string;
  icon: LucideIcon;
  /** `action`: the mint-to-sky gradient. `ink`: a navy glass plate. */
  tone: "action" | "ink";
  value: string;
};

/**
 * The season hero: the manager cover photo melting into the brand hero
 * gradient, the team name large, then total points and overall rank on two
 * plates. Text straight on the gradient is `--ui-on-grad-header` (navy in
 * light, near-white in dark, where the gradient is deep); the figures sit on
 * plates that carry their own measured pair — ink-deep on the action
 * gradient, plain on-ink white on navy glass — so they read the same in both
 * themes whatever part of the gradient they land on.
 */
function SeasonHero({
  kicker,
  teamName,
  figures,
}: {
  kicker: string;
  teamName: string;
  figures: HeroFigureSpec[];
}) {
  return (
    <div
      data-testid="profile-season-hero"
      className={cn("relative isolate overflow-hidden", ui.radius.sheet, ui.shadow.lifted)}
      style={{ backgroundImage: "var(--ui-grad-hero)" }}
    >
      <img
        src={managerCover}
        alt=""
        aria-hidden
        decoding="async"
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-32 w-full object-cover opacity-90 mix-blend-luminosity rtl:-scale-x-100"
        style={{ maskImage: PHOTO_FADE, WebkitMaskImage: PHOTO_FADE }}
      />
      <div className="px-4 pb-4 pt-20">
        <p className={cn(ui.text.label, ui.tone.onGradHeader)}>{kicker}</p>
        <p
          dir="auto"
          className={cn(ui.display.title, ui.tone.onGradHeader, "mt-1 [overflow-wrap:anywhere]")}
        >
          {teamName}
        </p>
        <dl className="mt-4 grid grid-cols-2 gap-3">
          {figures.map(({ key, label, icon: Icon, tone, value }) => (
            <div
              key={key}
              className={cn(
                "flex min-w-0 flex-col gap-2 p-3",
                ui.radius.card,
                tone === "action"
                  ? cn("text-[color:var(--ui-ink-deep)]", ui.shadow.lifted)
                  : cn(
                      "bg-[color:color-mix(in_oklab,var(--ui-ink-deep)_82%,transparent)]",
                      ui.tone.onInkPlain,
                    ),
              )}
              style={tone === "action" ? { backgroundImage: "var(--ui-grad-action)" } : undefined}
            >
              <dt className="flex items-center justify-between gap-2">
                <span className={cn(ui.text.label, tone === "ink" && ui.tone.onInk)}>{label}</span>
                <Icon className="h-4 w-4 shrink-0" aria-hidden />
              </dt>
              <dd className={cn(ui.score.md, "[overflow-wrap:anywhere]")}>
                <bdi>{value}</bdi>
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}

/**
 * One season figure as a tile. The featured tile (this gameweek's points)
 * sits on the action gradient with ink-deep text, as the kit's gradient
 * button does; the others are cards washed at the top with their accent,
 * and carry an icon disc in it. Every accent is a light fill in both themes
 * (spring, sky, caution), so the disc's icon is ink-deep in both.
 */
function StatTile({
  icon: Icon,
  label,
  value,
  accent,
  featured = false,
}: {
  icon: LucideIcon;
  label: string;
  value: ReactNode;
  accent?: string;
  featured?: boolean;
}) {
  const style: CSSProperties = featured
    ? { backgroundImage: "var(--ui-grad-action)" }
    : ({
        "--tile": accent,
        backgroundImage:
          "linear-gradient(to bottom, color-mix(in oklab, var(--tile) 24%, var(--ui-surface)) 0%, var(--ui-surface) 75%)",
      } as CSSProperties);
  return (
    <div
      className={cn(
        "flex min-h-28 min-w-0 flex-col justify-between gap-3 p-3.5",
        ui.radius.card,
        featured
          ? cn("text-[color:var(--ui-ink-deep)]", ui.shadow.lifted)
          : cn(ui.surface.card, ui.tone.default),
      )}
      style={style}
    >
      <div className="flex items-start justify-between gap-2">
        <p className={cn(ui.text.meta, !featured && ui.tone.muted)}>{label}</p>
        <span
          aria-hidden
          className={cn(
            "grid h-9 w-9 shrink-0 place-items-center",
            ui.radius.full,
            featured
              ? "bg-[color:var(--ui-ink-deep)] text-[color:var(--ui-accent-spring)]"
              : "bg-[color:var(--tile)] text-[color:var(--ui-ink-deep)]",
          )}
        >
          <Icon className="h-[18px] w-[18px]" />
        </span>
      </div>
      <p className={ui.stat.lg}>{value}</p>
    </div>
  );
}

type ChipState = "active" | "unavailable" | "used" | "available";

/**
 * Each chip's own colour and icon. The fills are tokens that come with a
 * measured foreground in both themes: spring and sky are light in both
 * (ink-deep on them, as on the action gradient), caution pairs with
 * `--ui-on-caution`, and the magenta negative with `--ui-on-negative`, which
 * flips with it.
 */
const CHIP_LOOK: Record<ChipKey, { fill: string; on: string; icon: LucideIcon }> = {
  bench_boost: { fill: "var(--ui-accent-sky)", on: "var(--ui-ink-deep)", icon: Armchair },
  free_hit: { fill: "var(--ui-accent-spring)", on: "var(--ui-ink-deep)", icon: Zap },
  triple_captain: { fill: "var(--ui-caution)", on: "var(--ui-on-caution)", icon: Crown },
  wildcard: { fill: "var(--ui-negative)", on: "var(--ui-on-negative)", icon: Sparkles },
};

/**
 * A chip as a card: its icon on its own colour, the name with the info
 * sheet button, and the state underneath. A chip still to play is washed in
 * its colour; the active one adds a ring in it; a used or unavailable one
 * goes flat on the sunken fill this product uses for "used up".
 */
function ChipCard({ chip, name, state }: { chip: ChipKey; name: string; state: ChipState }) {
  const look = CHIP_LOOK[chip];
  const Icon = look.icon;
  const spent = state === "used" || state === "unavailable";
  return (
    <li
      data-chip={chip}
      data-chip-state={state}
      className={cn(
        "flex min-h-36 min-w-0 flex-col gap-2 p-3",
        ui.radius.card,
        spent ? ui.surface.sunken : cn(ui.surface.card, ui.tone.default),
        state === "active" && "ring-2 ring-inset ring-[color:var(--chip)]",
      )}
      style={
        {
          "--chip": look.fill,
          "--on-chip": look.on,
          backgroundImage: spent
            ? undefined
            : "linear-gradient(to bottom, color-mix(in oklab, var(--chip) 30%, var(--ui-surface)) 0%, var(--ui-surface) 85%)",
        } as CSSProperties
      }
    >
      <div className="flex items-start justify-between gap-1">
        <span
          aria-hidden
          className={cn(
            "grid h-11 w-11 shrink-0 place-items-center",
            ui.radius.full,
            spent
              ? cn("bg-[color:var(--ui-surface)]", ui.tone.muted)
              : cn("bg-[color:var(--chip)] text-[color:var(--on-chip)]", ui.shadow.lifted),
          )}
        >
          <Icon className="h-5 w-5" />
        </span>
        <FplChipInfo chip={chip} label={name} className="-mt-1.5" />
      </div>
      <p className={cn(ui.display.teamSm, "min-w-0 [overflow-wrap:anywhere]")}>{name}</p>
      <ChipStateBadge state={state} className="mt-auto w-full" />
    </li>
  );
}

/**
 * A chip's state: ACTIVE on the action gradient, AVAILABLE ("play") filled
 * in the chip's own colour (it must not read as spent), USED and UNAVAILABLE
 * on the sunken fill this product uses for "used up". Each label is its own
 * literal key.
 */
function ChipStateBadge({ state, className }: { state: ChipState; className?: string }) {
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
      className={cn(
        "min-h-8",
        state === "available" &&
          "border-transparent bg-[color:var(--chip)] text-[color:var(--on-chip)]",
        state !== "active" && state !== "available" && "bg-[color:var(--ui-surface)]",
        className,
      )}
    >
      {label}
    </UiBadge>
  );
}
