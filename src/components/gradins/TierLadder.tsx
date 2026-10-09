import type { ReactNode } from "react";

import type { MyCardDto } from "@/backend/manager-card/contracts";
import { CardToken } from "@/components/manager-card/CardToken";
import { useGradinsCopy, useMomentCopy } from "@/components/manager-card/copy";
import { fill } from "@/components/manager-card/interpolate";
import { TierWord } from "@/components/manager-card/tier-word";
import { fromMyCard, ladderProfile } from "@/components/manager-card/to-profile";
import { TIER_CODES } from "@/components/manager-card/types";
import { ui } from "@/components/ui-kit";
import { useI18n } from "@/i18n/provider";
import { cn } from "@/lib/utils";

import { cardView, tierFell } from "./gradins-state";

/**
 * « Votre palier »: the five tiers as the card itself at each of them, the current one marked, and
 * what the tier follows. A token is the card as it would hang at that tier (same name, club
 * colours and serial), drawn with no number (`ladder`: the tier's own material and a dash): the
 * ladder shows the five materials, never a number the server did not give. The tier follows the
 * note, journée after journée, and can fall; nothing is won or lost here, and the words say so.
 *
 *   - rated: the current token carries a selected ring and « Actuel »; the season's best when it
 *     differs; the distance to the next tier when the server gave one; a fall states the tier
 *     held and the best (plan 4.2);
 *   - not rated yet: « Le palier arrive avec votre première note. » and no token is marked.
 */
export function TierLadder({
  card,
  fallLine = null,
}: {
  card: MyCardDto;
  /** What states a fall below the season's best tier: WP4's `MomentLines` for `tier_down`. */
  fallLine?: ReactNode;
}) {
  const gradins = useGradinsCopy();
  const moments = useMomentCopy();
  const { lang } = useI18n();
  const view = cardView(card);
  const current = view.newSeason ? null : card.tier;
  const base = fromMyCard(card);
  const best = card.bestTier && card.bestTier !== card.tier ? card.bestTier : null;
  return (
    <div data-testid="gradins-tier-ladder">
      <ul className="grid grid-cols-5 gap-1" aria-label={gradins.cardTier}>
        {TIER_CODES.map((tier) => {
          const here = tier === current;
          return (
            <li
              key={tier}
              aria-current={here ? "true" : undefined}
              className="flex min-w-0 flex-col items-center gap-1.5"
            >
              <span
                className={cn(
                  "grid h-14 w-full place-items-center",
                  ui.radius.card,
                  // the current step is marked by its ring alone: a dimmed token would put its dash
                  // under the 3:1 a number needs against the shirt
                  here &&
                    "ring-2 ring-[color:var(--ui-ink-fg)] ring-offset-2 ring-offset-[color:var(--ui-surface)]",
                )}
              >
                <CardToken profile={ladderProfile(base, tier)} size={44} />
              </span>
              <span
                className={cn(
                  "whitespace-nowrap text-center",
                  ui.text.micro,
                  "[font-weight:var(--ui-weight-heavy)]",
                  here ? ui.tone.default : ui.tone.muted,
                )}
              >
                <TierWord tier={tier} />
              </span>
              {here ? (
                <span className={cn("text-center", ui.text.micro, ui.tone.ink)}>
                  {gradins.cardTierNow}
                </span>
              ) : null}
            </li>
          );
        })}
      </ul>
      <div className={cn("mt-4 flex flex-col gap-1 text-pretty", ui.text.secondary, ui.tone.muted)}>
        {current === null ? (
          <p>{gradins.cardTierNone}</p>
        ) : (
          <>
            {tierFell(card) ? (
              // « Palier actuel : STADE. Meilleur cette saison : PRO. » is WP4's state line.
              fallLine
            ) : best ? (
              <p>
                {gradins.cardTierBest}
                {lang === "fr" ? "\u00A0: " : ": "}
                <span className={cn(ui.tone.default, "[font-weight:var(--ui-weight-heavy)]")}>
                  <TierWord tier={best} />
                </span>
              </p>
            ) : null}
            {card.nextTier ? (
              <p>
                {fill(moments.m4.sheetTierDistance, {
                  tier: <TierWord tier={card.nextTier.code} />,
                  from: card.nextTier.fromOvr,
                })}
              </p>
            ) : null}
            <p>{gradins.cardTierExplain}</p>
          </>
        )}
      </div>
    </div>
  );
}
