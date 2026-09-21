import type { Club, FantasySummary, Gameweek } from "@/types/domain";
import { useI18n } from "@/i18n/provider";
import { DeadlineCountdown } from "./DeadlineCountdown";
import { ClubCrest } from "./ClubCrest";
import { Trophy, Shirt, ChevronRight } from "lucide-react";
import { ui, UiCard, UiLinkButton } from "@/components/ui-kit";
import { cn } from "@/lib/utils";

/**
 * Fantasy CTA hero card.
 *
 * Converted from the Design System V2 level-4 glass surface to the shared UI
 * kit: an opaque `UiCard`, the Fantasy type scale and radii, and the kit's
 * gradient action button for the CTA. Layout, i18n and RTL behaviour are
 * unchanged, as is the public props API.
 *
 * Every `tracking-*` reaches this file through `ui.text.label`, which is
 * `ltr:`-prefixed — Arabic letterforms join and must never be letter-spaced
 * (BG-0069).
 */
export function FantasySummaryCard({
  summary,
  gw,
  club,
}: {
  summary: FantasySummary;
  gw: Gameweek;
  club?: Club;
}) {
  const { t, lang } = useI18n();
  const nf = new Intl.NumberFormat(lang === "ar" ? "ar-MA" : "fr-FR");
  const initials =
    summary.teamName
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0])
      .join("")
      .toUpperCase() || "BG";

  return (
    <UiCard className="relative min-w-0 overflow-hidden">
      <div className="relative grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
        <div className="flex min-w-0 items-start gap-2.5">
          {club ? (
            <ClubCrest club={club} size="md" className="mt-0.5 rounded-full" />
          ) : (
            <div
              aria-hidden
              className={cn(
                "mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full",
                ui.text.label,
                "text-[color:var(--ui-ink-deep)]",
              )}
              style={{ backgroundImage: "var(--ui-grad-action)" }}
            >
              {initials}
            </div>
          )}
          <div className="min-w-0">
            <div
              className={cn("inline-flex min-w-0 items-center gap-1.5", ui.text.label, ui.tone.ink)}
            >
              <Trophy className="h-3.5 w-3.5 shrink-0" aria-hidden />
              <span className="truncate">
                {t("home.gameweek")} {gw.number}
              </span>
            </div>
            <div className={cn("mt-1 truncate", ui.text.subtitle, ui.tone.default)}>
              {summary.teamName}
            </div>
            {/* BG-0074: the manager name falls back to the team name when no
                profile can be resolved, so printing both would repeat it. */}
            {summary.managerName && summary.managerName !== summary.teamName ? (
              <div className={cn("truncate", ui.text.meta, ui.tone.muted)}>
                {summary.managerName}
              </div>
            ) : null}
          </div>
        </div>
        <div className="text-end">
          <div className={cn(ui.text.label, ui.tone.muted)}>{t("home.deadline")}</div>
          <div className="mt-1">
            <DeadlineCountdown iso={gw.deadline} />
          </div>
        </div>
      </div>

      <div className="relative mt-4 grid grid-cols-4 gap-2 text-center">
        <Metric label={t("fantasy.gw_points")} value={nf.format(summary.gameweekPoints)} accent />
        <Metric label={t("fantasy.total_points")} value={nf.format(summary.totalPoints)} />
        <Metric
          label={t("fantasy.overall_rank")}
          value={summary.overallRank === null ? "—" : nf.format(summary.overallRank)}
          small
        />
        <Metric label={t("fantasy.transfers")} value={String(summary.transfersLeft)} />
      </div>

      <UiLinkButton to="/fantasy/team" aria-label={t("home.view_fantasy_team")} className="mt-4">
        <Shirt className="h-4 w-4 shrink-0" aria-hidden />
        <span className="truncate">{t("home.view_fantasy_team")}</span>
        <ChevronRight className="h-4 w-4 shrink-0" aria-hidden />
      </UiLinkButton>
    </UiCard>
  );
}

function Metric({
  label,
  value,
  accent,
  small,
}: {
  label: string;
  value: string;
  accent?: boolean;
  small?: boolean;
}) {
  return (
    <div className={cn("min-w-0 px-1.5 py-2", ui.radius.control, ui.surface.sunken)}>
      <div
        className={cn(
          ui.text.tabular,
          "[font-weight:var(--ui-weight-hero)] leading-none",
          accent ? ui.tone.ink : ui.tone.default,
          small ? ui.text.meta : ui.text.body,
        )}
      >
        {value}
      </div>
      {/* `micro` rather than `label`: four metrics share a 390px row, so the
          caption has to stay dense enough not to truncate to nothing. */}
      <div className={cn("mt-1 truncate", ui.text.micro, ui.tone.muted)}>{label}</div>
    </div>
  );
}
