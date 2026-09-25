import type { PredictionsErrorCode } from "@/backend/predictions/errors";
import type { TranslationKey } from "@/i18n/dictionaries";
import type { Language } from "@/types/domain";
import { formatNumber } from "../predictions-copy";

type Translate = (key: TranslationKey) => string;

function plural(n: number, lang: Language): Intl.LDMLPluralRule {
  return new Intl.PluralRules(lang === "ar" ? "ar" : "fr").select(n);
}

/** "12 membres". */
export function membersLabel(n: number, lang: Language, t: Translate): string {
  const rule = plural(n, lang);
  const template =
    rule === "one"
      ? t("predictions.leagues.members_one")
      : rule === "two"
        ? t("predictions.leagues.members_two")
        : rule === "few"
          ? t("predictions.leagues.members_few")
          : t("predictions.leagues.members_other");
  return template.replace("{n}", formatNumber(n, lang));
}

/** "2 membres n'ont pas encore joué". */
export function notPlayedLabel(n: number, lang: Language, t: Translate): string {
  const rule = plural(n, lang);
  const template =
    rule === "one"
      ? t("predictions.league.not_played_one")
      : rule === "two"
        ? t("predictions.league.not_played_two")
        : rule === "few"
          ? t("predictions.league.not_played_few")
          : t("predictions.league.not_played_other");
  return template.replace("{n}", formatNumber(n, lang));
}

/** One sentence per league refusal; anything else is "indisponible". */
export function leagueErrorMessage(code: PredictionsErrorCode, t: Translate): string {
  switch (code) {
    case "invite_code_invalid":
      return t("predictions.leagues.code_invalid");
    case "league_limit_reached":
      return t("predictions.leagues.limit");
    case "league_full":
      return t("predictions.leagues.full");
    case "league_create_limit_reached":
      return t("predictions.leagues.create_limit");
    case "validation_failed":
      return t("predictions.leagues.name_invalid");
    case "league_access_denied":
    case "league_membership_not_found":
      return t("predictions.error.league_access");
    case "network":
      return t("predictions.save.offline");
    // Not a league refusal: the code is owed first, and the app is taking the
    // reader to it. The same sentence as the auth layer's toast.
    case "mfa_required":
      return t("auth.step_up.toast");
    default:
      return t("predictions.state.unavailable");
  }
}
