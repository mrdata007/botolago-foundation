import { findClub } from "@/components/fantasy/club-identity";
import type { Club } from "@/types/domain";

import { GuestHero } from "./GuestHero";

/**
 * The proposition to a signed-in account that has no team yet: the guest's, with the account's own
 * display name knitted on the scarf and its favourite club's colours (a club it tries on takes
 * over), and « Créer mon équipe » as the way in. Plan 4.1.
 */
export function NoTeamHero(props: {
  clubs: readonly Club[];
  closed: boolean;
  canCreate: boolean;
  loadingAction: boolean;
  displayName: string;
  favouriteClubId?: string;
  minRated: number | null;
}) {
  const { displayName, favouriteClubId, ...rest } = props;
  return (
    <GuestHero
      {...rest}
      audience="no_team"
      profileName={displayName}
      favouriteClub={findClub(props.clubs, favouriteClubId) ?? null}
    />
  );
}
