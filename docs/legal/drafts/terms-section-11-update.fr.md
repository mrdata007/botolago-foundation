# Proposition de modification de l'article 11 des CGU

> **Projet — à valider par un juriste avant publication.**
> Ne pas lier depuis une page publique. Les CGU en vigueur sont la version 1.1 du 24 septembre
> 2026 (`src/content/legal/documents.ts`, constante `TERMS`, bloc FR). Aucun texte public n'est
> modifié par ce document.

## 1. Texte actuel (cité à l'identique)

Article **« 11. Sponsors et publicité »** :

> L'Application est financée par le sponsoring et peut afficher des contenus publicitaires ou de
> marque. BotolaGO ne vend pas vos données personnelles aux sponsors ; seules des statistiques
> agrégées et anonymisées leur sont communiquées (voir Politique de confidentialité).

Texte voisin dans la Politique de confidentialité v1.3, section **« 4. Sponsors et publicité »** :

> BotolaGO est financé par le sponsoring. Nous ne vendons ni ne louons vos données personnelles.
> Les sponsors reçoivent uniquement des statistiques agrégées et anonymisées (nombre
> d'utilisateurs, taux de participation, répartition par ville ou tranche d'âge). Une offre de
> sponsor ne vous est adressée nominativement que si vous y avez consenti.

## 2. Pourquoi il faut le changer

- « financée par le sponsoring » deviendra inexact si BotolaGO+ finance une part du service.
- « peut afficher des contenus publicitaires » est en tension avec la promesse faite aux membres
  (« Sans publicité »). Le texte doit dire que les membres n'en verront pas, sans rendre faux ce qui
  est dit aux autres utilisateurs. À ce jour, l'Application n'affiche aucune publicité.
- L'article 5 des CGU dit : « aucun achat, aucune mise et aucun dépôt d'argent ne sont requis pour
  jouer » ; cela reste vrai, mais l'article 5 gagne à renvoyer à BotolaGO+ pour qu'on ne lise pas
  l'abonnement comme une contradiction (voir 4 ci-dessous).

## 3. Proposition de nouveau texte pour l'article 11

**Option A — sponsoring maintenu à côté de l'abonnement.**

> **11. Financement, abonnement BotolaGO+ et publicité**
>
> L'Application est financée par l'adhésion facultative BotolaGO+ et, le cas échéant, par des
> partenariats de marque ou de sponsoring. À la date de ces conditions, l'Application n'affiche pas
> de publicité. Si des contenus publicitaires ou de marque devaient y apparaître, les membres
> BotolaGO+ n'en verraient pas pendant leur période d'adhésion, selon les Conditions BotolaGO+.
> BotolaGO ne vend pas vos données personnelles aux sponsors ou annonceurs ; seules des statistiques
> agrégées et anonymisées leur sont communiquées (voir Politique de confidentialité). BotolaGO+ est
> facultatif, ne modifie ni les points, ni les notes, ni les paliers, ni l'ordre des classements, et
> est régi par les Conditions BotolaGO+.

**Option B — si le sponsoring est abandonné.**

> **11. Financement et abonnement BotolaGO+**
>
> L'Application est financée notamment par l'adhésion facultative BotolaGO+, régie par les
> Conditions BotolaGO+. Elle n'affiche pas de publicité. Les membres BotolaGO+ bénéficient d'un
> engagement « sans publicité » pour la durée de leur adhésion. BotolaGO ne vend pas vos données
> personnelles.

**[À COMPLÉTER : le propriétaire décide si le sponsoring continue (option A) ou non (option B) ;
le juriste vérifie la formulation de la promesse « sans publicité » ; voir L5 et L10 pour les
contrats de sponsors et licences d'identité de clubs.]**

## 4. Autres articles des CGU à toucher en même temps

| Article actuel                                                                                | Changement proposé                                                                                                                                                                                                 |
| --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1 « Éditeur et objet » (« un jeu de fantasy football gratuit »)                               | Ajouter : « avec une adhésion facultative BotolaGO+ » ; le jeu reste gratuit.                                                                                                                                      |
| 5 « Nature du jeu » (« aucun achat … n'est requis pour jouer »)                               | Ajouter une phrase : « L'adhésion facultative BotolaGO+ n'est pas nécessaire pour jouer et n'apporte aucun avantage de jeu. »                                                                                      |
| 12 « Disponibilité et modifications »                                                         | Rien de plus ; le délai de préavis de 7 jours est repris dans les Conditions BotolaGO+.                                                                                                                            |
| 13 « Responsabilité » (« magasins d'applications »)                                           | Rien ; Apple et Google y figurent déjà.                                                                                                                                                                            |
| 14 « Résiliation » (« La suppression du compte entraîne la perte des points, classements … ») | Ajouter : la suppression du compte met fin à l'adhésion BotolaGO+ ; un abonnement acheté via Apple ou Google doit être résilié dans le magasin ; règle de remboursement : voir Conditions BotolaGO+ (décision L4). |
| 15 « Droit applicable et litiges »                                                            | Aligner avec l'article 18 des Conditions BotolaGO+ (loi 31-08).                                                                                                                                                    |
| Nouveau renvoi                                                                                | Dans l'article 1, citer les Conditions BotolaGO+ comme document complémentaire, avec leur lien, **seulement au moment de la publication**.                                                                         |
| 3 « Éligibilité » (« 18 ans révolus »)                                                        | Inchangé ; voir L7 pour la vérification d'âge au paiement.                                                                                                                                                         |

## 5. Procédure de publication (rappel)

- Numéroter la nouvelle version des CGU et celle de la Politique de confidentialité ensemble.
- Notifier dans l'Application au moins 7 jours avant l'entrée en vigueur (article 12 des CGU).
- Mettre à jour la version arabe en même temps ; la version française prévaut (article 16).
- Le test de contenu `src/content/legal/legal-content.test.ts` vérifie la structure des textes : il
  devra être relancé quand le texte réel sera modifié.

---

_Projet — à valider par un juriste avant publication._
