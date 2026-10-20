# BotolaGO UX writing review and implementation

This implementation follows the [committed brief](2026-10-20-ux-writing-brief.md).
The shared [French/Arabic glossary](UX_WRITING_GLOSSARY.md) records the voice and
terminology used. Product behavior, numeric values, access rules and delivery
logic are preserved. No shared database writes, messages or deployments were
performed. The notification-template migration was exercised only in an isolated,
disposable PostgreSQL container, which was removed after verification.

## Main findings and representative changes

The main problems were unexplained Fantasy money notation, ambiguous actions and
costs, headings that did not identify the task, redundant promotional subtitles,
technical details, and claims broader than what the implementation does. French
and Arabic were reviewed as separate experiences and then checked together.

The dictionaries revise 196 existing French values and 190 existing Arabic
values, and add 18 contextual keys in both languages. Existing keys are retained.

| Screen                    | Previous wording                                            | Implemented wording                                                      | Why                                                                                               |
| ------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| Fantasy introduction      | Un budget de {budget} M                                     | Un budget de {budget} millions                                           | Introduces the unit before shorthand. The body explains that prices and the game budget share it. |
| Fantasy introduction (AR) | ميزانية {budget} م                                          | ميزانية قدرها {budget} مليون                                             | Avoids an unexplained abbreviation on first use.                                                  |
| Transfer summary          | Coût / Banque, beside bare figures                          | Points déduits / Budget restant, with pts / M                            | Distinguishes points from game money.                                                             |
| Transfer summary (AR)     | التكلفة / الرصيد                                            | النقاط المخصومة / الميزانية المتبقية                                     | Makes the consequence and balance explicit.                                                       |
| Replacement picker        | vendu {price} M                                             | prix de vente : {price} M                                                | The transfer has not yet happened.                                                                |
| Squad error               | Répartition par poste invalide (2 GK, 5 DEF, 5 MID, 3 FWD). | Choisissez 2 gardiens, 5 défenseurs, 5 milieux et 3 attaquants.          | Explains how to recover using football terms.                                                     |
| Transfer confirmation     | Confirmer                                                   | Confirmer les transferts                                                 | Names the consequential action. Lineup saving and chip activation also have distinct labels.      |
| Email verification        | Vérification                                                | Confirmez votre e-mail                                                   | Identifies the current task; the address is isolated left to right.                               |
| Resend success            | Renvoyer le code                                            | Nouveau code envoyé. / أُرسل رمز جديد.                                   | Confirms completion rather than repeating a command.                                              |
| Registration              | Rejoignez la communauté BotolaGO en moins d’une minute.     | Subtitle removed                                                         | Removes repetition and an unsupported completion-time claim.                                      |
| News pagination           | Tout voir                                                   | Voir plus d’articles                                                     | The button appends one page.                                                                      |
| Profile editing           | Terminer                                                    | Enregistrer / حفظ التغييرات                                              | Distinguishes editing from onboarding.                                                            |
| Card styling              | Votre note ne change jamais, seul le style change.          | Changer de style ne modifie pas votre note.                              | Ratings can change during the season.                                                             |
| Card styling (AR)         | تقييمك لا يتغيّر أبدًا…                                     | تغيير مظهر البطاقة لا يغيّر تقييمك.                                      | Scopes the statement to the style change.                                                         |
| Manual payment            | Votre reçu et votre code partent ensemble…                  | Ajoutez votre reçu dans WhatsApp. Votre code est déjà dans le message.   | The link prepopulates text; the reader must attach the receipt.                                   |
| Manual payment (AR)       | يصلنا إيصالك ورمزك معًا…                                    | أرفق إيصال الدفع في واتساب. رمزك موجود في الرسالة.                       | States the actual next step.                                                                      |
| Payment availability      | Revenez dans quelques jours…                                | Paiement indisponible pour le moment. Actualisez la page pour réessayer. | Avoids a launch-date promise and covers missing payment details/code.                             |
| Recap metadata            | Calcul v{n}                                                 | Removed from visible text; diagnostic data attribute retained            | Users need the result and correction notice, not an implementation version.                       |
| Fantasy email             | Tu reçois cet e-mail car tes rappels…                       | Vous recevez cet e-mail car vos rappels…                                 | Applies the established French register across channels.                                          |

Working wording was retained, including approved Arabic football/chip names and
the intentional French **Saison** / Arabic **اشتراك** offer naming. Dynamic
values, rich-text markers and plural families remain intact. No original
translation key was deleted. New contextual keys prevent unrelated states from
sharing a generic message.

## Product areas and implementation files

- **Shared copy:** both dictionaries, plus the glossary and the i18n warning
  baseline explanation. French and Arabic changes include navigation/search,
  notifications, football statistics and empty states, news and saved articles,
  authentication, profile/security, Prospects, Fantasy/Pronostics and Plus.
