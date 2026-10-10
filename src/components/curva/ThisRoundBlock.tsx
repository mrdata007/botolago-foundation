import type { ReactNode } from "react";

import { formatDeadline } from "@/components/fpl/deadline";
import {
  CARD_STAT_TOTAL,
  OVR_MIN_STATS,
  useCardCopy,
  useCurvaCopy,
  useMomentCopy,
  type CardCopy,
  type CurvaCopy,
  type MomentCopy,
} from "@/components/manager-card/copy";
import { fill } from "@/components/manager-card/interpolate";
import { tierNode } from "@/components/manager-card/tier-node";
import { ui, UiCard, UiLinkButton } from "@/components/ui-kit";
import { useI18n } from "@/i18n/provider";
import { cn } from "@/lib/utils";
import type { Language } from "@/types/domain";

import { SectionHeader } from "@/components/common/SectionHeader";
import { Figure } from "./figures";
import type { FormingLine, RoundBlock } from "./curva-state";

/**
 * « Cette journée »: what the current journée means for the card (plan 4.1, and the M3b
 * sub-states of the approved onboarding plan).
 *
 *   - forming: the counter « 1/3 » in the 30px figure step, « Carte en formation », and one line;
 *   - every journée counted and too few statistics for a number (`insufficient`): the statistics
 *     counter « 2/4 », « Statistiques remplies », and the line that says 3 of 4 are needed (never
 *     a full journée counter « 2/2 » with no number);
 *   - rated: « J8 · date limite sam. 16:30 » and when the note is recalculated;
 *   - a season over: « Saison 2026/27 terminée : 86, CHAMPION. Elle reste sur votre carte. »;
 *   - a new season with no number of its own yet: the new counter, and the line that says the
 *     card keeps last season's note until then.
 *
 * Every date is the Fantasy deadline the gameweek read carries, in Morocco time. No time is ever
 * promised for a note: finalisation time varies.
 */
interface RoundText {
  title: string;
  /** The counter, when the card is counting: the figure « k/n » and what a screen reader says. */
  counter: { k: number; n: number; a11y: string } | null;
  label: string | null;
  line: ReactNode;
  secondary: ReactNode;
  /** The « Composer l'équipe » link is useful (there is something left to play). */
  compose: boolean;
}

function formingText(
  line: FormingLine,
  min: number,
  lang: Language,
  moments: MomentCopy,
  card: CardCopy,
): ReactNode {
  const final = card.finalRounds(min);
  switch (line.kind) {
    case "first_counted":
      return fill(moments.m3.firstCounted, { gw: line.gw });
    case "next":
      return fill(moments.m3.line, {
        final,
        gw: line.gw,
        deadline: <bdi>{formatDeadline(line.deadline, lang, { weekday: "short" })}</bdi>,
      });
    case "eve":
      return fill(moments.m3.eve, { gw: line.gw });
    case "over":
      return fill(moments.m3.over, { gw: line.gw });
    case "insufficient":
      return fill(moments.m3.insufficient, { need: OVR_MIN_STATS, total: CARD_STAT_TOTAL });
    case "late":
      return line.nextSeason ? fill(moments.m3.late, { season: line.nextSeason }) : null;
    case "listed": {
      const list = line.gws.length > 0 && line.gws.length <= 3 ? card.gwList(line.gws) : null;
      if (list) return fill(moments.m2.line1, { final, gws: list });
      if (line.from !== null) return fill(moments.m2.line1From, { final, gw: line.from });
      return null;
    }
  }
}

