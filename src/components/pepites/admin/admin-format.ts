import { PepitesAdminError } from "@/backend/pepites/admin-repository";

/**
 * Pure helpers for the Pépites staff screens: Morocco-time scheduling, the
 * editor's list operations, and the database's refusals said in words.
 * Admin copy is inline French/Arabic, like the rest of the console.
 */

const ZONE = "Africa/Casablanca";

/** The zone's offset from UTC at `instant`, in minutes. */
function zoneOffsetMinutes(instant: number): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(instant));
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  const asUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour"),
    get("minute"),
    get("second"),
  );
  return Math.round((asUtc - Math.floor(instant / 1000) * 1000) / 60_000);
}

/**
 * "2026-10-12T20:00" read as Morocco time, as an ISO instant, or null.
 * Morocco moves between UTC+1 and UTC+0 (Ramadan), so the offset is the
 * zone's own at that moment, not a constant.
 */
export function casablancaLocalToIso(local: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(local);
  if (!match) return null;
  const [, y, mo, d, h, mi] = match.map(Number) as unknown as number[];
  const guess = Date.UTC(y!, mo! - 1, d!, h!, mi!);
  let instant = guess - zoneOffsetMinutes(guess) * 60_000;
  // Near a change of offset the first guess can land on the other side.
  instant = guess - zoneOffsetMinutes(instant) * 60_000;
  return Number.isFinite(instant) ? new Date(instant).toISOString() : null;
}

/** An instant as the "YYYY-MM-DDTHH:mm" a datetime field holds, in Morocco time. */
export function isoToCasablancaLocal(iso: string): string {
  const instant = Date.parse(iso);
  const shifted = new Date(instant + zoneOffsetMinutes(instant) * 60_000);
  return shifted.toISOString().slice(0, 16);
}

/**
 * Where the schedule field starts: today at the configured publication time
 * (Morocco), or tomorrow once that has passed.
 */
export function defaultScheduleLocal(now: number, publishLocalTime: string): string {
  const [hours = "20", minutes = "00"] = publishLocalTime.split(":");
  const today = isoToCasablancaLocal(new Date(now).toISOString()).slice(0, 10);
  const candidate = `${today}T${hours.padStart(2, "0")}:${minutes.padStart(2, "0")}`;
  const iso = casablancaLocalToIso(candidate);
  if (iso && Date.parse(iso) > now + 5 * 60_000) return candidate;
  const tomorrow = new Date(Date.parse(`${today}T12:00:00Z`) + 86_400_000)
    .toISOString()
    .slice(0, 10);
  return `${tomorrow}T${hours.padStart(2, "0")}:${minutes.padStart(2, "0")}`;
}

/** A readable date and time in Morocco, for the staff lists. */
export function adminDateTime(iso: string | null | undefined, rtl: boolean): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return "—";
  return new Intl.DateTimeFormat(rtl ? "ar-MA-u-nu-latn" : "fr-FR", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: ZONE,
  }).format(date);
}

/* ------------------------------------------------------------ the editor */

export interface DraftEntry {
  readonly playerId: string;
  readonly name: string;
  readonly team: string | null;
  readonly computedRank: number | null;
  readonly reasonFr: string;
  readonly reasonAr: string;
}

export const TOP_SIZE = 10;

/** Moves the entry at `index` up (-1) or down (+1); out of range changes nothing. */
export function moveEntry(
  entries: readonly DraftEntry[],
  index: number,
  delta: -1 | 1,
): DraftEntry[] {
  const target = index + delta;
  if (index < 0 || index >= entries.length || target < 0 || target >= entries.length) {
    return [...entries];
  }
  const next = [...entries];
  const [moved] = next.splice(index, 1);
  next.splice(target, 0, moved!);
  return next;
}

/** Adds a player at the end, once, and never past ten. */
export function addEntry(entries: readonly DraftEntry[], entry: DraftEntry): DraftEntry[] {
  if (entries.length >= TOP_SIZE || entries.some((item) => item.playerId === entry.playerId)) {
    return [...entries];
  }
  return [...entries, entry];
}

/** The order and reasons as `admin_pepites_edition_update` takes them. */
export function entriesPayload(entries: readonly DraftEntry[]) {
  return entries.map((entry, index) => ({
    playerId: entry.playerId,
    rank: index + 1,
    reasonFr: entry.reasonFr.trim() || null,
    reasonAr: entry.reasonAr.trim() || null,
  }));
}

/* ---------------------------------------------------------- the refusals */

