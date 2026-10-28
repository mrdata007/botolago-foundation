import { Link } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";

import type { MyCardDto } from "@/backend/manager-card/contracts";
import { fillText } from "@/components/manager-card/interpolate";
import { useCardCopy, useMomentCopy, type WaitContext } from "@/components/manager-card/copy";
import { useI18n } from "@/i18n/provider";
import { STAT_CODES, type StatCode } from "@/components/manager-card/types";
import { ui } from "@/components/ui-kit";
import { cn } from "@/lib/utils";

import { CODE_CLASS, DASH, Figure } from "./figures";
import { hasFacts, waitContext, type PendingFacts } from "./pending-card";

/**
 * One statistic of the card: its code, its value (or a dash), what it is, and, when it is empty,
 * why. The value is the server's; a missing one is « — » with the server's reason, never 0
 * (plan 4.1 and 4.2). Used by G1's four tiles and G2's « D'où vient votre note ».
 */
export function StatTile({
  code,
  stat,
  minRated,
  wait,
  className,
  variant = "full",
}: {
  code: StatCode;
  stat: MyCardDto["stats"][StatCode];
  minRated: number;
  /**
   * What the card knows about its journées. With it, an empty statistic shows its short reason
   * (« après J7 », « pas de transfert ») where the number goes, not a bare dash.
   */
  wait?: WaitContext;
  className?: string;
  /** `quiet`: G1's explanation of the note, a size down; `full`: G2, where it is the point. */
  variant?: "full" | "quiet";
}) {
  const copy = useCardCopy();
  const empty = stat.value === null;
  return (
    <li
      className={cn(
        "flex min-w-0 flex-col gap-0.5 px-4",
        variant === "quiet" ? "py-2.5" : "py-3",
        className,
      )}
      data-stat={code}
    >
      <span className="flex min-w-0 items-baseline gap-1.5">
        <span className={CODE_CLASS}>{copy.stat[code]}</span>
        {/* In Arabic the card's label already is the word: showing both would say it twice. */}
        {copy.stat[code] !== copy.statWord[code] ? (
          <span
            className={cn(ui.text.meta, "[font-weight:var(--ui-weight-heavy)]", ui.tone.default)}
          >
            <span aria-hidden>· </span>
            {copy.statWord[code]}
          </span>
        ) : null}
      </span>
      {empty && wait ? (
        <span
          className={cn("text-balance", ui.text.bodyStrong, ui.tone.muted)}
          data-testid="curva-stat-wait"
        >
          {copy.waitText(stat.nullReason, wait)}
        </span>
      ) : (
        <span
          className={cn(
            variant === "quiet" ? ui.stat.lg : ui.stat.hero,
            empty ? ui.tone.muted : ui.tone.default,
          )}
        >
          {empty ? DASH : <Figure>{stat.value}</Figure>}
        </span>
      )}
      <span
        className={cn(
          "text-balance",
          ui.text.meta,
          variant === "quiet" ? ui.tone.muted : ui.tone.default,
        )}
      >
        {copy.statLong[code]}
      </span>
      {empty && stat.nullReason ? (
        <span className={cn("text-balance", ui.text.micro, "leading-snug", ui.tone.muted)}>
          {copy.reasonText(stat.nullReason, minRated)}
        </span>
      ) : null}
    </li>
  );
}

/**
 * G1's four tiles, each on its own wash of a brand colour (mint, sky, navy, mint again), fading
 * down to the card's surface. 24 % at most, so the muted lines keep 4.5:1 in both themes.
 */
