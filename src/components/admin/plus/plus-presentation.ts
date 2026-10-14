import type {
  BillingEventType,
  BillingOutcome,
  PremiumAdminProduct,
  PremiumGrantDurationKey,
  PremiumMode,
  PremiumSource,
  PremiumState,
} from "@/backend/premium/admin";
import { userAdminErrorMessage } from "@/components/admin/users/user-presentation";

/**
 * Wording and formatting for the BotolaGO+ admin screen, in French and Arabic.
 *
 * Dates reuse the user directory's formatters (Latin digits in both languages) and are drawn through
 * <AdminDate>. A price is formatted from the amount the API returned: nothing here knows what a
 * membership costs.
 */

export type Lang = "fr" | "ar";
type Pair = Record<Lang, string>;

function locale(lang: Lang): string {
  return lang === "ar" ? "ar-MA-u-nu-latn" : "fr-FR";
}

/** "20 MAD" from 2000 centimes; "19,50 MAD" when it is not a whole amount. */
export function formatPrice(priceMinor: number, currency: string, lang: Lang): string {
  const whole = priceMinor % 100 === 0;
  return new Intl.NumberFormat(locale(lang), {
    style: "currency",
    currency,
    currencyDisplay: "code",
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: 2,
  })
    .format(priceMinor / 100)
    .replace(/[\u00a0\u202f]/g, " ");
}

/** "20 MAD / mois", "200 MAD / an", or "…/ 3 mois" for any other period the database may hold. */
export function formatProductPrice(product: PremiumAdminProduct, lang: Lang): string {
  const price = formatPrice(product.priceMinor, product.currency, lang);
  if (product.periodMonths === 1) return lang === "ar" ? `${price} / شهر` : `${price} / mois`;
  if (product.periodMonths === 12) return lang === "ar" ? `${price} / سنة` : `${price} / an`;
  return lang === "ar"
    ? `${price} / ${product.periodMonths} أشهر`
    : `${price} / ${product.periodMonths} mois`;
}

export function renewalLabel(product: PremiumAdminProduct, lang: Lang): string {
  if (product.renews) return lang === "ar" ? "يتجدد تلقائياً" : "Renouvellement automatique";
  return lang === "ar"
    ? `${product.periodMonths} أشهر من تاريخ الشراء، بلا تجديد تلقائي`
    : `${product.periodMonths} mois à partir de l’achat, sans renouvellement automatique`;
}

const PRODUCT_NAMES: Record<string, Pair> = {
  plus_monthly: { fr: "Mensuel", ar: "شهري" },
  plus_yearly: { fr: "Annuel", ar: "سنوي" },
};

/** A product's name; an unknown code is shown as the code, never hidden. */
export function productName(code: string | null, lang: Lang): string {
  if (!code) return lang === "ar" ? "غير محدد" : "Non précisé";
  return PRODUCT_NAMES[code]?.[lang] ?? code;
}

export const STATE_LABELS: Record<PremiumState, Pair> = {
  active: { fr: "Actifs", ar: "نشطون" },
  cancelling: { fr: "En résiliation", ar: "قيد الإلغاء" },
  grace: { fr: "En grâce", ar: "في فترة السماح" },
  on_hold: { fr: "En suspens", ar: "معلّقون" },
  expired: { fr: "Expirés", ar: "منتهون" },
  refunded: { fr: "Remboursés", ar: "مستردّون" },
  revoked: { fr: "Révoqués", ar: "ملغون" },
};

/** One member's state, as a status word rather than a plural count label. */
export const STATE_NAMES: Record<PremiumState, Pair> = {
  active: { fr: "Actif", ar: "نشط" },
  cancelling: { fr: "En résiliation", ar: "قيد الإلغاء" },
  grace: { fr: "En grâce", ar: "في فترة السماح" },
  on_hold: { fr: "En suspens", ar: "معلّق" },
  expired: { fr: "Expiré", ar: "منتهٍ" },
  refunded: { fr: "Remboursé", ar: "مستردّ" },
  revoked: { fr: "Révoqué", ar: "ملغى" },
};

