import { moroccoDateTimeFormat } from "@/lib/morocco-time";

/**
 * The security console's machine values, in the reader's language.
 *
 * The approvals queue, the security page and the audit log printed the
 * database's own words -- `staff.assign_platform_admin`, `pending`,
 * `not_started`, "Queued", "Dead-letter", an ISO timestamp -- inside a French
 * and Arabic console. The raw value stays the wire contract and the test hook;
 * only what is rendered changes. A value with no label here (a new operation,
 * a new state) is shown as it is, never dropped.
 */

type Lang = "fr" | "ar";
type Labels = Readonly<Record<Lang, string>>;

function label(map: Readonly<Record<string, Labels>>, value: string, lang: Lang): string {
  return map[value]?.[lang] ?? value;
}

/* ------------------------------------------------------------ approvals */

/**
 * What an approval request does, and the role it grants, where the operation
 * names one. Phase 7D has a single dual-control operation.
 */
export const APPROVAL_OPERATIONS: Readonly<
  Record<string, { readonly action: Labels; readonly role: Labels | null }>
> = {
  "staff.assign_platform_admin": {
    action: {
      fr: "Attribution du rôle administrateur de la plateforme",
      ar: "تعيين دور مدير المنصة",
    },
    role: { fr: "administrateur de la plateforme", ar: "مدير المنصة" },
  },
};

/** "Attribution du rôle administrateur de la plateforme", or the raw slug. */
export function approvalOperationLabel(operationType: string, lang: Lang): string {
  return APPROVAL_OPERATIONS[operationType]?.action[lang] ?? operationType;
}

/** The role an operation grants, in words, or `null` when it names none. */
export function approvalOperationRole(operationType: string, lang: Lang): string | null {
  return APPROVAL_OPERATIONS[operationType]?.role?.[lang] ?? null;
}

const APPROVAL_STATUSES: Readonly<Record<string, Labels>> = {
  pending: { fr: "En attente", ar: "قيد الانتظار" },
  approved: { fr: "Approuvée", ar: "تمت الموافقة" },
  rejected: { fr: "Rejetée", ar: "مرفوضة" },
  cancelled: { fr: "Annulée", ar: "ملغاة" },
  expired: { fr: "Expirée", ar: "منتهية الصلاحية" },
};

export function approvalStatusLabel(status: string, lang: Lang): string {
  return label(APPROVAL_STATUSES, status, lang);
}

const EXECUTION_STATUSES: Readonly<Record<string, Labels>> = {
  not_started: { fr: "Pas encore exécutée", ar: "لم تُنفَّذ بعد" },
  executing: { fr: "En cours d’exécution", ar: "قيد التنفيذ" },
  executed: { fr: "Exécutée", ar: "نُفِّذت" },
  execution_failed: { fr: "Échec de l’exécution", ar: "فشل التنفيذ" },
};

export function executionStatusLabel(status: string, lang: Lang): string {
  return label(EXECUTION_STATUSES, status, lang);
}

/* ------------------------------------------------------------- security */

/** The session-invalidation queue's four counters. */
export const REVOCATION_QUEUE_LABELS = {
  pending: { fr: "En file", ar: "في الانتظار" },
  processing: { fr: "En cours", ar: "قيد المعالجة" },
  retrying: { fr: "Nouvel essai prévu", ar: "إعادة محاولة مقرّرة" },
  deadLetter: { fr: "Échec définitif", ar: "فشل نهائي" },
} as const satisfies Record<string, Labels>;

const REVOCATION_REQUEST_STATUSES: Readonly<Record<string, Labels>> = {
  pending: { fr: "En attente", ar: "قيد الانتظار" },
  processing: { fr: "En cours", ar: "قيد المعالجة" },
  completed: { fr: "Terminée", ar: "اكتملت" },
  failed: { fr: "En échec, nouvel essai prévu", ar: "فشلت، وإعادة المحاولة مقرّرة" },
  dead_letter: { fr: "Échec définitif", ar: "فشل نهائي" },
};

export function revocationRequestStatusLabel(status: string, lang: Lang): string {
  return label(REVOCATION_REQUEST_STATUSES, status, lang);
}

/** "2 en attente" / "2 قيد الانتظار". */
export function pendingCountLabel(count: number, lang: Lang): string {
  return lang === "ar" ? `${count} قيد الانتظار` : `${count} en attente`;
}

export const NO_REVOCATION_REQUESTED: Labels = {
  fr: "Aucune demande",
  ar: "لا يوجد طلب",
};

/* ---------------------------------------------------------------- audit */

const AUDIT_OUTCOMES: Readonly<Record<string, Labels>> = {
  succeeded: { fr: "Réussie", ar: "نجحت" },
  denied: { fr: "Refusée", ar: "مرفوضة" },
  failed: { fr: "Échouée", ar: "فشلت" },
};

export function auditOutcomeLabel(outcome: string, lang: Lang): string {
  return label(AUDIT_OUTCOMES, outcome, lang);
}

/**
 * An audit time in Morocco time, to the second, with Latin digits in Arabic
 * too: "6 oct. 2026, 22:14:03". Through the app's Morocco clock
 * (`morocco-time.ts`), not the browser's time-zone data. An unreadable value
 * is returned as it came, so nothing is hidden.
 */
export function formatAuditTimestamp(iso: string, lang: Lang): string {
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return iso;
  return moroccoDateTimeFormat(lang === "ar" ? "ar-MA-u-nu-latn" : "fr-FR", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).format(date);
}