function roundText(
  block: RoundBlock,
  lang: Language,
  curva: CurvaCopy,
  moments: MomentCopy,
  card: CardCopy,
): RoundText {
  switch (block.kind) {
    case "closed":
      return {
        title: curva.seasonClosedLabel,
        counter: null,
        label: null,
        line: fill(moments.m10.closed, {
          season: block.season,
          ovr: block.ovr,
          tier: block.tier ? tierNode(block.tier, card.tier[block.tier], lang) : "",
        }),
        secondary: null,
        compose: false,
      };
    case "started":
      return {
        title: curva.roundTitle,
        counter: {
          k: block.counted,
          n: block.min,
          a11y: card.countedA11y(block.counted, block.min),
        },
        label: moments.m3.label,
        // The sentence about last season's note is WP4's persistent state line (`MomentLines`,
        // under this block): this block states the counter, the page does not word it twice.
        line: null,
        secondary: null,
        compose: true,
      };
    case "forming":
      if (block.line.kind === "late") {
        // The season is over: no counter, no « en formation »; the count stays as a quiet line.
        return {
          title: curva.roundTitle,
          counter: null,
          label: null,
          line: formingText(block.line, block.min, lang, moments, card),
          // A full counter with no number would read as broken: then only the season.
          secondary:
            block.counted < block.min ? (
              <>
                <Figure>
                  {block.counted}/{block.min}
                </Figure>
                <span aria-hidden> · </span>
                <Figure>{block.season}</Figure>
              </>
            ) : (
              <Figure>{block.season}</Figure>
            ),
          compose: false,
        };
      }
      if (block.line.kind === "insufficient") {
        // Every journée is counted: what the number waits for is a statistic, so the counter
        // counts the statistics.
        const filled = block.line.statsFilled;
        return {
          title: curva.roundTitle,
          counter: {
            k: filled,
            n: CARD_STAT_TOTAL,
            a11y: card.statsFilledA11y(filled, CARD_STAT_TOTAL),
          },
          label: card.statsFilled,
          line: formingText(block.line, block.min, lang, moments, card),
          secondary: null,
          compose: true,
        };
      }
      return {
        title: curva.roundTitle,
        counter: {
          k: block.counted,
          n: block.min,
          a11y: card.countedA11y(block.counted, block.min),
        },
        label: moments.m3.label,
        line: formingText(block.line, block.min, lang, moments, card),
        secondary: null,
        compose: true,
      };
    case "rated":
      return {
        title: curva.roundTitle,
        counter: null,
        label: null,
        line: block.round
          ? fill(curva.roundLine, {
              gw: block.round.number,
              deadline: (
                <bdi>{formatDeadline(block.round.deadline, lang, { weekday: "short" })}</bdi>
              ),
            })
          : null,
        secondary: curva.roundRecalc,
        compose: true,
      };
  }
}

export function ThisRoundBlock({
  block,
  composeLabel,
  lines,
}: {
  block: RoundBlock;
  /** `fpl.pick_team`, read by the caller (a reused key). */
  composeLabel: string;
  /** The one-line states under the block (provisional cleared, new season): WP4's `MomentLines`. */
  lines?: ReactNode;
}) {
  const { lang } = useI18n();
  const curva = useCurvaCopy();
  const moments = useMomentCopy();
  const card = useCardCopy();
  const text = roundText(block, lang, curva, moments, card);
  return (
    <section data-testid="curva-round" aria-label={text.title}>
      <SectionHeader title={text.title} />
      <UiCard padding="md" className="flex flex-col gap-3">
        {text.counter ? (
          <div className="flex items-center gap-4">
            <p
              className={cn(
                "grid min-w-[4.25rem] shrink-0 place-items-center py-2",
                ui.radius.card,
                ui.surface.sunken,
                ui.score.md,
              )}
            >
              <span aria-hidden>
                <Figure>
                  {text.counter.k}/{text.counter.n}
                </Figure>
              </span>
              <span className="sr-only">{text.counter.a11y}</span>
            </p>
            <div className="min-w-0 flex-1">
              <p className={cn(ui.text.bodyStrong, ui.tone.default)}>{text.label}</p>
              {text.line ? (
                <p className={cn("mt-0.5 text-pretty", ui.text.secondary, ui.tone.muted)}>
                  {text.line}
                </p>
              ) : null}
            </div>
          </div>
        ) : (
          <div className="min-w-0">
            {text.line ? (
              <p className={cn("text-pretty", ui.text.bodyStrong, ui.tone.default)}>{text.line}</p>
            ) : null}
            {text.secondary ? (
              <p
                className={cn(
                  text.line && "mt-0.5",
                  "text-pretty",
                  ui.text.secondary,
                  ui.tone.muted,
                )}
              >
                {text.secondary}
              </p>
            ) : null}
          </div>
        )}
        {text.compose ? (
          <UiLinkButton to="/fantasy/team" variant="soft" size="sm" className="self-start">
            {composeLabel}
          </UiLinkButton>
        ) : null}
        <div className="empty:hidden">{lines}</div>
      </UiCard>
    </section>
  );
}
