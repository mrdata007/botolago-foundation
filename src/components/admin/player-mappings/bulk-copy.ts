import {
  MAX_PROPOSE_PER_CALL,
  type BulkRowState,
} from "@/backend/football/identity/bulk-mapping/contract";
import type { FlashscoreEvidenceClass } from "@/backend/football/identity/bulk-mapping/flashscore-contract";
import type { Lang } from "./copy";

/** The words of the Flashscore evidence batch. Plain and short; names are never evidence. */
export interface FlashscoreBulkCopy {
  readonly open: (count: number) => string;
  readonly title: string;
  readonly intro: string;
  readonly rules: readonly string[];
  readonly manifestOk: string;
  readonly population: (total: number, f1: number, f2: number, heldBack: number) => string;
  readonly heldBack: {
    readonly heading: (heldBack: number, reviewSet: number) => string;
    readonly note: string;
    readonly listHeading: string;
  };
  readonly classShort: Record<FlashscoreEvidenceClass, string>;
  readonly table: {
    readonly providerId: string;
    readonly supportingId: string;
    readonly evidenceClass: string;
    readonly evidence: string;
  };
  readonly evidence: {
    readonly shirtAgrees: string;
    readonly shirtNoAgreement: string;
    readonly events: (n: number) => string;
    readonly birthDateAgrees: string;
  };
  readonly proposeCalls: (calls: number) => string;
}

export interface BulkCopy {
  readonly open: (count: number) => string;
  readonly title: string;
  readonly intro: string;
  readonly back: string;
  readonly manifestHeading: string;
  readonly manifestHash: string;
  readonly manifestOk: string;
  readonly manifestBad: string;
  readonly manifestChecking: string;
  readonly population: (total: number, a: number, b: number) => string;
  readonly rules: readonly string[];
  readonly flashscoreExcluded: string;
  readonly noAutoNext: string;
  readonly states: Record<BulkRowState, string>;
  readonly table: {
    readonly select: string;
    readonly provider: string;
    readonly providerId: string;
    readonly club: string;
    readonly position: string;
    readonly dob: string;
    readonly shirt: string;
    readonly sportsMonks: string;
    readonly tier: string;
    readonly target: string;
    readonly state: string;
    readonly yes: string;
    readonly match: string;
    readonly noSignal: string;
    readonly displayOnly: string;
    readonly loadingName: string;
    readonly selectAll: string;
    readonly selectNone: string;
    readonly selected: (n: number, total: number) => string;
    readonly deselectNote: string;
  };
  readonly phases: Record<
    "propose" | "approve" | "execute",
    {
      readonly heading: string;
      readonly what: string;
      readonly button: string;
      readonly running: string;
      readonly typeLabel: string;
      readonly typeHint: (phrase: string) => string;
      readonly ready: (n: number) => string;
    }
  >;
  readonly selfApprovalOff: string;
  readonly executeSummary: {
    readonly heading: string;
    readonly approved: string;
    readonly skipped: string;
    readonly heldStale: string;
    readonly hash: string;
    readonly expected: (mapped: number, after: number) => string;
  };
  readonly result: {
    readonly heading: string;
    readonly acted: (n: number) => string;
    readonly aborted: (code: string) => string;
    readonly refresh: string;
  };
  readonly tierLabel: Record<"A" | "B", string>;
  readonly flashscore: FlashscoreBulkCopy;
}

const frStates: Record<BulkRowState, string> = {
  NOT_PROPOSED: "Pas encore proposé",
  PROPOSED: "Proposé",
  APPROVED: "Approuvé",
  EXECUTED: "Exécuté",
  STALE_EVIDENCE: "Preuves périmées",
  IDENTITY_CONFLICT: "Conflit d'identité",
  TARGET_ALREADY_MAPPED: "Joueur cible déjà associé",
  PROVIDER_ID_ALREADY_MAPPED: "Identifiant fournisseur déjà associé",
  APPROVAL_EXPIRED: "Approbation expirée",
  HELD: "En attente (retenu)",
  ERROR: "Erreur",
};

