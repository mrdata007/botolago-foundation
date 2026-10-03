import type { MappingErrorCode } from "@/backend/football/identity/mapping-contracts";
import type {
  PreviewCategory,
  PreviewReason,
  QueueView,
} from "@/backend/football/identity/review-queue";

/**
 * Every string of /admin/football/player-mappings, in French and Arabic. One
 * typed object per language, so a test can prove the two stay in step (same
 * keys, no empty value) and a new key cannot ship in only one of them.
 *
 * Names of people and clubs are DATA, shown as they are. Nothing here, and
 * nothing on the screen, ranks, orders or classifies on one.
 */
export type Lang = "fr" | "ar";

export interface PlayerMappingCopy {
  readonly dir: "ltr" | "rtl";
  readonly title: string;
  readonly intro: string;
  readonly previewNotice: string;
  readonly writesDisabled: string;
  readonly noPermission: string;
  /** Shown while the SERVER says one operator may approve their own proposal. */
  readonly singleOperator: {
    readonly title: string;
    readonly points: readonly string[];
  };
  readonly loading: string;
  readonly loadingProgress: (loaded: number) => string;
  readonly loadFailed: (code: string) => string;
  readonly retry: string;
  readonly refresh: string;
  readonly empty: string;
  readonly emptyView: Record<QueueView, string>;
  readonly views: Record<QueueView, string>;
  readonly viewsLabel: string;
  readonly filters: {
    readonly label: string;
    readonly club: string;
    readonly provider: string;
    readonly status: string;
    readonly evidence: string;
    readonly flag: string;
    readonly search: string;
    readonly searchHint: string;
    readonly all: string;
    readonly clear: string;
    readonly results: (shown: number, total: number) => string;
  };
  readonly providers: { readonly sofascore: string; readonly flashscore: string };
  readonly statuses: Record<string, string>;
  readonly evidence: { readonly rich: string; readonly partial: string; readonly thin: string };
  readonly evidenceHelp: string;
  readonly flags: Record<string, string>;
  readonly flagHelp: Record<string, string>;
  readonly row: {
    readonly shirt: string;
    readonly noShirt: string;
    readonly position: string;
    readonly noPosition: string;
    readonly options: (n: number) => string;
    readonly optionsPending: string;
    readonly optionsFailed: string;
    readonly open: string;
    readonly page: (page: number, pages: number) => string;
    readonly previous: string;
    readonly next: string;
    readonly multiClub: string;
  };
  readonly positions: {
    readonly G: string;
    readonly D: string;
    readonly M: string;
    readonly F: string;
  };
  readonly detail: {
    readonly close: string;
    readonly providerEvidence: string;
    readonly appPlayers: string;
    readonly name: string;
    readonly providerId: string;
    readonly provider: string;
    readonly clubs: string;
    readonly shirt: string;
    readonly position: string;
    readonly dob: string;
    readonly height: string;
    readonly nationality: string;
    readonly squad: string;
    readonly squadComplete: string;
    readonly squadIncomplete: string;
    readonly squadIncompleteHelp: string;
    readonly observedAt: string;
    readonly observations: (n: number) => string;
    readonly none: string;
    readonly dobStates: Record<string, string>;
    readonly previewTitle: string;
    readonly previewCategories: Record<PreviewCategory, string>;
    readonly previewReasons: Record<PreviewReason, string>;
    readonly scopeLabel: string;
    readonly scopeClub: string;
    readonly scopeAll: string;
    readonly optionsLoading: string;
    readonly optionsFailed: (code: string) => string;
    readonly optionsNone: string;
    readonly showMore: (n: number) => string;
    readonly showFewer: string;
    readonly appName: string;
    readonly appPosition: string;
    readonly score: string;
    readonly signalDob: string;
    readonly signalShirt: string;
    readonly signalPosition: string;
    readonly clubMismatch: string;
    readonly clubUnknown: string;
    readonly match: string;
    readonly conflict: string;
    readonly noSignal: string;
    readonly alreadyMapped: string;
    readonly positionDisagreement: string;
    readonly lowerRankedNote: string;
    readonly select: string;
    readonly selected: string;
    readonly rank: (n: number) => string;
  };
  readonly propose: {
    readonly title: string;
    readonly chosen: string;
    readonly noneChosen: string;
    readonly reasonHelp: string;
    readonly trigger: string;
    readonly confirmLabel: string;
    readonly confirmPrompt: string;
    readonly positionWarning: string;
    readonly creates: string;
    readonly done: string;
    readonly alreadyProposed: string;
    readonly notUnmapped: string;
    /** A Flashscore identity rests on a reviewed Sofascore mapping, which the database requires and reads itself. */
    readonly flashscoreNeedsSupport: string;
  };
  readonly proposal: {
    readonly title: string;
    readonly status: string;
    readonly kind: string;
    readonly basis: string;
    readonly by: string;
    readonly you: string;
    readonly someoneElse: string;
    readonly requestedAt: string;
    readonly expiresAt: string;
    readonly reason: string;
    readonly decisionReason: string;
    readonly positionNote: string;
    readonly fingerprint: string;
    readonly fingerprintHelp: string;
    readonly evidence: string;
    readonly signals: string;
    readonly holdCode: string;
    readonly secondReviewerRequired: string;
    readonly secondReviewerRequiredHelp: string;
    readonly ownProposal: string;
    readonly waitingOther: string;
    readonly selfApprovalNotice: string;
    readonly selfApprovedNote: string;
    readonly expired: string;
    readonly held: string;
    readonly notPending: string;
    readonly executionSeparate: string;
    readonly execute: {
      readonly title: string;
      readonly intro: string;
      readonly targetHeading: string;
      readonly provider: string;
      readonly externalId: string;
      readonly appPlayer: string;
      readonly candidate: string;
      readonly kind: string;
      readonly whatMap: string;
      readonly whatOther: string;
      readonly typeLabel: string;
      readonly typeHint: (phrase: string) => string;
      readonly button: string;
      readonly running: string;
      readonly done: string;
      readonly result: (provider: string, externalId: string, appPlayerId: string) => string;
      readonly dismiss: string;
      readonly fingerprintCheck: string;
    };
    readonly approve: string;
    readonly approveConfirm: string;
    readonly approvePrompt: (fingerprint: string) => string;
    readonly reject: string;
    readonly rejectConfirm: string;
    readonly rejectPrompt: string;
    readonly cancel: string;
    readonly cancelConfirm: string;
    readonly cancelPrompt: string;
    readonly acknowledge: string;
    readonly notePlaceholder: string;
    readonly noteLabel: string;
    readonly noteSave: string;
    readonly noteNeeded: string;
    readonly refreshEvidence: string;
    readonly staleHelp: string;
    readonly done: string;
    readonly open: string;
  };
  readonly proposalStatuses: Record<string, string>;
  readonly proposalKinds: Record<string, string>;
  readonly errors: Record<MappingErrorCode, string>;
  readonly clubLabel: (clubKey: string | null) => string;
}

