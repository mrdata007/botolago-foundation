/**
 * Account deletion, as the app states it.
 *
 * The hold is the database's (`app_private.account_deletion_hold()`,
 * migration 20261006143700): an account is closed the moment it asks and
 * erased this many days later. The Profile dialog and `/suppression-compte`
 * both say "7 jours" / "7 أيام" in their copy; change the three together, in a
 * reviewed migration.
 */
export const ACCOUNT_DELETION_HOLD_DAYS = 7;

/** The public page that explains deletion (also Google Play's deletion URL). */
export const ACCOUNT_DELETION_PATH = "/suppression-compte";

/** Where a device lands once its account has asked to be deleted. */
export const ACCOUNT_DELETION_DONE_PATH = `${ACCOUNT_DELETION_PATH}?confirmation=1`;
