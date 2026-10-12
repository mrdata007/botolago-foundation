import type {
  QueuePosition,
  SofascoreQueueErrorCode,
  SofascoreQueueReason,
} from "@/backend/football/identity/sofascore-player-queue";

/**
 * Every string of /admin/football/sofascore-players, in French and Arabic. One
 * typed object per language, so a test can prove the two stay in step (same
 * keys, no empty value) and a new key cannot ship in only one of them.
 *
 * Names of people and clubs are DATA, shown as they are.
 */
export type Lang = "fr" | "ar";

export interface ReasonCopy {
  readonly title: string;
  readonly body: string;
}

export interface SofascoreQueueCopy {
  readonly dir: "ltr" | "rtl";
  readonly title: string;
  readonly intro: string;
  readonly readerNotice: string;
  readonly loading: string;
  readonly loadFailed: string;
  readonly retry: string;
  readonly refresh: string;
  readonly empty: string;
  readonly count: (n: number) => string;
  readonly skipped: (n: number) => string;
  readonly reasonLabel: string;
  readonly reasons: Record<SofascoreQueueReason, ReasonCopy>;
  readonly unknownReason: ReasonCopy;
  readonly facts: {
    readonly shirt: string;
    readonly noShirt: string;
    readonly position: string;
    readonly noPosition: string;
    readonly club: string;
    readonly noClub: string;
    readonly side: string;
    readonly home: string;
    readonly away: string;
    readonly noSide: string;
    readonly seen: string;
    readonly seenTimes: (n: number) => string;
    readonly firstSeen: string;
    readonly lastSeen: string;
    readonly sofascoreId: string;
  };
  readonly positions: Record<QueuePosition, string>;
  readonly candidates: {
    readonly heading: (n: number) => string;
    readonly none: string;
    readonly noneNoButton: string;
    readonly alreadyMapped: (sofascoreId: string) => string;
    readonly unnamed: string;
  };
  readonly confirm: {
    readonly open: string;
    readonly openLabel: (candidate: string) => string;
    readonly title: string;
    readonly prompt: (sofascoreName: string, appName: string) => string;
    readonly consequence: string;
    readonly yes: string;
    readonly cancel: string;
    readonly working: string;
  };
  readonly done: (sofascoreName: string, appName: string) => string;
  readonly alreadyDone: (sofascoreName: string) => string;
  readonly errors: Record<SofascoreQueueErrorCode, string>;
}

/** Isolates a name (data) so its direction cannot reorder the sentence around it. */
const iso = (value: string) => `⁨${value}⁩`;

