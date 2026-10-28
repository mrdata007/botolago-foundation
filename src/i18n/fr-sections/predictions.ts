// The French dictionary, section: Pronostics (predictions.*).
// Loaded on demand, before the pages that use it render (`../fr-sections.ts`).
// A key that a page outside this section also renders belongs in
// `../dictionary-fr-core.ts`; `../fr-sections.test.ts` checks that.
export const frPredictions = {
  "predictions.all_done": "Tous vos pronostics sont faits",
  "predictions.tab.predict": "Mes pronos",
  "predictions.tab.board": "Classement",
  "predictions.tabs_label": "Sections des pronostics",
  "predictions.round.previous": "Journée précédente",
  "predictions.round.next": "Journée suivante",
  "predictions.rules.title": "Comment gagner des points",
  "predictions.rules.chip_exact": "Score exact · 3 pts",
  "predictions.rules.chip_outcome": "Bon résultat · 1 pt",
  "predictions.rules.exact": "Score exact : 3 points",
  "predictions.rules.outcome": "Bon vainqueur ou bon match nul : 1 point",
  "predictions.rules.miss": "Sinon : 0 point",
  "predictions.rules.lock": "Chaque pronostic se verrouille au coup d'envoi de son match.",
  "predictions.rules.postponed": "Match reporté : votre pronostic est gardé pour la nouvelle date.",
  "predictions.rules.ties":
    "À égalité de points, le plus de scores exacts passe devant ; sinon, ex æquo.",
  "predictions.save.saving": "Enregistrement…",
  "predictions.save.saved": "Enregistré",
  "predictions.save.offline": "Hors connexion · nouvel essai automatique",
  "predictions.save.failed": "Pronostic non enregistré",
  // The save was refused until the one-time code is in (`PT403
  // mfa_required`): not a failure, the picks wait. Short, for the bar; the
  // toast (`auth.step_up.toast`) says where the code comes from.
  "predictions.save.step_up": "Code requis pour enregistrer",
  "predictions.guest.saved_local": "Enregistré sur cet appareil",
  "predictions.guest.cta_title": "Entrez au classement",
  "predictions.guest.unranked": "Vous : {points} (non classé)",
  "predictions.guest.storage_blocked":
    "Votre navigateur bloque l'enregistrement : créez un compte pour garder vos pronostics.",
  "predictions.board.round": "Journée",
  "predictions.board.season": "Saison",
  "predictions.board.scope_label": "Classement de la journée ou de la saison",
  "predictions.board.col_rank": "Rang",
  "predictions.board.col_player": "Joueur",
  "predictions.board.col_points": "Pts",
  "predictions.board.col_exact": "Exacts",
  "predictions.board.col_rounds": "J.",
  "predictions.board.you": "Vous",
  "predictions.board.tied": "ex æquo",
  "predictions.board.empty": "Le classement apparaît après le premier match terminé.",
  "predictions.board.load_more": "Afficher plus",
  "predictions.board.empty_cta": "Faire mes pronostics",
  "predictions.state.unavailable": "Pronostics momentanément indisponibles",
  "predictions.state.coming_soon": "Bientôt disponible",
  "predictions.state.coming_soon_body":
    "Pronostiquez les scores de chaque journée de la Botola Pro et défiez vos amis.",
  "predictions.state.no_fixtures": "Les matchs de cette journée ne sont pas encore publiés.",
  "predictions.claim.pending": "Ajout de vos pronostics de visiteur à votre compte…",
  "predictions.claim.failed_body":
    "Vos pronostics restent sur cet appareil. Réessayez avant le coup d’envoi pour les ajouter à votre compte.",
  "predictions.claim.retrying": "Nouvel essai automatique en cours…",
  "predictions.personal.loading": "Chargement de vos pronostics enregistrés…",
  "predictions.personal.failed":
    "Impossible de charger vos pronostics. L’édition est suspendue pour les préserver. Réessayez.",

  /* Pronostics (BG-0146): leagues and invitations */
  "predictions.tab.leagues": "Ligues",
  "predictions.leagues.title": "Mes ligues",
  "predictions.leagues.empty": "Pas encore de ligue. Rejoignez celle de vos amis avec leur code.",
  "predictions.leagues.join": "Rejoindre une ligue",
  "predictions.leagues.code_label": "Code d'invitation",
  "predictions.leagues.join_button": "Rejoindre",
  "predictions.leagues.code_invalid": "Code invalide",
  "predictions.leagues.joined": "Vous avez rejoint « {league} »",
  "predictions.leagues.already_member": "Vous êtes déjà membre de cette ligue",
  "predictions.leagues.limit": "Limite de ligues atteinte",
  "predictions.leagues.full": "Cette ligue est complète",
  "predictions.leagues.invite_generic_fantasy": "Vous êtes invité dans une ligue Fantasy",
  "predictions.leagues.invite_explain":
    "Un ami vous invite dans sa ligue privée BotolaGO. Vous ne rejoignez la ligue que lorsque vous touchez « Rejoindre ».",
  "predictions.leagues.invite_join_fantasy": "Rejoindre la ligue en Fantasy",
  "predictions.leagues.invite_predictions_hint":
    "Vous préférez les pronostics ? Rejoindre en Pronostics",
  "predictions.leagues.invite_join_predictions": "Rejoindre en Pronostics (gratuit)",
  "predictions.leagues.invite_fantasy_hint":
    "Vous avez une équipe Fantasy ? Rejoignez aussi en Fantasy",
  "predictions.leagues.invite_signup": "Créez un compte pour rejoindre la ligue",
  "predictions.leagues.invite_missing":
    "Ce lien d'invitation est incomplet. Demandez le code à la personne qui vous a invité.",
  "predictions.leagues.share_link": "Partager le lien d'invitation",
  "predictions.leagues.share_text":
    "Rejoins ma ligue « {league} » sur BotolaGO et pronostique la Botola avec nous : {link}",
  "predictions.leagues.copy_link": "Copier le lien",
  "predictions.leagues.code_once": "Copiez-le maintenant : il ne s'affichera plus",
  "predictions.leagues.code_hint": "Code se terminant par {hint}",
  "predictions.leagues.leave": "Quitter la ligue",
  "predictions.leagues.leave_confirm": "Quitter « {league} » ? Vos pronostics restent enregistrés.",
  "predictions.leagues.left": "Vous avez quitté « {league} »",
  "predictions.leagues.via_fantasy": "Membre Fantasy",
  "predictions.leagues.via_predictions": "Membre Pronostics",
  "predictions.leagues.see_fantasy": "Voir le classement Fantasy",
  "predictions.leagues.create": "Créer une ligue",
  "predictions.leagues.name_label": "Nom de la ligue",
  "predictions.leagues.name_invalid": "Le nom doit compter de 3 à 80 caractères.",
  "predictions.leagues.create_button": "Créer",
  "predictions.leagues.create_limit":
    "Vous avez atteint le nombre maximum de ligues créées cette saison",
  "predictions.leagues.reset_code": "Nouveau code d'invitation",
  "predictions.leagues.reset_warning": "L'ancien code ne fonctionnera plus.",
  "predictions.leagues.signed_out":
    "Connectez-vous pour voir vos ligues, en rejoindre ou en créer une.",
  "predictions.leagues.members_one": "1 membre",
  "predictions.leagues.members_two": "2 membres",
  "predictions.leagues.members_few": "{n} membres",
  "predictions.leagues.members_other": "{n} membres",
  "predictions.league.not_played_one": "1 membre n'a pas encore joué",
  "predictions.league.not_played_two": "2 membres n'ont pas encore joué",
  "predictions.league.not_played_few": "{n} membres n'ont pas encore joué",
  "predictions.league.not_played_other": "{n} membres n'ont pas encore joué",
  "predictions.error.league_access": "Réservé aux membres de cette ligue",
  "predictions.share.whatsapp": "WhatsApp",
  "predictions.league.tab": "Pronostics",
  "predictions.share.before":
    "J'ai fait mes pronostics pour la Journée {n} de la Botola sur BotolaGO. À toi !",
  "predictions.share.title": "Partager mes pronostics",
} as const satisfies Record<string, string>;
