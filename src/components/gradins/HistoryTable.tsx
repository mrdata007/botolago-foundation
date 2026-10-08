import type { ReactNode } from "react";

import type { HistoryRowDto } from "@/backend/manager-card/contracts";
import { STANDINGS_FIGURE_CELL } from "@/components/fantasy-lists/standings";
import { useCardCopy, useGradinsCopy } from "@/components/manager-card/copy";
import { ui, UiTable, UiTBody, UiTD, UiTH, UiTHead, UiTR } from "@/components/ui-kit";
import { useI18n } from "@/i18n/provider";
import { cn } from "@/lib/utils";

import { DASH, Figure, ProvisionalBadge } from "./figures";

/**
 * « Journée / Note / Palier », newest first: the stored note after each evaluated journée. A row
 * with no note shows a dash with « pas encore de note » for a screen reader; a provisional note
 * carries the « Provisoire » pill. A real table, whose figures are the ones the sparkline draws.
 */
export function HistoryTable({
  rows,
  caption,
}: {
  rows: readonly HistoryRowDto[];
  caption: ReactNode;
}) {
  const { t } = useI18n();
  const copy = useGradinsCopy();
  const card = useCardCopy();
  return (
    <UiTable caption={caption}>
      <UiTHead className="bg-transparent">
        <UiTR>
          <UiTH className={cn("ps-4", STANDINGS_FIGURE_CELL)}>{copy.seasonsColRound}</UiTH>
          <UiTH numeric className={STANDINGS_FIGURE_CELL}>
            {copy.seasonsColRating}
          </UiTH>
          <UiTH className={cn("pe-4", STANDINGS_FIGURE_CELL)}>{copy.seasonsColTier}</UiTH>
        </UiTR>
      </UiTHead>
      <UiTBody>
        {rows.map((row, index) => (
          <UiTR
            key={`${row.seasonId}-${row.gameweekSeq}`}
            className={cn("h-[var(--ui-row-min)]", index === rows.length - 1 && "border-b-0")}
          >
            <UiTD className={cn("ps-4", STANDINGS_FIGURE_CELL, ui.tone.muted)}>
              {t("fantasy.leagues.gw")}
              <Figure>{row.gameweekSeq}</Figure>
            </UiTD>
            <UiTD numeric strong className={cn(STANDINGS_FIGURE_CELL, ui.stat.md, ui.tone.default)}>
              {row.ovr === null ? (
                <>
                  <span aria-hidden>{DASH}</span>
                  <span className="sr-only">{card.a11y.noRating}</span>
                </>
              ) : (
                <Figure>{row.ovr}</Figure>
              )}
            </UiTD>
            <UiTD className={cn("pe-4", STANDINGS_FIGURE_CELL)}>
              <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className={cn(ui.text.secondary, ui.tone.default)}>
                  {row.tier ? card.tier[row.tier] : DASH}
                </span>
                {row.provisional && row.ovr !== null ? (
                  <ProvisionalBadge className="px-2 py-0.5" />
                ) : null}
              </span>
            </UiTD>
          </UiTR>
        ))}
      </UiTBody>
    </UiTable>
  );
}
