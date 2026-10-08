import { Link } from "@tanstack/react-router";
import { useMemo } from "react";

import type { MyCardDto } from "@/backend/manager-card/contracts";
import { ui } from "@/components/ui-kit";
import { track } from "@/lib/analytics";
import { cn } from "@/lib/utils";
import { useMyManagerCard } from "@/services/use-manager-card";

import { CardToken } from "../CardToken";
import { cardLabel, useCardCopy, useCardStrings, useGradinsCopy } from "../copy";
import { fromMyCard } from "../to-profile";
import { rankTokenFigure } from "./inline-model";

/**
 * The card at the end of « Mon classement » (plan M3c): the 44 px token and, beside it, « 1/3 »
 * while the card forms or « 84 OVR » once it has a number. One link to `/gradins`, a round
 * 48 px target like the « Aller à ma position » control beside it.
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
  const gradins = useGradinsCopy();
  const profile = useMemo(() => fromMyCard(card), [card]);
  const figure = rankTokenFigure(card);
  const name = `${cardLabel(profile, strings)}${strings.a11y.separator}${gradins.hubCardView}`;
  return (
    <Link
      to="/gradins"
      aria-label={name}
      onClick={() => track("card_block_open")}
      data-testid="rank-card-token"
      className={cn(
        "flex min-h-12 items-center gap-1.5 py-0.5 pe-2.5 ps-1",
        ui.radius.full,
        "transition-colors hover:bg-[color:var(--ui-surface-sunken)] active:bg-[color:var(--ui-surface-sunken)]",
        ui.focus,
      )}
    >
      <span aria-hidden className="flex shrink-0 items-center justify-center">
        <CardToken profile={profile} size={44} />
      </span>
      <span aria-hidden className={cn("whitespace-nowrap", ui.text.bodyStrong, ui.tone.default)}>
        {figure.kind === "counter" ? (
          <bdi dir="ltr" className={ui.stat.md}>
            {figure.k}/{figure.n}
          </bdi>
        ) : (
          <>
            <bdi dir="ltr" className={ui.stat.md}>
              {figure.ovr}
            </bdi>{" "}
            <span className={ui.tone.muted}>{copy.ovr}</span>
          </>
        )}
      </span>
    </Link>
  );
}
