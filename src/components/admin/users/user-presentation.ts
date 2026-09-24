import type { AdminErrorCode } from "@/backend/admin/errors";
import type {
  AdminUserDto,
  BanDurationKey,
  UserAdminErrorCode,
} from "@/backend/admin/users-contracts";

/**
 * Wording and formatting for the user directory, in French and Arabic.
 *
 * Dates are written in the reader's language with Latin digits (as the News
 * CMS writes them: `ar-MA-u-nu-latn`), and rendered through <AdminDate>, never
 * <AdminDatum> -- a formatted Arabic date is text, not LTR data.
 */

type Lang = "fr" | "ar";

function locale(lang: Lang): string {
  return lang === "ar" ? "ar-MA-u-nu-latn" : "fr-FR";
}

/** "24 sept. 2026" */
export function formatUserDate(iso: string, lang: Lang): string {
  return new Date(iso).toLocaleDateString(locale(lang), { dateStyle: "medium" });
}

/** "24 sept. 2026, 14:05" */
export function formatUserDateTime(iso: string, lang: Lang): string {
  return new Date(iso).toLocaleString(locale(lang), { dateStyle: "medium", timeStyle: "short" });
}

/** The name an operator recognises an account by, most human first. */
export function userDisplayName(user: Pick<AdminUserDto, "displayName" | "username">, lang: Lang) {
  if (user.displayName) return user.displayName;
  if (user.username) return `@${user.username}`;
  return lang === "ar" ? "حساب بلا اسم" : "Compte sans nom";
}

/** The account's initial, for its disc. A question mark when it has no name. */
export function userInitial(user: Pick<AdminUserDto, "displayName" | "username">): string {
  const source = user.displayName ?? user.username ?? "";
  const first = [...source.trim()][0];
  return first ? first.toLocaleUpperCase() : "?";
}

export const BAN_DURATION_LABELS: Record<BanDurationKey, Record<Lang, string>> = {
  day: { fr: "24 heures", ar: "24 ساعة" },
  week: { fr: "7 jours", ar: "7 أيام" },
  month: { fr: "30 jours", ar: "30 يوماً" },
  indefinite: { fr: "Sans limite", ar: "بلا مدة محددة" },
};

/** "Banni jusqu’au 1 oct. 2026, 14:05" or "Banni sans limite de durée". */
export function banStatusLabel(endsAt: string | null, lang: Lang): string {
  if (endsAt === null) return lang === "ar" ? "محظور بلا مدة محددة" : "Banni sans limite de durée";
  const until = formatUserDateTime(endsAt, lang);
  return lang === "ar" ? `محظور حتى ${until}` : `Banni jusqu’au ${until}`;
}

const USER_ERROR_MESSAGES: Record<UserAdminErrorCode, Record<Lang, string>> = {
  moderation_reason_invalid: {
    fr: "Le motif doit faire entre 8 et 500 caractères, sans espace au début ni à la fin.",
    ar: "يجب أن يتراوح السبب بين 8 و500 حرف، بلا مسافات في البداية أو النهاية.",
  },
  ban_duration_invalid: {
    fr: "Durée de bannissement invalide.",
    ar: "مدة الحظر غير صالحة.",
  },
  user_not_found: {
    fr: "Ce compte n’existe pas ou a été supprimé.",
    ar: "هذا الحساب غير موجود أو حُذف.",
  },
  self_moderation_forbidden: {
    fr: "Vous ne pouvez pas bannir votre propre compte.",
    ar: "لا يمكنك حظر حسابك الخاص.",
  },
  staff_account_protected: {
    fr: "Ce compte appartient à un membre du personnel : son accès se gère depuis « Personnel ».",
    ar: "هذا الحساب لعضو في طاقم الإدارة: يُدار وصوله من صفحة « طاقم الإدارة ».",
  },
  user_already_banned: {
    fr: "Ce compte est déjà banni. Actualisez la page.",
    ar: "هذا الحساب محظور بالفعل. حدّث الصفحة.",
  },
  user_not_banned: {
    fr: "Ce compte n’est plus banni. Actualisez la page.",
    ar: "لم يعد هذا الحساب محظوراً. حدّث الصفحة.",
  },
  validation_failed: {
    fr: "La demande n’est pas valide.",
    ar: "الطلب غير صالح.",
  },
  users_admin_unavailable: {
    fr: "Cette page attend la mise à jour de la base de données (migration 20260924160000). Elle fonctionnera dès qu’elle sera appliquée.",
    ar: "هذه الصفحة بانتظار تحديث قاعدة البيانات (الترحيل 20260924160000). ستعمل بمجرد تطبيقه.",
  },
};

const ACCESS_ERROR_MESSAGES: Partial<Record<AdminErrorCode, Record<Lang, string>>> = {
  recent_auth_required: {
    fr: "Par sécurité, cette action demande une connexion de moins de 15 minutes. Déconnectez-vous, reconnectez-vous, puis réessayez.",
    ar: "لدواعٍ أمنية، يتطلب هذا الإجراء تسجيل دخول لم يمضِ عليه أكثر من 15 دقيقة. سجّل الخروج ثم الدخول وأعد المحاولة.",
  },
  mfa_required: {
    fr: "Activez la validation en deux étapes pour utiliser l’administration.",
    ar: "فعّل التحقق بخطوتين لاستخدام لوحة الإدارة.",
  },
  mfa_assurance_insufficient: {
    fr: "Validez votre connexion avec votre code à deux étapes, puis réessayez.",
    ar: "أكّد تسجيل دخولك برمز التحقق بخطوتين ثم أعد المحاولة.",
  },
  permission_missing: {
    fr: "Votre rôle ne permet pas cette action.",
    ar: "دورك لا يسمح بهذا الإجراء.",
  },
  staff_role_expired: {
    fr: "Votre rôle a expiré.",
    ar: "انتهت صلاحية دورك.",
  },
  idempotency_conflict: {
    fr: "Cette action a déjà été envoyée avec d’autres valeurs. Actualisez la page.",
    ar: "أُرسل هذا الإجراء من قبل بقيم مختلفة. حدّث الصفحة.",
  },
};

/** One sentence for an error code, whichever layer produced it. */
export function userAdminErrorMessage(code: string, lang: Lang): string {
  const known =
    USER_ERROR_MESSAGES[code as UserAdminErrorCode] ??
    ACCESS_ERROR_MESSAGES[code as AdminErrorCode];
  if (known) return known[lang];
  return lang === "ar"
    ? `تعذّر إتمام العملية (${code}).`
    : `L’opération n’a pas pu aboutir (${code}).`;
}
