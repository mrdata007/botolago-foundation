import type {
  BillingEventType,
  PremiumAdminOverview,
  BillingOutcome,
  PremiumAdminProduct,
  PaymentMethod,
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
  // The Saison has no period: it is paid once and ends with the Fantasy season.
  if (product.periodMonths === null)
    return lang === "ar" ? `${price} / مرة واحدة` : `${price} · une fois`;
  if (product.periodMonths === 1) return lang === "ar" ? `${price} / شهر` : `${price} / mois`;
  if (product.periodMonths === 12) return lang === "ar" ? `${price} / سنة` : `${price} / an`;
  return lang === "ar"
    ? `${price} / ${product.periodMonths} أشهر`
    : `${price} / ${product.periodMonths} mois`;
}

export function renewalLabel(product: PremiumAdminProduct, lang: Lang): string {
  if (product.periodMonths === null) {
    return lang === "ar"
      ? "صالح حتى نهاية موسم الفانتازي، بلا تجديد"
      : "Valable jusqu’à la fin de la saison Fantasy, sans reconduction";
  }
  if (product.renews) return lang === "ar" ? "يتجدد تلقائياً" : "Renouvellement automatique";
  return lang === "ar"
    ? `${product.periodMonths} أشهر من تاريخ الشراء، بلا تجديد تلقائي`
    : `${product.periodMonths} mois à partir de l’achat, sans renouvellement automatique`;
}

const PRODUCT_NAMES: Record<string, Pair> = {
  plus_season: { fr: "Saison 2026/27", ar: "اشتراك 2026/27" },
  plus_monthly: { fr: "Mensuel (ancien)", ar: "شهري (قديم)" },
  plus_yearly: { fr: "Annuel (ancien)", ar: "سنوي (قديم)" },
};

/**
 * A product's name. Staff never read a product code: an unknown one is « Autre formule », and the
 * count and the price beside it still say which line it is.
 */
export function productName(code: string | null, lang: Lang): string {
  if (!code) return lang === "ar" ? "غير محدد" : "Non précisé";
  return PRODUCT_NAMES[code]?.[lang] ?? (lang === "ar" ? "صيغة أخرى" : "Autre formule");
}

/** The states in which an account is a member right now through a subscription. */
const SUBSCRIBER_STATES: readonly PremiumState[] = ["active", "cancelling", "grace"];

/** Accounts that are members through a subscription today (staff offers are counted apart). */
export function subscriberCount(overview: PremiumAdminOverview): number {
  return SUBSCRIBER_STATES.reduce((sum, state) => sum + (overview.membersByState[state] ?? 0), 0);
}

/**
 * The banner at the top of the screen: what the current mode means for who sees the subscription.
 * `tone` only picks the alert colour; the first word is the mode, so nothing rests on colour.
 */
export const MODE_BANNERS: Record<PremiumMode, { tone: "info" | "alert"; text: Pair }> = {
  off: {
    tone: "alert",
    text: {
      fr: "Éteint : personne ne voit la Saison, même avec un accès offert par le personnel.",
      ar: "متوقف: لا أحد يرى الاشتراك، حتى مع وصول ممنوح من الفريق.",
    },
  },
  preview: {
    tone: "info",
    text: {
      fr: "Aperçu : seuls les comptes qui ont une Saison la voient (activée par le personnel). Rien n’est public.",
      ar: "معاينة: لا يراه إلا من لديهم اشتراك (يفعّله الفريق). لا شيء علني.",
    },
  },
  on: {
    tone: "info",
    text: {
      fr: "Ouvert : la Saison est visible par tout le monde.",
      ar: "مفتوح: الاشتراك ظاهر للجميع.",
    },
  },
};

