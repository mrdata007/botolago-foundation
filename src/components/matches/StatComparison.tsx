import { useMemo, type CSSProperties } from "react";
import type { MatchStatisticComparisonDto } from "@/backend/football/contracts";
import { ClubCrest } from "@/components/common/ClubCrest";
import { SectionHeader } from "@/components/common/SectionHeader";
import { EmptyState } from "@/components/common/States";
import { ui, UiCard, UiLivePill } from "@/components/ui-kit";
import type { TranslationKey } from "@/i18n/dictionaries";
import { useI18n } from "@/i18n/provider";
import { clubStyle, type ClubPalette } from "@/lib/club-palette";
import { cn } from "@/lib/utils";
import type { Club } from "@/types/domain";
import { noStatsMessage, type MatchDataPhase } from "./match-empty-states";
import type { PressurePoint } from "./pressure-bins";
import { PressureChart } from "./PressureChart";

type Stat = MatchStatisticComparisonDto;

/** `clubStyle(palette)` with extra inline style merged in (a bar segment's flex share). */
function withClub(palette: ClubPalette, style: CSSProperties) {
  const club = clubStyle(palette);
  return { "data-club": club["data-club"], style: { ...club.style, ...style } };
}

/**
 * The statistic's name in the reader's language. The API sends the
 * definition's `display_name`, which is English in every language ("Shots on
 * target"), so the known codes read their own translation; a code this list
 * does not know keeps the provider's label rather than disappearing. A
 * literal-key switch so the i18n audit sees every key.
 */
function statLabel(t: (key: TranslationKey) => string, stat: Stat): string {
  switch (stat.code) {
    case "possession":
      return t("matches.stats.possession");
    case "shots":
      return t("matches.stats.shots");
    case "shots_on_target":
      return t("matches.stats.shots_on_target");
    case "corners":
      return t("matches.stats.corners");
    case "fouls":
      return t("matches.stats.fouls");
    case "offsides":
      return t("matches.stats.offsides");
    case "saves":
      return t("matches.stats.saves");
    case "passes":
      return t("matches.stats.passes");
    case "pass_accuracy":
      return t("matches.stats.pass_accuracy");
    case "expected_goals":
      return t("matches.stats.expected_goals");
    case "expected_goals_on_target":
      return t("matches.stats.expected_goals_on_target");
    default:
      return stat.label;
  }
}

/**
 * The Stats tab (A-Stats), backed only by the provider's statistics.
 *
 * The pressure chart comes first when the provider sends a pressure index
 * (the SportsMonks add-on); expected goals are rows like any other, listed
 * after possession by their definition's order.
 *
 * One card: the two clubs over their columns, possession as a 40px split bar
 * in the two fills, then a row per statistic — the higher figure in a pill
 * of its club's colour, the label between, and one bar split in proportion.
 * Every figure is `ui.stat.*` (Manrope, tabular): these are read down a
 * column, which the display face's proportional digits cannot do.
 *
 * Colours are the page's resolved pair, so a clash-resolved away club is the
 * same colour here as in the header. Home is the first flex child
 * throughout, so Arabic puts it on the right like the header's home half.
 *
 * With no statistics, the message follows `phase` (see `match-empty-states`):
 * a finished match's missing figures are not promised "at kick-off".
 */
export function StatComparison({
  stats,
  home,
  away,
  palettes,
  isLive,
  phase,
  pressure = [],
}: {
  stats: readonly Stat[];
  home: Club;
  away: Club;
  palettes: { home: ClubPalette; away: ClubPalette };
  isLive: boolean;
  phase: MatchDataPhase;
  /** The provider's pressure index, minute by minute; empty draws no chart. */
  pressure?: readonly PressurePoint[];
}) {
  const { t, tr, lang } = useI18n();
  const nf = useMemo(
    () =>
      new Intl.NumberFormat(lang === "ar" ? "ar-MA" : "fr-FR", {
        maximumFractionDigits: 2,
      }),
    [lang],
  );

  const heading = (
    <SectionHeader
      title={t("matches.detail.tab.stats")}
      action={isLive ? <UiLivePill size="md" /> : undefined}
    />
  );

  const chart = <PressureChart points={pressure} home={home} away={away} palettes={palettes} />;

  if (stats.length === 0) {
    return (
      <section>
        {heading}
        {chart}
        <EmptyState>{noStatsMessage(phase, t)}</EmptyState>
      </section>
    );
  }

  /** The figure as the provider wrote it, else formatted; the unit only where it is "%". */
  const figure = (value: number | null, provided: string | null, stat: Stat) => {
    if (provided) return { number: provided, percent: false };
    if (value === null) return { number: "—", percent: false };
    return { number: nf.format(value), percent: stat.valueType === "percentage" };
  };

  const possession = stats.find(
    (stat) => stat.code === "possession" && stat.homeValue !== null && stat.awayValue !== null,
  );
  const rows = stats.filter((stat) => stat !== possession);

  return (
    <section>
      {heading}
      {chart}
      <UiCard padding="none" className={cn(ui.radius.sheet, "px-4 pb-1 pt-3.5")}>
        <div className="flex items-center justify-between gap-3">
          <span className="flex min-w-0 items-center gap-2">
            <ClubCrest club={home} palette={palettes.home} size="xs" />
            <span
              className={cn("truncate", ui.text.secondary, "[font-weight:var(--ui-weight-heavy)]")}
            >
              {tr(home.name)}
            </span>
          </span>
          <span className="flex min-w-0 items-center gap-2">
            <span
              className={cn("truncate", ui.text.secondary, "[font-weight:var(--ui-weight-heavy)]")}
            >
              {tr(away.name)}
            </span>
            <ClubCrest club={away} palette={palettes.away} size="xs" />
          </span>
        </div>

        {possession && (
          <Possession
            stat={possession}
            label={statLabel(t, possession)}
            palettes={palettes}
            figure={figure}
          />
        )}

        <ul className={cn(!possession && "mt-3")}>
          {rows.map((stat) => (
            <StatRow
              key={stat.code}
              stat={stat}
              label={statLabel(t, stat)}
              palettes={palettes}
              figure={figure}
            />
          ))}
        </ul>
      </UiCard>
    </section>
  );
}

