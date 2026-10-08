import { useMemo } from "react";

import { ui } from "@/components/ui-kit";
import { cn } from "@/lib/utils";
import { useManagerCardStatus } from "@/services/manager-card-status";

import { CardToken } from "../CardToken";
import { useCardCopy, useMomentCopy } from "../copy";
import { fill } from "../interpolate";
import { guestProfile } from "../to-profile";

/**
 * The fifth « Comment jouer » point of the guest intro (plan M1a): the card is named as the
 * result of playing, never shown off. After the deadline point, because it is a result and not
 * a step; the same row anatomy as the four above it.
 *
 * The disc holds the object's own mini in its base material with a dash in the number carrier
 * (a drawn card, not an icon, and in particular not an ID-card glyph). No name, no club, no
 * serial, no number, and no request: the guest has nothing to be read. The disc is quiet (a
 * sunken fill and a hairline, not the gradient the four steps carry) so the object's material
 * reads. The text names the rounds the status sent (`minRated`), never a constant.
 *
 * The caller shows it only while the section is live and the intro is the open one (a team can
 * still be created); it renders nothing when the status carries no `minRated`, because the number
 * of rounds is the server's and never a constant here.
 */
export function GuestIntroCardPoint() {
  const { minRated } = useManagerCardStatus();
  const moment = useMomentCopy();
  const card = useCardCopy();
  const profile = useMemo(() => guestProfile(), []);
  if (minRated === null) return null;
  return (
    <li className="flex items-start gap-3" data-testid="fantasy-intro-card-point">
      <span
        aria-hidden
        className={cn(
          "grid h-9 w-9 shrink-0 place-items-center",
          ui.radius.full,
          ui.surface.sunken,
          "shadow-[inset_0_0_0_1px_var(--ui-rule)]",
        )}
      >
        <CardToken profile={profile} size={24} />
      </span>
      <span className="flex min-w-0 flex-col">
        <span className={cn(ui.text.bodyStrong, ui.tone.default)}>{moment.m1.introTitle}</span>
        <span className={cn(ui.text.secondary, ui.tone.muted)}>
          {fill(moment.m1.introBody, { final: card.finalRounds(minRated) })}
        </span>
      </span>
    </li>
  );
}
