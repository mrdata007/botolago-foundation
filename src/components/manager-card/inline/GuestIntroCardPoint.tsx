import { ui } from "@/components/ui-kit";
import { cn } from "@/lib/utils";
import { useManagerCardStatus } from "@/services/manager-card-status";

import { useCardCopy, useMomentCopy } from "../copy";
import { fill } from "../interpolate";

/**
 * The fifth « Comment jouer » point of the guest intro (plan M1a): the card is named as the
 * result of playing, never shown off. After the deadline point, because it is a result and not
 * a step.
 *
 * A plain point, like the four above it (no disc, no mini): a bold line and its explanation. No
 * name, no club, no serial, no number, and no request: the guest has nothing to be read.
 * The text names the rounds the status sent (`minRated`), never a constant.
 *
 * The caller shows it only while the section is live and the intro is the open one (a team can
 * still be created); it renders nothing when the status carries no `minRated`, because the number
 * of rounds is the server's and never a constant here.
 */
export function GuestIntroCardPoint() {
  const { minRated } = useManagerCardStatus();
  const moment = useMomentCopy();
  const card = useCardCopy();
  if (minRated === null) return null;
  return (
    // A plain point like the four steps above it: a bold line and its explanation.
    <li className="flex min-w-0 flex-col" data-testid="fantasy-intro-card-point">
      <span className={cn(ui.text.bodyStrong, ui.tone.default)}>{moment.m1.introTitle}</span>
      <span className={cn(ui.text.secondary, ui.tone.muted)}>
        {fill(moment.m1.introBody, { final: card.finalRounds(minRated) })}
      </span>
    </li>
  );
}
