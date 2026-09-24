import { Link } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";

import { ui } from "@/components/ui-kit";
import { useI18n } from "@/i18n/provider";
import { cn } from "@/lib/utils";
import { rankOrdinal } from "./rank-ordinal";
import { RankOrdinal } from "./RankOrdinal";

export interface LeagueListRow {
  key: string;
  name: string;
  to: string;
  /** `null` before the league has ranked anyone: shown as a dash, never a zero. */
  rank: number | null;
  /** Member count, printed as "sur 24" beside a known rank. */
  members?: number | null;
}

/**
 * Leagues as Option A card rows (the A-Fantasy "Mes ligues" list): one card,
 * rows split by hairlines, a 4px edge bar on the inline start, the league name,
 * the manager's rank as an ordinal ("3e") with the league size ("sur 24"), and
 * a chevron. The whole row is the link, so its name is the league's name
 * followed by the rank.
 *
 * The edge is the default `--ui-club-edge` (the brand ink): a league has no
 * colour of its own in the data, and inventing one from its members' clubs
 * would claim an identity the league never chose.
 */
export function LeagueList({
  rows,
  label,
  className,
}: {
  rows: readonly LeagueListRow[];
  /** The list's accessible name. */
  label: string;
  className?: string;
}) {
  const { t, lang } = useI18n();
  const nf = new Intl.NumberFormat(lang === "ar" ? "ar-MA" : "fr-FR");
  return (
    <ul aria-label={label} className={cn(ui.surface.card, "overflow-hidden", className)}>
      {rows.map((row, index) => (
        <li key={row.key} className={cn(index > 0 && ui.rule.blockStart)}>
          <Link
            to={row.to}
            className={cn(
              "flex items-center gap-3 py-2 pe-3 ps-4",
              ui.space.row,
              ui.edge.start,
              ui.focus,
              // Inside a clipped card an outset ring loses its edges.
              "focus-visible:ring-inset focus-visible:ring-offset-0",
            )}
          >
            {/* Two lines before an ellipsis: beside an Arabic rank ("المركز
                12.483 من 18.420") a one-line name kept only "BotolaGO Of…". */}
            <span
              dir="auto"
              className={cn(
                "line-clamp-2 min-w-0 flex-1 break-words",
                ui.text.bodyStrong,
                ui.tone.default,
              )}
            >
              {row.name}
            </span>
            <span className="flex shrink-0 items-baseline gap-1.5">
              {row.rank === null ? (
                <span className={cn(ui.stat.md, ui.tone.muted)}>{t("fantasy.stat.none")}</span>
              ) : (
                <>
                  <RankOrdinal
                    parts={rankOrdinal(row.rank, lang, t, (value) => nf.format(value))}
                    className={ui.tone.default}
                  />
                  {row.members ? (
                    <span className={cn(ui.text.meta, ui.tone.muted)}>
                      {t("fantasy.leagues.of_members").replace("{n}", nf.format(row.members))}
                    </span>
                  ) : null}
                </>
              )}
            </span>
            <ChevronRight className={cn("h-5 w-5 shrink-0", ui.tone.muted)} aria-hidden />
          </Link>
        </li>
      ))}
    </ul>
  );
}