export const STATE_HINTS: Record<PremiumState, Pair> = {
  active: { fr: "Abonnement en cours.", ar: "اشتراك ساري." },
  cancelling: {
    fr: "Résilié, reste membre jusqu’à la fin de la période payée.",
    ar: "أُلغي، ويبقى عضواً حتى نهاية الفترة المدفوعة.",
  },
  grace: {
    fr: "Paiement en échec, accès maintenu le temps de la grâce.",
    ar: "فشل الدفع، والوصول محفوظ طوال فترة السماح.",
  },
  on_hold: {
    fr: "Boutique mobile : paiement non régularisé, accès suspendu.",
    ar: "متجر الهاتف: لم يُسوَّ الدفع، والوصول معلّق.",
  },
  expired: { fr: "Période terminée, plus membre.", ar: "انتهت الفترة، لم يعد عضواً." },
  refunded: { fr: "Remboursé, plus membre.", ar: "استُرد المبلغ، لم يعد عضواً." },
  revoked: { fr: "Retiré par le prestataire, plus membre.", ar: "سُحب من المزوّد، لم يعد عضواً." },
};

export const SOURCE_LABELS: Record<PremiumSource, Pair> = {
  web: { fr: "Site web", ar: "الموقع" },
  apple: { fr: "App Store", ar: "App Store" },
  google: { fr: "Google Play", ar: "Google Play" },
  grant: { fr: "Offert par le personnel", ar: "منحة من الطاقم" },
};

export const MODE_LABELS: Record<PremiumMode, Pair> = {
  off: { fr: "Éteint", ar: "متوقف" },
  preview: { fr: "Aperçu", ar: "معاينة" },
  on: { fr: "Ouvert", ar: "مفتوح" },
};

export const MODE_HINTS: Record<PremiumMode, Pair> = {
  off: {
    fr: "Personne n’est membre et toutes les lectures répondent « indisponible ».",
    ar: "لا أحد عضو، وكل القراءات تجيب « غير متاح ».",
  },
  preview: {
    fr: "Le propriétaire et le personnel : l’adhésion compte comme en production, achats de test du personnel compris, mais rien n’est public.",
    ar: "المالك والطاقم: تُحتسب العضوية كما في الإنتاج، بما فيها مشتريات الاختبار للطاقم، لكن لا شيء عام.",
  },
  on: {
    fr: "Les abonnements sont ouverts à tous.",
    ar: "الاشتراكات مفتوحة للجميع.",
  },
};

export const EVENT_TYPE_LABELS: Record<BillingEventType, Pair> = {
  purchase: { fr: "Achat", ar: "شراء" },
  renewal: { fr: "Renouvellement", ar: "تجديد" },
  cancel: { fr: "Résiliation", ar: "إلغاء" },
  uncancel: { fr: "Reprise", ar: "استئناف" },
  payment_failed: { fr: "Paiement échoué", ar: "فشل الدفع" },
  hold: { fr: "Mise en suspens", ar: "تعليق" },
  expire: { fr: "Expiration", ar: "انتهاء" },
  refund: { fr: "Remboursement", ar: "استرداد" },
  revoke: { fr: "Retrait", ar: "سحب" },
};

export const OUTCOME_LABELS: Record<BillingOutcome, Pair> = {
  applied: { fr: "Appliqué", ar: "طُبّق" },
  ignored_state: { fr: "Ignoré : état incompatible", ar: "تم تجاهله: حالة غير متوافقة" },
  ignored_stale: { fr: "Ignoré : plus ancien", ar: "تم تجاهله: أقدم من الحالي" },
  ignored_user: { fr: "Ignoré : compte inconnu", ar: "تم تجاهله: حساب غير معروف" },
  ignored_product: { fr: "Ignoré : produit inconnu", ar: "تم تجاهله: منتج غير معروف" },
  rejected_signature: { fr: "Signature refusée", ar: "التوقيع مرفوض" },
};

