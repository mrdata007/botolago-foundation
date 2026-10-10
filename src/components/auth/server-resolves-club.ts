import type { MyCardDto } from "@/backend/manager-card/contracts";

/**
 * Owner decision 5 (2026-10-08): no copy promises a club colour until the server has resolved the
 * club. Profile setup saves the favourite club as a provisional reference, and only the card read
 * turns that into the club the card shows. So the one evidence this screen can hold is the
 * account's own card read: it carries a club. For an account with no card yet there is no such
 * evidence, and the token keeps its own material, with no hint.
 *
 * Imported only by the card row, which the route loads on demand; the contract import is a type,
 * erased at build.
 */
export function serverResolvesClub(card: Pick<MyCardDto, "club"> | null | undefined): boolean {
  return card?.club != null;
}