const frFlashscore: FlashscoreBulkCopy = {
  open: (count) => `Lot Flashscore (${count})`,
  title: "Lot contrôlé d'identités Flashscore",
  intro:
    "Un seul lot, figé et vérifié, d'identifiants Flashscore. Chaque identifiant s'appuie sur un joueur Sofascore déjà associé et révisé, et sur des matchs terminés. Chaque ligne garde sa propre proposition, sa propre empreinte, sa propre approbation et son propre événement d'audit. Rien n'est associé avant l'action EXÉCUTER.",
  rules: [
    "Le joueur Sofascore lié doit déjà avoir une association active et révisée vers le même joueur de l'app.",
    "Classe F1 : mêmes événements de match alignés (but, passe, carton, remplacement), avec un maillot concordant ou au moins deux événements.",
    "Classe F2 : même maillot et dates de naissance concordantes entre les deux fournisseurs. C'est un recoupement, pas une preuve.",
    "Un nom ne décide rien : il n'est affiché qu'à titre indicatif.",
  ],
  manifestOk: "Manifeste vérifié : empreintes, ordre, aucun doublon, aucun nom ni date.",
  population: (total, f1, f2, heldBack) =>
    `${total} lignes · F1 : ${f1} · F2 : ${f2} · retenues : ${heldBack}`,
  heldBack: {
    heading: (heldBack, reviewSet) =>
      `${heldBack} ligne(s) sur ${reviewSet} du lot revu sont RETENUES : elles ne font pas partie de ce lot.`,
    note: "Elles ne seront ni proposées, ni approuvées, ni exécutées ici. Leur sort se règle à part.",
    listHeading: "Voir les lignes retenues",
  },
  classShort: {
    F1_REVIEWED_SOFASCORE_EVENTS: "F1 · événements",
    F2_REVIEWED_SOFASCORE_SHIRT_DOB: "F2 · maillot + naissance",
  },
  table: {
    providerId: "ID Flashscore",
    supportingId: "ID Sofascore lié",
    evidenceClass: "Classe",
    evidence: "Preuves",
  },
  evidence: {
    shirtAgrees: "Maillot concordant",
    shirtNoAgreement: "Maillot sans accord",
    events: (n) => `${n} événement(s) aligné(s)`,
    birthDateAgrees: "Dates de naissance concordantes",
  },
  proposeCalls: (calls) =>
    `La sélection actuelle demande ${calls} appel(s) de proposition (une raison par classe, ${MAX_PROPOSE_PER_CALL} lignes au plus par appel).`,
};

const fr: BulkCopy = {
  open: (count) => `Lot contrôlé (${count})`,
  title: "Lot contrôlé d'associations de joueurs",
  intro:
    "Un seul lot, figé et vérifié, d'identités Sofascore. Chaque ligne garde sa propre proposition, sa propre empreinte, sa propre approbation et son propre événement d'audit. Rien n'est associé avant l'action EXÉCUTER.",
  back: "Retour à la file",
  manifestHeading: "Manifeste figé",
  manifestHash: "SHA-256 du manifeste",
  manifestOk: "Manifeste vérifié : empreinte, ordre, aucun doublon, aucun nom ni date.",
  manifestBad: "Manifeste refusé : les actions sont désactivées.",
  manifestChecking: "Vérification du manifeste…",
  population: (total, a, b) => `${total} lignes · niveau A : ${a} · niveau B : ${b}`,
  rules: [
    "Date de naissance exacte et même club, poste compatible, un seul joueur cible possible.",
    "Niveau A : numéro de maillot concordant. Niveau B : maillot sans signal, jamais en conflit.",
    "Les deux niveaux exigent l'identité SportsMonks active sur le même joueur.",
    "Un nom ne décide rien : il n'est affiché qu'à titre indicatif.",
  ],
  flashscoreExcluded:
    "Flashscore est exclu de ce lot. Une ligne qui ne satisfait plus le contrat est ignorée, jamais remplacée.",
  noAutoNext:
    "Trois actions séparées : proposer, approuver, exécuter. Aucune ne déclenche la suivante.",
  states: frStates,
  table: {
    select: "Inclure",
    provider: "Joueur (fournisseur)",
    providerId: "ID Sofascore",
    club: "Club",
    position: "Poste",
    dob: "Date de naissance",
    shirt: "Maillot",
    sportsMonks: "SportsMonks",
    tier: "Niveau",
    target: "Joueur cible (app)",
    state: "État",
    yes: "Oui",
    match: "Concorde",
    noSignal: "Sans signal",
    displayOnly: "Affichage seulement",
    loadingName: "…",
    selectAll: "Tout sélectionner",
    selectNone: "Tout désélectionner",
    selected: (n, total) => `${n} sélectionnées sur ${total}`,
    deselectNote:
      "Décocher une ligne la retire seulement de ce lot : le candidat n'est ni ignoré ni modifié.",
  },
  phases: {
    propose: {
      heading: "1. Proposer le lot révisé",
      what: `Crée une proposition par ligne sélectionnée et encore non proposée, en appels de ${MAX_PROPOSE_PER_CALL} au plus. N'approuve rien, n'associe rien.`,
      button: "PROPOSER LE LOT RÉVISÉ",
      running: "Proposition en cours…",
      typeLabel: "Saisissez la phrase pour confirmer",
      typeHint: (phrase) => `Saisissez exactement : ${phrase}`,
      ready: (n) => `${n} ligne(s) prêtes à être proposées`,
    },
    approve: {
      heading: "2. Approuver le lot révisé",
      what: "Approuve une proposition à la fois, avec la même session, la même empreinte et son propre motif. N'exécute rien.",
      button: "APPROUVER LE LOT RÉVISÉ",
      running: "Approbation en cours…",
      typeLabel: "Saisissez la phrase pour confirmer",
      typeHint: (phrase) => `Saisissez exactement : ${phrase}`,
      ready: (n) => `${n} proposition(s) prêtes à être approuvées`,
    },
    execute: {
      heading: "3. Exécuter le lot approuvé",
      what: "Exécute une proposition approuvée à la fois, chacune dans sa propre transaction gardée. Un échec n'annule aucune autre ligne et n'est jamais relancé.",
      button: "EXÉCUTER LE LOT APPROUVÉ",
      running: "Exécution en cours…",
      typeLabel: "Saisissez la phrase pour confirmer",
      typeHint: (phrase) => `Saisissez exactement : ${phrase}`,
      ready: (n) => `${n} proposition(s) approuvées prêtes à être exécutées`,
    },
  },
  selfApprovalOff:
    "L'approbation par le même opérateur n'est pas autorisée par le serveur : l'approbation du lot est désactivée.",
  executeSummary: {
    heading: "Avant d'exécuter",
    approved: "Propositions approuvées",
    skipped: "Lignes ignorées / non proposées",
    heldStale: "Retenues, périmées ou en conflit",
    hash: "Manifeste",
    expected: (mapped, after) =>
      `Candidats associés : ${mapped} aujourd'hui, ${after} si toutes les propositions approuvées sont exécutées.`,
  },
  result: {
    heading: "Dernière action",
    acted: (n) => `${n} ligne(s) traitées.`,
    aborted: (code) =>
      `Arrêt immédiat : la session a été refusée (${code}). Rien d'autre n'a été tenté.`,
    refresh: "Actualiser depuis la base",
  },
  tierLabel: { A: "A (maillot + SportsMonks)", B: "B (SportsMonks, maillot sans signal)" },
  flashscore: frFlashscore,
};