export const GRANT_DURATION_LABELS: Record<PremiumGrantDurationKey, Pair> = {
  month: { fr: "30 jours", ar: "30 يوماً" },
  quarter: { fr: "90 jours", ar: "90 يوماً" },
  year: { fr: "1 an", ar: "سنة" },
};

/** A recorded state name (`stateBefore`, `stateAfter`) in words; "none" is no membership. */
export function recordedStateLabel(value: string | null, lang: Lang): string {
  if (value === null) return "—";
  if (value === "none") return lang === "ar" ? "بلا عضوية" : "aucune";
  return STATE_NAMES[value as PremiumState]?.[lang] ?? value;
}

/** "20 MAD" for an event's amount, or null when the event carried none. */
export function eventAmount(
  amountMinor: number | null,
  currency: string | null,
  lang: Lang,
): string | null {
  if (amountMinor === null || currency === null) return null;
  return formatPrice(amountMinor, currency, lang);
}

const PREMIUM_ERROR_MESSAGES: Record<string, Pair> = {
  premium_reason_invalid: {
    fr: "Le motif doit faire entre 8 et 500 caractères, sans espace au début ni à la fin.",
    ar: "يجب أن يتراوح السبب بين 8 و500 حرف، بلا مسافات في البداية أو النهاية.",
  },
  premium_grant_period_invalid: {
    fr: "La durée de l’offre n’est pas acceptée (au moins une minute, au plus 400 jours).",
    ar: "مدة المنحة غير مقبولة (دقيقة على الأقل و400 يوم على الأكثر).",
  },
  premium_account_not_found: {
    fr: "Ce compte n’existe pas ou a été supprimé.",
    ar: "هذا الحساب غير موجود أو حُذف.",
  },
  premium_grant_not_found: {
    fr: "Cette offre n’existe pas. Actualisez le compte.",
    ar: "هذه المنحة غير موجودة. حدّث الحساب.",
  },
  premium_grant_already_revoked: {
    fr: "Cette offre est déjà retirée. Actualisez le compte.",
    ar: "هذه المنحة مسحوبة بالفعل. حدّث الحساب.",
  },
  validation_failed: { fr: "La demande n’est pas valide.", ar: "الطلب غير صالح." },
  premium_admin_invalid_answer: {
    fr: "La base de données a répondu dans un format inattendu. Rien n’a été affiché pour ne pas montrer de chiffres faux.",
    ar: "أجابت قاعدة البيانات بصيغة غير متوقعة. لم يُعرض شيء حتى لا تظهر أرقام خاطئة.",
  },
  premium_admin_unavailable: {
    fr: "Cette page attend la mise à jour de la base de données (migration 20261013100200). Elle fonctionnera dès qu’elle sera appliquée.",
    ar: "هذه الصفحة بانتظار تحديث قاعدة البيانات (الترحيل 20261013100200). ستعمل بمجرد تطبيقه.",
  },
  premium_lookup_ambiguous: {
    fr: "Plusieurs comptes correspondent à cette adresse. Utilisez l’identifiant du compte.",
    ar: "عدة حسابات تطابق هذا العنوان. استعمل معرّف الحساب.",
  },
  premium_lookup_not_found: {
    fr: "Aucun compte ne correspond à cette adresse e-mail.",
    ar: "لا يوجد حساب يطابق هذا البريد الإلكتروني.",
  },
  premium_lookup_invalid: {
    fr: "Saisissez l’identifiant du compte (UUID) ou son adresse e-mail complète.",
    ar: "أدخل معرّف الحساب (UUID) أو بريده الإلكتروني الكامل.",
  },
};

/** One sentence for an error code, whichever layer produced it. */
export function premiumAdminErrorMessage(code: string, lang: Lang): string {
  return PREMIUM_ERROR_MESSAGES[code]?.[lang] ?? userAdminErrorMessage(code, lang);
}
