import { ClubCrest } from "@/components/common/ClubCrest";
import { useI18n } from "@/i18n/provider";
import type { TranslationKey } from "@/i18n/dictionaries";
import {
  buildPlayerDecisionPresentation,
  type PlayerPerformanceAvailability,
} from "./player-decision-presentation";
import { cn } from "@/lib/utils";
import type { Club } from "@/types/domain";
import type { FantasyPlayer, FixtureDifficulty } from "@/types/fantasy";
import { DifficultyBadge } from "./DifficultyBadge";
import { PlayerStatusBadge } from "./PlayerStatusBadge";

export interface PlayerDecisionSummaryProps {
  player: FantasyPlayer;
  club?: Club;
  clubs: readonly Club[];
  fixtures?: readonly FixtureDifficulty[];
  performanceAvailability?: PlayerPerformanceAvailability;
  density?: "compact" | "comfortable";
  className?: string;
}

function formatKickoff(iso: string, locale: string): string | null {
  const value = new Date(iso);
  if (Number.isNaN(value.getTime())) return null;
  return new Intl.DateTimeFormat(locale, {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(value);
}

export function PlayerDecisionSummary({
  player,
  club,
  clubs,
  fixtures = [],
  performanceAvailability,
  density = "compact",
  className,
}: PlayerDecisionSummaryProps) {
  const { t, tr, lang } = useI18n();
  const locale = lang === "ar" ? "ar-MA" : "fr-MA";
  const number = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 });
  const percent = new Intl.NumberFormat(locale, {
    style: "percent",
    maximumFractionDigits: 1,
  });
  const presentation = buildPlayerDecisionPresentation({
    player,
    fixtures,
    performanceAvailability,
  });
  const resolvedClub = club ?? clubs.find((candidate) => candidate.id === presentation.clubId);
  const fixture = presentation.nextFixture;
  const opponent = fixture
    ? clubs.find((candidate) => candidate.id === fixture.opponentClubId)
    : undefined;
  const kickoffAt = fixture?.kickoffAt;
  const kickoffLabel = kickoffAt ? formatKickoff(kickoffAt, locale) : null;

  const performanceItems: Array<{ key: string; label: string; value: string }> = [];
  if (presentation.performance.totalPoints !== undefined) {
    performanceItems.push({
      key: "totalPoints",
      label: t("fantasy.total_points"),
      value: number.format(presentation.performance.totalPoints),
    });
  }
  if (presentation.performance.form !== undefined) {
    performanceItems.push({
      key: "form",
      label: t("fantasy.form"),
      value: number.format(presentation.performance.form),
    });
  }
  if (presentation.performance.ownership !== undefined) {
    performanceItems.push({
      key: "ownership",
      label: t("fantasy.ownership"),
      value: percent.format(presentation.performance.ownership / 100),
    });
  }
  if (presentation.performance.expectedPoints !== undefined) {
    performanceItems.push({
      key: "expectedPoints",
      label: t("fantasy.expected_points"),
      value: number.format(presentation.performance.expectedPoints),
    });
  }

  return (
    <div
      className={cn(
        "grid w-full min-w-0 text-start",
        density === "comfortable" ? "gap-3" : "gap-2",
        className,
      )}
      data-player-id={presentation.id}
    >
      <div className="flex min-w-0 items-center gap-2.5">
        {resolvedClub && (
          <ClubCrest club={resolvedClub} size={density === "comfortable" ? "md" : "sm"} />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-1.5">
            <span className="min-w-0 truncate text-sm font-black text-foreground">
              {tr(presentation.name)}
            </span>
            <PlayerStatusBadge status={presentation.status} className="shrink-0" />
          </div>
          <div className="mt-0.5 flex min-w-0 items-center gap-1 text-[11px] text-[color:var(--text-muted)]">
            <span>{t(`player.pos.${presentation.position}` as TranslationKey)}</span>
            {resolvedClub && (
              <>
                <span aria-hidden>·</span>
                <span className="min-w-0 truncate">{tr(resolvedClub.shortName)}</span>
              </>
            )}
          </div>
        </div>
        <div className="shrink-0 text-end">
          <div className="text-sm font-black tabular-nums text-[color:var(--brand-accent)]">
            {number.format(presentation.price)}
          </div>
          <div className="text-[10px] uppercase tracking-wide text-[color:var(--text-muted)]">
            {t("fantasy.price")}
          </div>
        </div>
      </div>

      {fixture ? (
        <div className="flex min-w-0 items-center gap-2 rounded-[var(--radius-control)] border border-[var(--border-subtle)] bg-[color:var(--surface-hover)] px-2.5 py-2">
          {opponent && <ClubCrest club={opponent} size="sm" />}
          <div className="min-w-0 flex-1">
            <div className="text-[10px] font-black uppercase tracking-wide text-[color:var(--text-muted)]">
              {t("fantasy.players.next")} · {t("home.gameweek")} {number.format(fixture.gameweek)}
            </div>
            <div className="mt-0.5 truncate text-xs font-bold text-foreground">
              {opponent ? tr(opponent.shortName) : "—"}{" "}
              <span className="font-medium text-[color:var(--text-secondary)]">
                · {t(fixture.isHome ? "common.home" : "common.away")}
              </span>
            </div>
            {kickoffAt && kickoffLabel && (
              <div className="mt-0.5 truncate text-[10px] text-[color:var(--text-muted)]">
                {t("matches.kickoff")} · <time dateTime={kickoffAt}>{kickoffLabel}</time>
              </div>
            )}
          </div>
          <div className="shrink-0 text-end">
            <div className="mb-1 text-[9px] font-bold text-[color:var(--text-muted)]">
              {t("fantasy.fixtures.difficulty")}
            </div>
            <DifficultyBadge
              difficulty={fixture.difficulty}
              label={`${number.format(fixture.difficulty)} / ${number.format(5)}`}
              className="min-h-7 w-12 rounded-md"
            />
          </div>
        </div>
      ) : (
        <div className="rounded-[var(--radius-control)] border border-dashed border-[var(--border-subtle)] bg-[color:var(--surface-hover)] px-2.5 py-2 text-[11px] font-semibold text-[color:var(--text-secondary)]">
          {t("fantasy.players.no_fixture")}
        </div>
      )}

      {performanceItems.length > 0 && (
        <dl className="flex flex-wrap gap-x-3 gap-y-1 border-t border-[var(--border-subtle)] pt-2 text-[10px]">
          {performanceItems.map((item) => (
            <div key={item.key} className="flex items-baseline gap-1">
              <dt className="text-[color:var(--text-muted)]">{item.label}</dt>
              <dd className="font-black tabular-nums text-foreground">{item.value}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}
