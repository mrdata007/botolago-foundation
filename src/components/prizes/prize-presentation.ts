import type {
  PrizeAdminErrorCode,
  PrizeSkipReason,
  PrizeTieBreak,
  PrizeTier,
  PrizeWinnerStatus,
} from "@/backend/prizes/contracts";
import type { TranslationKey } from "@/i18n/dictionaries";
import type { Language } from "@/types/domain";

type Translate = (key: TranslationKey) => string;

/**
 * Labels for the prize surfaces.
 *
 * Every key is spelled out at its call site rather than looked up from a map:
 * the i18n gate reads translation keys as string literals at the call, and a
 * call whose argument is a variable both counts as drift (W4) and hides the
 * keys it reads (W3).
 */

/** Replaces each `{name}` in a dictionary template. */
export function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{([a-z]+)\}/g, (match, name: string) =>
    name in values ? String(values[name]) : match,
  );
}

export function tierLabel(t: Translate, tier: PrizeTier): string {
  switch (tier) {
    case "gameweek":
      return t("prizes.tier.gameweek");
    case "monthly":
      return t("prizes.tier.monthly");
    case "season":
      return t("prizes.tier.season");
    case "mini_league":
      return t("prizes.tier.mini_league");
  }
}

export function howToWin(t: Translate, tier: PrizeTier): string {
  switch (tier) {
    case "gameweek":
      return t("prizes.how.gameweek");
    case "monthly":
      return t("prizes.how.monthly");
    case "season":
      return t("prizes.how.season");
    case "mini_league":
      return t("prizes.how.mini_league");
  }
}

export function statusLabel(t: Translate, status: PrizeWinnerStatus): string {
  switch (status) {
    case "pending":
      return t("prizes.status.pending");
    case "verified":
      return t("prizes.status.verified");
    case "paid":
      return t("prizes.status.paid");
    case "forfeited":
      return t("prizes.status.forfeited");
    case "overridden":
      return t("prizes.status.overridden");
  }
}

export function tieBreakLabel(t: Translate, tieBreak: PrizeTieBreak): string {
  switch (tieBreak) {
    case "outright":
      return t("prizes.tie.outright");
    case "fewer_transfers":
      return t("prizes.tie.fewer_transfers");
    case "earlier_registration":
      return t("prizes.tie.earlier_registration");
    case "final_fallback":
      return t("prizes.tie.final_fallback");
    case "admin_override":
      return t("prizes.tie.admin_override");
  }
}

export function skipReasonLabel(t: Translate, reason: PrizeSkipReason): string {
  switch (reason) {
    case "flagged":
      return t("prizes.skip.flagged");
    case "staff":
      return t("prizes.skip.staff");
    case "gameweek_cap_reached":
      return t("prizes.skip.gameweek_cap_reached");
    case "mini_league_cap_reached":
      return t("prizes.skip.mini_league_cap_reached");
  }
}

/**
 * "Journée 7", "Journées 5–8", "Saison 2026/27". A mini-league period is its
 * league, which only the admin surface names.
 */
export function periodLabel(
  t: Translate,
  period: {
    tier: PrizeTier;
    firstGameweekNumber: number;
    lastGameweekNumber: number;
    seasonName: string;
    leagueName?: string | null;
  },
): string {
  switch (period.tier) {
    case "gameweek":
      return fill(t("prizes.period.gameweek"), { n: period.lastGameweekNumber });
    case "monthly":
      return fill(t("prizes.period.monthly"), {
        first: period.firstGameweekNumber,
        last: period.lastGameweekNumber,
      });
    case "season":
      return fill(t("prizes.period.season"), { season: period.seasonName });
    case "mini_league":
      return period.leagueName ?? fill(t("prizes.period.season"), { season: period.seasonName });
  }
}

/** A whole-dirham amount in the reader's digits: "2 500 MAD", "2٬500 درهم". */
export function formatMad(t: Translate, value: number, lang: Language): string {
  const formatted = new Intl.NumberFormat(lang === "ar" ? "ar-MA" : "fr-FR", {
    maximumFractionDigits: 0,
  }).format(value);
  return fill(t("prizes.value"), { value: formatted });
}

/** A readable sentence for a refusal the prize functions raise by name. */
export function prizeAdminErrorMessage(t: Translate, code: PrizeAdminErrorCode | string): string {
  switch (code) {
    case "prize_settings_conflict":
      return t("prizes.admin.error.settings_conflict");
    case "prize_tier_already_active":
      return t("prizes.admin.error.tier_active");
    case "prize_url_invalid":
      return t("prizes.admin.error.url");
    case "prize_value_invalid":
      return t("prizes.admin.error.value");
    case "prize_reason_invalid":
      return t("prizes.admin.error.reason");
    case "prize_winner_transition_invalid":
      return t("prizes.admin.error.transition");
    case "prize_override_team_ineligible":
      return t("prizes.admin.error.ineligible");
    case "prize_override_team_not_found":
      return t("prizes.admin.error.team_not_found");
    case "prize_account_not_found":
      return t("prizes.admin.error.account_not_found");
    case "prize_winner_not_overridable":
      return t("prizes.admin.error.not_overridable");
    case "prize_name_invalid":
      return t("prizes.admin.error.name");
    default:
      return fill(t("prizes.admin.error.generic"), { code });
  }
}
