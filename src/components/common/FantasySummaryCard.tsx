import { Link } from "@tanstack/react-router";
import type { Club, FantasySummary } from "@/types/domain";
import { useI18n } from "@/i18n/provider";
import { ClubCrest } from "./ClubCrest";
import { ChevronRight } from "lucide-react";
import { ui, UiCard } from "@/components/ui-kit";
import { cn } from "@/lib/utils";

/**
 * Home's "Votre Fantasy" card.
 *
 * Accueil art-direction pass: the gameweek and its deadline now lead the page
 * in Home's gameweek band, so the card no longer repeats them. What is left is
 * the manager's own state — the team, and the four numbers they open the card
 * for — composed as one strip of figures on hairlines rather than four grey
 * tiles, and a single way in: the team row itself, which links to the team.
 * The full-width gradient button it replaces was the loudest element on Home,
 * louder than the football; the section's own "Tout voir" still leads to the
 * Fantasy hub.
 *
 * Every `tracking-*` reaches this file through `ui.text.label`, which is
 * `ltr:`-prefixed — Arabic letterforms join and must never be letter-spaced
 * (BG-0069).
 */

export function FantasySummaryCard({ summary, club }: { summary: FantasySummary; club?: Club }) {
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
    <UiCard padding="none" className="min-w-0 overflow-hidden">
      <Link
        to="/fantasy/team"
        aria-label={`${summary.teamName} — ${t("home.view_fantasy_team")}`}
        className={cn(
          "flex min-w-0 items-center gap-3 px-4 py-3.5",
          "transition-colors duration-[var(--duration-quick)]",
          "hover:bg-[color:var(--ui-surface-sunken)]",
          ui.focus,
        )}
      >
        {club ? (
          <ClubCrest club={club} size="md" className="rounded-full" />
        ) : (
          <div
            aria-hidden
            className={cn(
              "grid h-10 w-10 shrink-0 place-items-center rounded-full",
              ui.surface.inkPlain,
              ui.text.label,
            )}
          >
            {initials}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className={cn("truncate", ui.text.subtitle, ui.tone.default)}>
            {summary.teamName}
          </div>
          {/* BG-0074: the manager name falls back to the team name when no
              profile can be resolved, so printing both would repeat it. */}
          {summary.managerName && summary.managerName !== summary.teamName ? (
            <div className={cn("truncate", ui.text.meta, ui.tone.muted)}>{summary.managerName}</div>
          ) : null}
        </div>
        <span
          className={cn(
            "inline-flex shrink-0 items-center gap-0.5",
            ui.text.meta,
            "[font-weight:var(--ui-weight-heavy)]",
            ui.tone.ink,
          )}
          aria-hidden
        >
          {t("home.view_fantasy_team")}
          <ChevronRight className="h-4 w-4" aria-hidden />
        </span>
      </Link>

      {/* BG-0111 — two-up at phone width, four-up from `sm`: at 390px a
          four-column row leaves each caption 64px, and "Classement" alone
          measures ~70px. The figures sit on the card itself, one hairline
          apart (the 1px gap shows the rule colour behind the cells), so the
          four numbers read as one strip instead of four grey buttons. */}
      <div
        className={cn(
          "grid grid-cols-2 gap-px text-center sm:grid-cols-4",
          "bg-[color:var(--ui-rule)]",
          ui.rule.blockStart,
        )}
      >
        <Metric label={t("fantasy.gw_points")} value={nf.format(summary.gameweekPoints)} accent />
        <Metric label={t("fantasy.total_points")} value={nf.format(summary.totalPoints)} />
        <Metric
          label={t("fantasy.overall_rank")}
          value={summary.overallRank === null ? "—" : nf.format(summary.overallRank)}
        />
        <Metric label={t("fantasy.transfers")} value={String(summary.transfersLeft)} />
      </div>
    </UiCard>
  );
}

function Metric({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="min-w-0 bg-[color:var(--ui-surface)] px-1.5 py-3">
      <div className={cn(ui.stat.lg, accent ? ui.tone.ink : ui.tone.default)}>{value}</div>
      {/* `micro` rather than `label`: the captions stay dense next to the
          figure, and wrap at word boundaries rather than clamp (BG-0124). */}
      <div className={cn("mt-1 break-words", ui.text.micro, ui.tone.muted)}>{label}</div>
    </div>
  );
}