/** The 16 clubs, written as they are on the pitch. Latin script in both languages. */
const CLUB_NAMES: Readonly<Record<string, string>> = {
  "amal-tiznit": "Amal Tiznit",
  "codm-meknes": "CODM Meknès",
  "cr-khemis-zemamra": "CR Khemis Zemamra",
  "difaa-el-jadida": "Difaâ El Jadida",
  "far-rabat": "FAR Rabat",
  "fus-rabat": "FUS Rabat",
  "hassania-agadir": "Hassania Agadir",
  "ittihad-tanger": "Ittihad Tanger",
  "kawkab-marrakech": "Kawkab Marrakech",
  "maghreb-fes": "Maghreb Fès",
  "moghreb-tetouan": "Moghreb Tétouan",
  "rsb-berkane": "RS Berkane",
  "raja-casablanca": "Raja Casablanca",
  "uts-rabat": "UTS Rabat",
  "widad-temara": "Widad Témara",
  "wydad-casablanca": "Wydad Casablanca",
};
const clubLabel = (clubKey: string | null) => (clubKey ? (CLUB_NAMES[clubKey] ?? clubKey) : "—");

const fr: PlayerMappingCopy = {
  dir: "ltr",
  title: "Rapprochement des joueurs",
  intro:
    "Relisez les joueurs des fournisseurs (Sofascore, Flashscore) et choisissez le joueur de l’application qui leur correspond. Une proposition ne rapproche personne : un autre relecteur qualifié doit l’approuver.",
  previewNotice:
    "Les catégories A à D sont une aide à la lecture, calculée sans aucun nom. Aucune n’est une décision et aucune ne crée de proposition.",
  writesDisabled:
    "La création de propositions n’est pas encore activée. Cet écran est en lecture seule jusqu’à l’approbation de la première proposition.",
  noPermission:
    "Votre rôle permet de lire cette file, pas de proposer ni d’approuver (football.manage_mappings requis).",
  singleOperator: {
    title: "MODE RELECTURE PAR UN SEUL OPÉRATEUR",
    points: [
      "Le même relecteur autorisé peut approuver sa propre proposition : personne d’autre ne la vérifie.",
      "L’approbation reste une action explicite : elle porte sur l’empreinte exacte affichée.",
      "L’exécution reste une action distincte : approuver n’écrit aucun rapprochement.",
      "Chaque action est consignée dans l’audit.",
    ],
  },
  loading: "Chargement des candidats…",
  loadingProgress: (loaded) => `Chargement des candidats… ${loaded} reçus`,
  loadFailed: (code) => `Impossible de charger la file de rapprochement (${code}).`,
  retry: "Réessayer",
  refresh: "Actualiser",
  empty: "Aucun candidat enregistré pour le moment.",
  emptyView: {
    unmapped: "Aucun candidat non rapproché ne correspond à ces filtres.",
    proposed: "Aucun candidat n’a de proposition en cours.",
    waiting_second: "Aucune proposition n’attend un second relecteur.",
    mapped: "Aucun candidat n’est rapproché.",
    ignored: "Aucun candidat n’est ignoré.",
    held: "Aucune proposition n’est bloquée ou expirée.",
  },
  views: {
    unmapped: "Non rapprochés",
    proposed: "Proposés",
    waiting_second: "En attente d’un second relecteur",
    mapped: "Rapprochés",
    ignored: "Ignorés",
    held: "Bloqués / conflit",
  },
  viewsLabel: "Vues de la file",
  filters: {
    label: "Filtres",
    club: "Club",
    provider: "Fournisseur",
    status: "Statut",
    evidence: "Preuves disponibles",
    flag: "Signalement",
    search: "Recherche",
    searchHint: "Nom ou identifiant fournisseur. Filtre seulement, ne classe jamais.",
    all: "Tous",
    clear: "Réinitialiser les filtres",
    results: (shown, total) => `${shown} sur ${total} candidats`,
  },
  providers: { sofascore: "Sofascore", flashscore: "Flashscore" },
  statuses: {
    unmapped: "Non rapproché",
    proposed: "Proposé",
    mapped: "Rapproché",
    ignored: "Ignoré",
  },
  evidence: { rich: "Riches", partial: "Partielles", thin: "Minces" },
  evidenceHelp:
    "Riches : date de naissance exploitable + numéro + poste. Partielles : deux sur trois. Minces : moins. Cela dit combien il y a à comparer, pas si quelqu’un correspond.",
  flags: {
    MULTI_SQUAD_OBSERVATION: "Deux effectifs",
    INCOMPLETE_PROVIDER_SQUAD: "Effectif incomplet",
    REGISTERED_TEAM_DISAGREEMENT: "Autre équipe enregistrée",
    DOB_CONFLICT: "Dates de naissance différentes",
    POSITION_DISAGREEMENT: "Poste différent",
    SHIRT_DIFFERENCE: "Numéro différent",
    CLUB_CONTEXT_MISMATCH: "Autre club",
  },
  flagHelp: {
    MULTI_SQUAD_OBSERVATION:
      "Le même identifiant figure dans deux effectifs. Ce n’est ni un transfert ni un doublon.",
    INCOMPLETE_PROVIDER_SQUAD:
      "Le fournisseur a renvoyé un effectif incomplet. L’absence d’un joueur n’est une preuve de rien.",
    REGISTERED_TEAM_DISAGREEMENT:
      "Le fournisseur enregistre ce joueur dans une autre équipe que celle de l’effectif.",
    DOB_CONFLICT: "Les deux dates de naissance sont valides et différentes.",
    POSITION_DISAGREEMENT: "Les deux postes sont connus et différents.",
    SHIRT_DIFFERENCE: "Aucun numéro observé ne correspond au numéro de l’application.",
    CLUB_CONTEXT_MISMATCH: "Le joueur de l’application appartient à un autre club.",
  },
  row: {
    shirt: "N°",
    noShirt: "N° inconnu",
    position: "Poste",
    noPosition: "Poste inconnu",
    options: (n) => (n === 1 ? "1 option plausible" : `${n} options plausibles`),
    optionsPending: "Options en cours de calcul…",
    optionsFailed: "Options indisponibles",
    open: "Ouvrir",
    page: (page, pages) => `Page ${page} sur ${pages}`,
    previous: "Précédent",
    next: "Suivant",
    multiClub: "2 clubs",
  },
  positions: { G: "Gardien", D: "Défenseur", M: "Milieu", F: "Attaquant" },
  detail: {
    close: "Fermer la comparaison",
    providerEvidence: "Ce que dit le fournisseur",
    appPlayers: "Joueurs de l’application",
    name: "Nom affiché",
    providerId: "Identifiant fournisseur",
    provider: "Fournisseur",
    clubs: "Club observé",
    shirt: "Numéro",
    position: "Poste",
    dob: "Date de naissance",
    height: "Taille",
    nationality: "Nationalité (code du fournisseur)",
    squad: "Effectif",
    squadComplete: "Complet",
    squadIncomplete: "Incomplet",
    observedAt: "Observé le",
    squadIncompleteHelp:
      "Les joueurs présents sont des preuves positives ; l’absence d’un joueur ne prouve rien et ne baisse aucune option.",
    observations: (n) => (n === 1 ? "1 effectif observé" : `${n} effectifs observés`),
    none: "—",
    dobStates: {
      valid: "Valide",
      missing: "Absente",
      not_provided: "Non fournie par ce fournisseur",
      unparseable: "Illisible",
      future: "Dans le futur",
      age_below_minimum: "Âge trop bas",
      age_above_maximum: "Âge trop élevé",
    },
    previewTitle: "Lecture de la preuve (aperçu, pas une décision)",
    previewCategories: {
      A: "A · Suggestion très forte",
      B: "B · Plausible mais ambigu",
      C: "C · Preuve insuffisante",
      D: "D · Conflit, à examiner",
    },
    previewReasons: {
      no_options: "Aucun joueur à comparer.",
      no_agreeing_signal: "Aucun signal ne concorde.",
      top_dob_conflict: "La meilleure option a une date de naissance différente.",
      top_position_conflict: "La meilleure option a un poste différent.",
      top_club_mismatch: "La meilleure option appartient à un autre club.",
      multi_squad: "Le candidat figure dans deux effectifs.",
      registered_team_disagreement: "Le fournisseur l’enregistre dans une autre équipe.",
      unique_dob_match: "Une seule option a la même date de naissance.",
      tied_top: "Plusieurs options sont à égalité en tête.",
      several_dob_matches: "Plusieurs options ont la même date de naissance.",
      dob_match_with_shirt_difference: "Même date de naissance, mais numéro différent.",
      incomplete_squad: "L’effectif du fournisseur est incomplet.",
      no_dob_signal: "Aucune date de naissance comparable.",
      corroborated_by_shirt: "Le numéro concorde aussi.",
      corroborated_by_position: "Le poste concorde aussi.",
    },
    scopeLabel: "Joueurs comparés",
    scopeClub: "Même club",
    scopeAll: "Tous les joueurs",
    optionsLoading: "Calcul du classement…",
    optionsFailed: (code) => `Classement indisponible (${code}).`,
    optionsNone: "Aucun joueur de l’application à comparer pour ce club.",
    showMore: (n) => `Voir les ${n} autres`,
    showFewer: "Réduire la liste",
    appName: "Joueur",
    appPosition: "Poste",
    score: "Score",
    signalDob: "Naissance",
    signalShirt: "Numéro",
    signalPosition: "Poste",
    clubMismatch: "Autre club : à vérifier",
    clubUnknown: "Aucun club connu",
    match: "Concorde",
    conflict: "Différent",
    noSignal: "Sans signal",
    alreadyMapped: "Déjà rapproché pour ce fournisseur",
    positionDisagreement: "Poste différent : à vérifier",
    lowerRankedNote:
      "Toutes les options restent visibles : aucun joueur n’est masqué pour son poste ni pour une donnée absente.",
    select: "Choisir",
    selected: "Choisi",
    rank: (n) => `Rang ${n}`,
  },
  propose: {
    title: "Proposer un rapprochement",
    chosen: "Joueur choisi",
    noneChosen: "Choisissez un joueur de l’application dans la liste.",
    reasonHelp: "Motif requis : 10 à 500 caractères, consigné dans l’audit.",
    trigger: "Proposer ce rapprochement",
    confirmLabel: "Confirmer la proposition",
    confirmPrompt:
      "Créer une proposition ? Elle ne rapproche personne : un autre relecteur qualifié doit l’approuver.",
    positionWarning:
      "Le poste du fournisseur diffère de celui du joueur de l’application. Une note justificative sera demandée avant toute approbation.",
    creates: "Crée une proposition seulement.",
    done: "Proposition créée. Un autre relecteur qualifié doit maintenant l’examiner.",
    alreadyProposed: "Ce candidat a déjà une proposition en cours.",
    notUnmapped: "Seul un candidat non rapproché peut recevoir une proposition.",
    flashscoreNeedsSupport:
      "Une identité Flashscore s’appuie sur un rapprochement Sofascore déjà contrôlé, que la base de données exige et relit elle-même. Elle se propose depuis l’écran du lot Flashscore, qui porte ce rapprochement.",
  },
  proposal: {
    title: "Proposition",
    status: "État",
    kind: "Type",
    basis: "Base",
    by: "Proposée par",
    you: "Vous",
    someoneElse: "Un autre relecteur",
    requestedAt: "Proposée le",
    expiresAt: "Expire le",
    reason: "Motif du proposant",
    decisionReason: "Motif de la décision",
    positionNote: "Note sur le poste",
    fingerprint: "Empreinte exacte",
    fingerprintHelp:
      "L’approbation porte sur cette empreinte précise. Si la preuve change, elle est refusée.",
    evidence: "Preuves",
    signals: "Signaux au moment de la proposition",
    holdCode: "Cause du blocage",
    secondReviewerRequired: "SECOND RELECTEUR QUALIFIÉ REQUIS",
    secondReviewerRequiredHelp:
      "Aucune autre personne qualifiée ne peut approuver cette proposition. Il n’y a pas de contournement : elle attend.",
    ownProposal:
      "Vous avez proposé ceci. Une autre personne doit l’approuver ou la rejeter ; vous ne le pouvez pas.",
    waitingOther: "En attente de la décision d’un autre relecteur.",
    selfApprovalNotice:
      "Vous êtes l’auteur de cette proposition et vous pouvez l’approuver vous-même : personne d’autre ne la vérifie. Relisez l’empreinte et les preuves avant d’approuver.",
    selfApprovedNote: "Approuvée par son auteur, sans second relecteur.",
    expired: "Cette proposition a expiré. Elle ne peut plus être décidée.",
    held: "Cette proposition est bloquée : le monde a changé depuis qu’elle a été faite.",
    notPending: "Cette proposition n’attend plus de décision.",
    executionSeparate:
      "L’approbation ne rapproche rien. L’exécution est une étape distincte, plus bas : rien n’est écrit tant que vous ne l’avez pas confirmée.",
    execute: {
      title: "Exécuter cette proposition approuvée",
      intro:
        "Une seule proposition à la fois. Vérifiez l’empreinte et la cible ci-dessous : l’exécution écrit le rapprochement, une seule fois, et la base revérifie tout au moment d’écrire.",
      targetHeading: "Cible du rapprochement",
      provider: "Fournisseur",
      externalId: "Identifiant fournisseur",
      appPlayer: "Joueur de l’application",
      candidate: "Candidat",
      kind: "Type de décision",
      whatMap:
        "Écrit UNE ligne de rapprochement : cet identifiant fournisseur désigne désormais ce joueur. Une correction ultérieure passe par un remplacement ou une désactivation revus, jamais par une suppression.",
      whatOther: "Applique cette décision approuvée à la ligne existante, exactement une fois.",
      typeLabel: "Confirmation écrite",
      typeHint: (phrase) => `Saisissez exactement ${phrase} pour activer le bouton.`,
      button: "Exécuter le rapprochement",
      running: "Exécution en cours…",
      done: "Exécuté. Une seule ligne a été écrite.",
      result: (provider, externalId, appPlayerId) =>
        `Exécuté : une seule ligne écrite. ${provider} ${externalId} désigne désormais le joueur ${appPlayerId}.`,
      dismiss: "Fermer ce message",
      fingerprintCheck:
        "Avant d’exécuter, l’écran relit la proposition : si l’empreinte a changé depuis votre lecture, rien n’est exécuté.",
    },
    approve: "Approuver",
    approveConfirm: "Confirmer l’approbation",
    approvePrompt: (fingerprint) => `Approuver exactement l’empreinte ${fingerprint} ?`,
    reject: "Rejeter",
    rejectConfirm: "Confirmer le rejet",
    rejectPrompt: "Rejeter cette proposition ? La décision est définitive.",
    cancel: "Retirer ma proposition",
    cancelConfirm: "Confirmer le retrait",
    cancelPrompt: "Retirer votre proposition ? Le candidat redevient non rapproché.",
    acknowledge:
      "J’ai lu la note : je reconnais que les postes diffèrent et je veux quand même approuver.",
    notePlaceholder: "Pourquoi ces deux postes désignent-ils la même personne ?",
    noteLabel: "Note sur le poste (10 à 500 caractères)",
    noteSave: "Enregistrer la note",
    noteNeeded: "Le poste diffère : ajoutez une note avant que quelqu’un puisse approuver.",
    refreshEvidence: "Actualiser la preuve",
    staleHelp:
      "La preuve a changé depuis la proposition. L’actualiser annule toute approbation précédente.",
    done: "Opération enregistrée et auditée.",
    open: "Ouvrir la proposition",
  },
  proposalStatuses: {
    pending: "En attente",
    approved: "Approuvée",
    executed: "Exécutée",
    rejected: "Rejetée",
    expired: "Expirée",
    cancelled: "Retirée",
    stale_evidence: "Preuve périmée",
    identity_conflict: "Conflit d’identité",
    position_disagreement: "Poste à justifier",
    already_mapped: "Déjà rapproché",
  },
  proposalKinds: {
    map: "Rapprocher",
    replace: "Remplacer",
    deactivate: "Désactiver",
    reactivate: "Réactiver",
    ignore: "Ignorer",
    reverse_ignore: "Ne plus ignorer",
  },
  errors: {
    staff_access_denied: "Accès réservé au personnel.",
    permission_missing: "Votre rôle n’a pas cette permission.",
    mfa_assurance_insufficient: "Une seconde vérification (AAL2) est requise.",
    recent_auth_required: "Reconnectez-vous : une authentification récente est requise.",
    self_approval_denied: "Vous ne pouvez pas approuver votre propre proposition.",
    self_approval_no_longer_allowed:
      "L’approbation par l’auteur n’est plus autorisée : une autre personne doit approuver.",
    not_authorized: "Seul l’auteur de la proposition peut faire cela.",
    proposal_not_found: "Proposition introuvable.",
    candidate_not_found: "Candidat introuvable.",
    proposal_expired: "La proposition a expiré.",
    approval_expired: "L’approbation a expiré.",
    approver_no_longer_qualified: "L’approbateur n’est plus qualifié.",
    fingerprint_mismatch: "La proposition a changé : rechargez et relisez-la.",
    proposal_not_pending: "La proposition n’attend plus de décision.",
    proposal_not_approved: "La proposition n’est pas approuvée.",
    proposal_not_open: "La proposition n’est plus ouverte.",
    proposal_not_stale: "La preuve n’est pas périmée.",
    proposal_not_awaiting_note: "Aucune note n’est attendue.",
    operation_already_executed: "Déjà exécutée.",
    position_disagreement_unacknowledged:
      "Le poste diffère : une note et une reconnaissance sont requises.",
    stale_evidence: "La preuve a changé depuis la proposition.",
    identity_conflict: "Un conflit d’identité bloque cette décision.",
    already_mapped: "Ce joueur est déjà rapproché.",
    proposal_already_open: "Une proposition est déjà ouverte pour ce candidat.",
    ignore_refused_id_in_lineup:
      "Cet identifiant apparaît dans une composition : il ne peut pas être ignoré.",
    reason_required: "Un motif de 10 à 500 caractères est requis.",
    note_required: "Une note de 10 à 500 caractères est requise.",
    invalid_proposal: "Proposition invalide.",
    invalid_filter: "Filtre invalide.",
    invalid_decision: "Décision invalide.",
    idempotency_conflict: "Cette opération a déjà été envoyée avec un contenu différent.",
    supporting_dependency_required:
      "Une identité Flashscore doit s’appuyer sur un rapprochement Sofascore déjà contrôlé : indiquez-le.",
    supporting_dependency_invalid: "La classe de preuve indiquée n’est pas valide.",
    supporting_dependency_not_applicable:
      "Cette proposition ne prend pas de rapprochement Sofascore de soutien.",
    supporting_mapping_missing: "Le rapprochement Sofascore de soutien n’existe pas.",
    supporting_mapping_not_sofascore:
      "Le rapprochement de soutien doit être un rapprochement Sofascore.",
    supporting_mapping_inactive: "Le rapprochement Sofascore de soutien n’est plus actif.",
    supporting_mapping_unreviewed:
      "Le rapprochement Sofascore de soutien n’a pas été fait par le circuit contrôlé.",
    supporting_mapping_target_mismatch:
      "Le rapprochement Sofascore de soutien pointe vers un autre joueur.",
    supporting_mapping_changed:
      "Le rapprochement Sofascore de soutien a changé depuis l’approbation : actualisez la proposition.",
    evidence_refs_required: "Des références de preuve sont requises.",
    mapping_unavailable: "Le service de rapprochement est indisponible.",
  },
  clubLabel,
};

