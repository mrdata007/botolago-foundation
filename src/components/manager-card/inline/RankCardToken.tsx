import { Link } from "@tanstack/react-router";
import { useMemo } from "react";

import type { MyCardDto } from "@/backend/manager-card/contracts";
import { ui } from "@/components/ui-kit";
import { track } from "@/lib/analytics";
import { cn } from "@/lib/utils";
import { useMyManagerCard } from "@/services/use-manager-card";

import { CardToken } from "../CardToken";
import { cardLabel, useCardCopy, useCardStrings, useCurvaCopy } from "../copy";
import { fromMyCard } from "../to-profile";
import { rankTokenFigure } from "./inline-model";

/**
 * The card at the end of « Mon classement » (plan M3c): the 44 px token and, under it, « 1/3 »
 * while the card forms or « 84 OVR » once it has a number (stacked, so the line beside it keeps
 * the room its three figures need). One link to `/curva`, a target of at least 48 px like the
 * « Aller à ma position » control beside it.
 *
 * Display only: this line never changes the rank above it, and no ranking reads the number. The
 * link is named by the card's own accessible sentence (« Carte de manager, …, pas encore de note,
 * 1 journée comptée sur 3 »), then where it leads, so the figure is never the whole of its name.
 */
export function RankCardToken() {
  const query = useMyManagerCard();
  const card = query.data;
  if (!card) return null;
  return <RankCardTokenView card={card} />;
}

export function RankCardTokenView({ card }: { card: MyCardDto }) {
  const copy = useCardCopy();
  const strings = useCardStrings();
  const curva = useCurvaCopy();
  const profile = useMemo(() => fromMyCard(card), [card]);
  const figure = rankTokenFigure(card);
  const name = `${cardLabel(profile, strings)}${strings.a11y.separator}${curva.hubCardView}`;
  return (
    <Link
      to="/curva"
      aria-label={name}
      onClick={() => track("card_block_open")}
      data-testid="rank-card-token"
      className={cn(
        "flex min-h-12 flex-col items-center gap-0.5 px-1 py-0.5",
        ui.radius.card,
        "transition-colors hover:bg-[color:var(--ui-surface-sunken)] active:bg-[color:var(--ui-surface-sunken)]",
        ui.focus,
      )}
    >
      <span aria-hidden className="flex shrink-0 items-center justify-center">
        <CardToken profile={profile} size={44} />
      </span>
      <span aria-hidden className={cn("whitespace-nowrap", ui.text.meta, ui.tone.default)}>
        {figure.kind === "counter" ? (
          <bdi dir="ltr" className={ui.stat.sm}>
            {figure.k}/{figure.n}
          </bdi>
        ) : (
          <>
            <bdi dir="ltr" className={ui.stat.sm}>
              {figure.ovr}
            </bdi>{" "}
            <span className={ui.tone.muted}>{copy.ovr}</span>
          </>
        )}
      </span>
    </Link>
  );
}
