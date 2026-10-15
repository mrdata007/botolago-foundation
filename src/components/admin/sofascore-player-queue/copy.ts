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
  /** "Link as second ID": the player keeps his main SofaScore id, this one becomes a second one. */
  readonly alias: {
    readonly open: string;
    readonly openLabel: (candidate: string) => string;
    readonly title: string;
    readonly prompt: (sofascoreName: string, appName: string) => string;
    readonly consequence: (mainId: string) => string;
    readonly yes: string;
    readonly working: string;
  };
  readonly more: {
    readonly heading: string;
    readonly cannotCreate: string;
  };
  /** Find any catalog player: the club squad, or a name search. */
  readonly search: {
    readonly open: string;
    readonly close: string;
    readonly title: string;
    readonly label: string;
    readonly hint: string;
    readonly submit: string;
    readonly showSquad: string;
    readonly loading: string;
    readonly squadHeading: (n: number) => string;
    readonly resultsHeading: (n: number) => string;
    readonly empty: string;
    readonly tooShort: string;
    readonly inClub: string;
    readonly noClub: string;
    readonly noLink: string;
    readonly mainId: (id: string) => string;
    readonly secondIds: (ids: string) => string;
    readonly inactive: string;
    readonly link: string;
    readonly linkLabel: (name: string) => string;
    readonly alias: string;
    readonly aliasLabel: (name: string) => string;
  };
  /** Create the player from SofaScore. */
  readonly create: {
    readonly open: string;
    readonly title: string;
    readonly intro: string;
    readonly name: string;
    readonly shirt: string;
    readonly shirtHint: string;
    readonly position: string;
    readonly club: string;
    readonly consequence: string;
    readonly yes: string;
    readonly working: string;
    readonly invalidName: string;
    readonly invalidShirt: string;
  };
  readonly done: (sofascoreName: string, appName: string) => string;
  readonly doneAlias: (sofascoreName: string, appName: string) => string;
  readonly doneCreate: (sofascoreName: string) => string;
  readonly alreadyDone: (sofascoreName: string) => string;
  readonly errors: Record<SofascoreQueueErrorCode, string>;
}

/** Isolates a name (data) so its direction cannot reorder the sentence around it. */
const iso = (value: string) => `⁨${value}⁩`;

