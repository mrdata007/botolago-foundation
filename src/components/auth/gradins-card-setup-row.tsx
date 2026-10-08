import { useDeferredValue, useMemo } from "react";

import { CardToken } from "@/components/manager-card/CardToken";
import { useMomentCopy } from "@/components/manager-card/copy";
import { auto } from "@/components/manager-card/interpolate";
import { cardClubFromClub, localProfile } from "@/components/manager-card/to-profile";
import type { CardClub } from "@/components/manager-card/types";
import { ui } from "@/components/ui-kit";
import { cn } from "@/lib/utils";
import { useMyManagerCard } from "@/services/use-manager-card";
import type { Club } from "@/types/domain";

import { serverResolvesClub } from "./server-resolves-club";

/**
 * Profile setup, steps 1 and 2: the manager card being formed (plan M1c). Rendered only while
 * Gradins is live and the guest came from the Fantasy builder (`isFantasyCreateNext`). The route
 * loads this file with `lazy`, inside its live branch: with the switch off the page neither
 * mounts nor downloads any of it. The file name starts with `gradins-` so its chunk is named like
 * the section's own, which `scripts/qa/manager-card-off-bundle-gate.ts` lets reach the card code.
 *
 * A slim row, not a card: the 64 px token at the start and the name as it is typed beside it (no
 * eyebrow label over it, and nothing fades or slides: a recolour changes the token in place). It is
 * slim on purpose. Step 2 already ends a few pixels above a phone's fold, and a
 * taller block pushed « Suivant » below it in the lab build.
 */

/** The row itself, drawn from what it is given. `club` is set only once the server resolves it. */
export function CardSetupRow({
  name,
  club,
  clubHint,
}: {
  /** The display name as typed. */
  name: string;
  club: CardClub | null;
  /** Show `m1.setup.club_hint` beside the token. Only ever true with a resolved club. */
  clubHint: boolean;
}) {
  const copy = useMomentCopy();
  const shown = name.trim();
  // The token follows the field without a redraw on every key.
  const tokenName = useDeferredValue(shown);
  const profile = useMemo(() => localProfile({ displayName: tokenName, club }), [tokenName, club]);
  return (
    <div className="mb-4 flex items-center gap-3" data-testid="auth-card-row">
      <CardToken profile={profile} size={64} />
      <div className="min-w-0 flex-1">
        {/* The token beside the name says what this is; no label over it. The token's own
            accessible name already says who the card is for, so the echo stays out of the tree.
            With no name typed yet, the row says « Votre carte » in its place. */}
        {shown ? (
          <p aria-hidden="true" className={cn("break-words", ui.display.header, ui.tone.default)}>
            {auto(shown)}
          </p>
        ) : (
          <p className={cn(ui.text.bodyStrong, ui.tone.muted)}>{copy.m1.setupCardLabel}</p>
        )}
        {clubHint ? (
          <p className={cn(ui.text.meta, ui.tone.muted)}>{copy.m1.setupClubHint}</p>
        ) : null}
      </div>
    </div>
  );
}

/**
 * The row with its data: the account's card read decides whether the club colour may show
 * (`serverResolvesClub`), and the club is the one tapped on step 2 (or already chosen).
 */
export function CardSetupSlot({
  step,
  name,
  clubId,
  clubs,
}: {
  step: number;
  name: string;
  clubId: string | undefined;
  clubs: readonly Club[] | undefined;
}) {
  const resolved = serverResolvesClub(useMyManagerCard().data);
  const chosen = resolved && clubId ? clubs?.find((club) => club.id === clubId) : undefined;
  const club = useMemo(() => cardClubFromClub(chosen), [chosen]);
  return <CardSetupRow name={name} club={club} clubHint={resolved && step === 2} />;
}
