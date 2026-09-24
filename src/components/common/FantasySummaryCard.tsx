import { Link } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import createTeamArt from "@/assets/illustrations/create-team.webp";
import type { FantasySummary } from "@/types/domain";
import { useI18n } from "@/i18n/provider";
import { ui } from "@/components/ui-kit";
import { cn } from "@/lib/utils";

/**
 * Home's Fantasy card (Option A, A-Home): the action gradient, one link.
 *
 * `FantasySummaryCard` is the manager's: at the start a kicker ("VOTRE
 * FANTASY · ATLAS XI") and the overall rank, at the end the gameweek's points
 * as the one big figure. Only numbers the summary really carries: the board's
 * "▲ 1 210" rank movement has no source (`FantasySummary` holds the current
 * ranks, not the previous ones), so it is not drawn, and a manager with no
 * rank yet simply has no rank line.
 *
 * `FantasyCreateCard` is the same object for a visitor with no team yet:
 * the kicker, "Créer mon équipe", and the tactics-board illustration.
 *
 * Every foreground on the gradient is `--ui-ink-deep`, the one colour the kit
 * pairs with it — the gradient stays light in the dark theme, so a themed
 * text colour would fail there. `ui.text.label` carries the only tracking,
 * `ltr:`-prefixed: Arabic letterforms join and are never letter-spaced
 * (BG-0069).
 */

/** The gradient card frame both states share. */
const CARD = cn(
  "flex min-w-0 items-center gap-4 px-5 py-6",
  ui.radius.sheet,
  "text-[color:var(--ui-ink-deep)]",
  "transition-transform duration-[var(--duration-tap)] ease-[var(--ease-standard)] active:translate-y-px",
  ui.focus,
);
const GRADIENT = { backgroundImage: "var(--ui-grad-action)" } as const;

/** "Votre {accent}Fantasy{/accent}" as a single-tone kicker: the gradient is
 *  already the accent, so the markers are dropped rather than coloured. */
const plain = (text: string) => text.replace(/\{\/?accent\}/g, "");

export function FantasySummaryCard({ summary }: { summary: FantasySummary }) {
  const { t, lang } = useI18n();
  const nf = new Intl.NumberFormat(lang === "ar" ? "ar-MA" : "fr-FR");
  const points = nf.format(summary.gameweekPoints);
  const rank = summary.overallRank === null ? null : nf.format(summary.overallRank);
  // "58" alone is a number, not a meaning: the link's name says what each
  // figure is, and the visual content under it is hidden from assistive tech.
  const label = [
    summary.teamName,
    `${t("fantasy.gw_points")} ${points}`,
    rank === null ? null : `${t("fantasy.overall_rank")} ${rank}`,
    t("home.view_fantasy_team"),
  ]
    .filter(Boolean)
    .join(". ");

  return (
    <Link to="/fantasy/team" aria-label={label} className={CARD} style={GRADIENT}>
      <span aria-hidden className="min-w-0 flex-1">
        <span className={cn("block truncate", ui.text.label)}>
          {plain(t("home.fantasy_hub"))} · {summary.teamName}
        </span>
        {rank === null ? null : (
          <span
            className={cn(
              "mt-1 block truncate",
              ui.text.meta,
              "[font-weight:var(--ui-weight-strong)]",
            )}
          >
            {t("fpl.rank")} <bdi className={ui.text.tabular}>{rank}</bdi>
          </span>
        )}
      </span>
      <span aria-hidden className="flex shrink-0 items-baseline gap-1">
        <bdi className={ui.score.hero}>{points}</bdi>
        <span className={cn(ui.text.meta, "[font-weight:var(--ui-weight-heavy)]")}>
          {t("fantasy.points.abbr")}
        </span>
      </span>
    </Link>
  );
}

export function FantasyCreateCard({
  canCreate,
}: {
  /** Whether a team can be created now; otherwise the card opens the hub. */
  canCreate: boolean;
}) {
  const { t } = useI18n();
  // Two literal calls rather than one call over a ternary: the i18n gate
  // reads keys statically and counts a computed argument as opaque.
  const title = canCreate ? t("fantasy.create.title") : t("fantasy.title");
  return (
    <Link to={canCreate ? "/fantasy/create" : "/fantasy"} className={CARD} style={GRADIENT}>
      <span className="min-w-0 flex-1">
        <span className={cn("block truncate", ui.text.label)}>{plain(t("home.fantasy_hub"))}</span>
        <span className={cn("mt-1 flex items-center gap-1", ui.display.section)}>
          <span className="min-w-0 truncate">{title}</span>
          <ChevronRight className="h-5 w-5 shrink-0" aria-hidden />
        </span>
      </span>
      <img
        src={createTeamArt}
        alt=""
        aria-hidden
        loading="lazy"
        decoding="async"
        className="-my-3 h-20 w-auto shrink-0 object-contain"
      />
    </Link>
  );
}
