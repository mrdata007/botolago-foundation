import type { EditorialStatus, NewsLanguage } from "@/backend/news/contracts";

/**
 * When the article editor asks before changing an article's status, and what
 * it says when it does.
 *
 * Publier, Dépublier, Archiver and Refuser used to run on one press. With
 * unsaved edits, every status button asked a native "Modifications non
 * enregistrées. Continuer ?", and "OK" moved the last SAVED text -- so a
 * publish shipped what was on the server, not what was on screen. Now those
 * four moves always open the kit dialog, which names the article and says
 * what happens on the site; and any move with unsaved edits opens it too,
 * offering "Enregistrer et …": save, then move only if the save succeeded.
 *
 * Wording only. Which moves exist (`NEXT_STATUSES`), what the server allows
 * and the transition call itself are unchanged.
 */

type Lang = "fr" | "ar";

/** The moves that change what readers see, or end the article's run. */
export const CONFIRMED_MOVES: readonly EditorialStatus[] = [
  "published",
  "unpublished",
  "archived",
  "rejected",
];

/** Does pressing the button for `target` open the dialog first? */
export function moveNeedsDialog(target: EditorialStatus, dirty: boolean): boolean {
  return dirty || CONFIRMED_MOVES.includes(target);
}

/** The moves whose commit button is the filled negative. */
export function isDestructiveMove(target: EditorialStatus): boolean {
  return target === "unpublished" || target === "archived" || target === "rejected";
}

const TITLES: Partial<Record<EditorialStatus, Record<Lang, string>>> = {
  published: { fr: "Publier l’article ?", ar: "نشر المقال؟" },
  unpublished: { fr: "Dépublier l’article ?", ar: "إلغاء نشر المقال؟" },
  archived: { fr: "Archiver l’article ?", ar: "أرشفة المقال؟" },
  rejected: { fr: "Refuser l’article ?", ar: "رفض المقال؟" },
};

const LANGUAGE_NAMES: Record<NewsLanguage, Record<Lang, string>> = {
  fr: { fr: "en français", ar: "باللغة الفرنسية" },
  ar: { fr: "en arabe", ar: "باللغة العربية" },
};

/** What the move does on the site, in one or two sentences. */
function consequence(
  target: EditorialStatus,
  current: EditorialStatus,
  articleLanguage: NewsLanguage,
  lang: Lang,
): string | null {
  switch (target) {
    case "published":
      return lang === "ar"
        ? `سيظهر فوراً لجميع القرّاء في قسم الأخبار ${LANGUAGE_NAMES[articleLanguage].ar}.`
        : `Il sera visible tout de suite par tous les lecteurs, dans les Actualités ${LANGUAGE_NAMES[articleLanguage].fr}.`;
    case "unpublished":
      return lang === "ar"
        ? "سيختفي من الموقع: لن تظهر صفحته ولا مكانه في قسم الأخبار. يمكنك إعادة نشره لاحقاً."
        : "Il disparaîtra du site : sa page et sa place dans les Actualités ne seront plus visibles. Vous pourrez le republier.";
    case "archived":
      if (current === "published") {
        return lang === "ar"
          ? "سيختفي من الموقع. لاستعادته، يجب إرجاعه إلى المسودة."
          : "Il disparaîtra du site. Pour le reprendre, il faudra le remettre en brouillon.";
      }
      return lang === "ar"
        ? "لن يظهر على الموقع. لاستعادته، يجب إرجاعه إلى المسودة."
        : "Il n’apparaîtra pas sur le site. Pour le reprendre, il faudra le remettre en brouillon.";
    case "rejected":
      return lang === "ar"
        ? "لن يُنشر. لاستعادته، يجب إرجاعه إلى المسودة."
        : "Il ne sera pas publié. Pour le reprendre, il faudra le remettre en brouillon.";
    default:
      return null;
  }
}

/** The commit button with unsaved edits: the save is named, then the move. */
const SAVE_AND_MOVE: Record<EditorialStatus, Record<Lang, string>> = {
  draft: { fr: "Enregistrer et remettre en brouillon", ar: "حفظ وإرجاع إلى المسودة" },
  in_review: { fr: "Enregistrer et envoyer en relecture", ar: "حفظ وإرسال للمراجعة" },
  scheduled: { fr: "Enregistrer et programmer", ar: "حفظ وجدولة" },
  published: { fr: "Enregistrer et publier", ar: "حفظ ونشر" },
  unpublished: { fr: "Enregistrer et dépublier", ar: "حفظ وإلغاء النشر" },
  archived: { fr: "Enregistrer et archiver", ar: "حفظ وأرشفة" },
  rejected: { fr: "Enregistrer et refuser", ar: "حفظ ورفض" },
};

export interface EditorialMoveCopy {
  readonly title: string;
  /** What happens on the site, or why saving comes first. */
  readonly description: string;
  /** Said under the headline when the edits on screen are saved first. */
  readonly unsavedNote: string | null;
  readonly commit: string;
  readonly abandon: string;
}

export function editorialMoveCopy({
  target,
  current,
  dirty,
  articleLanguage,
  moveLabel,
  lang,
}: {
  target: EditorialStatus;
  current: EditorialStatus;
  dirty: boolean;
  articleLanguage: NewsLanguage;
  /** The status button's own label ("Publier"), the commit without edits. */
  moveLabel: string;
  lang: Lang;
}): EditorialMoveCopy {
  const ar = lang === "ar";
  const effect = consequence(target, current, articleLanguage, lang);
  const title =
    TITLES[target]?.[lang] ?? (ar ? "تغييرات غير محفوظة" : "Modifications non enregistrées");
  const description =
    effect ??
    (ar
      ? "يسري تغيير الحالة على النص المحفوظ. ستُحفظ تغييراتك أولاً، ثم تتغيّر حالة المقال."
      : "Le changement de statut porte sur le texte enregistré. Vos modifications seront enregistrées d’abord, puis l’article changera de statut.");
  return {
    title,
    description,
    unsavedNote:
      dirty && effect
        ? ar
          ? "توجد تغييرات غير محفوظة: ستُحفظ أولاً، والنص الظاهر على الشاشة هو الذي سيُعتمد."
          : "Vous avez des modifications non enregistrées : elles seront enregistrées d’abord, et c’est le texte à l’écran qui comptera."
        : null,
    commit: dirty ? SAVE_AND_MOVE[target][lang] : moveLabel,
    abandon: ar ? "تراجع" : "Abandonner",
  };
}
