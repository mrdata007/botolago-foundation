# Subtext and UX copy overhaul: report

Branch `claude/clever-heisenberg-pcbpxo` (8 commits on top of `8779e75`). Nothing is merged,
deployed or applied to a database. No pull request is open.

Files next to this report:

- `COVERAGE.md`: every screen found, whether it was rendered, what was seen (deliverable A).
- `COPY_TABLE.md`: before and after of every changed string, French and Arabic (deliverable B).
- `screens/`: before and after pictures of the most improved screens (deliverable C).
- Brief committed before the first change: `docs/briefs/2026-10-16-subtext-copy-overhaul.md`.

## In short

- 211 pieces of supporting text changed: 96 rewritten, 71 shortened, 41 removed with the element that
  showed them, 3 added.
- Some elements were removed while their text stayed in use elsewhere, so the count of removed
  elements is higher than the count of removed texts.
- Nothing about a rule, a price, a deadline, a score or who gets what was changed.
- 101 of 108 screens and states were rendered and looked at. 7 could not be reached and are marked
  unverified below.

## A. Screen coverage

Method: the running app on sample data, signed out and signed in with the demo account, French and
Arabic, phone (390 px) and desktop (1366 px). 400 pages and 130 states (tabs, sheets, dialogs, errors)
were captured before the change and 400 after.

| Result                                           | Count |
| ------------------------------------------------ | ----- |
| Screens and states rendered and looked at        | 101   |
| Unreachable on sample data (marked "UNVERIFIED") | 7     |

Not reachable, so judged from the code only: the empty squad builder (`/fantasy/create`), a Pronostics
league page, two-step sign-in screens and the OAuth consent page, the Prospects empty and error states,
a published match recap, the unsubscribe success and error states, the home stories viewer, the offline
banner, and emails and push text. Full list with reasons: `COVERAGE.md`, section (b).

Left out on purpose: the admin console, developer sample pages, legal text.

## B. What changed (examples; every string is in `COPY_TABLE.md`)

| Screen                           | Before                                                                                                                    | After                                                  | Why                                                                      |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------ |
| Rules, budget answer             | "Vous disposez de 100.0 pour 15 joueurs…"                                                                                 | "Vous disposez de 100 M pour 15 joueurs…"              | the unit was missing                                                     |
| Rules, formations answer         | "au moins 3 défenseurs, au moins 2 milieux…"                                                                              | "1 gardien et l’une de ces formations : 3-4-3, 3-5-2…" | the old rule was wrong: every listed formation has 3 or more midfielders |
| Rules, intro                     | "…Les actions réalisées dans les vrais matchs déterminent votre score."                                                   | last sentence removed                                  | stale: points follow the rating from a set journée                       |
| Rules, "Règles du jeu" heading   | drawn above the intro that opens the same page                                                                            | hidden (kept for screen readers)                       | repeated the page title                                                  |
| Top players                      | subtitle repeated the title                                                                                               | removed                                                | adds nothing                                                             |
| Join a league                    | a disabled "Face à face" mode and its line                                                                                | removed                                                | advertised a mode that does not exist                                    |
| Landing page                     | hero state line twice, fact chips repeating the steps, "Pas encore prêt ?" card, four filler lines                        | removed                                                | the same thing said two or three times                                   |
| Landing, closing title           | "Votre équipe vous attend."                                                                                               | "Composez votre équipe."                               | a visitor has no team yet                                                |
| Signed-in home                   | row "15 joueurs · 100 M · Capitaine ×2 · date"                                                                            | removed                                                | rules the reader knows; the date is in the strip above                   |
| Notifications                    | body line under "Connectez-vous pour voir vos notifications"                                                              | removed                                                | restated the title                                                       |
| Login                            | subtitle under the title                                                                                                  | removed                                                | title and form say it                                                    |
| Match page, empty panels         | "Match reporté : pas de données à afficher."                                                                              | "Match reporté."                                       | the state is the information                                             |
| Prospects follow sheet           | "…suivre ses matchs, recevoir le Top 10 du lundi et l’ajouter à votre équipe Fantasy."                                    | "…suivre ce joueur et le retrouver sous « Suivis »…"   | promised three things the app does not do                                |
| Prospects ranking line           | "…600+ Minutes"                                                                                                           | segment removed                                        | the real minimum is 180 minutes                                          |
| BotolaGO+ recap                  | "Calcul v3"                                                                                                               | removed                                                | backend wording shown to fans                                            |
| Pay screen                       | "Les coordonnées de paiement arrivent bientôt." plus "Revenez dans quelques jours : le paiement n'est pas encore ouvert." | "Le paiement n’est pas encore ouvert."                 | says plainly what is true today                                          |
| Home section heading             | "Explorer BotolaGO" / "استكشف بوتولاجو"                                                                                   | "Autres sections" / "أقسام أخرى"                       | banned word, and a heading over ordinary tiles                           |
| Prizes hero title                | "Jouez gratuitement, gagnez des lots !"                                                                                   | "Des lots à gagner cette saison"                       | exclamation mark and a promise                                           |
| Tagline                          | "Actualité & Fantasy du football marocain"                                                                                | "Scores, actualités et Fantasy de la Botola"           | concrete; AR kept in line (chooser copy updated too)                     |
| Arabic starters                  | "رسمي"                                                                                                                    | "أساسي"                                                | mistranslation: "official" for "starter"                                 |
| Arabic outcome points            | "إصابة الفائز"                                                                                                            | "الفائز أو التعادل"                                    | read as "injury of the winner"                                           |
| Arabic league role (join screen) | "مسؤول الدوري" while elsewhere "منشئ الدوري"                                                                              | "منشئ الدوري" everywhere (French: "créateur")          | one word per concept                                                     |