const FR: SofascoreQueueCopy = {
  dir: "ltr",
  title: "Joueurs SofaScore à confirmer",
  intro:
    "Le rapprochement automatique n’a pas pu associer ces joueurs SofaScore à un joueur de l’application sans risque d’erreur. Pour chacun, choisissez le bon joueur BotolaGO : une confirmation, puis le match est ré-essayé automatiquement.",
  readerNotice:
    "Vous pouvez lire cette liste, mais votre rôle ne permet pas de confirmer un joueur (permission « gérer les rapprochements » requise).",
  loading: "Chargement de la liste…",
  loadFailed: "La liste n’a pas pu être chargée.",
  retry: "Réessayer",
  refresh: "Actualiser",
  empty: "Aucun joueur à confirmer pour le moment. Tout est à jour.",
  count: (n) => (n === 1 ? "1 joueur à confirmer" : `${n} joueurs à confirmer`),
  skipped: (n) =>
    n === 1
      ? "1 ligne de la liste était illisible et a été ignorée."
      : `${n} lignes de la liste étaient illisibles et ont été ignorées.`,
  reasonLabel: "Pourquoi il est en attente",
  reasons: {
    awaiting_second_match: {
      title: "Vu une seule fois : en attente d’un second match",
      body: "Un seul joueur du club porte ce numéro à ce poste, mais ce rapprochement n’a été vu que dans un match. Il sera fait automatiquement dès qu’un second match le confirme. Si ce joueur est bien le bon, vous pouvez le confirmer tout de suite ci-dessous. Le nom affiché par SofaScore n’est qu’une information : il ne décide jamais.",
    },
    ambiguous_shirt: {
      title: "Plusieurs joueurs avec ce numéro",
      body: "Plusieurs joueurs du club ont ce numéro de maillot à un poste compatible. Choisissez le bon dans la liste ci-dessous.",
    },
    no_shirt: {
      title: "Numéro de maillot absent",
      body: "SofaScore n’indique pas de numéro de maillot pour ce joueur : le rapprochement automatique (côté, numéro, poste) est impossible. Choisissez le bon joueur à la main s’il doit rapporter des points.",
    },
    shirt_conflict: {
      title: "Les observations se contredisent",
      body: "Ce joueur SofaScore a déjà été rapproché d’un autre joueur de l’application, ou un autre joueur SofaScore est rapproché du même joueur. Rien n’est lié automatiquement : vérifiez les candidats avant de confirmer.",
    },
    no_candidate: {
      title: "Aucun joueur correspondant",
      body: "Aucun joueur de ce club n’a ce numéro de maillot dans l’application. S’il n’a rien marqué, le match n’est pas mis en attente à cause de lui. Ajoutez le joueur à l’application s’il doit rapporter des points.",
    },
    ambiguous_name: {
      title: "Plusieurs joueurs possibles (ancienne règle)",
      body: "Ancien motif, posé quand le rapprochement se faisait par le nom : plusieurs joueurs de l’application portaient ce nom. Choisissez le bon dans la liste ci-dessous.",
    },
    partial_name: {
      title: "Nom seulement en partie identique (ancienne règle)",
      body: "Ancien motif, posé quand le rapprochement se faisait par le nom. Vérifiez que c’est bien la même personne avant de confirmer.",
    },
    candidate_already_mapped: {
      title: "Déjà rattaché à un autre joueur SofaScore",
      body: "Le joueur de l’application qui ressemble à celui-ci est déjà rattaché à un autre joueur SofaScore. Rien n’est changé automatiquement : vérifiez d’abord cet autre rattachement.",
    },
    inactive_mapping_exists: {
      title: "Ancien rattachement désactivé",
      body: "Un ancien rattachement désactivé existe. Une confirmation peut être refusée tant qu’il existe (conflit) ; si c’est le cas, il faut d’abord le traiter avec le personnel technique.",
    },
    position_mismatch: {
      title: "Le poste ne correspond pas",
      body: "Un joueur du club a ce numéro, mais pas à un poste compatible (par exemple gardien d’un côté, joueur de champ de l’autre). Vérifiez que c’est bien la même personne avant de confirmer.",
    },
    duplicate_name_in_squad: {
      title: "Deux joueurs du club portent ce nom (ancienne règle)",
      body: "Ancien motif, posé quand le rapprochement se faisait par le nom. Le rapprochement se fait maintenant par côté, numéro et poste : ce joueur sera réexaminé au prochain match.",
    },
  },
  unknownReason: {
    title: "Raison inconnue",
    body: "Cette raison n’est pas décrite ici. Vérifiez le joueur avec soin avant de confirmer.",
  },
  facts: {
    shirt: "Numéro",
    noShirt: "Numéro inconnu",
    position: "Poste",
    noPosition: "Poste inconnu",
    club: "Club",
    noClub: "Club inconnu",
    side: "Côté",
    home: "À domicile",
    away: "À l’extérieur",
    noSide: "Inconnu",
    seen: "Vu",
    seenTimes: (n) => (n === 1 ? "1 fois" : `${n} fois`),
    firstSeen: "Première fois",
    lastSeen: "Dernière fois",
    sofascoreId: "Identifiant SofaScore",
  },
  positions: {
    goalkeeper: "Gardien",
    defender: "Défenseur",
    midfielder: "Milieu",
    forward: "Attaquant",
  },
  candidates: {
    heading: (n) => (n === 1 ? "1 joueur BotolaGO possible" : `${n} joueurs BotolaGO possibles`),
    none: "Aucun joueur BotolaGO à proposer pour celui-ci.",
    noneNoButton:
      "Il n’y a donc rien à confirmer ici. Il n’existe pas encore de bouton pour créer un joueur : l’ajouter à l’application reste, pour l’instant, une tâche du personnel.",
    alreadyMapped: (id) =>
      `Déjà rattaché au joueur SofaScore ${iso(id)} : ce joueur ne peut pas être choisi ici.`,
    unnamed: "Joueur sans nom",
  },
  confirm: {
    open: "Confirmer ce joueur",
    openLabel: (candidate) => `Confirmer ce joueur : ${iso(candidate)}`,
    title: "Confirmer le rapprochement",
    prompt: (sofascoreName, appName) =>
      `Rattacher le joueur SofaScore « ${iso(sofascoreName)} » au joueur BotolaGO « ${iso(appName)} » ?`,
    consequence:
      "Le rapprochement est enregistré tout de suite. Le match en attente sera ré-essayé automatiquement d’ici environ 15 minutes.",
    yes: "Oui, rattacher",
    cancel: "Annuler",
    working: "Enregistrement…",
  },
  done: (sofascoreName, appName) =>
    `« ${iso(sofascoreName)} » est rattaché à « ${iso(appName)} ». Le match sera ré-essayé automatiquement d’ici environ 15 minutes.`,
  alreadyDone: (sofascoreName) =>
    `« ${iso(sofascoreName)} » était déjà rattaché à ce joueur. Rien n’a changé.`,
  errors: {
    queue_entry_not_found:
      "Ce joueur n’est plus dans la liste. Actualisez la page pour voir l’état actuel.",
    queue_entry_already_resolved:
      "Quelqu’un a déjà confirmé un autre joueur pour celui-ci. Actualisez la page pour voir l’état actuel.",
    player_not_found: "Ce joueur BotolaGO n’existe plus. Actualisez la page.",
    sofascore_mapping_conflict:
      "Rapprochement refusé : l’un de ces deux joueurs a déjà un rattachement SofaScore. Rien n’a été changé.",
    invalid_resolution: "La demande est invalide. Rien n’a été changé.",
    staff_access_denied: "Accès réservé au personnel autorisé.",
    staff_suspended: "Votre accès au personnel est suspendu.",
    permission_missing: "Votre rôle n’a pas la permission de confirmer un joueur.",
    mfa_assurance_insufficient: "Une seconde vérification (AAL2) est requise.",
    recent_auth_required: "Reconnectez-vous : une authentification récente est requise.",
    queue_unavailable:
      "Le service est indisponible pour le moment. Rien n’a été changé. Réessayez.",
  },
};

