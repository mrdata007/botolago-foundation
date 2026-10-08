import { Link } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import { useMemo, type ReactNode } from "react";

import type { MyCardDto } from "@/backend/manager-card/contracts";
import { formatDeadline } from "@/components/fpl/deadline";
import { ui, UiBadge, UiSkeleton } from "@/components/ui-kit";
import { useI18n } from "@/i18n/provider";
import { track } from "@/lib/analytics";
import { cn } from "@/lib/utils";
import { useMyManagerCard } from "@/services/use-manager-card";
import type { Gameweek } from "@/types/domain";

import { CardToken } from "../CardToken";
import {
  useCardCopy,
  useGradinsCopy,
  useMomentCopy,
  type CardCopy,
  type GradinsCopy,
  type MomentCopy,
} from "../copy";
import { fill } from "../interpolate";
import { fromMyCard } from "../to-profile";
import { hubCardModel, type HubCardHead, type HubCardLine } from "./inline-model";

/** The a-dot and the colon bind to the word before them, so a line never starts with one. */
const bindSeparators = (template: string) => template.replace(/ ([·:]) /g, " $1 ");

/**
 * The card block of the Fantasy hub (plan M3a, M3b), directly under « Composer l’équipe ».
 *
 * While the card forms: the 64 px token with its dash, the counter « 1/3 » as the biggest thing in
 * the block, « Carte en formation », and one line with the next round and its deadline (or the
 * sub-state the server's data proves: the eve, a round over but not final, a minimum reached with
 * no number, a late signer). Once there is a number: « 84 OVR », its tier, « Provisoire » while
 * it is, and the next round. Every figure is what the card read says; a count that is not known
 * is not shown, and nothing is 0 that is not.
 *
 * The whole block is one link to `/gradins`. It has no button of its own, because the useful
 * action on this screen is playing the round. « Nouveau » marks a moment that is waiting there:
 * the hub never opens it, the number is on screen whether or not it is ever seen.
 *
 * The token sits in an auto-width column (the box the renderer reports) so a tall one is never
 * squeezed, and the text takes what is left. The card read is made once per screen by the shared
 * query; while it loads the block's height is held so the page below does not jump.
 */
export function HubCardBlock({ gameweek }: { gameweek: Gameweek | null }) {
  const query = useMyManagerCard();
  if (query.isLoading) return <HubCardBlockSkeleton />;
  const card = query.data;
  if (!card) return null;
  return <HubCardBlockView card={card} gameweek={gameweek} />;
}

function HubCardBlockSkeleton() {
  return (
    <div aria-hidden className="mt-2" data-testid="hub-card-block-pending">
      <UiSkeleton className={cn("min-h-28", ui.radius.card)} />
    </div>
  );
}

/** The block for a card already read: pure of any request, so it can be drawn for any card. */
export function HubCardBlockView({
  card,
  gameweek,
}: {
  card: MyCardDto;
  gameweek: Gameweek | null;
}) {
  const { lang } = useI18n();
  const moment = useMomentCopy();
  const gradins = useGradinsCopy();
  const cardCopy = useCardCopy();
  const profile = useMemo(() => fromMyCard(card), [card]);
  const model = hubCardModel(
    card,
    gameweek ? { number: gameweek.number, deadline: gameweek.deadline, status: gameweek.status } : null,
  );
  const line = renderLine(model.line, {
    lang,
    moment,
    gradins,
    cardCopy,
    minRated: card.minRated,
    rated: model.head.kind === "number",
    tier: card.tier,
    deadline: (iso) => <bdi>{formatDeadline(iso, lang, { weekday: "short" })}</bdi>,
  });
  return (
    <Link
      to="/gradins"
      onClick={() => track("card_block_open")}
      data-testid="hub-card-block"
      className={cn(
        "mt-2 flex min-h-28 items-center gap-3.5 py-3 pe-2 ps-3",
        ui.surface.card,
        "transition-colors hover:bg-[color:var(--ui-surface-sunken)] active:bg-[color:var(--ui-surface-sunken)]",
        ui.focus,
      )}
    >
      <span aria-hidden className="flex shrink-0 items-center justify-center">
        <CardToken profile={profile} size={64} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="sr-only">{gradins.hubCardView}. </span>
        <span className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
          <Head head={model.head} cardCopy={cardCopy} formingLabel={moment.m3.label} />
          {model.fresh ? <UiBadge tone="action">{gradins.badgeNew}</UiBadge> : null}
        </span>
        {line ? (
          <span className={cn("text-pretty", ui.text.meta, ui.tone.muted)}>{line}</span>
        ) : null}
      </span>
      <ChevronRight className={cn("h-5 w-5 shrink-0", ui.tone.muted)} aria-hidden />
    </Link>
  );
}

function Head({
  head,
  cardCopy,
  formingLabel,
}: {
  head: HubCardHead;
  cardCopy: CardCopy;
  formingLabel: string;
}) {
  if (head.kind === "counter") {
    return (
      <>
        <bdi dir="ltr" className={cn(ui.stat.hero, ui.tone.default)}>
          {head.k}/{head.n}
        </bdi>
        <span className={cn(ui.text.bodyStrong, ui.tone.default)}>{formingLabel}</span>
      </>
    );
  }
  return (
    <>
      <span className="inline-flex items-baseline gap-1.5">
        <bdi dir="ltr" className={cn(ui.stat.hero, ui.tone.default)}>
          {head.ovr}
        </bdi>
        <span className={cn(ui.text.bodyStrong, ui.tone.default)}>{cardCopy.ovr}</span>
      </span>
      {head.tier ? (
        <span className={cn(ui.text.bodyStrong, ui.tone.default)}>{cardCopy.tier[head.tier]}</span>
      ) : null}
      {head.provisional ? <UiBadge tone="outline">{cardCopy.provisional}</UiBadge> : null}
    </>
  );
}

function renderLine(
  line: HubCardLine,
  ctx: {
    lang: string;
    moment: MomentCopy;
    gradins: GradinsCopy;
    cardCopy: CardCopy;
    minRated: number;
    rated: boolean;
    tier: MyCardDto["tier"];
    deadline: (iso: string) => ReactNode;
  },
): ReactNode {
  switch (line.kind) {
    case "none":
      return null;
    case "next":
      return ctx.rated
        ? fill(bindSeparators(ctx.gradins.roundLine), {
            gw: line.gameweek,
            deadline: ctx.deadline(line.deadline),
          })
        : fill(bindSeparators(ctx.moment.m3.line), {
            final: ctx.cardCopy.finalRounds(ctx.minRated),
            gw: line.gameweek,
            deadline: ctx.deadline(line.deadline),
          });
    case "first_counted":
      return fill(ctx.moment.m3.firstCounted, { gw: line.gameweek });
    case "eve":
      return fill(ctx.moment.m3.eve, { gw: line.gameweek });
    case "over":
      return fill(ctx.moment.m3.over, { gw: line.gameweek });
    case "insufficient":
      return ctx.moment.m3.insufficient;
    case "late":
      return fill(ctx.moment.m3.late, { season: line.season });
    case "closed":
      return fill(ctx.moment.m10.closed, {
        season: line.season,
        ovr: line.ovr,
        tier: ctx.cardCopy.tier[line.tier],
      });
  }
}