/** After a grant: where the new member will find it, so nobody hunts for it. */
export function grantWhereToLook(
  own: boolean,
  mode: PremiumMode | null,
  lang: Lang,
): { lead: string; off: string | null } {
  const lead =
    lang === "ar"
      ? own
        ? "يظهر الاشتراك في الملف الشخصي وعلى بطاقتك:"
        : "سجّل الدخول بهذا الحساب: يظهر الاشتراك في الملف الشخصي وعلى بطاقته:"
      : own
        ? "La Saison apparaît dans Profil et sur votre carte :"
        : "Connectez-vous avec ce compte : la Saison apparaît dans Profil et sur sa carte :";
  const off =
    mode === "off"
      ? lang === "ar"
        ? "الوضع متوقف حاليًا: لن يظهر الاشتراك قبل أن يفتح المالك المعاينة."
        : "Le mode est Éteint : rien n’apparaîtra tant que le propriétaire n’a pas ouvert l’aperçu."
      : null;
  return { lead, off };
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
    fr: "Le propriétaire et le personnel : l’abonnement compte comme en production, achats de test du personnel compris, mais rien n’est public.",
    ar: "المالك والطاقم: يُحتسب الاشتراك كما في الإنتاج، بما فيه مشتريات الاختبار للطاقم، لكن لا شيء عام.",
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

/** How a Saison was paid, for the chips and the grants list. */
export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, Pair> = {
  bank_transfer: { fr: "Virement", ar: "تحويل" },
  cashplus: { fr: "CashPlus", ar: "كاش بلس" },
  wafacash: { fr: "Wafacash", ar: "وفاكاش" },
  free: { fr: "Offert", ar: "هدية" },
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
    fr: "La durée de l’offre n’est pas acceptée (au plus 400 jours).",
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
  recent_auth_required: {
    fr: "Par sécurité, cette action demande une connexion de moins de 15 minutes. Reconnectez-vous : vous reviendrez sur cette page pour recommencer.",
    ar: "لدواعٍ أمنية، يتطلب هذا الإجراء تسجيل دخول لم يمضِ عليه أكثر من 15 دقيقة. سجّل الدخول من جديد: ستعود إلى هذه الصفحة لتعيد المحاولة.",
  },
  validation_failed: { fr: "La demande n’est pas valide.", ar: "الطلب غير صالح." },
  premium_admin_invalid_answer: {
    fr: "La base de données a répondu dans un format inattendu. Rien n’a été affiché pour ne pas montrer de chiffres faux.",
    ar: "أجابت قاعدة البيانات بصيغة غير متوقعة. لم يُعرض شيء حتى لا تظهر أرقام خاطئة.",
  },
  premium_admin_unavailable: {
    fr: "Les abonnements ne sont pas encore prêts sur cette base de données. Prévenez l’équipe technique : la page fonctionnera dès que la mise à jour sera faite.",
    ar: "الاشتراكات ليست جاهزة بعد على قاعدة البيانات هذه. أبلغ الفريق التقني: ستعمل الصفحة بمجرد إجراء التحديث.",
  },
  premium_lookup_ambiguous: {
    fr: "Plusieurs comptes correspondent à cette adresse. Utilisez l’identifiant du compte.",
    ar: "عدة حسابات تطابق هذا العنوان. استعمل معرّف الحساب.",
  },
  premium_lookup_not_found: {
    fr: "Aucun compte ne correspond à cette adresse e-mail.",
    ar: "لا يوجد حساب يطابق هذا البريد الإلكتروني.",
  },
  premium_lookup_email_not_allowed: {
    fr: "La recherche par e-mail demande l’accès à l’annuaire des utilisateurs. Utilisez l’identifiant du compte.",
    ar: "البحث بالبريد الإلكتروني يتطلب صلاحية دليل المستخدمين. استعمل معرّف الحساب.",
  },
  premium_code_not_found: {
    fr: "Aucun compte ne correspond à ce code. Vérifiez-le avec l’acheteur.",
    ar: "لا يوجد حساب يطابق هذا الرمز. تحقق منه مع المشتري.",
  },
  season_already_active: {
    fr: "Ce compte a déjà une Saison valable jusqu’à la fin de la saison : rien à activer.",
    ar: "لهذا الحساب اشتراك سارٍ حتى نهاية الموسم: لا شيء لتفعيله.",
  },
  premium_season_unavailable: {
    fr: "Aucune saison Fantasy n’est en cours : la Saison ne peut pas être activée.",
    ar: "لا يوجد موسم فانتازي جارٍ: لا يمكن تفعيل الاشتراك.",
  },
  premium_season_ended: {
    fr: "La saison Fantasy est déjà terminée : la Saison ne peut plus être activée.",
    ar: "انتهى موسم الفانتازي: لم يعد ممكنًا تفعيل الاشتراك.",
  },
  premium_payment_reference_invalid: {
    fr: "La référence du paiement doit faire entre 1 et 80 caractères.",
    ar: "يجب أن يتراوح مرجع الدفع بين 1 و80 حرفًا.",
  },
  premium_product_unavailable: {
    fr: "La Saison n'est pas en vente sur ce serveur : vérifiez que la mise à jour de la base est appliquée.",
    ar: "الاشتراك غير متاح للبيع على هذا الخادم: تحقق من تطبيق تحديث قاعدة البيانات.",
  },
  premium_payment_reference_required: {
    fr: "Indiquez la référence du paiement (numéro du virement ou du reçu).",
    ar: "أدخل مرجع الدفع (رقم التحويل أو الإيصال).",
  },
  premium_payment_method_invalid: {
    fr: "Le mode de paiement n’est pas accepté.",
    ar: "طريقة الدفع غير مقبولة.",
  },
  premium_payment_details_invalid: {
    fr: "Les coordonnées ne sont pas valides. Le numéro WhatsApp compte 8 à 16 chiffres, avec un « + » possible au début ; le RIB, 10 à 40 caractères (chiffres, lettres, espaces, points, tirets).",
    ar: "البيانات غير صالحة. رقم واتساب من 8 إلى 16 رقمًا، ويمكن أن يبدأ بـ «+»؛ والـ RIB من 10 إلى 40 حرفًا (أرقام وحروف ومسافات ونقاط وشرطات).",
  },
  premium_code_invalid: {
    fr: "Ce code n’a pas le bon format : « BG- » suivi de six caractères.",
    ar: "صيغة الرمز غير صحيحة: «BG-» ثم ستة أحرف.",
  },
  premium_lookup_invalid: {
    fr: "Saisissez l’identifiant du compte (UUID), son code de paiement (BG-…) ou son adresse e-mail complète.",
    ar: "أدخل معرّف الحساب (UUID) أو رمز الدفع (BG-…) أو بريده الإلكتروني الكامل.",
  },
};

/** One sentence for an error code, whichever layer produced it. */
export function premiumAdminErrorMessage(code: string, lang: Lang): string {
  return PREMIUM_ERROR_MESSAGES[code]?.[lang] ?? userAdminErrorMessage(code, lang);
}

/** The refusals a fresh sign-in fixes: the screen offers « Se reconnecter » for them. */
export function needsReconnect(code: string): boolean {
  return code === "recent_auth_required";
}