- **Accounts and core content:** auth shell/forms, profile editing, notification
  entry, home/news/club error states and news pagination. The subtitle accepts
  React content so email addresses can retain their direction in Arabic.
- **Fantasy:** introduction, squad builder, player picker, team, transfers and
  confirmation, rules, profile, hub and import feedback. `FantasyAmount` keeps
  one-decimal values on the existing million scale, adds compact visual units
  and a full accessible unit, and isolates numerals. Points are separate.
- **Plus and manager cards:** briefing prices, recap metadata and copy for
  offers/payment, membership, rivals, trophies, sharing, manager statistics and
  insufficient-data states. Preserve prices/dates from existing service data.
- **Notifications:** selected team-reminder and points-ready email renderers,
  plus the existing notification renderer. French uses vous; Arabic dynamic
  point totals use count-neutral labels. Zero and negative scores remain valid.
  Timing guards, consent, scheduling, escaping and delivery behavior are unchanged.
  A guarded forward-only migration prepares the same French register for future
  round-opening in-app notices. It retains the old edition and Arabic wording,
  and has not been applied to a shared database. Its pgTAP regression is included;
  local checks used an isolated PostgreSQL template fixture rather than the full
  Supabase stack.
- **Release preparation:** after the owner requested merge and publication,
  `scripts/backend/apply-20261020092736-ux-writing.sql` was added for the scoped
  template migration. Its default full-path rehearsal deliberately rolls back;
  apply requires the same guards and records the exact migration bytes.
- **Verification:** existing exact-copy assertions were deliberately updated;
  amount, notification count and account/Plus browser scenarios exercise relevant
  behavior rather than snapshotting every sentence.

The PR file list is the complete implementation inventory. Staff-only admin,
partner-demo copy, licensed article content and applied migrations are excluded.

## Factual discrepancies and decisions

| Issue                                            | Evidence and resolution                                                                                                                                                                                                                                                                                  |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fantasy “100 M” has no established real currency | Rules and services store a million-based numeric game scale. Explain millions; do not call them dirhams or rename them credits.                                                                                                                                                                          |
| Event-based scoring versus newer rating rules    | The immutable v1 document describes the original rules. Later rating/publication decisions supersede parts of it. The introduction now refers to performances; detailed rules keep their existing mode-aware service data.                                                                               |
| Selection locked until results are validated     | The staged lifecycle can open the next round while previous points remain provisional. Copy now scopes locking to the selected round, without promising when the next one opens.                                                                                                                         |
| Chip cancellation                                | V1 says confirmed activation is non-cancellable; local mode and the current UI can allow cancellation, and cloud behavior uses activeChipCancellable. No blanket irrevocability claim was introduced; behavior is unchanged. This documentation/implementation difference remains for the product owner. |
| Public-league caps and random assignment         | Copy claimed 15 private / 3 public leagues and random assignment. Targeted inspection did not establish those caps; the current handler picks the first eligible returned league. Remove those claims and offer private leagues as the fallback.                                                         |
| Monthly/yearly versus seasonal Plus offer        | Earlier briefs describe historical monthly/12-month offers. Current season brief/contracts govern the one-off seasonal purchase. Replacement text preserves dynamic price and expiry rather than hardcoding them.                                                                                        |
| Receipt automatically attached/sent              | PlusPayScreen builds a WhatsApp URL containing the account code. It does not attach a file or send the message. Copy now instructs the reader to attach the receipt.                                                                                                                                     |
| Ratings published 5–16 days after matches        | Older provider-lag descriptions are not a guaranteed publication schedule. Rival/recap text refers to publication without a fixed delay.                                                                                                                                                                 |
| Ad-free benefit                                  | Existing offer documentation and UI promise no advertising. This pass scopes the claim to paid access. No advertising integration or separate member-suppression mechanism was found; no new ad behavior was added.                                                                                      |

Live switches, current payment configuration, staff-entered payment notes and
delivery availability were not queried. Uncertainty about these is not replaced
with a promise in the interface. New Arabic lines have not received a separate
native-reader sign-off; prior owner-approved terminology remains enforced.

## Validation and evidence

Final results and exact rendering coverage are recorded in
[the evidence report](evidence/2026-10-20-ux-writing/README.md).

Local mocks establish rendering and local interactions, not production service
availability. Browser email captures establish layout, not Gmail/Outlook/Apple
Mail delivery. Real mobile hardware, native permission dialogs, live payments,
production accounts and live notification delivery were not exercised.

The mock squad-creation route can redirect to an existing team, and the
prediction-league route can redirect to the prediction hub. Record final paths
instead of claiming these as separately rendered flows. Transfer checks exercise
the shared picker/builder surfaces. Rare lifecycle, recovery and data-dependent
states additionally rely on the existing component tests and source review;
they are not all independently reached in a browser.