const MESSAGES: Record<string, { fr: string; ar: string }> = {
  recent_auth_required: {
    fr: "Reconnectez-vous (connexion récente requise) puis réessayez.",
    ar: "أعد تسجيل الدخول (مطلوب تسجيل دخول حديث) ثم حاول مجددًا.",
  },
  mfa_required: {
    fr: "Confirmez d'abord votre second facteur.",
    ar: "أكّد أولًا عاملك الثاني.",
  },
  permission_missing: {
    fr: "Votre rôle ne permet pas cette action.",
    ar: "دورك لا يسمح بهذا الإجراء.",
  },
  PEPITES_EDITION_NOT_DRAFT: {
    fr: "Cette édition n'est plus un brouillon.",
    ar: "هذه النسخة لم تعد مسودة.",
  },
  PEPITES_EDITION_NOT_OPEN: {
    fr: "Cette édition n'est plus modifiable.",
    ar: "لم يعد بالإمكان تعديل هذه النسخة.",
  },
  PEPITES_ENTRIES_INVALID: {
    fr: "La liste doit compter au plus dix joueurs, sans doublon.",
    ar: "يجب أن تضم القائمة عشرة لاعبين على الأكثر دون تكرار.",
  },
  PEPITES_SCHEDULE_TIME_INVALID: {
    fr: "Choisissez une heure entre maintenant et dans 14 jours.",
    ar: "اختر وقتًا بين الآن و14 يومًا.",
  },
  PEPITES_EDITION_NOT_READY: {
    fr: "L'édition n'est pas prête : corrigez les points signalés.",
    ar: "النسخة غير جاهزة: صحّح النقاط المشار إليها.",
  },
  PEPITES_EDITION_NOT_SCHEDULED: {
    fr: "Cette édition n'est pas programmée.",
    ar: "هذه النسخة غير مبرمجة.",
  },
  PEPITES_EDITION_NOT_PUBLISHED: {
    fr: "Cette édition n'est pas publiée.",
    ar: "هذه النسخة غير منشورة.",
  },
  PEPITES_ENTRY_PLAYER_NOT_RANKED: {
    fr: "Un joueur choisi n'est pas classé dans ce calcul.",
    ar: "أحد اللاعبين المختارين غير مصنّف في هذا الحساب.",
  },
  PEPITES_REASON_INVALID: {
    fr: "Donnez un motif (8 à 500 caractères).",
    ar: "اذكر سببًا (من 8 إلى 500 حرف).",
  },
  ATTRIBUTE_SOURCE_NOTE_REQUIRED: {
    fr: "Indiquez la source (8 caractères au moins).",
    ar: "اذكر المصدر (8 أحرف على الأقل).",
  },
  INVALID_ATTRIBUTE_VALUE: {
    fr: "Cette valeur n'est pas valide pour ce champ.",
    ar: "هذه القيمة غير صالحة لهذا الحقل.",
  },
  PHOTO_RELEASE_PREREQUISITES: {
    fr: "Les droits de cette photo ne sont pas complets.",
    ar: "حقوق هذه الصورة غير مكتملة.",
  },
  PHOTO_RELEASE_TRANSITION_NOT_ALLOWED: {
    fr: "Cette action n'est pas possible dans l'état actuel de la photo.",
    ar: "هذا الإجراء غير ممكن في الحالة الحالية للصورة.",
  },
  PHOTO_RELEASE_REASON_REQUIRED: {
    fr: "Donnez un motif.",
    ar: "اذكر سببًا.",
  },
  PHOTO_RELEASE_DATES_INVALID: {
    fr: "Les dates de l'autorisation ne sont pas cohérentes.",
    ar: "تواريخ الإذن غير متناسقة.",
  },
};

/** The database's refusal, in the reader's language, with its code kept. */
export function describeAdminError(error: unknown, rtl: boolean): string {
  const code =
    error instanceof PepitesAdminError
      ? error.message || error.code
      : error instanceof Error
        ? error.message
        : String(error);
  const known = Object.keys(MESSAGES).find((key) => code.includes(key));
  const text = known
    ? MESSAGES[known]![rtl ? "ar" : "fr"]
    : rtl
      ? "تعذّر تنفيذ العملية."
      : "L'opération a échoué.";
  return `${text} (${code || "unknown"})`;
}

const PROBLEMS: Record<string, { fr: string; ar: string }> = {
  run_not_succeeded: { fr: "Le calcul du classement n'a pas abouti", ar: "لم ينجح حساب الترتيب" },
  entries_not_ten: { fr: "Il faut exactement dix joueurs", ar: "يجب عشرة لاعبين بالضبط" },
  entries_stale: {
    fr: "Des joueurs ne sont plus classés dans ce calcul",
    ar: "بعض اللاعبين لم يعودوا مصنّفين في هذا الحساب",
  },
  corrected_not_published: {
    fr: "L'édition corrigée n'est plus publiée",
    ar: "النسخة المصحَّحة لم تعد منشورة",
  },
  intake_missing: { fr: "Photo originale absente", ar: "الصورة الأصلية غير موجودة" },
  document_missing: { fr: "Autorisation signée absente", ar: "الإذن الموقّع غير موجود" },
  date_of_birth_unknown: { fr: "Date de naissance inconnue", ar: "تاريخ الميلاد غير معروف" },
  guardian_required: {
    fr: "Joueur mineur : signature du tuteur requise",
    ar: "لاعب قاصر: يلزم توقيع الولي",
  },
  captured_before_birth: { fr: "Date de prise de vue impossible", ar: "تاريخ التصوير غير ممكن" },
  captured_in_future: { fr: "Date de prise de vue dans le futur", ar: "تاريخ التصوير في المستقبل" },
  signed_in_future: { fr: "Date de signature dans le futur", ar: "تاريخ التوقيع في المستقبل" },
  expired: { fr: "Autorisation expirée", ar: "انتهت صلاحية الإذن" },
};

export function problemLabel(code: string, rtl: boolean): string {
  const known = PROBLEMS[code];
  return known ? known[rtl ? "ar" : "fr"] : code;
}
