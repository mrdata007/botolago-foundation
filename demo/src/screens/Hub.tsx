/**
 * `/fantasy`, as src/routes/fantasy.index.tsx composes it: the page title,
 * the gameweek band over the stadium photo, the team area (the first-time
 * proposition, then the manager's card), the shortcut tiles and "En savoir
 * plus". The one addition is the sponsor strip under the gameweek band.
 */
import fantasyHeroPhoto from "@/assets/photos/fantasy-hero.webp";
import { Link } from "@tanstack/react-router";
import {
  BookOpen,
  CalendarDays,
  ChevronRight,
  CircleHelp,
  SlidersHorizontal,
  Star,
  TrendingUp,
  Trophy,
} from "lucide-react";
import type { ReactNode } from "react";

import { BrandedText } from "@/components/brand/BrandedText";
import { DeadlineCountdown } from "@/components/common/DeadlineCountdown";
import { FantasyHubTeamArea } from "@/components/fantasy/FantasyHubPersonal";
import type { FantasyHubLayout } from "@/components/fantasy/fantasy-hub-layout";
import { formatDeadline } from "@/components/fpl/deadline";
import { FantasyFrame } from "@/components/fpl/FantasyFrame";
import { GameweekStatusText } from "@/components/fpl/GameweekStatusText";
import { ui, UiCard, UiPageTitle } from "@/components/ui-kit";
import { useI18n } from "@/i18n/provider";
import { cn } from "@/lib/utils";
import type { Gameweek } from "@/types/domain";

import { SponsorStrip } from "../components/Sponsor";
import { useDemo } from "../state";
import { useDemoGameweek, useDemoSummary, useDemoTeam } from "./shared";

const NEW_MANAGER: FantasyHubLayout = {
  audience: "no_team",
  intro: "no_team",
  dashboard: "none",
  prizeWelcome: false,
};
const OWNER: FantasyHubLayout = {
  audience: "owner",
  intro: null,
  dashboard: "show",
  prizeWelcome: false,
};

export function HubScreen() {
  const { t } = useI18n();
  const { state } = useDemo();
  const gameweek = useDemoGameweek();
  const team = useDemoTeam();
  const summary = useDemoSummary();

  return (
    <FantasyFrame bottomNav topBar="always">
      <UiPageTitle title={t("fantasy.title")} />
      <GameweekBand gameweek={gameweek} played={state.played} />
      <SponsorStrip gameweek={gameweek.number} />

      <div className={cn("pt-3.5", ui.space.gutter)}>
        <FantasyHubTeamArea
          layout={team ? OWNER : NEW_MANAGER}
          phase="ready"
          retry={() => undefined}
          gameweek={gameweek}
          team={team}
          displayName={null}
          summary={summary}
          summaryPending={false}
          prizes
        />
      </div>

      <ShortcutTiles />
      <MoreAboutSection />
    </FantasyFrame>
  );
}

function GameweekBand({ gameweek, played }: { gameweek: Gameweek; played: boolean }) {
  const { t, lang } = useI18n();
  return (
    <section
      aria-label={`${t("fpl.gameweek")} ${gameweek.number}`}
      className="relative isolate overflow-hidden"
    >
      <img
        src={fantasyHeroPhoto}
        alt=""
        aria-hidden
        decoding="async"
        className="absolute inset-0 -z-10 h-full w-full object-cover object-[50%_55%]"
      />
      <span
        aria-hidden
        className="absolute inset-0 -z-10"
        style={{
          backgroundImage:
            "linear-gradient(to bottom, color-mix(in oklab, var(--ui-ink-deep) 76%, transparent), color-mix(in oklab, var(--ui-ink-deep) 90%, transparent))",
        }}
      />
      <div className={cn("py-3.5", ui.space.gutter, ui.tone.onInkPlain)}>
        <p className="flex flex-wrap items-baseline gap-x-2">
          <span className={cn(ui.display.title, "uppercase")}>
            {`${t("fpl.gameweek")} ${gameweek.number}`}
          </span>{" "}
          <span className={cn(ui.text.label, ui.tone.onInkMuted)}>{`· ${t("fpl.deadline")}`}</span>
        </p>
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
          <p className={cn(ui.text.secondary, "[font-weight:var(--ui-weight-heavy)]")}>
            <bdi>{formatDeadline(gameweek.deadline, lang, { weekday: "short" })}</bdi>
          </p>
          {played ? (
            <GameweekStatusText
              status="finalized"
              deadlinePassed
              className={cn(ui.text.label, "min-h-8")}
            />
          ) : (
            <DeadlineCountdown iso={gameweek.deadline} />
          )}
        </div>
      </div>
    </section>
  );
}