const ar: BulkCopy = {
  ...fr,
  open: (count) => `دفعة مضبوطة (${count})`,
  title: "دفعة مضبوطة لربط اللاعبين",
  intro:
    "دفعة واحدة مجمّدة ومتحقَّق منها لهويات Sofascore. لكل سطر اقتراحه وبصمته وموافقته وحدث تدقيقه. لا يُربط شيء قبل إجراء التنفيذ.",
  back: "العودة إلى القائمة",
  manifestHeading: "البيان المجمّد",
  manifestHash: "SHA-256 للبيان",
  manifestOk: "تم التحقق من البيان: البصمة والترتيب وعدم التكرار وخلوه من الأسماء والتواريخ.",
  manifestBad: "رُفض البيان: الإجراءات معطّلة.",
  manifestChecking: "جارٍ التحقق من البيان…",
  population: (total, a, b) => `${total} سطرًا · المستوى A: ${a} · المستوى B: ${b}`,
  flashscoreExcluded:
    "Flashscore مستبعد من هذه الدفعة. السطر الذي لم يعد يستوفي العقد يُتخطّى ولا يُستبدل أبدًا.",
  noAutoNext: "ثلاثة إجراءات منفصلة: اقتراح، موافقة، تنفيذ. لا يُطلق أي منها التالي.",
  states: {
    NOT_PROPOSED: "لم يُقترح بعد",
    PROPOSED: "مُقترح",
    APPROVED: "موافَق عليه",
    EXECUTED: "نُفّذ",
    STALE_EVIDENCE: "أدلة قديمة",
    IDENTITY_CONFLICT: "تعارض هوية",
    TARGET_ALREADY_MAPPED: "اللاعب الهدف مربوط مسبقًا",
    PROVIDER_ID_ALREADY_MAPPED: "معرّف المزوّد مربوط مسبقًا",
    APPROVAL_EXPIRED: "انتهت الموافقة",
    HELD: "معلّق",
    ERROR: "خطأ",
  },
  table: {
    ...fr.table,
    select: "تضمين",
    provider: "اللاعب (المزوّد)",
    club: "النادي",
    position: "المركز",
    dob: "تاريخ الميلاد",
    shirt: "القميص",
    tier: "المستوى",
    target: "اللاعب الهدف (التطبيق)",
    state: "الحالة",
    yes: "نعم",
    match: "متطابق",
    noSignal: "بلا إشارة",
    displayOnly: "للعرض فقط",
    selectAll: "تحديد الكل",
    selectNone: "إلغاء تحديد الكل",
    selected: (n, total) => `${n} محدّدة من ${total}`,
    deselectNote: "إلغاء تحديد سطر يزيله من هذه الدفعة فقط: لا يُتجاهل المرشّح ولا يتغيّر.",
  },
  phases: {
    propose: {
      ...fr.phases.propose,
      heading: "١. اقتراح الدفعة المراجَعة",
      button: "اقتراح الدفعة المراجَعة",
      what: `ينشئ اقتراحًا لكل سطر محدّد لم يُقترح بعد، بحد أقصى ${MAX_PROPOSE_PER_CALL} في الاستدعاء الواحد. لا يوافق ولا يربط.`,
      typeLabel: "اكتب العبارة للتأكيد",
    },
    approve: {
      ...fr.phases.approve,
      heading: "٢. الموافقة على الدفعة المراجَعة",
      button: "الموافقة على الدفعة المراجَعة",
      what: "يوافق على اقتراح واحد في كل مرة بالجلسة نفسها والبصمة نفسها وسبب خاص. لا ينفّذ شيئًا.",
      typeLabel: "اكتب العبارة للتأكيد",
    },
    execute: {
      ...fr.phases.execute,
      heading: "٣. تنفيذ الدفعة الموافَق عليها",
      button: "تنفيذ الدفعة الموافَق عليها",
      what: "ينفّذ اقتراحًا واحدًا موافَقًا عليه في كل مرة، وكل واحد في معاملة محروسة مستقلة. لا يُلغي الفشلُ غيره ولا يُعاد.",
      typeLabel: "اكتب العبارة للتأكيد",
    },
  },
  selfApprovalOff: "لا يسمح الخادم بموافقة المشغّل نفسه: موافقة الدفعة معطّلة.",
  tierLabel: { A: "A (قميص + SportsMonks)", B: "B (SportsMonks، القميص بلا إشارة)" },
  flashscore: {
    open: (count) => `دفعة Flashscore (${count})`,
    title: "دفعة مضبوطة لهويات Flashscore",
    intro:
      "دفعة واحدة مجمّدة ومتحقَّق منها لمعرّفات Flashscore. يستند كل معرّف إلى لاعب Sofascore مربوط ومراجَع مسبقًا وإلى مباريات منتهية. لكل سطر اقتراحه وبصمته وموافقته وحدث تدقيقه. لا يُربط شيء قبل إجراء التنفيذ.",
    rules: [
      "يجب أن يكون للاعب Sofascore المرتبط ربط فعّال ومراجَع بنفس لاعب التطبيق.",
      "الفئة F1: أحداث مباراة متطابقة (هدف، تمريرة حاسمة، بطاقة، تبديل) مع قميص متطابق أو حدثين على الأقل.",
      "الفئة F2: القميص نفسه وتاريخا الميلاد متطابقان لدى المزوّدين. هذا تعزيز وليس إثباتًا.",
      "الاسم لا يقرّر شيئًا: يُعرض للإشارة فقط.",
    ],
    manifestOk: "تم التحقق من البيان: البصمات والترتيب وعدم التكرار وخلوه من الأسماء والتواريخ.",
    population: (total, f1, f2, heldBack) =>
      `${total} سطرًا · F1: ${f1} · F2: ${f2} · محجوبة: ${heldBack}`,
    heldBack: {
      heading: (heldBack, reviewSet) =>
        `${heldBack} سطرًا من ${reviewSet} في المجموعة المراجَعة محجوبة: ليست جزءًا من هذه الدفعة.`,
      note: "لن تُقترح ولن يُوافَق عليها ولن تُنفَّذ هنا. يُعالج أمرها على حدة.",
      listHeading: "عرض الأسطر المحجوبة",
    },
    classShort: {
      F1_REVIEWED_SOFASCORE_EVENTS: "F1 · أحداث",
      F2_REVIEWED_SOFASCORE_SHIRT_DOB: "F2 · قميص + ميلاد",
    },
    table: {
      providerId: "معرّف Flashscore",
      supportingId: "معرّف Sofascore المرتبط",
      evidenceClass: "الفئة",
      evidence: "الأدلة",
    },
    evidence: {
      shirtAgrees: "القميص متطابق",
      shirtNoAgreement: "القميص غير متطابق",
      events: (n) => `${n} حدث متطابق`,
      birthDateAgrees: "تاريخا الميلاد متطابقان",
    },
    proposeCalls: (calls) =>
      `يتطلب التحديد الحالي ${calls} استدعاء اقتراح (سبب واحد لكل فئة، و${MAX_PROPOSE_PER_CALL} سطرًا كحد أقصى للاستدعاء).`,
  },
};

export const getBulkCopy = (lang: string): BulkCopy => (lang === "ar" ? ar : fr);
