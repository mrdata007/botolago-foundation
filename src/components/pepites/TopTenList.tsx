import { ui } from "@/components/ui-kit";
import { useI18n } from "@/i18n/provider";
import { cn } from "@/lib/utils";

import { formatNumber, type TopTenItem } from "./pepites-format";
import { MovementBadge, PepitesPlayerLine, PlayerLink, ScoreFigure } from "./PepitesParts";

/**
 * The ten players of an edition, in the editor's order: rank, photo or
 * silhouette, name and club, score, last week's arrow and the editor's line
 * in the reader's language. Each row opens the player's page.
 */
export function TopTenList({ items, testId }: { items: readonly TopTenItem[]; testId?: string }) {
  const { lang } = useI18n();
  return (
    <ol className="flex flex-col gap-2" data-testid={testId}>
      {items.map((item) => {
        const reason = lang === "ar" ? item.reasonAr : item.reasonFr;
        return (
          <li key={item.player.id} data-testid="pepites-top-entry">
            <PlayerLink playerId={item.player.id}>
              <div
                className={cn(
                  "flex flex-col gap-2 rounded-[var(--ui-radius-card)] p-3",
                  ui.surface.card,
                )}
              >
                <div className="flex items-center gap-3">
                  <bdi
                    className={cn(
                      ui.score.row,
                      "w-7 shrink-0 text-center tabular-nums",
                      item.rank <= 3 ? ui.tone.ink : ui.tone.muted,
                    )}
                    aria-label={`#${item.rank}`}
                  >
                    {formatNumber(item.rank, lang)}
                  </bdi>
                  <div className="min-w-0 flex-1">
                    <PepitesPlayerLine
                      player={item.player}
                      size="md"
                      trailing={
                        <div className="flex shrink-0 flex-col items-end gap-1">
                          <ScoreFigure score={item.score} />
                          {item.movement !== undefined ? (
                            <MovementBadge movement={item.movement ?? null} />
                          ) : null}
                        </div>
                      }
                    />
                  </div>
                </div>
                {reason ? (
                  <p className={cn(ui.text.meta, ui.tone.muted, "ps-10")}>{reason}</p>
                ) : null}
              </div>
            </PlayerLink>
          </li>
        );
      })}
    </ol>
  );
}