Terms now used one way in French: journée (lower case in a sentence), Joker and jeton (never Wildcard),
créateur (league owner), règles (the game) against règlement (the prizes), moments forts, enregistrer.
In Arabic: الجولة, التقييم, منشئ الدوري, مؤشر الصعود (the Prospects score), دون 23.

Bugs found and fixed on the way:

- Resending a verification code confirmed with the button's own label ("Renvoyer le code"). It now has
  its own message.
- Saved articles told Arabic readers to sign in in French (text hard-coded in `saved-articles.ts`).
- A club's live match was labelled "Prochain match".
- Arabic landing page: the deadline date broke across lines and scrambled; it now stays in one piece.
- The "Score exact · 3 pts" chip was hard to read (3.64:1); it is now 5.69:1 in the light theme.
  This shared badge colour also touches three other badges (declared in the brief).

## C. Visual comparison

Pictures (left BEFORE, right AFTER) in `screens/`: landing (FR, AR), rules (FR, AR), join a league,
login, Prospects method (FR, AR), BotolaGO+, Curva.

Measured on 400 captured pages after the change (French and Arabic, phone and desktop):

- sideways overflow: 0 pages; page errors: 0; blank or error pages: 0 (the one 404 is intended);
- a lone "·" at a line end fixed on the Prospects title, a Prospects week title and the Pronostics
  progress line, measured at 360, 390 and 1366 px;
- readability of grey subtext was measured too (11,832 text elements): all pass 4.5:1 apart from the
  one chip above;
- looked at: better on landing, Fantasy hub, rules, top players, join a league, Curva lock, login,
  prizes, Prospects, method page, Pronostics, club page. Equal on home, profile, match, notifications,
  security. Nothing worse or broken.

Not done: BotolaGO+ below the fold, the league creator tab, the empty and no-fixtures states, the compare
picker sheet, and the unmounted components. About 120 changed strings were measured but not opened as
images. Dark theme was measured for contrast only, not looked at screen by screen.

## D. Implementation summary

Commits: `3675c18` brief; `a62bba5` text rewrites; `1884dc5` Fantasy and Prospects removals;
`e910fd6` landing, home, account and BotolaGO+ removals and three bugs; `85ce558` fixes from the final
review; `aab5ea3` Arabic score name.

- 55 files changed. Dictionaries: 211 keys changed, 41 removed, 3 added. One component deleted
  (`FantasyRuleChips`, unused after the home change).
- Tests edited (all because they pinned wording or an element that was deliberately removed):
  `StandingsTable`, `match-empty-states` (only the exact wording of five lines),
  `match-page.option-a`, `fantasy-rules.ssr`, `fantasy-league-invite`, `delivery-promise` (two removed
  keys), `profile-language-control`, `profile.saved`, `LandingLive`, Curva copy and render tests, club
  page (one test added).
- Tests that guard a rule were not weakened: `match-empty-states` rules, `plus.render`,
  `prospects-rename`, `wording-phase-c1`, `fantasy-glossary-ar`, `launch-copy`, the SEO end-to-end test,
  legal and the AI-notice rule.
- Not touched: `supabase/`, migrations, `scripts/backend/`, legal text, scoring, entitlements, prices.

Checks, run on the final state:

| Check                                                                             | Result                                        |
| --------------------------------------------------------------------------------- | --------------------------------------------- |
| Type check                                                                        | clean                                         |
| ESLint (changed files)                                                            | 0 errors                                      |
| Prettier                                                                          | clean                                         |
| Localization gate                                                                 | pass, all four baselines unchanged            |
| Unit tests (`bun test`)                                                           | 10,520 pass, 23 skipped, 1 fail               |
| Browser tests: SEO rendering                                                      | 9 of 9 pass (includes the Fantasy rules text) |
| Browser tests: anonymous, empty states, mobile readability, Prospects, Pronostics | 93 pass, 4 fail, 1 skipped                    |

The two kinds of failure were already there before this work:

- the one unit test is the Morocco Ramadan clock-change test (`UTC+0 in Ramadan 2027`);
- the four browser failures are the "search results" readability test: it needs a live search backend.
  I ran it against the original code and it fails the same way.

Reverted after the final review because they changed behaviour, not text: the success toasts after
sign-in and password update, and the error handling of four Fantasy components that are not mounted
anywhere.

## E. Independent reviewers

Two passes, each by an agent that had not written the proposals.

First pass (before any edit) found real problems and all were accepted:

- three tests protect a rule and would have been edited to pass: match panels (no promises before
  kick-off), BotolaGO+ vocabulary, Prospects naming. They were left untouched and the proposals that
  collided were dropped;
- about 11 places where French and Arabic said different things were reconciled;
- the dead-key deletions (about 120 rows) were not safe and were cancelled;
- several "improvements" were worse than the original and were rejected (for example a paywall title,
  a "100 % gratuit" claim next to a paid Saison, "Lot des 4 journées" against the legal "Lot mensuel").

Final pass (on the finished change): verdict "ship after fixes", no blocker. It read all 161 rewritten
French and Arabic pairs and the 52 removals, and confirmed that no rule, deadline, price or limit changed
meaning, that placeholders match in both languages, and that no forbidden path was touched.

Fixes accepted and applied: the Arabic role word on the join screen, the pay screen, leftover banned
words (Explorer, "!", اكتشف, استكشف), the Google sign-in reason in the Arabic draft warning, "Chip actif",
the Prospects ranking sentence, the two reverts above, and the declared list of changes beyond text.

Criticisms not applied, with reasons:

| Item                                                                 | Why not                                                                                       |
| -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| "Heureux de vous revoir" as the login title                          | pinned by `wording-phase-c1` (a rule test)                                                    |
| "Découvrir la Saison" and the other Plus "Découvrir" buttons         | `plus.render` pins one; the others need that decision first                                   |
| The deadline stated twice on the guest Fantasy hub                   | the second line is the deadline for a new team and can differ from the card above (see below) |
| Three "Choisir un joueur" prompts on the Prospects compare page      | a layout decision; left for you                                                               |
| The Prospects method intro still says "التنقيط / الجاهزية" in Arabic | that line is stored in the database                                                           |
| Landing hero sentence repeated on four other screens                 | left; the other copies are on screens with their own purpose                                  |
| `welcome.title`, `fantasy.intro.title` greetings                     | not changed yet                                                                               |

## Decisions that are yours

1. **Tu or vous.** The product writes _vous_ (about 500 strings against fewer than 30 _tu_). Your example
   "Compose ton équipe" was tu. The share and invite messages to friends are tu; nothing else is. I did not
   switch the product.
2. **Account deletion.** `profile.delete_confirm_kept` says only prizes and security logs are kept, but
   `/suppression-compte` lists five kinds of retained data. Left untouched; it needs you or legal.
3. **BotolaGO+ over-claims.** "Vous ne verrez jamais de publicité" (the app has no ads today but this
   is a promise), and "Holo, Électrique… Visibles dans les classements" (ranking rows draw no card).
   The paywall lists four benefits while the briefing, the rivals view and the trophy cabinet are locked
   too. Nothing changed here; these are claims, not wording.
4. **"Gratuit" and "aucun achat".** Said in about 50 French strings, next to a paid Saison (200 MAD).
5. **"أفضل 10" or "توب 10"** for the Prospects Top 10 in Arabic. Both exist; the share title and emails
   use "توب 10". Changing it touches an email function (needs a deploy) and four tests.
6. **Lifecycle words** (Verrouillée, Clôturée, Définitive, validée), and the Arabic pair قفل / اعتماد.
7. **"Saison" or "accès"** for BotolaGO+, and the words BotolaGO+ tests forbid (abonnement, renouvellement).
8. **"Pour vous" on the news tab** suggests personalisation that does not exist.
9. **"Lot du mois"** actually covers a block of four journées, while the legal text says "Lot mensuel".
10. **Arabic:** the word for a real match's captain, and the abbreviation for assists ("تم" or "ت.ح").

## Left for later (not done, on purpose)

- Emails (the Fantasy and notification emails say "Découvrez" in one preheader) and the 23 notification
  texts seeded by migrations: they need a deploy or a migration.
- Page titles and descriptions are French on about 30 routes when the reader chose Arabic.
- About 244 dictionary keys are not used by any screen, and four components are never mounted
  (`FantasyOnboarding`, `FantasyImportPrompt`, `ConflictBar`, `UnsavedBadge`). A separate cleanup, because
  it changes the localization baselines.
- The Arabic brand is written three ways in two share messages (`plus.recap.share_message`,
  `plus.tr.share_message`).
- Remaining lone "·" at line ends on the Prospects player header, the Arabic Prospects ranking chips and
  Curva on desktop (same as before the change).
- `AGENTS.md` asks for a draft pull request after screen work. None was opened because you did not ask
  for one; say the word and I will open it.
