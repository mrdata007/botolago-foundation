import type { ReactNode } from "react";

import { formatDeadline } from "@/components/fpl/deadline";
import {
  useCardCopy,
  useGradinsCopy,
  useMomentCopy,
  type CardCopy,
  type GradinsCopy,
  type MomentCopy,
} from "@/components/manager-card/copy";
import { fill } from "@/components/manager-card/interpolate";
import { ui, UiCard, UiLinkButton } from "@/components/ui-kit";
import { useI18n } from "@/i18n/provider";
import { cn } from "@/lib/utils";
import type { Language } from "@/types/domain";

import { SectionHeader } from "@/components/common/SectionHeader";
import { Figure } from "./figures";
import type { FormingLine, RoundBlock } from "./gradins-state";

/**
 * « Cette journée »: what the current journée means for the card (plan 4.1, and the M3b
 * sub-states of the approved onboarding plan).
 *
 *   - forming: the counter « 1/3 » in the 30px figure step, « Carte en formation », and one line;
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
  /** The counter, when the card is counting. */
  counter: { counted: number; min: number } | null;
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
      return moments.m3.insufficient;
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
  gradins: GradinsCopy,
  moments: MomentCopy,
  card: CardCopy,
): RoundText {
  switch (block.kind) {
    case "closed":
      return {
        title: gradins.seasonClosedLabel,
        counter: null,
        label: null,
        line: fill(moments.m10.closed, {
          season: block.season,
          ovr: block.ovr,
          tier: block.tier ? card.tier[block.tier] : "",
        }),
        secondary: null,
        compose: false,
      };
    case "started":
      return {
        title: gradins.roundTitle,
        counter: { counted: block.counted, min: block.min },
        label: moments.m3.label,
        line: fill(moments.m10.started, {
          season: block.season,
          prev: block.previous,
          final: card.finalRounds(block.min),
        }),
        secondary: null,
        compose: true,
      };
    case "forming":
      if (block.line.kind === "late") {
        // The season is over: no counter, no « en formation »; the count stays as a quiet line.
        return {
          title: gradins.roundTitle,
          counter: null,
          label: null,
          line: formingText(block.line, block.min, lang, moments, card),
          secondary: (
            <>
              <Figure>{block.counted}</Figure>/<Figure>{block.min}</Figure>
              <span aria-hidden> · </span>
              <Figure>{block.season}</Figure>
            </>
          ),
          compose: false,
        };
      }
      return {
        title: gradins.roundTitle,
        counter: { counted: block.counted, min: block.min },
        label: moments.m3.label,
        line: formingText(block.line, block.min, lang, moments, card),
        secondary: null,
        compose: true,
      };
    case "rated":
      return {
        title: gradins.roundTitle,
        counter: null,
        label: null,
        line: block.round
          ? fill(gradins.roundLine, {
              gw: block.round.number,
              deadline: (
                <bdi>{formatDeadline(block.round.deadline, lang, { weekday: "short" })}</bdi>
              ),
            })
          : null,
        secondary: gradins.roundRecalc,
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
  const gradins = useGradinsCopy();
  const moments = useMomentCopy();
  const card = useCardCopy();
  const text = roundText(block, lang, gradins, moments, card);
  return (
    <section data-testid="gradins-round" aria-label={text.title}>
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
                <Figure>{text.counter.counted}</Figure>/<Figure>{text.counter.min}</Figure>
              </span>
              <span className="sr-only">
                {card.countedA11y(text.counter.counted, text.counter.min)}
              </span>
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
