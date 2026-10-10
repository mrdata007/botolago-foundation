import type { ReactNode } from "react";

import type { MyCardDto, SeasonSummaryDto } from "@/backend/manager-card/contracts";
import { CardToken } from "@/components/manager-card/CardToken";
import { useCurvaCopy } from "@/components/manager-card/copy";
import { fill } from "@/components/manager-card/interpolate";
import { TierWord } from "@/components/manager-card/tier-word";
import type { TokenSize } from "@/components/manager-card/types";
import { ui } from "@/components/ui-kit";
import { cn } from "@/lib/utils";

import { DASH, Figure } from "./figures";
import { seasonProfile } from "./season-profile";

/**
 * The rack: a shelf line across the column and one season standing on it for each season the card
 * has lived (plan 4.6, and the « Vos saisons » row of G1). The seasons stand beside one another on
 * the line, newest first, so "depuis le début" is something you can see: the first season is
 * still there.
 *
 * `onPick` makes each season a button (G6 picks the season the page shows, `aria-pressed`);
 * without it the rack is a plain list inside whatever link wraps it (G1).
 */
export function SeasonRack({
  card,
  seasons,
  selectedId,
  onPick,
  size,
}: {
  card: MyCardDto;
  seasons: readonly SeasonSummaryDto[];
  selectedId?: string | null;
  onPick?: (season: SeasonSummaryDto) => void;
  size: Extract<TokenSize, 44 | 56>;
}) {
  const curva = useCurvaCopy();
  return (
    <div className="relative pt-2" data-testid="curva-rack">
      <span
        aria-hidden
        className="absolute inset-x-0 top-0 h-1.5 rounded-full bg-[color:var(--ui-rule-strong)]"
      />
      <ul className="flex items-start gap-1 overflow-x-auto pb-1 pt-2 [scrollbar-width:none]">
        {seasons.map((season) => {
          const current = season.seasonId === card.season.id;
          const selected = selectedId === season.seasonId;
          const profile = seasonProfile(card, season);
          const caption: ReactNode =
            season.ovr !== null ? (
              <>
                <Figure>{season.ovr}</Figure>
                {season.tier ? (
                  <>
                    {" · "}
                    <TierWord tier={season.tier} />
                  </>
                ) : null}
              </>
            ) : season.gameweeksCounted >= card.minRated ? (
              // Every journée counted and still no number (too few statistics): a full counter
              // would read as broken, so the season shows the dash of a number not given.
              DASH
            ) : (
              <>
                <Figure>
                  {season.gameweeksCounted}/{card.minRated}
                </Figure>
              </>
            );
          const body = (
            <>
              <CardToken profile={profile} size={size} />
              <span
                className={cn("mt-1.5 max-w-full truncate", ui.text.micro, ui.tone.muted)}
                data-rack-season=""
              >
                {fill(curva.seasonsSeason, { season: <Figure>{season.label}</Figure> })}
              </span>
              <span
                className={cn(
                  "max-w-full truncate",
                  ui.text.meta,
                  "[font-weight:var(--ui-weight-heavy)]",
                  ui.tone.default,
                )}
              >
                {caption}
              </span>
            </>
          );
          const itemClass = cn(
            "flex min-w-[4.5rem] flex-col items-center px-2 py-1",
            ui.radius.card,
          );
          return (
            <li
              key={season.seasonId}
              className="shrink-0"
              data-current={current ? "true" : undefined}
            >
              {onPick ? (
                <button
                  type="button"
                  aria-pressed={selected}
                  onClick={() => onPick(season)}
                  className={cn(
                    itemClass,
                    "press min-h-[var(--ui-tap-min)]",
                    ui.focus,
                    selected && "bg-[color:var(--ui-surface-sunken)]",
                  )}
                >
                  {body}
                </button>
              ) : (
                <span className={itemClass}>{body}</span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
