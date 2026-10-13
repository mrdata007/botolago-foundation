# Compléments à la Politique de confidentialité pour BotolaGO+

> **Projet — à valider par un juriste avant publication.**
> Brouillon pour l'avocat du propriétaire, à intégrer dans la Politique de confidentialité par une
> version ultérieure. Il ne dépend pas de la version 1.4 en préparation sur une autre branche
> (notifications push) : le juriste fusionnera les textes. Ne pas lier depuis une page publique.
> Les passages **[À COMPLÉTER : …]** sont des décisions ou informations manquantes ; les questions
> correspondantes sont dans `QUESTIONS_FOR_LAWYER.md` (L1 à L11).

Politique actuelle de référence : version 1.3 du 6 octobre 2026, sections numérotées 1 à 13.

## A. Nouvelles données (à ajouter au tableau de la section 2)

| Catégorie                               | Données                                                                                                                                                                                                                        | Source                          |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------- |
| Abonnement BotolaGO+                    | formule (mensuelle ou annuelle), état (actif, résilié mais en cours, en grâce, expiré, remboursé), dates de début, de fin de période et de résiliation, canal d'achat (site, App Store, Google Play), édition de carte choisie | générées par votre abonnement   |
| Facturation et paiement (site)          | montant TTC payé, devise, date, référence de transaction du prestataire, numéro de facture, résultat du paiement (réussi, échoué, remboursé, contesté) ; **pas de numéro de carte**                                            | prestataire de paiement et vous |
| Achats via les magasins                 | identifiant d'achat ou de transaction d'origine fourni par Apple ou Google, identifiant d'abonné attribué par RevenueCat, état du droit d'accès                                                                                | Apple, Google, RevenueCat       |
| Rappels                                 | date du rappel envoyé 3 jours avant le renouvellement mensuel                                                                                                                                                                  | générées par l'Application      |
| Réglages de confidentialité de la carte | votre choix de montrer ou non l'historique de votre carte aux membres de vos ligues **[À COMPLÉTER : valeur par défaut — décision juridique]**                                                                                 | vous                            |
| Support                                 | échanges liés à l'abonnement, demandes de remboursement                                                                                                                                                                        | vous                            |

**Précision à reprendre dans la phrase finale de la section 2.** La phrase actuelle « Nous ne
collectons ni données bancaires, … » devient : « Nous ne collectons ni ne conservons vos numéros de
carte bancaire : le paiement est effectué sur la page sécurisée de notre prestataire de paiement ou
par Apple ou Google. Nous recevons seulement le résultat du paiement et une référence de
transaction. » **[À COMPLÉTER : valider la formulation avec le prestataire retenu, qui peut
renvoyer les quatre derniers chiffres et le type de carte.]**

## B. Visibilité publique de l'édition de carte

L'édition de carte choisie par un membre (Holo, Électrique, Pixels ou Chrome) est visible par les
autres utilisateurs dans les classements, les ligues, le profil et l'image de partage. Elle permet
de déduire que la personne est, ou a été, membre BotolaGO+. Les informations de paiement, de formule
et de date d'achat ne sont **pas** visibles publiquement.

**[À COMPLÉTER : le juriste doit dire si cette visibilité est une donnée personnelle traitée sur la
base du contrat ou nécessite un consentement ou une option de masquage ; décider s'il faut proposer
un réglage « masquer mon édition » ; voir L6.]**

## C. Finalités et bases légales (à ajouter au tableau de la section 3)