const ar: PlayerMappingCopy = {
  dir: "rtl",
  title: "مطابقة اللاعبين",
  intro:
    "راجِع لاعبي المزوّدين (Sofascore وFlashscore) واختر لاعب التطبيق الذي يقابلهم. الاقتراح لا يطابق أحدًا: يجب أن يوافق عليه مراجع مؤهَّل آخر.",
  previewNotice:
    "الفئات من A إلى D مساعدة على القراءة تُحسب دون أي اسم. لا تُعدّ أيٌّ منها قرارًا ولا تُنشئ أي اقتراح.",
  writesDisabled:
    "إنشاء الاقتراحات غير مفعَّل بعد. هذه الشاشة للقراءة فقط إلى حين الموافقة على أول اقتراح.",
  noPermission:
    "دورك يسمح بقراءة هذه القائمة فقط، لا بالاقتراح ولا بالموافقة (يلزم football.manage_mappings).",
  singleOperator: {
    title: "وضع المراجعة بمشغِّل واحد",
    points: [
      "يستطيع المراجع المخوَّل نفسه الموافقة على اقتراحه: لا يراجعه أحد غيره.",
      "تبقى الموافقة إجراءً صريحًا: تخصّ البصمة الدقيقة المعروضة.",
      "يبقى التنفيذ إجراءً منفصلًا: الموافقة لا تكتب أي مطابقة.",
      "يُسجَّل كل إجراء في سجل التدقيق.",
    ],
  },
  loading: "جارٍ تحميل المرشَّحين…",
  loadingProgress: (loaded) => `جارٍ تحميل المرشَّحين… وصل ${loaded}`,
  loadFailed: (code) => `تعذّر تحميل قائمة المطابقة (${code}).`,
  retry: "إعادة المحاولة",
  refresh: "تحديث",
  empty: "لا يوجد مرشَّحون مسجَّلون حاليًا.",
  emptyView: {
    unmapped: "لا يوجد مرشَّح غير مطابَق يوافق هذه المرشِّحات.",
    proposed: "لا يوجد مرشَّح لديه اقتراح قيد النظر.",
    waiting_second: "لا يوجد اقتراح ينتظر مراجعًا ثانيًا.",
    mapped: "لا يوجد مرشَّح مطابَق.",
    ignored: "لا يوجد مرشَّح متجاهَل.",
    held: "لا يوجد اقتراح متوقف أو منتهي الصلاحية.",
  },
  views: {
    unmapped: "غير مطابَقين",
    proposed: "مقترَحون",
    waiting_second: "بانتظار مراجع ثانٍ",
    mapped: "مطابَقون",
    ignored: "متجاهَلون",
    held: "متوقفة / تعارض",
  },
  viewsLabel: "عروض القائمة",
  filters: {
    label: "المرشِّحات",
    club: "النادي",
    provider: "المزوّد",
    status: "الحالة",
    evidence: "الأدلة المتوفرة",
    flag: "التنبيه",
    search: "بحث",
    searchHint: "الاسم أو معرّف المزوّد. للتصفية فقط، لا يرتّب أبدًا.",
    all: "الكل",
    clear: "إعادة ضبط المرشِّحات",
    results: (shown, total) => `${shown} من ${total} مرشَّحًا`,
  },
  providers: { sofascore: "Sofascore", flashscore: "Flashscore" },
  statuses: {
    unmapped: "غير مطابَق",
    proposed: "مقترَح",
    mapped: "مطابَق",
    ignored: "متجاهَل",
  },
  evidence: { rich: "غنية", partial: "جزئية", thin: "ضعيفة" },
  evidenceHelp:
    "غنية: تاريخ ميلاد صالح + رقم + مركز. جزئية: اثنان من ثلاثة. ضعيفة: أقل. هذا يبيّن حجم ما يمكن مقارنته، لا ما إذا كان أحدهم يطابق.",
  flags: {
    MULTI_SQUAD_OBSERVATION: "تشكيلتان",
    INCOMPLETE_PROVIDER_SQUAD: "تشكيلة ناقصة",
    REGISTERED_TEAM_DISAGREEMENT: "فريق مسجَّل آخر",
    DOB_CONFLICT: "تاريخا ميلاد مختلفان",
    POSITION_DISAGREEMENT: "مركز مختلف",
    SHIRT_DIFFERENCE: "رقم مختلف",
    CLUB_CONTEXT_MISMATCH: "نادٍ آخر",
  },
  flagHelp: {
    MULTI_SQUAD_OBSERVATION: "المعرّف نفسه ورد في تشكيلتين. هذا ليس انتقالًا ولا تكرارًا.",
    INCOMPLETE_PROVIDER_SQUAD: "أعاد المزوّد تشكيلة ناقصة. غياب لاعب لا يدلّ على شيء.",
    REGISTERED_TEAM_DISAGREEMENT: "يسجّل المزوّد هذا اللاعب في فريق غير فريق التشكيلة.",
    DOB_CONFLICT: "تاريخا الميلاد صالحان لكنهما مختلفان.",
    POSITION_DISAGREEMENT: "المركزان معروفان لكنهما مختلفان.",
    SHIRT_DIFFERENCE: "لا يطابق أي رقم مرصود رقم التطبيق.",
    CLUB_CONTEXT_MISMATCH: "لاعب التطبيق ينتمي إلى نادٍ آخر.",
  },
  row: {
    shirt: "رقم",
    noShirt: "الرقم مجهول",
    position: "المركز",
    noPosition: "المركز مجهول",
    options: (n) => (n === 1 ? "خيار معقول واحد" : `${n} خيارات معقولة`),
    optionsPending: "جارٍ حساب الخيارات…",
    optionsFailed: "الخيارات غير متاحة",
    open: "فتح",
    page: (page, pages) => `الصفحة ${page} من ${pages}`,
    previous: "السابق",
    next: "التالي",
    multiClub: "ناديان",
  },
  positions: { G: "حارس", D: "مدافع", M: "وسط", F: "مهاجم" },
  detail: {
    close: "إغلاق المقارنة",
    providerEvidence: "ما يقوله المزوّد",
    appPlayers: "لاعبو التطبيق",
    name: "الاسم المعروض",
    providerId: "معرّف المزوّد",
    provider: "المزوّد",
    clubs: "النادي المرصود",
    shirt: "الرقم",
    position: "المركز",
    dob: "تاريخ الميلاد",
    height: "الطول",
    nationality: "الجنسية (رمز المزوّد)",
    squad: "التشكيلة",
    squadComplete: "كاملة",
    squadIncomplete: "ناقصة",
    observedAt: "تاريخ الرصد",
    squadIncompleteHelp:
      "اللاعبون الحاضرون أدلة إيجابية؛ أما غياب لاعب فلا يثبت شيئًا ولا يخفض أي خيار.",
    observations: (n) => (n === 1 ? "تشكيلة واحدة مرصودة" : `${n} تشكيلات مرصودة`),
    none: "—",
    dobStates: {
      valid: "صالح",
      missing: "غائب",
      not_provided: "لا يوفّره هذا المزوّد",
      unparseable: "غير مقروء",
      future: "في المستقبل",
      age_below_minimum: "عمر أدنى من المعقول",
      age_above_maximum: "عمر أعلى من المعقول",
    },
    previewTitle: "قراءة الدليل (معاينة وليست قرارًا)",
    previewCategories: {
      A: "A · اقتراح قوي جدًا",
      B: "B · معقول لكنه ملتبس",
      C: "C · دليل غير كافٍ",
      D: "D · تعارض، يستدعي الفحص",
    },
    previewReasons: {
      no_options: "لا يوجد لاعبون للمقارنة.",
      no_agreeing_signal: "لا توجد إشارة متوافقة.",
      top_dob_conflict: "أفضل خيار له تاريخ ميلاد مختلف.",
      top_position_conflict: "أفضل خيار له مركز مختلف.",
      top_club_mismatch: "أفضل خيار ينتمي إلى نادٍ آخر.",
      multi_squad: "المرشَّح وارد في تشكيلتين.",
      registered_team_disagreement: "يسجّله المزوّد في فريق آخر.",
      unique_dob_match: "خيار واحد فقط له تاريخ الميلاد نفسه.",
      tied_top: "عدة خيارات متعادلة في الصدارة.",
      several_dob_matches: "عدة خيارات لها تاريخ الميلاد نفسه.",
      dob_match_with_shirt_difference: "تاريخ الميلاد نفسه لكن الرقم مختلف.",
      incomplete_squad: "تشكيلة المزوّد ناقصة.",
      no_dob_signal: "لا يوجد تاريخ ميلاد قابل للمقارنة.",
      corroborated_by_shirt: "الرقم يتوافق أيضًا.",
      corroborated_by_position: "المركز يتوافق أيضًا.",
    },
    scopeLabel: "اللاعبون المقارَنون",
    scopeClub: "النادي نفسه",
    scopeAll: "جميع اللاعبين",
    optionsLoading: "جارٍ حساب الترتيب…",
    optionsFailed: (code) => `الترتيب غير متاح (${code}).`,
    optionsNone: "لا يوجد لاعبون من التطبيق للمقارنة في هذا النادي.",
    showMore: (n) => `عرض الـ ${n} الباقين`,
    showFewer: "تقليص القائمة",
    appName: "اللاعب",
    appPosition: "المركز",
    score: "النتيجة",
    signalDob: "الميلاد",
    signalShirt: "الرقم",
    signalPosition: "المركز",
    clubMismatch: "نادٍ آخر: يلزم التحقق",
    clubUnknown: "لا نادي معروف",
    match: "يتوافق",
    conflict: "مختلف",
    noSignal: "دون إشارة",
    alreadyMapped: "مطابَق مسبقًا لهذا المزوّد",
    positionDisagreement: "مركز مختلف: يلزم التحقق",
    lowerRankedNote: "تبقى كل الخيارات ظاهرة: لا يُخفى لاعب بسبب مركزه ولا بسبب بيانات غائبة.",
    select: "اختيار",
    selected: "مختار",
    rank: (n) => `المرتبة ${n}`,
  },
  propose: {
    title: "اقتراح مطابقة",
    chosen: "اللاعب المختار",
    noneChosen: "اختر لاعبًا من التطبيق في القائمة.",
    reasonHelp: "السبب مطلوب: من 10 إلى 500 حرف، ويُسجَّل في التدقيق.",
    trigger: "اقتراح هذه المطابقة",
    confirmLabel: "تأكيد الاقتراح",
    confirmPrompt: "إنشاء اقتراح؟ لن يطابق أحدًا: يجب أن يوافق عليه مراجع مؤهَّل آخر.",
    positionWarning:
      "مركز المزوّد يختلف عن مركز لاعب التطبيق. ستُطلب ملاحظة تبريرية قبل أي موافقة.",
    creates: "يُنشئ اقتراحًا فقط.",
    done: "أُنشئ الاقتراح. على مراجع مؤهَّل آخر أن يفحصه الآن.",
    alreadyProposed: "لهذا المرشَّح اقتراح قيد النظر بالفعل.",
    notUnmapped: "لا يمكن اقتراح مطابقة إلا لمرشَّح غير مطابَق.",
    flashscoreNeedsSupport:
      "تستند هوية Flashscore إلى ربط Sofascore تمت مراجعته، وتشترطه قاعدة البيانات وتقرؤه بنفسها. تُقترح من شاشة دفعة Flashscore التي تحمل هذا الربط.",
  },
  proposal: {
    title: "الاقتراح",
    status: "الحالة",
    kind: "النوع",
    basis: "الأساس",
    by: "مقترَح من",
    you: "أنت",
    someoneElse: "مراجع آخر",
    requestedAt: "تاريخ الاقتراح",
    expiresAt: "ينتهي في",
    reason: "سبب المقترِح",
    decisionReason: "سبب القرار",
    positionNote: "ملاحظة المركز",
    fingerprint: "البصمة الدقيقة",
    fingerprintHelp: "تنصبّ الموافقة على هذه البصمة تحديدًا. إذا تغيّر الدليل رُفضت.",
    evidence: "الأدلة",
    signals: "الإشارات وقت الاقتراح",
    holdCode: "سبب التوقف",
    secondReviewerRequired: "مطلوب مراجع ثانٍ مؤهَّل",
    secondReviewerRequiredHelp:
      "لا يوجد شخص مؤهَّل آخر يستطيع الموافقة على هذا الاقتراح. لا التفاف على ذلك: يبقى بالانتظار.",
    ownProposal: "أنت من اقترح هذا. يجب أن يوافق عليه شخص آخر أو يرفضه؛ ولا يمكنك ذلك.",
    waitingOther: "بانتظار قرار مراجع آخر.",
    selfApprovalNotice:
      "أنت من اقترح هذا ويمكنك الموافقة عليه بنفسك: لا يراجعه أحد غيرك. راجع البصمة والأدلة جيدًا قبل الموافقة.",
    selfApprovedNote: "وافق عليه صاحب الاقتراح نفسه، دون مراجع ثانٍ.",
    expired: "انتهت صلاحية هذا الاقتراح، ولم يعد ممكنًا البتّ فيه.",
    held: "هذا الاقتراح متوقف: تغيّر الوضع منذ تقديمه.",
    notPending: "لم يعد هذا الاقتراح ينتظر قرارًا.",
    executionSeparate:
      "الموافقة لا تطابق شيئًا. التنفيذ خطوة منفصلة أدناه: لا يُكتب شيء حتى تؤكّدها.",
    execute: {
      title: "تنفيذ هذا الاقتراح المعتمَد",
      intro:
        "اقتراح واحد في كل مرة. راجع البصمة والهدف أدناه: التنفيذ يكتب المطابقة مرة واحدة، وتعيد قاعدة البيانات التحقق من كل شيء عند الكتابة.",
      targetHeading: "هدف المطابقة",
      provider: "المزوِّد",
      externalId: "معرّف المزوِّد",
      appPlayer: "لاعب التطبيق",
      candidate: "المرشَّح",
      kind: "نوع القرار",
      whatMap:
        "يكتب سطر مطابقة واحدًا: يصبح معرّف المزوِّد هذا يشير إلى هذا اللاعب. أي تصحيح لاحق يتم باستبدال أو إيقاف مُراجَعين، وليس بالحذف.",
      whatOther: "يطبّق هذا القرار المعتمَد على السطر الموجود، مرة واحدة تمامًا.",
      typeLabel: "تأكيد كتابي",
      typeHint: (phrase) => `اكتب ${phrase} بالضبط لتفعيل الزر.`,
      button: "تنفيذ المطابقة",
      running: "جارٍ التنفيذ…",
      done: "تم التنفيذ. كُتب سطر واحد فقط.",
      result: (provider, externalId, appPlayerId) =>
        `تم التنفيذ: كُتب سطر واحد فقط. ${provider} ${externalId} يشير الآن إلى اللاعب ${appPlayerId}.`,
      dismiss: "إغلاق هذه الرسالة",
      fingerprintCheck:
        "قبل التنفيذ تعيد الشاشة قراءة الاقتراح: إن تغيّرت البصمة منذ قراءتك فلن يُنفَّذ شيء.",
    },
    approve: "موافقة",
    approveConfirm: "تأكيد الموافقة",
    approvePrompt: (fingerprint) => `الموافقة على البصمة ${fingerprint} تحديدًا؟`,
    reject: "رفض",
    rejectConfirm: "تأكيد الرفض",
    rejectPrompt: "رفض هذا الاقتراح؟ القرار نهائي.",
    cancel: "سحب اقتراحي",
    cancelConfirm: "تأكيد السحب",
    cancelPrompt: "سحب اقتراحك؟ يعود المرشَّح غير مطابَق.",
    acknowledge: "قرأتُ الملاحظة: أُقرّ بأن المركزين مختلفان وأريد الموافقة مع ذلك.",
    notePlaceholder: "لماذا يشير هذان المركزان إلى الشخص نفسه؟",
    noteLabel: "ملاحظة المركز (من 10 إلى 500 حرف)",
    noteSave: "حفظ الملاحظة",
    noteNeeded: "المركز مختلف: أضف ملاحظة قبل أن يستطيع أحد الموافقة.",
    refreshEvidence: "تحديث الدليل",
    staleHelp: "تغيّر الدليل منذ الاقتراح. تحديثه يُلغي أي موافقة سابقة.",
    done: "سُجّلت العملية ودُقِّقت.",
    open: "فتح الاقتراح",
  },
  proposalStatuses: {
    pending: "قيد الانتظار",
    approved: "موافَق عليه",
    executed: "منفَّذ",
    rejected: "مرفوض",
    expired: "منتهي الصلاحية",
    cancelled: "مسحوب",
    stale_evidence: "دليل قديم",
    identity_conflict: "تعارض هوية",
    position_disagreement: "مركز يلزم تبريره",
    already_mapped: "مطابَق مسبقًا",
  },
  proposalKinds: {
    map: "مطابقة",
    replace: "استبدال",
    deactivate: "تعطيل",
    reactivate: "إعادة تفعيل",
    ignore: "تجاهل",
    reverse_ignore: "إلغاء التجاهل",
  },
  errors: {
    staff_access_denied: "الوصول مقتصر على طاقم الإدارة.",
    permission_missing: "دورك لا يملك هذه الصلاحية.",
    mfa_assurance_insufficient: "يلزم تحقق ثانٍ (AAL2).",
    recent_auth_required: "أعد تسجيل الدخول: يلزم توثيق حديث.",
    self_approval_denied: "لا يمكنك الموافقة على اقتراحك أنت.",
    self_approval_no_longer_allowed: "لم تعد موافقة صاحب الاقتراح مسموحًا بها: يلزم شخص آخر.",
    not_authorized: "صاحب الاقتراح وحده يستطيع فعل ذلك.",
    proposal_not_found: "الاقتراح غير موجود.",
    candidate_not_found: "المرشَّح غير موجود.",
    proposal_expired: "انتهت صلاحية الاقتراح.",
    approval_expired: "انتهت صلاحية الموافقة.",
    approver_no_longer_qualified: "لم يعد الموافِق مؤهَّلًا.",
    fingerprint_mismatch: "تغيّر الاقتراح: أعد التحميل وراجعه من جديد.",
    proposal_not_pending: "لم يعد الاقتراح ينتظر قرارًا.",
    proposal_not_approved: "الاقتراح غير موافَق عليه.",
    proposal_not_open: "لم يعد الاقتراح مفتوحًا.",
    proposal_not_stale: "الدليل ليس قديمًا.",
    proposal_not_awaiting_note: "لا تُنتظر ملاحظة.",
    operation_already_executed: "نُفِّذ مسبقًا.",
    position_disagreement_unacknowledged: "المركز مختلف: يلزم ملاحظة وإقرار.",
    stale_evidence: "تغيّر الدليل منذ الاقتراح.",
    identity_conflict: "يمنع تعارض في الهوية هذا القرار.",
    already_mapped: "هذا اللاعب مطابَق مسبقًا.",
    proposal_already_open: "يوجد اقتراح مفتوح لهذا المرشَّح بالفعل.",
    ignore_refused_id_in_lineup: "يظهر هذا المعرّف في تشكيلة مباراة: لا يمكن تجاهله.",
    reason_required: "يلزم سبب من 10 إلى 500 حرف.",
    note_required: "يلزم نص من 10 إلى 500 حرف.",
    invalid_proposal: "اقتراح غير صالح.",
    invalid_filter: "مرشِّح غير صالح.",
    invalid_decision: "قرار غير صالح.",
    idempotency_conflict: "أُرسلت هذه العملية سابقًا بمحتوى مختلف.",
    supporting_dependency_required:
      "يجب أن تستند هوية Flashscore إلى ربط Sofascore تمت مراجعته: حدّده.",
    supporting_dependency_invalid: "فئة الدليل المذكورة غير صالحة.",
    supporting_dependency_not_applicable: "هذا الاقتراح لا يأخذ ربط Sofascore داعمًا.",
    supporting_mapping_missing: "ربط Sofascore الداعم غير موجود.",
    supporting_mapping_not_sofascore: "يجب أن يكون الربط الداعم ربطًا من Sofascore.",
    supporting_mapping_inactive: "ربط Sofascore الداعم لم يعد نشطًا.",
    supporting_mapping_unreviewed: "ربط Sofascore الداعم لم يتم عبر المسار المراجَع.",
    supporting_mapping_target_mismatch: "ربط Sofascore الداعم يشير إلى لاعب آخر.",
    supporting_mapping_changed: "تغيّر ربط Sofascore الداعم منذ الموافقة: حدّث الاقتراح.",
    evidence_refs_required: "مراجع الدليل مطلوبة.",
    mapping_unavailable: "خدمة المطابقة غير متاحة.",
  },
  clubLabel,
};

export const PLAYER_MAPPING_COPY: Readonly<Record<Lang, PlayerMappingCopy>> = { fr, ar };

export const getPlayerMappingCopy = (lang: string): PlayerMappingCopy => (lang === "ar" ? ar : fr);

/** The sentence for a refusal code, falling back to the unavailable one. */
export function mappingErrorMessage(copy: PlayerMappingCopy, code: string): string {
  return (copy.errors as Record<string, string>)[code] ?? copy.errors.mapping_unavailable;
}
