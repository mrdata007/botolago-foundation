import type { TranslationKey } from "@/i18n/dictionaries";
import type { AuthErrorCode } from "@/services/auth-types";

/**
 * The form-error text for a failed Google / Apple sign-in. The login and the
 * sign-up page both showed the generic "une erreur est survenue" for every
 * failure, so a provider that is switched off in Supabase, a lost connection
 * and a rate limit all read the same, and the first of them never got to say
 * what to do instead (use the e-mail form).
 */
export function socialSignInErrorKey(code: AuthErrorCode | undefined): TranslationKey {
  switch (code) {
    case "provider_unavailable":
      return "auth.error.provider_unavailable";
    case "network":
      return "auth.error.network";
    case "rate_limited":
      return "auth.error.rate_limited";
    default:
      return "auth.error.generic";
  }
}
