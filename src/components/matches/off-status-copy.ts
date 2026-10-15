import type { TranslationKey } from "@/i18n/dictionaries";
import type { MatchOffStatus } from "@/types/domain";

type Translate = (key: TranslationKey) => string;

// Literal-key switches rather than a lookup table, so the i18n gate sees every
// key. A match that is not being played as scheduled is one of four things,
// and each has its own words: postponed and suspended are still to come,
// cancelled and abandoned are not, and only "postponed" has a date to wait
// for. `null` is read as postponed, the claim the domain status itself makes.

/** The short status word: the pill on a card and in the match header. */
export function offStatusLabel(off: MatchOffStatus | null, t: Translate): string {
  switch (off) {
    case "cancelled":
      return t("matches.status.cancelled");
    case "suspended":
      return t("matches.status.suspended");
    case "abandoned":
      return t("matches.status.abandoned");
    case "postponed":
    case null:
      return t("matches.status.postponed");
  }
}

/** The sentence under the header: what happened, and only what the data supports. */
export function offStatusNotice(off: MatchOffStatus | null, t: Translate): string {
  switch (off) {
    case "cancelled":
      return t("matches.detail.cancelled_notice");
    case "suspended":
      return t("matches.detail.suspended_notice");
    case "abandoned":
      return t("matches.detail.abandoned_notice");
    case "postponed":
    case null:
      return t("matches.detail.postponed_notice");
  }
}

/** The state as a screen reader says it, in a card's label. */
export function offStatusA11y(off: MatchOffStatus | null, t: Translate): string {
  switch (off) {
    case "cancelled":
      return t("matches.a11y.status_cancelled");
    case "suspended":
      return t("matches.a11y.status_suspended");
    case "abandoned":
      return t("matches.a11y.status_abandoned");
    case "postponed":
    case null:
      return t("matches.a11y.status_postponed");
  }
}