const TILE_WASH: Record<StatCode, string> = {
  cap: "bg-[image:linear-gradient(to_bottom,color-mix(in_oklab,var(--ui-accent-spring)_24%,var(--ui-surface)),color-mix(in_oklab,var(--ui-accent-spring)_8%,var(--ui-surface)))]",
  sel: "bg-[image:linear-gradient(to_bottom,color-mix(in_oklab,var(--ui-accent-sky)_24%,var(--ui-surface)),color-mix(in_oklab,var(--ui-accent-sky)_8%,var(--ui-surface)))]",
  trf: "bg-[image:linear-gradient(to_bottom,color-mix(in_oklab,var(--ui-ink-fg)_14%,var(--ui-surface)),color-mix(in_oklab,var(--ui-ink-fg)_4%,var(--ui-surface)))]",
  con: "bg-[image:linear-gradient(to_bottom,color-mix(in_oklab,var(--ui-accent-sky)_24%,var(--ui-surface)),color-mix(in_oklab,var(--ui-accent-spring)_10%,var(--ui-surface)))]",
};

/**
 * « Ce que dit votre carte »: the four statistics in a 2 × 2 grid inside one card, and the whole
 * card goes to « Votre carte » (G2), where each one is explained. A statistic that is not there
 * yet shows its reason, not a zero.
 */
export function StatTiles({
  card,
  facts = null,
}: {
  card: MyCardDto;
  /** While the card has no number: what the screen already knows (points, rank, journées). */
  facts?: PendingFacts | null;
}) {
  const moments = useMomentCopy();
  const wait = waitContext(card);
  return (
    <Link
      to="/curva/carte"
      className={cn("press-tile block overflow-hidden", ui.surface.card, ui.focus)}
      data-testid="curva-stat-tiles"
    >
      <ul className="grid grid-cols-2">
        {STAT_CODES.map((code, index) => (
          <StatTile
            key={code}
            code={code}
            stat={card.stats[code]}
            minRated={card.minRated}
            wait={wait}
            variant="quiet"
            className={cn(
              TILE_WASH[code],
              index % 2 === 0 && "border-e border-[color:var(--ui-rule)]",
              index < 2 && "border-b border-[color:var(--ui-rule)]",
            )}
          />
        ))}
      </ul>
      {facts && hasFacts(facts) ? <Facts facts={facts} /> : null}
      <span
        className={cn(
          "flex min-h-[var(--ui-row-min)] items-center justify-between gap-2 px-4",
          ui.text.meta,
          "[font-weight:var(--ui-weight-heavy)]",
          // the way to the card's page on the action gradient: ink-deep, light in both themes
          "text-[color:var(--ui-ink-deep)]",
        )}
        style={{ backgroundImage: "var(--ui-grad-action)" }}
      >
        {moments.m4.heroDetail}
        <ChevronRight className="h-5 w-5 shrink-0" aria-hidden />
      </span>
    </Link>
  );
}

/**
 * Points, rank and journées counted, from data the screen already holds, each only when known.
 * Figures are isolated (`bdi dir="ltr"`) so Arabic keeps them in order.
 */
function Facts({ facts }: { facts: PendingFacts }) {
  const copy = useCardCopy();
  const { lang } = useI18n();
  const nf = new Intl.NumberFormat(lang === "ar" ? "ar-MA-u-nu-latn" : "fr-FR");
  const items: { key: string; label: string; value: string; spoken: string }[] = [];
  if (facts.points !== null) {
    const shown = nf.format(facts.points);
    items.push({ key: "points", label: copy.pending.points, value: shown, spoken: shown });
  }
  if (facts.rank !== null) {
    items.push({
      key: "rank",
      label: copy.pending.rank,
      value: facts.of !== null ? `${facts.rank}/${facts.of}` : String(facts.rank),
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
      value: String(facts.counted),
      spoken: String(facts.counted),
    });
  }
  return (
    <dl
      className="grid auto-cols-fr grid-flow-col divide-x divide-[color:var(--ui-rule)] border-t border-[color:var(--ui-rule)] rtl:divide-x-reverse"
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
            <span aria-hidden>
              <Figure>{item.value}</Figure>
            </span>
            <span className="sr-only">{item.spoken}</span>
          </dd>
        </div>
      ))}
    </dl>
  );
}