const AR: SofascoreQueueCopy = {
  dir: "rtl",
  title: "لاعبو SofaScore بانتظار التأكيد",
  intro:
    "لم تتمكن المطابقة التلقائية من ربط هؤلاء اللاعبين من SofaScore بلاعب في التطبيق دون خطر الخطأ. اختر لكل واحد منهم لاعب BotolaGO الصحيح: تأكيد واحد، ثم تُعاد محاولة المباراة تلقائيًا.",
  readerNotice:
    "يمكنك الاطلاع على هذه القائمة، لكن دورك لا يسمح بتأكيد لاعب (يلزم إذن «إدارة المطابقات»).",
  loading: "جارٍ تحميل القائمة…",
  loadFailed: "تعذّر تحميل القائمة.",
  retry: "إعادة المحاولة",
  refresh: "تحديث",
  empty: "لا يوجد لاعبون بانتظار التأكيد حاليًا. كل شيء محدَّث.",
  count: (n) => (n === 1 ? "لاعب واحد بانتظار التأكيد" : `${n} لاعبين بانتظار التأكيد`),
  skipped: (n) =>
    n === 1
      ? "تعذّرت قراءة سطر واحد من القائمة وتم تجاهله."
      : `تعذّرت قراءة ${n} أسطر من القائمة وتم تجاهلها.`,
  reasonLabel: "سبب الانتظار",
  reasons: {
    awaiting_second_match: {
      title: "ظهر مرة واحدة فقط: بانتظار مباراة ثانية",
      body: "لاعب واحد فقط في النادي يحمل هذا الرقم في هذا المركز، لكن هذه المطابقة لم تُرصد إلا في مباراة واحدة. ستتم تلقائيًا بمجرد أن تؤكدها مباراة ثانية. إن كنت متأكدًا من أنه اللاعب الصحيح فيمكنك تأكيده الآن أدناه. الاسم الذي يعرضه SofaScore للاطلاع فقط ولا يُعتمد عليه أبدًا.",
    },
    ambiguous_shirt: {
      title: "عدة لاعبين بالرقم نفسه",
      body: "عدة لاعبين في النادي يحملون رقم القميص هذا في مركز متوافق. اختر اللاعب الصحيح من القائمة أدناه.",
    },
    no_shirt: {
      title: "رقم القميص غير متوفر",
      body: "لا يقدّم SofaScore رقم قميص لهذا اللاعب، لذا تستحيل المطابقة التلقائية (الجهة والرقم والمركز). اختر اللاعب الصحيح يدويًا إذا كان يجب أن يكسب نقاطًا.",
    },
    shirt_conflict: {
      title: "الملاحظات متناقضة",
      body: "سبق أن رُبط لاعب SofaScore هذا بلاعب آخر في التطبيق، أو أن لاعب SofaScore آخر مرتبط باللاعب نفسه. لا يتم أي ربط تلقائي: تحقق من المرشحين قبل التأكيد.",
    },
    no_candidate: {
      title: "لا يوجد لاعب مطابق",
      body: "لا يوجد في التطبيق لاعب في هذا النادي يحمل رقم القميص هذا. إذا لم يسجّل أي نقطة فلن تُعلَّق المباراة بسببه. أضف اللاعب إلى التطبيق إذا كان يجب أن يكسب نقاطًا.",
    },
    ambiguous_name: {
      title: "عدة لاعبين محتملين (قاعدة قديمة)",
      body: "سبب قديم وُضع حين كانت المطابقة بالاسم: عدة لاعبين في التطبيق يحملون هذا الاسم. اختر اللاعب الصحيح من القائمة أدناه.",
    },
    partial_name: {
      title: "الاسم متطابق جزئيًا فقط (قاعدة قديمة)",
      body: "سبب قديم وُضع حين كانت المطابقة بالاسم. تأكد أنه الشخص نفسه قبل التأكيد.",
    },
    candidate_already_mapped: {
      title: "مرتبط بلاعب آخر من SofaScore",
      body: "لاعب التطبيق الذي يشبه هذا اللاعب مرتبط أصلًا بلاعب آخر من SofaScore. لا يتغير شيء تلقائيًا: تحقق أولًا من هذا الربط الآخر.",
    },
    inactive_mapping_exists: {
      title: "ربط قديم معطَّل",
      body: "يوجد ربط قديم معطَّل. قد يُرفض التأكيد ما دام موجودًا (تعارض)، وفي هذه الحالة يجب معالجته أولًا مع الفريق التقني.",
    },
    position_mismatch: {
      title: "المركز غير متطابق",
      body: "يوجد في النادي لاعب بهذا الرقم لكن في مركز غير متوافق (مثلًا حارس مرمى من جهة ولاعب ميدان من الأخرى). تأكد أنه الشخص نفسه قبل التأكيد.",
    },
    duplicate_name_in_squad: {
      title: "لاعبان في النادي بالاسم نفسه (قاعدة قديمة)",
      body: "سبب قديم وُضع حين كانت المطابقة بالاسم. أصبحت المطابقة الآن بالجهة والرقم والمركز: ستُعاد دراسة هذا اللاعب في المباراة القادمة.",
    },
  },
  unknownReason: {
    title: "سبب غير معروف",
    body: "هذا السبب غير موصوف هنا. تحقق من اللاعب بعناية قبل التأكيد.",
  },
  facts: {
    shirt: "الرقم",
    noShirt: "الرقم غير معروف",
    position: "المركز",
    noPosition: "المركز غير معروف",
    club: "النادي",
    noClub: "النادي غير معروف",
    side: "الجهة",
    home: "على أرضه",
    away: "خارج أرضه",
    noSide: "غير معروف",
    seen: "ظهر",
    seenTimes: (n) => (n === 1 ? "مرة واحدة" : `${n} مرات`),
    firstSeen: "أول ظهور",
    lastSeen: "آخر ظهور",
    sofascoreId: "معرّف SofaScore",
  },
  positions: {
    goalkeeper: "حارس مرمى",
    defender: "مدافع",
    midfielder: "لاعب وسط",
    forward: "مهاجم",
  },
  candidates: {
    heading: (n) => (n === 1 ? "لاعب BotolaGO محتمل واحد" : `${n} لاعبين محتملين من BotolaGO`),
    none: "لا يوجد لاعب من BotolaGO لاقتراحه لهذا اللاعب.",
    noneNoButton:
      "لذلك لا يوجد ما يمكن تأكيده هنا. لا يوجد بعد زر لإنشاء لاعب: إضافته إلى التطبيق ما زالت مهمة يدوية على عاتق الفريق حاليًا.",
    alreadyMapped: (id) => `مرتبط أصلًا بلاعب SofaScore ${iso(id)}: لا يمكن اختيار هذا اللاعب هنا.`,
    unnamed: "لاعب بلا اسم",
  },
  confirm: {
    open: "تأكيد هذا اللاعب",
    openLabel: (candidate) => `تأكيد هذا اللاعب: ${iso(candidate)}`,
    title: "تأكيد المطابقة",
    prompt: (sofascoreName, appName) =>
      `ربط لاعب SofaScore «${iso(sofascoreName)}» بلاعب BotolaGO «${iso(appName)}»؟`,
    consequence:
      "تُسجَّل المطابقة فورًا، وتُعاد محاولة المباراة المعلّقة تلقائيًا خلال نحو 15 دقيقة.",
    yes: "نعم، اربطه",
    cancel: "إلغاء",
    working: "جارٍ الحفظ…",
  },
  done: (sofascoreName, appName) =>
    `تم ربط «${iso(sofascoreName)}» بـ«${iso(appName)}». ستُعاد محاولة المباراة تلقائيًا خلال نحو 15 دقيقة.`,
  alreadyDone: (sofascoreName) =>
    `«${iso(sofascoreName)}» كان مرتبطًا أصلًا بهذا اللاعب. لم يتغير شيء.`,
  errors: {
    queue_entry_not_found: "هذا اللاعب لم يعد في القائمة. حدّث الصفحة لرؤية الحالة الحالية.",
    queue_entry_already_resolved:
      "قام شخص آخر بتأكيد لاعب مختلف لهذا اللاعب. حدّث الصفحة لرؤية الحالة الحالية.",
    player_not_found: "لاعب BotolaGO هذا لم يعد موجودًا. حدّث الصفحة.",
    sofascore_mapping_conflict:
      "رُفضت المطابقة: أحد هذين اللاعبين مرتبط أصلًا بلاعب من SofaScore. لم يتغير شيء.",
    invalid_resolution: "الطلب غير صالح. لم يتغير شيء.",
    staff_access_denied: "الوصول مقتصر على الطاقم المخوَّل.",
    staff_suspended: "وصولك إلى الإدارة معلَّق.",
    permission_missing: "دورك لا يملك إذن تأكيد لاعب.",
    mfa_assurance_insufficient: "يلزم تحقق ثانٍ (AAL2).",
    recent_auth_required: "أعد تسجيل الدخول: يلزم توثيق حديث.",
    queue_unavailable: "الخدمة غير متاحة حاليًا. لم يتغير شيء. أعد المحاولة.",
  },
};

export const SOFASCORE_QUEUE_COPY: Record<Lang, SofascoreQueueCopy> = { fr: FR, ar: AR };

export function getSofascoreQueueCopy(lang: Lang): SofascoreQueueCopy {
  return SOFASCORE_QUEUE_COPY[lang];
}

/** The sentence for a refusal code, falling back to the unavailable one. */
export function sofascoreQueueErrorMessage(copy: SofascoreQueueCopy, code: string): string {
  return (copy.errors as Record<string, string>)[code] ?? copy.errors.queue_unavailable;
}

export function reasonCopy(copy: SofascoreQueueCopy, reason: string): ReasonCopy {
  return (copy.reasons as Record<string, ReasonCopy>)[reason] ?? copy.unknownReason;
}