| Finalité                                                                                                                              | Base légale                                                                                                                                                            |
| ------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Gérer votre abonnement BotolaGO+ : encaisser, activer et arrêter l'accès, appliquer les avantages                                     | exécution du contrat (Conditions BotolaGO+)                                                                                                                            |
| Afficher votre édition de carte aux autres utilisateurs                                                                               | exécution du contrat **[À COMPLÉTER : à confirmer, voir B]**                                                                                                           |
| Fournir la carrière détaillée et les duels détaillés avec les membres de vos ligues, selon les réglages de confidentialité de chacun  | exécution du contrat ; **[À COMPLÉTER : base légale de la divulgation de l'historique de l'autre personne dans le duel — intérêt légitime ou consentement ; voir L6]** |
| Envoyer le rappel 3 jours avant le renouvellement et les messages de service sur l'abonnement (paiement échoué, fin de période, reçu) | exécution du contrat et obligation légale d'information du consommateur                                                                                                |
| Établir les factures, tenir la comptabilité, répondre aux obligations fiscales                                                        | obligation légale **[À COMPLÉTER : textes à citer par l'expert-comptable ; voir L8]**                                                                                  |
| Traiter les remboursements, contestations de paiement et litiges                                                                      | exécution du contrat et intérêt légitime                                                                                                                               |
| Prévenir la fraude au paiement et les abus (partage de compte, remboursements frauduleux)                                             | intérêt légitime                                                                                                                                                       |
| Vérifier votre âge au moment du paiement                                                                                              | **[À COMPLÉTER : à définir selon la décision sur L7]**                                                                                                                 |

Aucune donnée d'abonnement n'est utilisée pour modifier vos points, vos notes, vos paliers ni
l'ordre des classements.

## D. Sous-traitants et destinataires (à ajouter au tableau de la section 5)

| Prestataire                                                      | Rôle                                                                                                                                                             | Localisation des données                                                                     |
| ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| **[À COMPLÉTER : prestataire de paiement marocain, non choisi]** | encaissement des paiements par carte sur le site : reçoit les données de carte et de transaction, nous renvoie le résultat                                       | **[À COMPLÉTER : Maroc ou autre]**                                                           |
| Apple (App Store)                                                | encaissement et gestion des abonnements achetés dans l'application iPhone ; Apple détermine ses propres finalités pour les données de paiement                   | selon la politique d'Apple                                                                   |
| Google (Google Play)                                             | idem pour l'application Android                                                                                                                                  | selon la politique de Google                                                                 |
| RevenueCat                                                       | service de gestion des abonnements des magasins : relie les achats Apple et Google à votre compte et fournit l'état du droit d'accès ; sous-traitant de BotolaGO | **[À COMPLÉTER : localisation des serveurs — à obtenir de RevenueCat, États-Unis ou autre]** |
| Supabase                                                         | déjà indiqué : hébergement des enregistrements d'abonnement et de facturation                                                                                    | Union européenne — Paris                                                                     |
| Resend                                                           | déjà indiqué : e-mails de service (reçus, rappels) si ce canal est retenu                                                                                        | Union européenne — Irlande                                                                   |

**[À COMPLÉTER : le juriste vérifie les contrats de sous-traitance (accord de traitement des
données) à signer avec chaque prestataire ; Apple et Google étant responsables de traitement pour
leurs propres paiements, ils ne sont pas des sous-traitants au sens strict — à confirmer.]**

## E. Transferts hors du Maroc (à ajouter à la section 6)

Les prestataires listés en D peuvent traiter vos données hors du Maroc (RevenueCat, Apple, Google,
le cas échéant le prestataire de paiement). Ces transferts sont encadrés par des clauses
contractuelles et, lorsque la loi 09-08 l'exige, par l'autorisation de la CNDP (article 43).

**[À COMPLÉTER : pays d'accueil exacts ; garanties retenues ; dépôt ou mise à jour de la
déclaration/autorisation CNDP pour les nouveaux traitements — facturation et paiement, abonnement,
comparaison entre membres d'une même ligue, sous-traitants situés à l'étranger. La section 1
indique aujourd'hui « Déclaration CNDP : déclaration en cours ». Voir L6.]**

## F. Durées de conservation (à ajouter au tableau de la section 7)

| Données                                                                                                     | Durée                                                                                                                                                                                                                                                                                                                             |
| ----------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| État de l'abonnement et édition choisie                                                                     | pendant la vie du compte ; effacés à la suppression du compte (sous 7 jours comme le compte)                                                                                                                                                                                                                                      |
| Enregistrements de paiement et de facturation (factures, références de transaction, événements de paiement) | **5 ans** (durée retenue par l'éditeur le 13 octobre 2026 ; conformité aux règles comptables à confirmer par l'expert-comptable, voir L8). Après suppression du compte, ces enregistrements sont conservés **détachés de votre identité** (pseudonymisés) pendant cette durée seulement |
| Journaux d'événements du prestataire (webhooks)                                                             | **[À COMPLÉTER : durée proposée, par exemple 13 à 24 mois, sauf obligation comptable]**                                                                                                                                                                                                                                           |
| Messages de support sur l'abonnement                                                                        | 2 ans après clôture de la demande (comme le support actuel)                                                                                                                                                                                                                                                                       |

À la suppression du compte, un abonnement du site en cours est résilié d'abord. Pour un
abonnement acheté via Apple ou Google, la suppression du compte BotolaGO **n'annule pas
l'abonnement du magasin** : il faut le résilier dans les réglages du magasin **[À COMPLÉTER :
message d'avertissement exact avant suppression ; voir le runbook de suppression de compte]**.

## G. Vos droits (à ajouter à la section 8)

Les droits d'accès, de rectification, d'opposition et de suppression s'appliquent aussi aux données
d'abonnement. La suppression ne peut pas porter sur les enregistrements que la loi nous oblige à
conserver (comptabilité) ; ils restent séparés de votre identité. Vous pouvez à tout moment masquer
l'historique de votre carte aux membres de vos ligues dans votre profil **[À COMPLÉTER : confirmer
l'existence et l'emplacement de ce réglage]**. Les demandes se font à support@botolago.com
**[À COMPLÉTER : adresse dédiée aux abonnements ?]**.

## H. Sponsors et publicité (section 4) et mineurs (section 10)

- **Section 4.** Voir `terms-section-11-update.fr.md` : la phrase « BotolaGO est financé par le
  sponsoring » doit être alignée sur la décision prise pour l'article 11 des CGU.
- **Section 10.** « L'Application est réservée aux personnes de 18 ans et plus » reste vrai ; la
  question d'une vérification d'âge au paiement est posée en L7.

## I. Version et date

À la fusion : numéroter la nouvelle version, indiquer la date d'entrée en vigueur et notifier dans
l'Application au moins 7 jours avant, comme le prévoit la section 12 actuelle.

---

_Projet — à valider par un juriste avant publication._
