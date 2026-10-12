import type { ReactNode } from "react";

import type { MyCardDto } from "@/backend/manager-card/contracts";
import { useCardCopy } from "@/components/manager-card/copy";
import { fillText } from "@/components/manager-card/interpolate";
import { STAT_CODES, type StatCode } from "@/components/manager-card/types";
import { ui } from "@/components/ui-kit";
import { useI18n } from "@/i18n/provider";
import { cn } from "@/lib/utils";

import { CODE_CLASS, Figure } from "./figures";
import { hasFacts, waitContext, type PendingFacts } from "./pending-card";

/**
 * Under a card that has no number yet: its four statistics with their words, and what each empty
 * one is waiting for, then the facts the screen already has (points, rank, journées counted).
 *
 * The card's own drawing keeps its strip (« CAP — | SEL 99 »): its labels are about 9 px on a
 * phone and an empty value is a bare dash, so this strip says in plain words what each code is and
 * why a value is missing. A value is the server's; an empty one shows the short reason made from
 * its `nullReason` (never a number, never 0), and a screen reader gets the full sentence.
 *
 * Not interactive (no tap target to size). Logical properties only, figures isolated for Arabic.
 */
export function PendingCardPanel({
  card,
  facts,
  className,
}: {
  card: Pick<MyCardDto, "stats" | "gameweeksCounted" | "minRated" | "ratingGameweeks">;
  facts: PendingFacts;
  className?: string;
}) {
  const copy = useCardCopy();
  const wait = waitContext(card);
  return (
    <section
      className={cn("min-w-0", className)}
      data-testid="curva-pending-panel"
      aria-label={copy.pending.title}
    >
      <h2 className={cn("pb-2.5", ui.text.section, ui.tone.muted)}>{copy.pending.title}</h2>
      <div className={cn("overflow-hidden", ui.surface.card)}>
        <ul className="grid grid-cols-2">
          {STAT_CODES.map((code, index) => (
            <StatCell
              key={code}
              code={code}
              stat={card.stats[code]}
              wait={wait}
              className={cn(
                index % 2 === 0 && "border-e border-[color:var(--ui-rule)]",
                index < 2 && "border-b border-[color:var(--ui-rule)]",
              )}
            />
          ))}
        </ul>
        {hasFacts(facts) ? <Facts facts={facts} /> : null}
      </div>
    </section>
  );
}

function StatCell({
  code,
  stat,
  wait,
  className,
}: {
  code: StatCode;
  stat: MyCardDto["stats"][StatCode];
  wait: ReturnType<typeof waitContext>;
  className?: string;
}) {
  const copy = useCardCopy();
  const word = copy.statWord[code];
  const value = stat.value;
  const empty = value === null;
  // In Arabic the card's label already is the word: showing both would say it twice.
  const showCode = copy.stat[code] !== word;
  const sentence = empty
    ? fillText(copy.pending.statWait, {
        word,
        reason: stat.nullReason
          ? copy.reasonText(stat.nullReason, wait.min)
          : copy.waitText(null, wait),
      })
    : fillText(copy.pending.statValue, { word, value });
  return (
    <li
      className={cn(
        "flex min-h-[4.5rem] min-w-0 flex-col justify-center gap-1 px-4 py-3",
        className,
      )}
      data-stat={code}
      data-empty={empty ? "1" : undefined}
    >
      <span aria-hidden className="flex min-w-0 items-baseline gap-2">
        {showCode ? <span className={CODE_CLASS}>{copy.stat[code]}</span> : null}
        <span className={cn("min-w-0", ui.text.meta, "[font-weight:var(--ui-weight-heavy)]")}>
          {word}
        </span>
      </span>
      {empty ? (
        <span
          aria-hidden
          className={cn("text-balance", ui.text.secondary, ui.tone.muted)}
          data-testid="curva-pending-wait"
        >
          {copy.waitText(stat.nullReason, wait)}
        </span>
      ) : (
        <span aria-hidden className={cn(ui.stat.lg, ui.tone.default)}>
          <Figure>{value}</Figure>
        </span>
      )}
      <span className="sr-only">{sentence}</span>
    </li>
  );
}

function Facts({ facts }: { facts: PendingFacts }) {
  const copy = useCardCopy();
  const { lang } = useI18n();
  const nf = new Intl.NumberFormat(lang === "ar" ? "ar-MA-u-nu-latn" : "fr-FR");
  const items: { key: string; label: string; value: ReactNode; spoken: string }[] = [];
  if (facts.points !== null) {
    const shown = nf.format(facts.points);
    items.push({
      key: "points",
      label: copy.pending.points,
      value: <Figure>{shown}</Figure>,
      spoken: shown,
    });
  }
  if (facts.rank !== null) {
    items.push({
      key: "rank",
      label: copy.pending.rank,
      value:
        facts.of !== null ? (
          <Figure>
            {facts.rank}/{facts.of}
          </Figure>
        ) : (
          <Figure>{facts.rank}</Figure>
        ),
      spoken:
        facts.of !== null
          ? fillText(copy.pending.rankOf, { rank: facts.rank, total: facts.of })
          : String(facts.rank),
    });
  }
  if (facts.counted !== null) {
    items.push({
      key: "rounds",
      label: copy.pending.rounds,
      value: <Figure>{facts.counted}</Figure>,
      spoken: String(facts.counted),
    });
  }
  return (
    <dl
      className={cn(
        "grid grid-flow-col auto-cols-fr border-t border-[color:var(--ui-rule)]",
        "divide-x divide-[color:var(--ui-rule)] rtl:divide-x-reverse",
      )}
      data-testid="curva-pending-facts"
    >
      {items.map((item) => (
        <div
          key={item.key}
          className="flex min-w-0 flex-col gap-0.5 px-4 py-2.5"
          data-fact={item.key}
        >
          <dt className={cn("text-balance", ui.text.meta, ui.tone.muted)}>{item.label}</dt>
          <dd className={cn("m-0", ui.text.bodyStrong, ui.tone.default)}>
            <span aria-hidden>{item.value}</span>
            <span className="sr-only">{item.spoken}</span>
          </dd>
        </div>
      ))}
    </dl>
  );
}
