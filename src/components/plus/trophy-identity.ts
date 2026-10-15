/** Who the cabinet belongs to, as the card page already knows them (never a card serial). */
export interface TrophyIdentity {
  name: string;
  /** The club's short name or initials, when the manager has one. */
  club: string | null;
  ovr: number | null;
  tier: string | null;
}