type Figure = (
  value: number | null,
  provided: string | null,
  stat: Stat,
) => { number: string; percent: boolean };

/** A figure with its "%" a step smaller, as one isolated run. */
function Value({
  value,
  className,
}: {
  value: { number: string; percent: boolean };
  className?: string;
}) {
  return (
    <bdi className={cn("whitespace-nowrap", className)}>
      {value.number}
      {value.percent ? <span className="text-[length:0.7em]">%</span> : null}
    </bdi>
  );
}

function Possession({
  stat,
  label,
  palettes,
  figure,
}: {
  stat: Stat;
  label: string;
  palettes: { home: ClubPalette; away: ClubPalette };
  figure: Figure;
}) {
  const home = stat.homeValue ?? 0;
  const away = stat.awayValue ?? 0;
  const total = home + away;
  return (
    <div className="pb-3.5 pt-3">
      <p className={cn("text-center", ui.text.label, ui.tone.muted)}>{label}</p>
      {/* The figures ARE the readout; the bar is their shape. Outer corners
          round, the seam square-ish — logical radii, so they follow the
          halves when Arabic mirrors them. */}
      <div className="mt-2 flex h-10 gap-0.5">
        <span
          {...withClub(palettes.home, { flex: `${total > 0 ? home : 1} 1 0` })}
          className={cn(
            "flex min-w-0 items-center ps-3",
            "rounded-e-[var(--ui-radius-tight)] rounded-s-[var(--ui-radius-track)]",
            ui.club.fill,
          )}
        >
          <Value
            value={figure(stat.homeValue, stat.homeDisplayValue, stat)}
            className={ui.stat.lg}
          />
        </span>
        <span
          {...withClub(palettes.away, { flex: `${total > 0 ? away : 1} 1 0` })}
          className={cn(
            "flex min-w-0 items-center justify-end pe-3",
            "rounded-e-[var(--ui-radius-track)] rounded-s-[var(--ui-radius-tight)]",
            ui.club.fill,
          )}
        >
          <Value
            value={figure(stat.awayValue, stat.awayDisplayValue, stat)}
            className={ui.stat.lg}
          />
        </span>
      </div>
    </div>
  );
}

function StatRow({
  stat,
  label,
  palettes,
  figure,
}: {
  stat: Stat;
  label: string;
  palettes: { home: ClubPalette; away: ClubPalette };
  figure: Figure;
}) {
  const home = stat.homeValue;
  const away = stat.awayValue;
  const comparable = home !== null && away !== null;
  const homeLeads = comparable && home > away;
  const awayLeads = comparable && away > home;

  const cell = (side: "home" | "away", leads: boolean) => {
    const value =
      side === "home"
        ? figure(stat.homeValue, stat.homeDisplayValue, stat)
        : figure(stat.awayValue, stat.awayDisplayValue, stat);
    return (
      <span
        {...(leads ? clubStyle(palettes[side]) : {})}
        className={cn(
          "inline-flex h-6 min-w-9 items-center justify-center px-2",
          ui.radius.full,
          side === "home" ? "justify-self-start" : "justify-self-end",
          leads ? ui.club.fill : ui.tone.default,
        )}
      >
        <Value value={value} className={ui.stat.md} />
      </span>
    );
  };

  return (
    <li className={cn("py-2", ui.rule.blockStart)}>
      <div className="grid grid-cols-[4rem_minmax(0,1fr)_4rem] items-center">
        {cell("home", homeLeads)}
        <span
          className={cn(
            "text-center",
            ui.text.meta,
            "[font-weight:var(--ui-weight-strong)]",
            ui.tone.muted,
          )}
        >
          {label}
        </span>
        {cell("away", awayLeads)}
      </div>
      {comparable && (
        // One bar, split in proportion: a zero side takes no room, and two
        // zeros leave an even, neutral track rather than an empty row.
        <div aria-hidden className="mt-2 flex h-1.5 gap-0.5">
          {home + away === 0 ? (
            <span className={cn("flex-1", ui.radius.full, ui.surface.sunken)} />
          ) : (
            <>
              {home > 0 && (
                <span
                  {...withClub(palettes.home, { flex: `${home} 1 0` })}
                  className={cn(ui.radius.full, ui.club.fillOnly)}
                />
              )}
              {away > 0 && (
                <span
                  {...withClub(palettes.away, { flex: `${away} 1 0` })}
                  className={cn(ui.radius.full, ui.club.fillOnly)}
                />
              )}
            </>
          )}
        </div>
      )}
    </li>
  );
}