const FR: SofascoreQueueCopy = {
  dir: "ltr",
  title: "Joueurs SofaScore à confirmer",
  intro:
    "Le rapprochement automatique n’a pas pu associer ces joueurs SofaScore à un joueur de l’application sans risque d’erreur. Pour chacun, choisissez le bon joueur BotolaGO : une confirmation, puis le match est réessayé automatiquement.",
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
    ambiguous_shirt: {
      title: "Plusieurs joueurs avec ce numéro",
      body: "Plusieurs joueurs du club ont ce numéro de maillot à un poste compatible. Choisissez le bon dans la liste ci-dessous.",
    },
    weak_match: {
      title: "Un candidat probable, poste inconnu",
      body: "Un seul joueur du club correspond (même club, même numéro), mais le poste de l’un des deux est inconnu : le rapprochement n’a pas été fait automatiquement. Si c’est bien le bon joueur, confirmez-le.",
    },
    no_shirt_on_file: {
      title: "Un joueur du club n’a pas de numéro enregistré",
      body: "Aucun joueur du club n’a ce numéro, mais un joueur du club n’a aucun numéro enregistré et pourrait être celui-ci. Rien n’est créé ni lié automatiquement : confirmez le bon joueur s’il est dans la liste.",
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
      body: "Le joueur n’a pas pu être créé automatiquement (poste inconnu, nom trop court, saison passée ou catalogue momentanément occupé) et personne dans ce club ne porte ce numéro. S’il n’a rien marqué, le match n’est pas mis en attente à cause de lui ; la création est réessayée au prochain passage.",
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
      "Cherchez-le dans le catalogue ci-dessous, ou créez-le à partir de SofaScore s’il n’y est pas.",
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
      "Le rapprochement est enregistré tout de suite. Le match en attente sera réessayé automatiquement d’ici environ 15 minutes.",
    yes: "Oui, rattacher",
    cancel: "Annuler",
    working: "Enregistrement…",
  },
  alias: {
    open: "Rattacher comme second identifiant",
    openLabel: (candidate) => `Rattacher comme second identifiant : ${iso(candidate)}`,
    title: "Second identifiant SofaScore",
    prompt: (sofascoreName, appName) =>
      `SofaScore a deux profils pour cette personne. Rattacher « ${iso(sofascoreName)} » à « ${iso(appName)} » comme second identifiant ?`,
    consequence: (mainId) =>
      `Le joueur garde son identifiant principal ${iso(mainId)} (nom, numéro et photo en viennent toujours). Les matchs où SofaScore utilise ce second identifiant lui rapportent ses points ; le match en attente est réessayé d’ici environ 15 minutes.`,
    yes: "Oui, rattacher comme second identifiant",
    working: "Enregistrement…",
  },
  more: {
    heading: "Autres actions",
    cannotCreate:
      "La création n’est pas proposée : il faut un club, un poste et un match de la saison en cours.",
  },
  search: {
    open: "Chercher un autre joueur",
    close: "Fermer la recherche",
    title: "Chercher dans le catalogue",
    label: "Nom du joueur",
    hint: "Laissez vide pour voir l’effectif du club ; deux lettres au moins pour chercher dans tout le catalogue.",
    submit: "Chercher",
    showSquad: "Effectif du club",
    loading: "Recherche…",
    squadHeading: (n) =>
      n === 1 ? "1 joueur dans l’effectif du club" : `${n} joueurs dans l’effectif du club`,
    resultsHeading: (n) => (n === 1 ? "1 joueur trouvé" : `${n} joueurs trouvés`),
    empty: "Aucun joueur trouvé.",
    tooShort: "Tapez au moins deux lettres, ou laissez vide pour l’effectif du club.",
    inClub: "Dans ce club",
    noClub: "Sans club cette saison",
    noLink: "Pas encore d’identifiant SofaScore",
    mainId: (id) => `Identifiant SofaScore ${iso(id)}`,
    secondIds: (ids) => `Second identifiant : ${iso(ids)}`,
    inactive: "Son lien SofaScore est désactivé : à traiter par le personnel technique.",
    link: "Rattacher",
    linkLabel: (name) => `Rattacher à ${iso(name)}`,
    alias: "Rattacher comme second identifiant",
    aliasLabel: (name) => `Rattacher comme second identifiant de ${iso(name)}`,
  },
  create: {
    open: "Créer ce joueur",
    title: "Créer le joueur à partir de SofaScore",
    intro:
      "Vérifiez les informations venues de SofaScore. Vous pouvez corriger le nom, le numéro et le poste ; le club est celui du match.",
    name: "Nom",
    shirt: "Numéro",
    shirtHint: "Laissé vide si un autre joueur actif du club le porte déjà.",
    position: "Poste",
    club: "Club",
    consequence:
      "Le joueur est ajouté au club pour la saison en cours, au marché Fantasy au prix de départ, et rattaché à cet identifiant SofaScore. Le match en attente est réessayé d’ici environ 15 minutes.",
    yes: "Créer et rattacher",
    working: "Création…",
    invalidName: "Le nom doit compter entre 2 et 200 caractères.",
    invalidShirt: "Le numéro doit être un nombre entre 0 et 99.",
  },
  done: (sofascoreName, appName) =>
    `« ${iso(sofascoreName)} » est rattaché à « ${iso(appName)} ». Le match sera réessayé automatiquement d’ici environ 15 minutes.`,
  doneAlias: (sofascoreName, appName) =>
    `« ${iso(sofascoreName)} » est maintenant un second identifiant de « ${iso(appName)} ». Le match sera réessayé automatiquement d’ici environ 15 minutes.`,
  doneCreate: (sofascoreName) =>
    `« ${iso(sofascoreName)} » est créé et rattaché. Le match sera réessayé automatiquement d’ici environ 15 minutes.`,
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
    sofascore_alias_needs_primary:
      "Ce joueur n’a pas d’identifiant SofaScore principal actif : rattachez-le normalement. Rien n’a été changé.",
    sofascore_alias_conflict:
      "Cet identifiant SofaScore est déjà utilisé par un autre lien. Rien n’a été changé.",
    sofascore_create_no_club:
      "Impossible de créer ce joueur : son club est inconnu. Rien n’a été changé.",
    sofascore_create_season_not_current:
      "Impossible de créer ce joueur : il n’a pas été vu dans un match de la saison en cours. Rien n’a été changé.",
    sofascore_create_position_required:
      "Choisissez un poste pour créer ce joueur. Rien n’a été changé.",
    sofascore_create_name_invalid:
      "Le nom doit compter entre 2 et 200 caractères. Rien n’a été changé.",
    sofascore_create_shirt_invalid: "Le numéro doit être entre 0 et 99. Rien n’a été changé.",
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
    ambiguous_shirt: {
      title: "عدة لاعبين بالرقم نفسه",
      body: "عدة لاعبين في النادي يحملون رقم القميص هذا في مركز متوافق. اختر اللاعب الصحيح من القائمة أدناه.",
    },
    weak_match: {
      title: "مرشح محتمل، المركز غير معروف",
      body: "لاعب واحد فقط في النادي يطابق (النادي والرقم نفسهما) لكن مركز أحدهما غير معروف، لذا لم تتم المطابقة تلقائيًا. إن كان هو اللاعب الصحيح فأكّده.",
    },
    no_shirt_on_file: {
      title: "لاعب في النادي بلا رقم مسجَّل",
      body: "لا يوجد في النادي لاعب بهذا الرقم، لكن يوجد لاعب في النادي بلا رقم مسجَّل وقد يكون هو. لا يتم إنشاء أو ربط أي شيء تلقائيًا: أكّد اللاعب الصحيح إن كان في القائمة.",
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
      body: "تعذّر إنشاء اللاعب تلقائيًا (مركز غير معروف أو اسم قصير جدًا أو موسم سابق أو الفهرس مشغول مؤقتًا) ولا أحد في هذا النادي يحمل هذا الرقم. إذا لم يسجّل أي نقطة فلن تُعلَّق المباراة بسببه، وستُعاد محاولة الإنشاء في المرة القادمة.",
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
    noneNoButton: "ابحث عنه في الفهرس أدناه، أو أنشئه انطلاقًا من SofaScore إن لم يكن موجودًا.",
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
  alias: {
    open: "ربط كمعرّف ثانٍ",
    openLabel: (candidate) => `ربط كمعرّف ثانٍ: ${iso(candidate)}`,
    title: "معرّف SofaScore ثانٍ",
    prompt: (sofascoreName, appName) =>
      `لدى SofaScore ملفّان لهذا الشخص. ربط «${iso(sofascoreName)}» بـ«${iso(appName)}» كمعرّف ثانٍ؟`,
    consequence: (mainId) =>
      `يحتفظ اللاعب بمعرّفه الرئيسي ${iso(mainId)} (ومنه يبقى الاسم والرقم والصورة). المباريات التي يستعمل فيها SofaScore هذا المعرّف الثاني تُحتسب نقاطها له، وتُعاد محاولة المباراة المعلّقة خلال نحو 15 دقيقة.`,
    yes: "نعم، اربطه كمعرّف ثانٍ",
    working: "جارٍ الحفظ…",
  },
  more: {
    heading: "إجراءات أخرى",
    cannotCreate: "الإنشاء غير متاح: يلزم نادٍ ومركز ومباراة من الموسم الحالي.",
  },
  search: {
    open: "البحث عن لاعب آخر",
    close: "إغلاق البحث",
    title: "البحث في الفهرس",
    label: "اسم اللاعب",
    hint: "اتركه فارغًا لعرض تشكيلة النادي؛ حرفان على الأقل للبحث في الفهرس كله.",
    submit: "بحث",
    showSquad: "تشكيلة النادي",
    loading: "جارٍ البحث…",
    squadHeading: (n) => (n === 1 ? "لاعب واحد في تشكيلة النادي" : `${n} لاعبين في تشكيلة النادي`),
    resultsHeading: (n) => (n === 1 ? "تم العثور على لاعب واحد" : `تم العثور على ${n} لاعبين`),
    empty: "لم يُعثر على أي لاعب.",
    tooShort: "اكتب حرفين على الأقل، أو اترك الحقل فارغًا لعرض تشكيلة النادي.",
    inClub: "في هذا النادي",
    noClub: "بلا نادٍ هذا الموسم",
    noLink: "لا يملك بعدُ معرّف SofaScore",
    mainId: (id) => `معرّف SofaScore ${iso(id)}`,
    secondIds: (ids) => `معرّف ثانٍ: ${iso(ids)}`,
    inactive: "ربطه بـSofaScore معطَّل: يعالجه الفريق التقني.",
    link: "ربط",
    linkLabel: (name) => `ربط بـ${iso(name)}`,
    alias: "ربط كمعرّف ثانٍ",
    aliasLabel: (name) => `ربط كمعرّف ثانٍ لـ${iso(name)}`,
  },
  create: {
    open: "إنشاء هذا اللاعب",
    title: "إنشاء اللاعب انطلاقًا من SofaScore",
    intro:
      "تحقّق من المعلومات الواردة من SofaScore. يمكنك تصحيح الاسم والرقم والمركز؛ أما النادي فهو نادي المباراة.",
    name: "الاسم",
    shirt: "الرقم",
    shirtHint: "يُترك فارغًا إن كان لاعب نشط آخر في النادي يحمله.",
    position: "المركز",
    club: "النادي",
    consequence:
      "يُضاف اللاعب إلى النادي للموسم الحالي، وإلى سوق Fantasy بسعر البداية، ويُربط بمعرّف SofaScore هذا. وتُعاد محاولة المباراة المعلّقة خلال نحو 15 دقيقة.",
    yes: "إنشاء وربط",
    working: "جارٍ الإنشاء…",
    invalidName: "يجب أن يتراوح طول الاسم بين حرفين و200 حرف.",
    invalidShirt: "يجب أن يكون الرقم بين 0 و99.",
  },
  done: (sofascoreName, appName) =>
    `تم ربط «${iso(sofascoreName)}» بـ«${iso(appName)}». ستُعاد محاولة المباراة تلقائيًا خلال نحو 15 دقيقة.`,
  doneAlias: (sofascoreName, appName) =>
    `أصبح «${iso(sofascoreName)}» معرّفًا ثانيًا لـ«${iso(appName)}». ستُعاد محاولة المباراة تلقائيًا خلال نحو 15 دقيقة.`,
  doneCreate: (sofascoreName) =>
    `تم إنشاء «${iso(sofascoreName)}» وربطه. ستُعاد محاولة المباراة تلقائيًا خلال نحو 15 دقيقة.`,
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
    sofascore_alias_needs_primary:
      "لا يملك هذا اللاعب معرّف SofaScore رئيسيًا نشطًا: اربطه بالطريقة العادية. لم يتغير شيء.",
    sofascore_alias_conflict: "معرّف SofaScore هذا مستعمل في ربط آخر. لم يتغير شيء.",
    sofascore_create_no_club: "تعذّر إنشاء هذا اللاعب: ناديه غير معروف. لم يتغير شيء.",
    sofascore_create_season_not_current:
      "تعذّر إنشاء هذا اللاعب: لم يظهر في مباراة من الموسم الحالي. لم يتغير شيء.",
    sofascore_create_position_required: "اختر مركزًا لإنشاء هذا اللاعب. لم يتغير شيء.",
    sofascore_create_name_invalid: "يجب أن يتراوح طول الاسم بين حرفين و200 حرف. لم يتغير شيء.",
    sofascore_create_shirt_invalid: "يجب أن يكون الرقم بين 0 و99. لم يتغير شيء.",
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