function ShortcutTiles() {
  const { t } = useI18n();
  const tiles: Array<{ to: string; label: string; icon: ReactNode }> = [
    { to: "/matches", label: t("fpl.fixtures"), icon: <CalendarDays aria-hidden /> },
    { to: "/fantasy/fixtures", label: t("fpl.fdr"), icon: <SlidersHorizontal aria-hidden /> },
    { to: "/fantasy/players", label: t("fpl.player_stats"), icon: <TrendingUp aria-hidden /> },
    { to: "/fantasy/rankings", label: t("fantasy.tab.rankings"), icon: <Star aria-hidden /> },
  ];
  return (
    <div className={cn("mt-2.5", ui.space.gutter)}>
      <ul className="grid grid-cols-2 gap-2">
        {tiles.map((tile) => (
          <li key={tile.to} className="min-w-0">
            <Link
              to={tile.to}
              className={cn(
                "flex h-full items-center gap-2.5 px-2.5 py-2",
                ui.surface.card,
                ui.space.row,
                ui.text.meta,
                "[font-weight:var(--ui-weight-heavy)]",
                ui.tone.default,
                "transition-colors hover:bg-[color:var(--ui-surface-sunken)]",
                ui.focus,
              )}
            >
              <span
                className={cn(
                  "grid h-9 w-9 shrink-0 place-items-center [&_svg]:h-[18px] [&_svg]:w-[18px]",
                  ui.radius.full,
                  ui.surface.sunken,
                  ui.tone.ink,
                )}
              >
                {tile.icon}
              </span>
              <span className="min-w-0 text-balance">{tile.label}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

function MoreAboutSection() {
  const { t } = useI18n();
  const rows: Array<{ to: string; label: string; icon: ReactNode }> = [
    { to: "/prizes", label: t("prizes.title"), icon: <Trophy aria-hidden /> },
    { to: "/fantasy/rules", label: t("fpl.rules"), icon: <BookOpen aria-hidden /> },
    { to: "/fantasy/help", label: t("fpl.help_rules"), icon: <CircleHelp aria-hidden /> },
  ];
  return (
    <section className={cn("mt-6", ui.space.gutter)}>
      <h2 className={cn("pb-2.5 text-balance", ui.display.section, ui.tone.default)}>
        <BrandedText text={t("fpl.more_about")} />
      </h2>
      <UiCard padding="none">
        <ul>
          {rows.map((row, index) => (
            <li key={row.to} className={cn(index < rows.length - 1 && ui.rule.block)}>
              <Link
                to={row.to}
                className={cn(
                  "flex items-center gap-3 px-3 py-2",
                  ui.space.row,
                  ui.text.bodyStrong,
                  ui.tone.default,
                  "transition-colors hover:bg-[color:var(--ui-surface-sunken)]",
                  ui.focus,
                )}
              >
                <span
                  className={cn(
                    "grid h-9 w-9 shrink-0 place-items-center [&_svg]:h-[18px] [&_svg]:w-[18px]",
                    ui.radius.full,
                    ui.surface.sunken,
                    ui.tone.ink,
                  )}
                >
                  {row.icon}
                </span>
                <span className="min-w-0 flex-1">{row.label}</span>
                <ChevronRight
                  className={cn("h-5 w-5 shrink-0 rtl:rotate-180", ui.tone.muted)}
                  aria-hidden
                />
              </Link>
            </li>
          ))}
        </ul>
      </UiCard>
    </section>
  );
}
