import { CheckCircle2 } from "lucide-react";
import { useEffect } from "react";

import { ui } from "@/components/ui-kit";
import { track } from "@/lib/analytics";
import { cn } from "@/lib/utils";
import { useManagerCardStatus } from "@/services/manager-card-status";

import { CardToken } from "../CardToken";
import { useCardCopy, useMomentCopy } from "../copy";
import { fill } from "../interpolate";
import { guestProfile, localProfile } from "../to-profile";
import type { CardClub, CardProfile } from "../types";

/**
 * What the object on the save step draws (plan M1b):
 *   - a visitor: the base scarf with no name, no club, no serial and no number. The name the
 *     card will carry is chosen at sign-up, so the team name here would be wrong after saving;
 *   - a signed-in account without a team: the card name (the display name when it is not
 *     blank, else the team name, as the board reads it) and the club the profile names, if one
 *     resolves. A club that does not resolve leaves the object in its own material.
 */
export function saveLineProfile(input: {
  signedIn: boolean;
  displayName: string | null | undefined;
  teamName: string;
  club: CardClub | null;
}): CardProfile {
  if (!input.signedIn) return guestProfile();
  return localProfile({
    displayName: input.displayName?.trim() || input.teamName.trim(),
    club: input.club,
  });
}

/**
 * The save step's one line (plan M1b): a 64 px row between the captain rows and the guest note,
 * a 44 px token at the start and the sentence at the end, above « Entrer l’effectif »
 * (the button stays last and full width). It raises the value of saving at the moment an
 * account is asked for, and promises nothing but what is true: the card starts with the team and
 * its number comes after the rounds the status names.
 *
 * The token is a drawn object, so it sits in an auto-width column: the box the renderer reports,
 * never a fixed width, with the text taking what is left. `card_save_line_view` is the
 * conversion guardrail (once, when the line first shows).
 */
export function CardSaveLine({ profile }: { profile: CardProfile }) {
  const { minRated } = useManagerCardStatus();
  const moment = useMomentCopy();
  const card = useCardCopy();
  useEffect(() => {
    if (minRated !== null) track("card_save_line_view");
  }, [minRated]);
  if (minRated === null) return null;
  return (
    <div
      className={cn(
        "mt-3 flex min-h-16 items-center gap-3 py-2 pe-3 ps-2",
        ui.radius.card,
        ui.surface.sunken,
      )}
      data-testid="card-save-line"
    >
      <span aria-hidden className="flex shrink-0 items-center justify-center">
        <CardToken profile={profile} size={44} />
      </span>
      <p className={cn("min-w-0 text-pretty", ui.text.secondary, ui.tone.muted)}>
        {fill(moment.m1.saveLine, { final: card.finalRounds(minRated) })}
      </p>
    </div>
  );
}

/**
 * « Compte créé. Il reste à enregistrer votre équipe. » (plan M1c, back in the builder): said
 * once above the save button when a visitor's draft was adopted by the account that has just
 * been made. `id` is what the button's `aria-describedby` points at.
 */
export function BuilderReturnLine({ id }: { id: string }) {
  const moment = useMomentCopy();
  return (
    <p
      id={id}
      role="status"
      className={cn(
        "mt-3 flex items-start gap-2",
        ui.text.secondary,
        "[font-weight:var(--ui-weight-strong)]",
        ui.tone.default,
      )}
      data-testid="card-builder-return-line"
    >
      <CheckCircle2
        className="mt-0.5 h-[18px] w-[18px] shrink-0 text-[color:var(--ui-positive)]"
        aria-hidden
      />
      <span>{moment.m1.builderLine}</span>
    </p>
  );
}
