/**
 * What a refused Admin action tells the console, and how the console says it.
 *
 * The screens used to print the server's code after a colon -- "Transition
 * refusée: recent_auth_required" -- in a French and Arabic console. The codes
 * below are the access refusals any sensitive action can meet, plus the
 * approval queue's own; each gets one sentence in both languages. A code not
 * listed here is still shown, as a reference after a sentence that says the
 * operation did not go through, so nothing is hidden from a support request.
 *
 * Wording only: what the server checks, and when, is unchanged.
 */

type Lang = "fr" | "ar";

/** The 15-minute rule's refusal. The one a sign-in can clear on the spot. */
export const RECENT_AUTH_REFUSAL = "recent_auth_required";

export function isRecentAuthRefusal(code: string | null | undefined): boolean {
  return code === RECENT_AUTH_REFUSAL;
}

/**
 * What an action handed to `AdminDestructiveAction` reports back. Nothing (or
 * `undefined`) means it went through: the motive draft is cleared. A refusal
 * carries the server's code: the draft is kept, and `recent_auth_required`
 * shows "Se reconnecter" under the action -- which is why a screen does not
 * repeat that one in its own notice (`screenNoticeFor`).
 */
export type AdminActionOutcome = void | { readonly refused: string };

export function refusedWith(code: string): { readonly refused: string } {
  return { refused: code };
}

/**
 * The screen-level notice for a refusal reported to a confirm step: the
 * given text, or `null` for the 15-minute rule, whose prompt (with its
 * button) already sits under the action. Said twice, it read as two errors.
 */
export function screenNoticeFor(code: string, text: string): string | null {
  return isRecentAuthRefusal(code) ? null : text;
}

export const ADMIN_REFUSAL_TEXT: Readonly<Record<string, Readonly<Record<Lang, string>>>> = {
  // Under a confirm step, `AdminRecentAuthPrompt` says this with the
  // "Se reconnecter" button and the screen's own notice stays quiet; this
  // sentence is for the places with no such step.
  recent_auth_required: {
    fr: "Par sécurité, cette action demande une connexion de moins de 15 minutes. Reconnectez-vous, puis réessayez.",
    ar: "لدواعٍ أمنية، يتطلب هذا الإجراء تسجيل دخول لم يمضِ عليه أكثر من 15 دقيقة. أعد تسجيل الدخول، ثم حاول مجدداً.",
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
  approval_expired: {
    fr: "Cette demande a expiré. Une nouvelle demande est nécessaire.",
    ar: "انتهت صلاحية هذا الطلب. يلزم تقديم طلب جديد.",
  },
  approval_conflict: {
    fr: "Cette demande a changé entre-temps. Actualisez la page.",
    ar: "تغيّر هذا الطلب في الأثناء. حدّث الصفحة.",
  },
  approval_payload_mismatch: {
    fr: "Cette demande a changé entre-temps. Actualisez la page.",
    ar: "تغيّر هذا الطلب في الأثناء. حدّث الصفحة.",
  },
  self_approval_forbidden: {
    fr: "Vous ne pouvez pas approuver votre propre demande : un second administrateur doit le faire.",
    ar: "لا يمكنك الموافقة على طلبك بنفسك: يجب أن يوافق عليه مسؤول ثانٍ.",
  },
  self_escalation_forbidden: {
    fr: "Vous ne pouvez pas étendre ni approuver votre propre accès.",
    ar: "لا يمكنك توسيع صلاحياتك أو الموافقة عليها بنفسك.",
  },
  operation_already_executed: {
    fr: "Cette demande a déjà été exécutée.",
    ar: "نُفّذ هذا الطلب من قبل.",
  },
  last_platform_admin_required: {
    fr: "Au moins un administrateur de la plateforme doit rester actif.",
    ar: "يجب أن يبقى مدير واحد للمنصة على الأقل نشطاً.",
  },
};

/** One sentence for a refusal code; an unknown code is kept as a reference. */
export function describeAdminRefusal(code: string, lang: Lang): string {
  const known = ADMIN_REFUSAL_TEXT[code];
  if (known) return known[lang];
  return lang === "ar"
    ? `تعذّر إتمام العملية (المرجع: ${code}).`
    : `L’opération n’a pas pu aboutir (réf. : ${code}).`;
}
