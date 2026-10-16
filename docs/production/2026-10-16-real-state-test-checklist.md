# Real-state test checklist: real phones, real accounts, French and Arabic

Written 2026-10-16 from `main` at `9e7056ad`. This closes the paper side of the
launch blocker called **STATE** in `docs/production/2026-10-16-launch-blockers-owner-plan.md`
(section 2, row STATE, and section 4, "STATE (real-state checks)"). It is a
checklist only. Nothing in it has been run, no database was touched to write it,
and no result is recorded here.

**What the owner has to do:** name one tester, say which two phones they have,
and settle the items in section 0 marked **owner to confirm**. Everything else
is written so that a person who is not a developer can follow it. Plan one full day
for one tester with two phones (my estimate; PLAN gives half a day to one day,
also an estimate), plus the screen-reader pass.

**Why this exists.** Every earlier check of these screens used sample data in a
desktop Chromium browser: no real account, no iPhone, no Android phone, no screen
reader (PA:65-71, PB:86-92, PC:81-94, PD:128-138). The states below are the ones
sample data cannot show: failed loads, retries, empty and very long lists, a lost
connection, a real account in Arabic.

## How to read the citations

Line numbers are for the files as they stand on `main` at `9e7056ad`.

| Short              | What it points to                                                                              |
| ------------------ | ---------------------------------------------------------------------------------------------- |
| PA                 | `docs/audits/2026-10-14-audit-remediation-phase-a.md`                                          |
| PB                 | `docs/audits/2026-10-15-audit-remediation-phase-b.md`                                          |
| PC                 | `docs/audits/2026-10-15-audit-remediation-phase-c.md`                                          |
| PD                 | `docs/audits/2026-10-15-audit-remediation-phase-d.md`                                          |
| PLAN               | `docs/production/2026-10-16-launch-blockers-owner-plan.md`                                     |
| PROD               | `PRODUCT.md`                                                                                   |
| DS                 | `docs/engineering/DESIGN_SYSTEM_V2.md`                                                         |
| QA65               | `docs/qa/PHASE_6_5_FUNCTIONAL_ACCEPTANCE_PLAN.md` (section 8, lines 209-229, the error matrix) |
| SHARE              | `docs/engineering/SHARING_AUDIT_2026-10.md`                                                    |
| EMAIL              | `docs/backend/EMAIL_NOTIFICATIONS.md`                                                          |
| REM                | `docs/engineering/REMINDER_DELIVERY_EVIDENCE.md`                                               |
| FP                 | `docs/engineering/ARABIC_FIRST_PAINT.md`                                                       |
| PHONE              | `docs/mobile/PHONE_APP.md`                                                                     |
| `fr:key`, `ar:key` | The screen text with that key in `src/i18n/dictionary-fr.ts` or `src/i18n/dictionary-ar.ts`    |

An audit item such as "PB:43 (QA-03)" means line 43 of the Phase B report, the
row for finding QA-03. "Expected" always names the file the wording or rule comes
from. Where no file fixes the behaviour, the case says **owner to confirm**.

## 0. Owner: fill in and settle before handing this over

| #   | What                                                      | Answer                 |
| --- | --------------------------------------------------------- | ---------------------- |
| 1   | Tester's name                                             | (owner writes it here) |
| 2   | iPhone model and iOS version                              | (owner writes it here) |
| 3   | Android model and Android version                         | (owner writes it here) |
| 4   | The address the tester opens (see O1 below)               | (owner writes it here) |
| 5   | The build or release id of that address, for the report   | (owner writes it here) |
| 6   | Test accounts and where the sign-up codes arrive (see O2) | (owner writes it here) |
| 7   | Date and time window of the session                       | (owner writes it here) |

### Items the owner must confirm

These are not decided in the repository, so each one is flagged **owner to confirm**.
Each is referred to as O1, O2 and so on in the cases.

- **O1. Which address and build the tester uses.** PLAN section 4 (STATE) says no
  staging copy of the website was found (`docs/production/CAPACITY_AND_RELEASE_EVIDENCE_PLAN.md:281-282`).
  The two options it names are a local copy of the site pointed at the staging
  database (agents can set it up after step 9 of the capacity plan), or test
  accounts on the live site, which is a production write (`CLAUDE.md:33-40`) and
  which the plan calls "not recommended". This checklist assumes the first. The tester also needs a
  way to reach that copy from two phones; how is the owner's call.
- **O2. Sign-up and reset e-mails.** Cases A1, A2 and A5 need a sign-up code and a
  reset link to arrive in a real mailbox. Whether the test environment can send
  them is not recorded: the launch ledger's sign-up mail items BG-0106 to
  BG-0108 are listed as unsettled (PLAN section 7). If it cannot, the owner
  creates confirmed test accounts by hand and A1, A2 and A5 are marked Blocked.
- **O3. What data the test environment holds.** Cases that need a live match, a
  postponed match, an open Fantasy round or news articles only work if that data
  exists there. The owner (or the agent who sets up the copy) says which
  Fantasy round is open and whether a match is live during the session. The
  Fantasy screens say so themselves when team creation is closed (`fr:fantasy.availability.*`).
- **O4. The prepared data P1 to P6 below.** Each one is a write to the test
  database, so it is done by the single named staging writer before the session
  (`AGENTS.md:23-26`, PLAN section 3 question 8: Claude), never by the tester and
  never at the same time as another writer. A case that needs one that was not
  prepared is marked Blocked, not Fail.
- **O5. Google and Apple sign-in.** The buttons are switched on in the code
  (`OAUTH_PROVIDERS_ENABLED`, `src/lib/feature-flags.ts:145`), but whether the
  providers are enabled in Supabase was last recorded as "not enabled", now
  unknown (PROD:206-207, "Google and Apple sign-in"). Say whether to run A8.
- **O6. Website only, or also the phone-app builds.** This checklist tests the
  website in the phone's own browser (Safari on iPhone, Chrome on Android). PHONE
  says an iPhone build was uploaded to TestFlight on 2026-10-05 and an Android
  test file was built (`docs/mobile/PHONE_APP.md:3-7`), while PROD:30 says no
  build has run. Neither has been seen on a phone. Say whether the tester should
  also open the app; this checklist does not cover it.
- **O7. NVDA.** PC:209-210 asks for a pass with VoiceOver, TalkBack and NVDA.
  The owner also decided that desktop layout does not matter (PD:21). Say
  whether a Windows PC tester is needed for section 3.3.
- **O8. Switches.** Whether Curva (the Manager Card), email notifications, Rivals
  and Trophées are switched on in the test environment was not read (PLAN
  section 5, "Other facts recorded 2026-10-16"). Cases marked **needs O8** are
  skipped if the feature is off, and the tester writes "off" in Notes.

### Prepared data (done by the staging writer, see O4)

| ID  | What must exist before the session                                                                       | Used by |
| --- | -------------------------------------------------------------------------------------------------------- | ------- |
| P1  | Test account "Lecteur" with about 60 saved articles, and a second one with more than 2,000 saved         | E8      |
| P2  | A private Fantasy league with more than 100 members                                                      | D6      |
| P3  | A past Fantasy round for a test team, containing a player who has since left the player list             | C9      |
| P4  | A test team with a player whose price has changed since it was bought                                    | C5      |
| P5  | A global ranking long enough to need several pages (and, ideally, a hidden or deleted account inside it) | D1, D2  |
| P6  | Two test accounts, "A" and "B", both confirmed, plus one for the sign-up cases that is not yet created   | many    |

## 1. What you need before starting

### 1.1 Devices

- **One iPhone** (Safari) and **one Android phone** (Chrome). Both with a screen
  lock you can open, a working mobile data or Wi-Fi connection, and the system
  language of your choice. Note the model and version in section 0.
- A second person's phone or a second browser is useful for case K1 (an invite
  link sent from one phone to the other). The two test phones can do it.
- **A Windows PC with NVDA** only if the owner said yes to O7.

### 1.2 Accounts

- Use **test accounts only**: the ones the owner gives you, or new ones with an
  e-mail address you control and a name like `qa-tester-01`. Never your own
  personal account, never a friend's.
- Keep a note of each account's e-mail, user name and password in a private place
  (not in the report).
- Never use real data of a real person. Never take part in a real prize draw or
  a real private league with a real person.

### 1.3 Languages

Every case says which languages to run. Switch the app language from
**Profil, then "Langue sur cet appareil"** (`fr:profile.language.device`). The
phone's own language does not choose the app's language: the app remembers its own
choice on that phone (PROD:123-128, "Language").

### 1.4 Screen readers

- iPhone: **VoiceOver** (Settings, Accessibility, VoiceOver).
- Android: **TalkBack** (Settings, Accessibility, TalkBack).
- Windows: **NVDA** (free), only if O7 is yes.
- Section 3 explains what to listen for. Do it as a separate pass after sections
  A to K, because a screen reader changes how you tap.

### 1.5 Which address

Open **only** the address in section 0, row 4. Check that it is the real
backend and not sample data: on the sign-in screen, the line
"Démo : demo@botolago.ma / demo1234" must **not** be there
(`fr:auth.demo_hint`, shown only in sample mode, `src/routes/auth.login.tsx:323`).
If you see it, stop and tell the owner.

### 1.6 Safety rules (read twice)

1. **Test accounts only** (1.2).
2. **Never touch production data.** On the live site `botolago.com`, you may only
   do what any visitor does without an account: look and read. Do not create an
   account, sign in, save, vote, predict or join anything on the live site unless
   the owner wrote "yes" for that in section 0 (`CLAUDE.md:33-40`, PLAN
   section 4, STATE). Cases that only read are marked **Read-only OK** and may be
   run on the live site as a visitor.
3. **Account deletion: stop before the red button.** Case G3 opens the deletion
   screen and **must end without confirming**. The red button "Supprimer
   définitivement" closes the account at once and erases it within 7 days
   (`fr:profile.delete_account_desc`). If you press it by mistake, tell the owner
   immediately.
4. Do not run load, speed or sign-up burst tests. Do not press the same button 50
   times to "see what happens".
5. Do not share the test address publicly.
6. If something looks dangerous (a real person's name, a real e-mail, money asked
   for), stop and report it.

### 1.7 How to run a case

- **Run:** `ALL` means both phones and both languages (4 runs). `SPLIT` means
  French on one phone and Arabic on the other (2 runs); if one fails, repeat that
  case on the other phone. `ONE` means once, on the phone named.
- In the result line write **P** (pass), **F** (fail) or **B** (blocked, you could
  not run it, say why) in each box you ran, and leave the others empty.
- "Airplane mode" means: turn on the phone's airplane mode, then turn Wi-Fi back
  off if the phone turned it on, so the page really has no connection. To test a
  failure inside the app, **load the screen first while online, then switch on
  airplane mode, then move around inside the app** (tap links, tabs and buttons).
  Do not reload the page: the browser's own "no connection" page is not the app's
  error screen.
- A **Fail** is anything that differs from "Expected", or a screen that stays
  blank, shows "Chargement…" for more than about 30 seconds, shows a technical
  code, shows text cut off at the edge, or shows the wrong language. Wording
  quality in Arabic is judged separately by the Arabic reader
  (`docs/review/2026-10-16-arabic-wording-review.md`); you only fail a case for
  Arabic if the text is the wrong language, missing, cut off, or in the wrong
  direction.
- Take a screenshot of every Fail (section 4.2).

## 2. Test cases

Order: A sign-up and recovery, B home and matches, C Fantasy, D rankings and
leagues, E news and saved articles, F notifications settings, G profile and
account deletion request, H language and right-to-left, I errors and empty
states, J long lists, K sharing and phone fit. Cases that are already covered by
an automated test still appear here when the automated test cannot show the same
thing on a real phone (see appendix A).

### A. Sign-up, login, recovery

#### A1. Create an account

- **Run:** SPLIT. **Needs:** O2.
- **Steps:**
  1. Open the test address in a fresh private tab. Choose your language.
  2. Go to Profil, then "Créer un compte". Fill in the name, a user name such as
     `qa-tester-01`, your test e-mail and a password; tick the terms; tap "Créer
     mon compte".
  3. Open your mailbox, read the 6-digit code, type it on the next screen.
  4. If a "Personnalisez votre profil" screen appears, tap "Passer".
- **Expected:** a screen "Vérification" asks for a 6-digit code
  (`fr:auth.verify.title`, `fr:auth.verify.subtitle`). The line "Démo : le code est
  123456" is **not** shown (`fr:auth.verify.demo_hint`, sample mode only,
  `src/routes/auth.verify.tsx:143`). The real code arrives and works. After it, you
  are signed in; the profile screen has three short steps that you can skip
  (`fr:auth.setup.skip`).
- **Covers:** PB:43 (QA-03), PB:44 (QA-04), PA:70 (no real account seen), PD:228-229.
- **Result:** iPhone FR [ ] iPhone AR [ ] Android FR [ ] Android AR [ ] **Notes:**

#### A2. Wrong code and "send again"

- **Run:** SPLIT. **Needs:** O2.
- **Steps:** on the code screen, type six wrong digits and tap "Vérifier". Then
  tap "Renvoyer le code" once, and try to tap it again straight away.
- **Expected:** the wrong code says "Code invalide." (`fr:auth.error.otp_invalid`),
  which is a different message from a connection problem. While a new code is on
  its way, a second request is blocked and a countdown "Renvoyer dans" is shown
  (`fr:auth.verify.resend_in`); a failed request shows a message instead of
  nothing.
- **Covers:** PB:43 (QA-03), PB:44 (QA-04).
- **Result:** iPhone FR [ ] iPhone AR [ ] Android FR [ ] Android AR [ ] **Notes:**

#### A3. Wrong password, and an account you never confirmed

- **Run:** ALL. **Needs:** O2 for the second step.
- **Steps:** (1) Sign out. On the sign-in screen enter a real test e-mail with a
  wrong password and tap "Se connecter". (2) Create a second test account but
  **do not** enter its code; then try to sign in with it.
- **Expected:** (1) "E-mail ou mot de passe incorrect." (`fr:auth.error.credentials`);
  the button comes back and you can try again (the loading does not stay on).
  (2) "E-mail non confirmé. Vérifiez votre boîte de réception, puis réessayez."
  (`fr:auth.error.email_unconfirmed`). No technical codes on screen.
- **Covers:** PB:92 (sign-in error codes seen only with a real server);
  `tests/e2e/staging.acceptance.e2e.ts:51-64` covers (1) in French in Chromium only.
- **Result:** iPhone FR [ ] iPhone AR [ ] Android FR [ ] Android AR [ ] **Notes:**

#### A4. Sign in with no connection

- **Run:** SPLIT.
- **Steps:** open the sign-in screen, fill in correct details, switch on airplane
  mode, tap "Se connecter". Then switch airplane mode off and tap again.
- **Expected:** "Connexion impossible. Vérifiez votre réseau et réessayez."
  (`fr:auth.error.network`); the button is usable again; after the connection is
  back the second tap signs you in without reloading the page. The general rule
  for an offline action is a clear message, no endless spinner, nothing lost
  (QA65:216).
- **Covers:** PB:44 (QA-04), PB:92.
- **Result:** iPhone FR [ ] iPhone AR [ ] Android FR [ ] Android AR [ ] **Notes:**

#### A5. Forgot password

- **Run:** SPLIT. **Needs:** O2.
- **Steps:** (1) On the sign-in screen tap "Mot de passe oublié ?", enter the
  e-mail of a real test account, tap "Envoyer le lien". (2) Repeat with an e-mail
  that has **no** account. (3) Open the e-mail on the phone, tap the link, choose
  a new password, then sign in with it. (4) Open the same link a second time.
- **Expected:** (1) and (2) show the **same** screen "Vérifiez votre boîte de
  réception" with "Si un compte est associé à cet e-mail…"
  (`fr:auth.forgot.success_title`, `fr:auth.forgot.success_body`), so the screen
  never reveals whether an account exists. (3) "Mot de passe mis à jour"
  (`fr:auth.update.success_title`). (4) a message that the link is invalid or has
  expired (`fr:auth.callback.error` or `fr:auth.update.no_session`); which of the
  two appears is **owner to confirm**.
- **Covers:** PB:44 (QA-04).
- **Result:** iPhone FR [ ] iPhone AR [ ] Android FR [ ] Android AR [ ] **Notes:**

#### A6. Sign in, and come back to where you were

- **Run:** SPLIT.
- **Steps:** signed out, open any news article, tap the save (bookmark) icon.
  When asked, sign in. Repeat from the player list in Fantasy (filtered by one
  club) if you can reach a sign-in prompt there.
- **Expected:** after signing in you land on the same article (or the same
  filtered list), not on the home page.
- **Covers:** PB:47 (UX-005), PC:51 (SOL-04, a bare `/auth` goes to the sign-in page).
- **Result:** iPhone FR [ ] iPhone AR [ ] Android FR [ ] Android AR [ ] **Notes:**

#### A7. User-name and password rules

- **Run:** SPLIT.
- **Steps:** on the sign-up screen type the user name `ab`, then `Rachid é`, then
  a valid one; type a password of 5 characters, then a long one.
- **Expected:** a bad user name shows "3 à 20 caractères : lettres latines sans
  accent (a–z), chiffres, tiret (-) ou tiret bas (_). Commencez par une lettre ou
  un chiffre." (`fr:auth.error.username_invalid`). In Arabic the Latin parts
  (a–z, -, _) read correctly inside the Arabic sentence and are not jumbled. A
  password under 8 characters shows "Au moins 8 caractères." (`fr:auth.error.password_short`).
  A name such as `admin` may show the same user-name message; that is a known
  limit, not a Fail (PC:124-127, risk 1).
- **Covers:** PC:37 (LOC-02), PC:124-127.
- **Result:** iPhone FR [ ] iPhone AR [ ] Android FR [ ] Android AR [ ] **Notes:**

#### A8. Google or Apple button

- **Run:** ONE per phone. **Needs:** O5. Use a throw-away Google or Apple account,
  never a personal one.
- **Steps:** on the sign-in screen tap the Google button (iPhone: also Apple).
- **Expected:** either the provider's sign-in page opens and you come back signed
  in, or the app says "Ce fournisseur n'est pas disponible pour le moment."
  (`fr:auth.error.provider_unavailable`). A dead button, a blank page or a
  technical error is a Fail. Which of the two is right today is **owner to
  confirm** (O5).
- **Covers:** PROD:199-207 ("Built, but switched off or not delivering"); SHARE:176-191 (return
  from Google not tried with a real account).
- **Result:** iPhone [ ] Android [ ] **Notes:**

### B. Home and matches

#### B1. First visit and how the page fits the phone

- **Run:** ALL. **Read-only OK.**
- **Steps:** clear this site's data (or open a private tab), open the address.
  Watch what appears first, choose a language, reach the home page. Turn the phone
  sideways and back. Check the top bar and the bottom bar against the notch, the
  rounded corners and the home bar.
- **Expected:** a short launch screen once, then "Choisissez votre langue"
  (`fr:language.choose_title`), then the home page
  (`tests/e2e/anonymous.acceptance.e2e.ts:62-95`, Chromium and sample data only).
  Nothing is hidden under the notch or the bottom bar; buttons in both bars can
  be tapped. How it looks sideways on a real notched iPhone and on older Android
  phones has never been checked (PROD:418-423); the app is designed upright, so
  record what you see rather than judging it.
- **Covers:** PROD:418-423 (safe areas, BG-0151), PA:70.
- **Result:** iPhone FR [ ] iPhone AR [ ] Android FR [ ] Android AR [ ] **Notes:**

#### B2. Home with real data

- **Run:** SPLIT. **Read-only OK.**
- **Steps:** on the home page look at today's matches, the next matches and the
  news. Signed out, look for the link under the game button. Signed in, follow one
  club and look again.
- **Expected:** real clubs, real times, no sample names. Signed out, the landing
  page shows "Voir les matchs et résultats" under the game button
  (`fr:landing.cta_matches`). When nothing is on, "Aucun match programmé dans les
  prochains jours." (`fr:home.upcoming_empty`); for followed clubs with no match,
  "Aucun match de vos clubs sur cette période." (`fr:home.mine_empty`). Scores
  that are not known show a dash, never 0 (PROD:245).
- **Covers:** PD:33 (UX-011), PROD:244-245, PA:67-69.
- **Result:** iPhone FR [ ] iPhone AR [ ] Android FR [ ] Android AR [ ] **Notes:**

#### B3. Matches calendar and an empty day

- **Run:** SPLIT. **Read-only OK.**
- **Steps:** open Matchs. Use "Jour précédent" / "Jour suivant" to move across a
  week, to a day with no match. Open a match, use Back.
- **Expected:** a day with nothing on offers the latest results
  (`tests/e2e/empty-states.e2e.ts:14`, Chromium, sample data). The day you chose
  is still the chosen day after you open a match and press Back
  (`tests/e2e/context-restoration.e2e.ts:42`).
- **Covers:** PB:48 (UX-006), PA:67-69.
- **Result:** iPhone FR [ ] iPhone AR [ ] Android FR [ ] Android AR [ ] **Notes:**

#### B4. A match page, in each state you can find

- **Run:** SPLIT. **Needs:** O3 (a live match, a finished one, and if possible a
  postponed or cancelled one). **Read-only OK.**
- **Steps:** open a finished match, a live match, and a postponed or cancelled
  one. On each, look at the score, the status, the tabs (Résumé, Stats, Compos,
  Face à face) and the time of the last update.
- **Expected:** finished: "Terminé" and the score. Live: "En direct", a note
  "Mise à jour automatique", and, if the data goes quiet, "Score non actualisé
  depuis …" and after a long silence "Score à confirmer" (`fr:matches.detail.stale_since`,
  `fr:matches.status.unconfirmed`). A score the app does not know shows a dash,
  and a real 0-0 stays 0-0. Postponed, cancelled, suspended and abandoned each
  have their own wording ("Match reporté : pas de données à afficher." and so on,
  `fr:matches.detail.no_data_*`); a cancelled match is not shown as upcoming and
  not "date à confirmer".
- **Covers:** PA:33 (DATA-01), PA:35 (DATA-03), PB:49 (DATA-04), PA:90-94 (risk 3: a
  phone clock more than 5 minutes fast can wrongly flag a live match; if you see
  that, note it, it is known).
- **Result:** iPhone FR [ ] iPhone AR [ ] Android FR [ ] Android AR [ ] **Notes:**

#### B5. Match page when the connection drops

- **Run:** SPLIT. **Read-only OK.**
- **Steps:** open a match page with its score showing. Switch on airplane mode.
  Tap the "Stats", then "Compos", then "Face à face" tabs. Switch airplane mode
  off and use the retry on each box.
- **Expected:** the score and the page stay on screen. A tab whose data could not
  load says so in its own box, for example "Impossible de charger les statistiques
  du match." (`fr:matches.detail.section_failed.*`) with a retry; that is different
  from "no data". After reconnecting, the retry fills the box. A failed refresh
  keeps the last good copy.
- **Covers:** PA:34 (DATA-02), PA:65-69.
- **Result:** iPhone FR [ ] iPhone AR [ ] Android FR [ ] Android AR [ ] **Notes:**

#### B6. The standings table

- **Run:** SPLIT. **Read-only OK.**
- **Steps:** open Matchs, then the standings. Look at the columns and the line
  under the table. Open the way to see the other columns.
- **Expected:** five columns fit the phone and the rest open on request
  (`tests/e2e/mobile-readability.e2e.ts:91`). A line says the table is
  provisional or unofficial and computed from match results
  (`fr:standings.provisional`, `fr:standings.unofficial`). Clubs with an official
  point deduction show it (PB:50).
- **Covers:** PB:50 (DATA-05).
- **Result:** iPhone FR [ ] iPhone AR [ ] Android FR [ ] Android AR [ ] **Notes:**

#### B7. Match times are Morocco time, whatever the phone says

- **Run:** ONE per phone, French. **Read-only OK.**
- **Steps:** note the kick-off time of one upcoming match. In the phone's settings
  change the time zone to another country (for example Paris, then New York) and
  reopen the match. Put the time zone back afterwards.
- **Expected:** the time shown does not change: match and deadline times always
  show Morocco time (PROD:115-118, 409).
- **Covers:** PD:100-109 (Morocco time), PROD:409.
- **Result:** iPhone [ ] Android [ ] **Notes:**

#### B8. Pronostics: guest picks, then sign in

- **Run:** SPLIT. **Needs:** O3 (an upcoming match).
- **Steps:** signed out, open Pronostics (inside Matchs) and enter a score for two
  upcoming matches. Sign in with a test account. Look at the Pronostics screen
  right after. If you can, repeat with airplane mode on while the picks load.
- **Expected:** after sign-in a message "Vos pronostics sont sur votre compte"
  with a count such as "2 pronostics ajoutés à votre compte" (`fr:predictions.claim.*`);
  a match that has already started is reported as "n'a pas pu être ajouté", never
  sent late. While your saved picks load you see "Chargement de vos pronostics
  enregistrés…", and if they fail "…n'ont pas pu être chargés. La modification est
  suspendue pour ne pas écraser vos scores." with a retry
  (`fr:predictions.personal.*`): the screen is never shown as empty and editable
  at that moment.
- **Covers:** PA:30 (QA-01), PA:31 (QA-05), `tests/e2e/pronostics.e2e.ts:130` (sample data).
- **Result:** iPhone FR [ ] iPhone AR [ ] Android FR [ ] Android AR [ ] **Notes:**

#### B9. The Prospects section keeps its new name

- **Run:** SPLIT. **Read-only OK.**
- **Steps:** open the Prospects section from the bottom bar or menu, open a player,
  the ranking and the method page.
- **Expected:** the section is called "Prospects" in French and "المواهب" in
  Arabic (`fr:nav.pepites`, `ar:nav.pepites`). The old name "Pépites" does not
  appear on any screen. The web address still contains `pepites`; that is
  intended (PD:22, PROD:281).
- **Covers:** PD:40 (LOC-09 rename).
- **Result:** iPhone FR [ ] iPhone AR [ ] Android FR [ ] Android AR [ ] **Notes:**

### C. Fantasy: team building and transfers

All of section C needs a signed-in test account on the test address (not the live
site; C1 starts signed out) and an open Fantasy round (O3). If team creation is closed, the screen
should say so plainly: "La saison Fantasy n'est pas encore ouverte", "En attente
de la prochaine journée Fantasy" or the registration-closed text
(`fr:fantasy.availability.*`); record which one you see and mark the case Blocked.

#### C1. Build a team as a guest, leave, come back, sign up

- **Run:** SPLIT. **Needs:** O2, an open round.
- **Steps:** signed out, open Fantasy and start a team. Add a few players. Close the
  browser tab, reopen the address, open Fantasy again. Then tap save, create an
  account (A1) and finish.
- **Expected:** "Votre brouillon est gardé sur cet appareil. Un compte gratuit est
  demandé à l'enregistrement." (`fr:fantasy.create.guest_note`) and the draft is
  still there after reopening. If the phone cannot keep it (some private modes),
  the page says so: "Cet appareil ne peut pas garder votre brouillon…"
  (`fr:fantasy.create.guest_unsaved`); that sentence must appear **only** when it
  is true. Leaving with an unsaved squad asks you first. After sign-up the draft is
  offered back ("Équipe locale détectée") and can be saved.
- **Covers:** PA:32 (UX-009), PA:65-69 (this screen redirects in sample mode), PA:104-105
  (guests are told not to use Google sign-in mid-draft).
- **Result:** iPhone FR [ ] iPhone AR [ ] Android FR [ ] Android AR [ ] **Notes:**

#### C2. The squad rules, in plain messages

- **Run:** SPLIT.
- **Steps:** in the team builder try to add a fourth player of one club; try to go
  over the budget; try to save with 14 players; then use "Compléter
  automatiquement".
- **Expected:** "Maximum 3 joueurs du même club." (`fr:fpl.club_limit`), "Budget
  dépassé." (`fr:fpl.budget_exceeded`), "Complétez les 15 joueurs pour continuer."
  (`fr:fpl.complete_squad_first`). The automatic fill reaches 15 of 15 and the
  budget of 100.0 (PROD:173). The rules come from the server; the phone only
  explains them (PROD:235-240).
- **Covers:** PA:65-69; automatic fill is covered in Chromium by
  `tests/e2e/staging.acceptance.e2e.ts:66-92`.
- **Result:** iPhone FR [ ] iPhone AR [ ] Android FR [ ] Android AR [ ] **Notes:**

#### C3. The player list keeps your filters

- **Run:** SPLIT.
- **Steps:** open the player list; search a name, choose a position and a club,
  sort by price, go to page 2. Open a player, then press Back. Reload the page.
- **Expected:** your search, position, club, price, sort and page are still
  there after Back and after a reload (they live in the address). The sort menu
  labels read in full (no clipped word).
- **Covers:** PB:48 (UX-006), PC:21-23 (a clipped label was found in review).
- **Result:** iPhone FR [ ] iPhone AR [ ] Android FR [ ] Android AR [ ] **Notes:**

#### C4. Save a team and find it again

- **Run:** ALL.
- **Steps:** save the team from C1 or build a new one. Close the browser
  completely. Reopen and sign in. Open the Fantasy team page ("Votre équipe"). Then sign in on the other phone
  with the same account.
- **Expected:** the team, captain and vice-captain are there on both phones, with
  the saved name. If a newer version exists you are offered "Recharger la dernière
  version" or "Continuer avec mes modifications" (`fr:fantasy.conflict.*`).
- **Covers:** `tests/e2e/fantasy.journey.e2e.ts:71` (French, Chromium); PD:228-229.
- **Result:** iPhone FR [ ] iPhone AR [ ] Android FR [ ] Android AR [ ] **Notes:**

#### C5. A transfer, and what you get back for the player you sell

- **Run:** SPLIT. **Needs:** P4.
- **Steps:** open Transferts. Choose the player whose price changed (P4) as
  "Sortant", pick a replacement as "Entrant". Compare the "Prix de vente" in the
  squad, the figure in the picker, the bank ("Banque") and the confirm screen. Do
  not confirm yet.
- **Expected:** the selling price is the same on every one of those screens and is
  the owner's real sale value, not the market price: a player bought at 7.0 whose
  price is now 7.4 sells for 7.2 (PA:28, FANT-01). The projected bank on the
  confirm screen equals the old bank plus the sale value minus the price of the new
  player (`fr:fantasy.transfers.projected_bank`).
- **Covers:** PA:28 (FANT-01).
- **Result:** iPhone FR [ ] iPhone AR [ ] Android FR [ ] Android AR [ ] **Notes:**

#### C6. Transfer when the connection is lost, and a draft that survives

- **Run:** SPLIT. **Needs:** an open round.
- **Steps:** (1) Pick one outgoing and one incoming player so the preview shows.
  Switch on airplane mode and change one choice. (2) Switch it off and tap the
  retry. (3) Start a second swap but pick only the outgoing player, leave the
  screen, close the tab, reopen Transferts.
- **Expected:** (1) the preview does not stay blank: "Connexion indisponible. Vos
  transferts sont conservés : réessayez." (`fr:fantasy.transfers.preview.network`);
  the confirm button is never grey without a reason. (2) the retry keeps your
  choices and shows the preview. (3) the first swap is exactly as you left it and
  the second shows an empty "incoming" place; no player is paired with the wrong
  one. Other reasons it can show: not enough budget ("il manque … M"), a newer
  version of the team, a code needed, deadline passed (`fr:fantasy.transfers.preview.*`).
- **Covers:** PA:29 (FANT-02), PB:32 (SOL-01), PA:65-69, QA65:216-217.
- **Result:** iPhone FR [ ] iPhone AR [ ] Android FR [ ] Android AR [ ] **Notes:**

#### C7. The "you are about to make N transfers" sentence

- **Run:** ONE per language per phone (so 4 runs, short). **Needs:** an open round,
  a test team that can make three swaps.
- **Steps:** prepare one swap, read the sentence on the confirm screen; do it with
  two swaps, then three. Do not confirm unless the owner allows the test team to
  change.
- **Expected:** French: "Vous allez effectuer 1 transfert." / "2 transferts." /
  "3 transferts." (`fr:fpl.about_to_transfer_*`). Arabic: "ستُجري انتقالًا واحدًا."
  / "ستُجري انتقالين." / "ستُجري 3 انتقالات." (`ar:fpl.about_to_transfer_*`). The
  forms from 11 and 100 upwards cannot be reached with a real team; they were
  checked only in code (PC:40, PC:161-162).
- **Covers:** PC:40 (LOC-03).
- **Result:** iPhone FR [ ] iPhone AR [ ] Android FR [ ] Android AR [ ] **Notes:**

#### C8. The points screen

- **Run:** SPLIT. **Needs:** O3 (at least one round with points).
- **Steps:** open Points. Move between rounds. Look for the state of the round, the
  automatic substitutions and the vice-captain line. Look at a round that has not
  started.
- **Expected:** each round says "En cours" (provisional), "En direct" or "Définitif"
  (`fr:fantasy.points.status.*`). Substitutions read "n'a pas joué" for the player
  who did not play (`fr:fantasy.points.autosub_reason.*`, PC:34 FR-01). When the
  captain did not play: "Le vice-capitaine a pris le relais"
  (`fr:fantasy.points.vice_takeover`). A value the app does not know is a dash, not
  0 (PROD:245). The line "Historique (données de démo)" must **not** appear
  (`fr:fantasy.points.legacy_source`, a sample-data label).
- **Covers:** PC:87-89 (real points page with substitutions never seen),
  PB:36 (ASTRA-01), PB:35 (FANT-08), PC:34 (FR-01).
- **Result:** iPhone FR [ ] iPhone AR [ ] Android FR [ ] Android AR [ ] **Notes:**

#### C9. A past round names every player

- **Run:** SPLIT. **Needs:** P3.
- **Steps:** open an old round of the test team (P3) from Points or the history.
- **Expected:** every player in that round has a name. If the database change for
  this is not on the test database, a notice appears instead: "Certains joueurs de
  cette journée ne figurent plus dans la liste des joueurs : leur nom ne peut pas
  être affiché, mais leurs points comptent bien dans le total."
  (`fr:fantasy.points.unresolved_players`). Both outcomes are acceptable here; record
  which one you got. An owned player missing from the buying pool shows as "Hors
  marché" in Transferts and can be sold but not bought (`fr:fantasy.transfers.owned_unavailable`).
  The club and position shown are the player's current ones, so a transferred player's
  old round shows his new club; that is known (PB:34).
- **Covers:** PB:33 (SOL-02), PB:34 (FANT-07), PD:80-83 (which environment has the
  migration is **owner to confirm**).
- **Result:** iPhone FR [ ] iPhone AR [ ] Android FR [ ] Android AR [ ] **Notes:**

#### C10. The rules page and the first screens do not over-promise

- **Run:** SPLIT. **Read-only OK.**
- **Steps:** read the landing page, the Fantasy FAQ/intro and the rules page
  (Règles).
- **Expected:** the landing, FAQ and intro say nothing about points from player
  ratings. The rules page names which rounds each scoring rule covers: "Jusqu'à la
  journée N : barème par actions." and "À partir de la journée N : points selon la
  note SofaScore." (`fr:fantasy.scoring.eventUntil`, `fr:fantasy.scoring.ratingFrom`)
  with a link to the rules from the intro. Which round the rating rule starts at is
  **owner to confirm** (PLAN section 7, "Fantasy rating points").
- **Covers:** PA:25 (FANT-06), PA:26 (LOC-01).
- **Result:** iPhone FR [ ] iPhone AR [ ] Android FR [ ] Android AR [ ] **Notes:**

### D. Rankings and leagues

#### D1. The overall ranking, page by page

- **Run:** SPLIT. **Needs:** P5.
- **Steps:** open the overall ranking. Go through four or five pages with "Page
  suivante", use "Aller à ma position", search a manager, then switch to the round
  ranking.
- **Expected:** every page shows the true total ("managers classés"); going to a
  later page does not start again from the top. If the board has more than 2,000
  managers, the search says "La recherche porte sur les … premiers managers (sur
  …). Les autres restent accessibles page par page." (`fr:fantasy.rankings.search_limited`);
  with fewer managers this line is correctly absent. When the previous rank is
  unknown you see a dash, never an invented arrow. The round tab does not say which
  round it shows; that is known (PA:95-97, PB:114-115).
- **Covers:** PB:38 (FANT-05), PA:27 (FANT-04), PB:91.
- **Result:** iPhone FR [ ] iPhone AR [ ] Android FR [ ] Android AR [ ] **Notes:**

#### D2. A hidden or deleted manager inside the ranking

- **Run:** ONE per language. **Needs:** P5 with a hidden or deleted account in it.
- **Steps:** page through the range that contains that account.
- **Expected:** no crash, no empty page in the middle, no duplicated rank. Ranks may
  have a gap where an account was deleted, and one page may be off by the number of
  deleted rows; that is known (PB:96-100). Anything beyond that is a Fail.
- **Covers:** PB:91 (board paging against real hidden or deleted accounts), PB:96-100.
- **Result:** iPhone FR [ ] iPhone AR [ ] Android FR [ ] Android AR [ ] **Notes:**

#### D3. Create a private league

- **Run:** SPLIT. **Needs:** a test team.
- **Steps:** Ligues, "Créer une ligue". Use a name with symbols such as `Mo$$ & Co`.
  Open the league, tap the invite/share control and read the message that is
  prepared.
- **Expected:** "Ligue créée" (`fr:fantasy.leagues.created`). The prepared message
  keeps the league name exactly as typed (including `$`), and contains one link; the
  code is not shown in the address bar after the link is opened
  (SHARE:34-40 and SHARE:77 (S-06)). The league appears under "Privées".
- **Covers:** PD:38 (D5 sharing, S-06), `tests/e2e/fantasy.journey.e2e.ts:211`.
- **Result:** iPhone FR [ ] iPhone AR [ ] Android FR [ ] Android AR [ ] **Notes:**

#### D4. Join a league: wrong code and no connection

- **Run:** SPLIT. **Needs:** P6 (a second account).
- **Steps:** with account B, open "Rejoindre une ligue". (1) Type a made-up code.
  (2) Type the real code of A's league but with airplane mode on. (3) Switch it
  off and try again.
- **Expected:** (1) only an invalid code says "Code d'invitation invalide."
  (`fr:fantasy.leagues.error.invalid_code`). (2) a connection failure says the
  code is not at fault and that you may already be in the league: "Connexion
  impossible : le code n'est pas en cause…" (`fr:fantasy.leagues.join_network`).
  (3) "Ligue rejointe", and if the follow-up refresh fails: "Vous avez bien rejoint
  la ligue, mais ses informations n'ont pas pu être actualisées…"
  (`fr:fantasy.leagues.joined_refresh_failed`).
- **Covers:** PB:40 (UX-004).
- **Result:** iPhone FR [ ] iPhone AR [ ] Android FR [ ] Android AR [ ] **Notes:**

#### D5. Leagues when the read fails

- **Run:** SPLIT.
- **Steps:** open Ligues, then open one league, so the lists have loaded. Switch on
  airplane mode and, inside the app, go back and open the list, its members and its
  standings again. Switch airplane mode off and tap the retry.
- **Expected:** a failure is told as a failure, never as "no leagues" or "no
  members": "Vos ligues n'ont pas pu être chargées. Elles n'ont pas disparu :
  réessayez." (`fr:fantasy.leagues.read_failed`), "La liste des managers n'a pas pu
  être chargée. Elle n'est pas vide : réessayez." (`fr:fantasy.leagues.members_read_failed`).
  A failed refresh keeps the old rows with "Mise à jour impossible pour le
  moment…" (`fr:fantasy.leagues.stale`). The "last updated" wording uses the
  standings' own calculation time, else says the data was loaded and when, else
  nothing; it never shows the phone's clock as if it were the calculation time
  (PA:36).
- **Covers:** PB:39 (UX-003), PA:36 (UX-010).
- **Result:** iPhone FR [ ] iPhone AR [ ] Android FR [ ] Android AR [ ] **Notes:**

#### D6. A league with more than 100 members

- **Run:** ONE per language. **Needs:** P2.
- **Steps:** open the league (P2) standings, scroll to the end of the first page,
  tap "Afficher la suite du classement", repeat until the end. Try once with
  airplane mode on.
- **Expected:** the count reads like "100 sur 250" (`fr:fantasy.leagues.of_members`)
  and grows; no row appears twice. If the next page fails: "La suite du classement
  n'a pas pu être chargée. Les rangs déjà affichés restent valables."
  (`fr:fantasy.leagues.more_failed`) and the rows stay.
- **Covers:** PB:37 (FANT-03).
- **Result:** iPhone FR [ ] iPhone AR [ ] Android FR [ ] Android AR [ ] **Notes:**

### E. News and saved articles (including slow and offline)

#### E1. The news list keeps your place

- **Run:** SPLIT. **Read-only OK.**
- **Steps:** open Actualités, choose a category, then a club. Open an article, press
  Back. Reload the page.
- **Expected:** the category and club are still chosen after Back and after a
  reload. An empty category says "Aucun article dans cette catégorie pour le
  moment." (`fr:news.empty_category`). Licensed articles show their credit and link
  ("Source : ElBotola" / "المصدر: البطولة", PROD:168-169).
- **Covers:** PB:48 (UX-006), PB:52 (DATA-07).
- **Result:** iPhone FR [ ] iPhone AR [ ] Android FR [ ] Android AR [ ] **Notes:**

#### E2. A real Arabic article

- **Run:** Arabic only, ONE per phone. **Read-only OK.**
- **Steps:** open at least three real Arabic articles, one of which has italic or
  emphasised words and, if you can find one, a quotation. Read the first screen
  and scroll.
- **Expected:** the whole text uses the Arabic font; emphasis is upright, not
  slanted; Latin words inside are still slanted if they were italic. The page is
  right-to-left and the article shows its source credit. This has been checked on a
  substituted body only, never on a real article.
- **Covers:** PC:44 (LOC-08), PC:85-89.
- **Result:** iPhone AR [ ] Android AR [ ] **Notes:**

#### E3. Save and unsave an article

- **Run:** SPLIT.
- **Steps:** signed in, open an article, tap the bookmark. Open Profil, then "Articles
  enregistrés". Tap "Retirer de la liste" on the article.
- **Expected:** the article appears on the saved page; removing it shows (and a
  screen reader announces) "Article retiré de vos articles enregistrés."
  (`fr:news.saved.removed_announce`). The bookmark and the list agree. A failed
  write brings the article back with "Impossible de retirer cet article pour le
  moment. Réessayez." (`fr:news.saved.remove_error`).
- **Covers:** PB:46 (UX-001).
- **Result:** iPhone FR [ ] iPhone AR [ ] Android FR [ ] Android AR [ ] **Notes:**

#### E4. The saved-articles page in each state

- **Run:** SPLIT.
- **Steps:** (1) Signed out, open `/profile/saved`. (2) With a new account that has
  saved nothing, open it. (3) With an account that has saved articles, open Profil while online, switch on
  airplane mode, then tap "Articles enregistrés". (4) Reconnect and tap the retry.
- **Expected:** (1) "Connectez-vous pour retrouver vos articles"
  (`fr:news.saved.signin_title`). (2) "Aucun article enregistré" with a button
  "Parcourir les actualités" (`fr:news.saved.empty_title`, `fr:news.saved.browse`).
  (3) "Vos articles enregistrés n'ont pas pu être chargés. Vérifiez votre connexion
  et réessayez." (`fr:news.saved.error`) with a retry, not an empty list. (4) the
  list returns. More articles load with "Voir plus d'articles"; if the next page
  fails: "La suite n'a pas pu être chargée."
- **Covers:** PB:46 (UX-001), PB:86-89.
- **Result:** iPhone FR [ ] iPhone AR [ ] Android FR [ ] Android AR [ ] **Notes:**

#### E5. A slow connection

- **Run:** ONE per phone, French. **Read-only OK.**
- **Steps:** use a really weak connection: go outdoors or into a lift, or use the
  phone's low-data mode, or ask the owner for a slow network profile. Open the
  home page, then Actualités, then an article, then Matchs.
- **Expected:** pages show a loading state and then content; nothing stays on
  "Chargement…" for good; if a part of the page cannot be fetched you see
  "Cette page ne s'est pas chargée" with a way to retry or go home
  (`fr:error.title`, `fr:state.retry`, `fr:state.go_home`) rather than a white
  screen. On timeout the loading ends, a safe retry is offered and nothing is
  done twice (QA65:218).
- **Covers:** PB:92 (how a failed script chunk behaves on a device), PB:56 (SEC-05),
  QA65:209-229.
- **Result:** iPhone [ ] Android [ ] **Notes:**

#### E6. Offline in the middle of reading and saving

- **Run:** SPLIT.
- **Steps:** open an article fully. Switch on airplane mode. Tap the bookmark. Tap
  a link to another article. Switch it off again.
- **Expected:** saving offline says "Impossible d'enregistrer cet article pour le
  moment. Réessayez." (`fr:news.saved.save_error`) and the bookmark returns to its
  true state. Opening another article gives a clear failure and a retry. Nothing
  is lost. Do not expect an "hors ligne" banner: the text `fr:state.offline`
  ("Vous êtes hors ligne. Les données peuvent être obsolètes.") is defined in
  `src/components/common/States.tsx:208` but no screen in `src/` uses it (searched
  2026-10-16). Whether one should be shown is **owner to confirm**.
- **Covers:** PB:46, QA65:216-217.
- **Result:** iPhone FR [ ] iPhone AR [ ] Android FR [ ] Android AR [ ] **Notes:**

#### E7. Switching accounts does not leak saved marks

- **Run:** SPLIT. **Needs:** P6 (accounts A and B).
- **Steps:** sign in as A, save two articles, note which. Sign out. Look at the
  same articles signed out. Sign in as B and look at them again.
- **Expected:** signed out and as B, those articles show as **not** saved. Only A
  sees them saved.
- **Covers:** PD:146-162 (risk 2, the leak found in review), PLAN section 5 (commit
  `db2c6354`).
- **Result:** iPhone FR [ ] iPhone AR [ ] Android FR [ ] Android AR [ ] **Notes:**

#### E8. An account with a lot of saved articles

- **Run:** ONE per language. **Needs:** P1.
- **Steps:** (1) With the account that has about 60 saves, open the saved page and
  keep tapping "Voir plus d'articles". (2) With the account that has more than
  2,000, open the saved page, then save and unsave one article from a list.
- **Expected:** (1) all 60 show with no "données invalides" error (a reader with
  more than 50 saves used to get one). (2) the count reads "plus de 2 000", not a
  wrong number, with the note "Vous avez plus de 2 000 articles enregistrés. Les
  plus récents s'affichent en premier." (`fr:news.saved.over_limit`,
  `fr:news.saved.count_over`); a tap checks the real saved state first and a
  failed write undoes only that article.
- **Covers:** PB:46 (UX-001), PD:32, PD:130.
- **Result:** iPhone FR [ ] iPhone AR [ ] Android FR [ ] Android AR [ ] **Notes:**

#### E9. Search

- **Run:** SPLIT. **Read-only OK.**
- **Steps:** tap the search icon, type a club name, a player name, then nonsense.
  Switch on airplane mode and search again. With a keyboard attached (or on a
  screen reader) move through the results.
- **Expected:** results lead with the name and show what they are (Club, Joueur)
  underneath (`tests/e2e/mobile-readability.e2e.ts:131`). Nonsense gives "Aucun
  résultat" (`fr:nav.search.empty`); a failed search is different: "La recherche
  est indisponible pour le moment." (`fr:nav.search.unavailable`); a partly
  failed one says "Certains résultats sont indisponibles pour le moment."
  (`fr:nav.search.partial`). Enter never opens a result that is not shown.
- **Covers:** PB:42 (UX-007), PB:45 (SOL-03), PC:46 (MOB-02).
- **Result:** iPhone FR [ ] iPhone AR [ ] Android FR [ ] Android AR [ ] **Notes:**

#### E10. The news carousel on the home page

- **Run:** SPLIT. **Read-only OK.**
- **Steps:** on the home page swipe the news carousel; tap the dots; tap the
  previous/next arrows if shown.
- **Expected:** it moves one article at a time; each dot is easy to hit (it is a
  44 by 44 target, the painted dot is smaller, DS:56; PC:47); in Arabic it moves
  in the reading direction.
- **Covers:** PC:47 (MOB-03), PC:85-86 (the real carousel was never seen).
- **Result:** iPhone FR [ ] iPhone AR [ ] Android FR [ ] Android AR [ ] **Notes:**

#### E11. Share an article

- **Run:** SPLIT.
- **Steps:** on an article tap "Partager". Try three things: send it to WhatsApp (or
  any chat app) and open it from there; open the share sheet and **close it without
  sending**; if there is no share sheet, use "copy link".
- **Expected:** the chat shows a link to the article only (no tracking tags such as
  `utm_` from how you arrived). Closing the sheet does **not** show "Lien copié".
  A real copy shows "Lien copié" (`fr:article.share_copied`) only when the link was
  really copied.
- **Covers:** PD:38 (D5), SHARE:73 and SHARE:79 (S-02, S-08), PD:129 (the iOS share sheet and
  WhatsApp were never tried).
- **Result:** iPhone FR [ ] iPhone AR [ ] Android FR [ ] Android AR [ ] **Notes:**

### F. Notifications settings

Push alerts and e-mail reminders cannot be proved here (section 5). These cases
check only that the settings screens are honest.

#### F1. The inbox: signed out, empty, dismissing

- **Run:** SPLIT.
- **Steps:** (1) Signed out, open Notifications. (2) With a new account, open it.
  (3) If the inbox has items, dismiss one; with airplane mode on, dismiss another
  and use "Tout marquer comme lu".
- **Expected:** (1) "Connectez-vous pour voir vos notifications"
  (`fr:notifications.signin_title`). (2) "Rien de nouveau pour l'instant"
  (`fr:notifications.empty_title`). (3) a refused dismissal brings the card back
  with "La notification n'a pas pu être supprimée. Réessayez."; a failed "mark all
  as read" says so.
- **Covers:** PB:41 (UX-002). The inbox is filled only when e-mail or push sending
  is on (REM:32-35), so an empty inbox is normal on a test account.
- **Result:** iPhone FR [ ] iPhone AR [ ] Android FR [ ] Android AR [ ] **Notes:**

#### F2. The notification switches

- **Run:** SPLIT. **Needs:** a signed-in account.
- **Steps:** Profil, then "Notifications" (it shows a count like "2/3"). On the
  screen that opens, switch "Alertes match", "Actualités importantes", "Rappels
  Fantasy" and "Recevoir par e-mail" on and off, then "Terminer". Reload and look
  again.
- **Expected:** the choices are still what you set after a reload. The wording
  describes your account's setting and does **not** promise that an e-mail will
  arrive: the app cannot see whether sending is switched on (EMAIL:42-55). The row
  "Alertes sur ce téléphone" does **not** exist in a browser; it exists only inside
  the phone app (`src/routes/auth.profile-setup.tsx:483`, PHONE).
- **Covers:** PB:57 (PRO-04), EMAIL:42-55.
- **Result:** iPhone FR [ ] iPhone AR [ ] Android FR [ ] Android AR [ ] **Notes:**

#### F3. The match reminder bell

- **Run:** SPLIT. **Needs:** an upcoming match, a signed-in account.
- **Steps:** on an upcoming match tap "Me rappeler ce match", once with e-mail
  notifications on and once with them off in F2.
- **Expected:** with e-mail on: "Rappel activé pour ce match. Les rappels par
  e-mail sont activés sur votre compte." (`fr:reminders.toast.on`). With e-mail off:
  "Rappel enregistré. Les notifications par e-mail sont désactivées sur votre
  compte." with an "Activer" button (`fr:reminders.toast.needs_email`). Neither says
  an e-mail **will** arrive. Signed out, it asks you to sign in
  (`fr:reminders.sign_in_reason`).
- **Covers:** PB:57 (PRO-04), EMAIL:42-55, REM:7-16.
- **Result:** iPhone FR [ ] iPhone AR [ ] Android FR [ ] Android AR [ ] **Notes:**

#### F4. The language of notifications

- **Run:** ALL. **Needs:** a **new** test account.
- **Steps:** create the account while the app is in Arabic. Open Profil, then
  "Notifications", go to the language step "Langue des notifications". Read what it
  says is selected. Then change the app language on the phone from Profil and come
  back to that step.
- **Expected:** a new account's notification language is **French**, whatever
  language the app was in when you created it (owner decision, PD:23, PD:39), until you press "العربية" and
  save. The step shows the stored value, and opening it never changes the app's
  language on this phone. The help line says this ("Langue de vos e-mails, alertes
  et notifications. Le français est la langue par défaut…", `fr:auth.setup.language_hint`).
- **Covers:** PD:39, PD:142-145 (risk 1), PC:42 (LOC-06).
- **Result:** iPhone FR [ ] iPhone AR [ ] Android FR [ ] Android AR [ ] **Notes:**

#### F5. A profile that failed to load cannot be saved over

- **Run:** ONE per phone, French.
- **Steps:** signed in, switch on airplane mode, then use the bottom bar to open Profil
  and "Modifier le profil" (or the Notifications step); try to change the language
  or a switch and save. Switch airplane mode off and look at the profile. If the
  profile still shows from memory and the failed load cannot be reproduced, write B
  and say so.
- **Expected:** the save is refused (no silent change); after reconnecting, your
  language, club, photo and alerts are exactly as before.
- **Covers:** PD:39 ("a save from an unread profile is refused").
- **Result:** iPhone [ ] Android [ ] **Notes:**

### G. Profile and account deletion request (stop before confirming)

#### G1. Profile, signed in and signed out

- **Run:** SPLIT.
- **Steps:** signed out, open Profil. Sign in and open it again. Open "Modifier le
  profil", change the display name, save.
- **Expected:** signed out: "Vous naviguez en invité" with a sign-in prompt
  (`fr:profile.guest_title`). Signed in: your e-mail and user name, "Mes clubs", the
  saved articles row, language, theme, security, legal links and the delete section.
  The name change is still there after a reload.
- **Covers:** PD:228-229.
- **Result:** iPhone FR [ ] iPhone AR [ ] Android FR [ ] Android AR [ ] **Notes:**

#### G2. Sign out, with and without your Fantasy data on the phone

- **Run:** SPLIT.
- **Steps:** tap "Se déconnecter".
- **Expected:** a question "Voulez-vous conserver votre équipe Fantasy sur cet
  appareil ?" with "Conserver les données" and "Effacer et se déconnecter"
  (`fr:profile.sign_out_*`). After either choice you are signed out and see the
  guest profile; the saved marks of the account are gone from the news lists (E7).
- **Covers:** PD:146-162.
- **Result:** iPhone FR [ ] iPhone AR [ ] Android FR [ ] Android AR [ ] **Notes:**

#### G3. The account-deletion request screen: read it, then back out

- **Run:** ALL. **Use a throw-away test account created for this, never an account
  other cases still need.**
- **Steps:**
  1. Profil, scroll to the section "Supprimer le compte" and tap "Supprimer mon
     compte".
  2. Read the whole dialog. Check that the red button "Supprimer définitivement" is
     **greyed out**. Tick the box "Je comprends que la suppression est définitive."
     and see that the red button turns on.
  3. **Untick the box.** Tap "Tout savoir sur la suppression" and read the page
     that opens, then go back.
  4. Close with "Annuler".
  5. **Do not tap the red button.**
- **Expected:** the dialog says you are signed out everywhere and your name leaves
  the rankings, that the account is erased within 7 days, and what is kept (prize
  records for 5 years and security logs for 12 months)
  (`fr:profile.delete_confirm_body`, `fr:profile.delete_confirm_kept`). The red
  button is off until the box is ticked and "Annuler" closes the dialog with
  nothing changed (`src/routes/profile.tsx:886-935`). Afterwards you are still
  signed in and can use the app. If the account has two-step sign-in, a code is
  asked for only when the red button is pressed; you never get there.
- **Covers:** PD:228-229. The deletion worker that later erases a closed account is a separate item the owner watches (PD:111-113, PLAN section 5).
- **Result:** iPhone FR [ ] iPhone AR [ ] Android FR [ ] Android AR [ ] **Notes:**

#### G4. The public deletion page

- **Run:** SPLIT. **Read-only OK.**
- **Steps:** signed out, open `/suppression-compte` on the test address.
- **Expected:** a page "Supprimer votre compte BotolaGO" with how to ask (from the
  app, or by e-mail), the delays ("immédiatement", "sous 7 jours"), what is
  deleted, what is kept and for how long, and the contact address
  (`fr:account_deletion.*`; the page needs no sign-in, `src/routes/suppression-compte.tsx`).
  In Arabic it is right-to-left with the same sections. With `?confirmation=1` on
  the address a green notice "Votre compte est fermé" appears; this is the
  screen shown after a real deletion request, so do not follow it by pressing the
  real button.
- **Covers:** PD:228-229; the page is the one the deletion dialog links to (`src/routes/profile.tsx:914-919`).
- **Result:** iPhone FR [ ] iPhone AR [ ] Android FR [ ] Android AR [ ] **Notes:**

### H. Language switch, French and Arabic, and right-to-left

#### H1. First choice of Arabic

- **Run:** ONE per phone. **Read-only OK.**
- **Steps:** clear site data. On the language chooser pick "العربية" and continue.
  Then close the tab and open the address again by typing it.
- **Expected:** the whole page becomes right-to-left, with Arabic words and mirrored
  arrows. On a full page load the page may show French for a moment and then
  switch to Arabic; that is accepted behaviour (owner decision, PD:19, FP:16-50).
  It is a Fail only if the page stays French, or is Arabic words laid out left to
  right.
- **Covers:** PD:19 (LOC-05 kept), PC:45.
- **Result:** iPhone [ ] Android [ ] **Notes:**

#### H2. Switch FR to AR and back, from Profil

- **Run:** ALL.
- **Steps:** Profil, "Langue sur cet appareil", choose the other language. Look at
  Home, Matchs, Fantasy, Actualités, Profil. Close the browser completely, reopen,
  and check the language again. Switch back.
- **Expected:** every screen changes at once, the choice survives closing the
  browser, and the help line says it changes the language on this device and that
  notifications use the account's language (`fr:profile.language.help`).
  Switching does not change the account's notification language (F4).
- **Covers:** PC:42 (LOC-06), PROD:123-128.
- **Result:** iPhone FR [ ] iPhone AR [ ] Android FR [ ] Android AR [ ] **Notes:**

#### H3. Arabic could not be loaded

- **Run:** ONE per phone.
- **Steps:** in French, load the home page. Switch on airplane mode. Choose
  "العربية" in Profil. Read the notice. Switch airplane mode off and tap the retry
  in the notice.
- **Expected:** the page stays in French and a notice sits under the top bar,
  covering neither the top bar nor the language control, saying "L'arabe n'a pas pu
  être chargé. Vérifiez votre connexion, puis réessayez." (`fr:language.arabic_failed`)
  with a Retry and a Close, both at least 44 px. Retry switches the app to Arabic.
- **Covers:** FP:51-53 ("a notice with Retry appears"), `src/i18n/language-load-notice.tsx:1-40`.
- **Result:** iPhone [ ] Android [ ] **Notes:**

#### H4. Walk through eight screens in Arabic

- **Run:** ALL (Arabic only).
- **Steps:** in Arabic open: Home, Matchs, one match page, the standings, Fantasy
  (team and transfers), a league, Actualités with one article, Profil. On each,
  tick the list below.
- **Expected (tick all that apply):**
  - the page reads from right to left and starts at the right edge;
  - back arrows and chevrons point the way the reading goes (mirrored once, never
    twice; DS:656);
  - on a score, the **home** team is on the **right** and the away team on the left
    (DS:170-196);
  - numbers, scores, times and codes use Western digits (0-9) and read left to
    right inside the Arabic line (PROD:407-408);
  - tabs and bars list their items from right to left, and swiping a carousel
    follows the reading direction;
  - no text is cut off at an edge, no line runs off the screen, and no sideways
    scrolling is needed (Fail if the page scrolls sideways);
  - the Arabic text is not spaced out letter by letter.
- **Covers:** PC:46-51, PA:54-57 (checked only in Chromium), PROD:400-409.
- **Result:** iPhone AR [ ] Android AR [ ] **Notes (name the screens that failed):**

#### H5. Largest text size on the phone

- **Run:** ONE per phone, FR and AR (so 2 runs each).
- **Steps:** set the phone's text size to the largest (iPhone: Settings, Accessibility,
  Display and Text Size, Larger Text, drag to the maximum; Android: Settings,
  Display, Font size and Display size, largest). Open Home, Fantasy, Actualités,
  Matchs, Prospects, Profil and one match page. Put the size back afterwards.
- **Expected:** page titles wrap onto a second line instead of being cut off, and a
  control that no longer fits drops to its own line; nothing is hidden behind the
  top or bottom bar. A long Arabic word may be split at the end of a line; that is
  accepted (PC:50, PC:151-152). Never has this been tried with a real operating-system
  text scale (PC:90-91).
- **Covers:** PC:50 (VIS-001), PC:90-91.
- **Result:** iPhone FR [ ] iPhone AR [ ] Android FR [ ] Android AR [ ] **Notes:**

### I. Errors and empty states

#### I1. A brand-new account sees helpful empty screens

- **Run:** SPLIT. **Needs:** a new account with nothing done.
- **Steps:** open Fantasy rankings, Ligues, Articles enregistrés, Notifications, Mes
  clubs in Profil, Pronostics "Mes ligues".
- **Expected:** each says what is missing and what to do next, never a blank page or
  a spinner: "Pas encore d'équipe" with "Créer mon équipe"
  (`fr:fantasy.rankings.no_team`, `fr:fantasy.rankings.create_team`); "Aucune ligue"
  (`fr:fantasy.leagues.empty_title`); "Aucun article enregistré"; "Rien de nouveau
  pour l'instant"; "Pas encore de ligue. Rejoignez celle de vos amis avec leur
  code." (`fr:predictions.leagues.empty`).
- **Covers:** PA:65-69, PB:39 (an empty state must not be used for a failure).
- **Result:** iPhone FR [ ] iPhone AR [ ] Android FR [ ] Android AR [ ] **Notes:**

#### I2. No sample data on screen

- **Run:** ONE per phone, French, while doing the other cases. **Read-only OK.**
- **Steps:** keep an eye out, on every screen you visit, for any of these words:
  "Démo", "demo@botolago.ma", "123456", "Exemple" on a manager card, "Historique
  (données de démo)", "Indisponible en mode démonstration". The landing page shows a
  labelled "Démonstration" squad picture on purpose; that is not a Fail.
- **Expected:** none of them appears on the real test address
  (`fr:auth.demo_hint`, `fr:auth.verify.demo_hint`, `fr:card.sample`,
  `fr:fantasy.points.legacy_source`, `fr:auth.mfa.demo_unavailable`;
  landing: `fr:landing.demo_badge`, which is intended).
- **Covers:** PA:65-69, PB:86-89, PD:228-229 (everything seen before was sample data).
- **Result:** iPhone [ ] Android [ ] **Notes:**

#### I3. A page that does not exist

- **Run:** ONE per phone, FR and AR. **Read-only OK.**
- **Steps:** type a made-up address such as `/test-page-qa` after the test address.
  Then open a made-up match address `/matches/000`.
- **Expected:** a "Page introuvable" screen with "Cette page n'existe pas ou a été
  déplacée." (`fr:notfound.title`, `fr:notfound.description`) and a way back to the
  home page (`fr:state.go_home`, "Retour à l'accueil"). For a match address that does
  not exist: "Match introuvable" (`fr:matches.detail.not_found_title`). No blank
  screen, no technical text.
- **Covers:** `tests/e2e/built-output.smoke.e2e.ts:236` checks only that the server
  answers 404 for an unknown address, in Chromium.
- **Result:** iPhone FR [ ] iPhone AR [ ] Android FR [ ] Android AR [ ] **Notes:**

#### I4. The Manager Card (Curva) on a weak connection

- **Run:** ONE per phone, FR and AR. **Needs:** O8 (Curva switched on).
- **Steps:** on a slow connection (E5) open the Curva card page, or the card share
  picture. Retry if it fails.
- **Expected:** the card draws, or after a retry says "La carte n'a pas pu
  s'afficher. Vérifiez votre connexion, puis réessayez." (`fr:card.load_failed`) and
  then offers "Recharger la page" (`fr:card.reload`). It never sits on a half-drawn
  card forever. A signed-in person sees their own card, and the viewer after a
  sign-out never sees the previous account's card.
- **Covers:** PB:55 (SEC-04), PB:54 (SEC-03).
- **Result:** iPhone FR [ ] iPhone AR [ ] Android FR [ ] Android AR [ ] **Notes:**

#### I5. Moving around Fantasy never sticks on "Chargement"

- **Run:** ONE per phone, FR, on a slow connection.
- **Steps:** with a signed-in team, move between Fantasy Accueil, Équipe, Transferts,
  Points, Classement, Ligues about ten times, quickly.
- **Expected:** every screen settles; no screen stays on "Chargement…" or "Chargement
  de votre équipe…" (`fr:fantasy.cloud.loading`) for more than 20 seconds (the automated test waits at most 20 seconds on a fast
  network, `tests/e2e/fantasy.journey.e2e.ts:41-43`; allow 30 on a slow one).
- **Covers:** `tests/e2e/fantasy.journey.e2e.ts:242` (Chromium, fast network).
- **Result:** iPhone [ ] Android [ ] **Notes:**

### J. Long lists

#### J1. The Fantasy player list

- **Run:** SPLIT. **Read-only OK** for browsing as a visitor.
- **Steps:** open the player list with no filter, scroll a long way, tap "Voir …
  joueurs" in the filter sheet, change the sort, scroll back up.
- **Expected:** scrolling stays smooth, rows do not repeat, the count reads
  correctly ("Voir 1 joueur", "Voir 2 joueurs", "Voir N joueurs", or "Aucun joueur
  correspondant" when none; `fr:fpl.pick.filters_apply_*`); in Arabic "عرض لاعبين"
  for two players is known to be ambiguous without vowel marks (PC:143-144).
- **Covers:** PB:48 (UX-006), PC:40, PC:143-144.
- **Result:** iPhone FR [ ] iPhone AR [ ] Android FR [ ] Android AR [ ] **Notes:**

#### J2. News: scroll the archive

- **Run:** ONE per language. **Read-only OK.**
- **Steps:** in Actualités keep scrolling and loading more until you have loaded
  about 100 articles.
- **Expected:** each batch adds new articles with no repeats and no gaps in dates;
  the page does not freeze; Back returns to the same place.
- **Covers:** PB:48; PROD:348 (about 15,690 licensed editions).
- **Result:** iPhone FR [ ] iPhone AR [ ] Android FR [ ] Android AR [ ] **Notes:**

#### J3. A long inbox

- **Run:** ONE per language. **Needs:** an account with more than one page of
  notifications; this is **owner to confirm** (no prepared data for it is listed in P1 to P6).
- **Steps:** open Notifications, tap "Voir plus" until the end, use the filter chips
  "Football", "Fantasy", "Actualités".
- **Expected:** more items load without repeats; each filter shows only its kind;
  unread items are marked "Non lue" (`fr:notifications.load_more`, `fr:notifications.unread`).
- **Covers:** PB:41.
- **Result:** iPhone FR [ ] iPhone AR [ ] Android FR [ ] Android AR [ ] **Notes:**

### K. Sharing and the phone itself

#### K1. An invite link from one phone to the other

- **Run:** two runs: iPhone sends to Android, then Android sends to iPhone, one run in
  French and the other in Arabic. **Needs:** P6.
- **Steps:** on the sending phone create a private league (D3) and use WhatsApp (or
  the share sheet) to send the invite to the other phone. On the receiving phone,
  signed out, open the link from the chat. Create an account (A1) and finish.
- **Expected:** the link opens the join screen of the right league; after sign-up
  the code is still known and you join; the code is not left in the address bar; if
  the phone blocks storage you are told rather than left with a broken link
  ("Ce lien d'invitation est incomplet" must not appear for a valid link). The
  Arabic recipient on a fresh phone may see French first; that is known (PD:167-168).
- **Covers:** PD:38 (D5), SHARE:78 (S-07), PD:129, SHARE:34-40, PD:167-168.
- **Result:** iPhone to Android [ ] Android to iPhone [ ] **Notes:**

#### K2. Taps you can hit

- **Run:** SPLIT.
- **Steps:** on Home, Matchs, Fantasy and Actualités try to tap every small control
  with your thumb: the bell, the back button, bookmarks, filter chips, the carousel
  dots, the "Signaler" (report) buttons and the "JOUER" chip on the squad page.
- **Expected:** every control is at least 44 by 44 px (DS:56-58, `--ui-tap-min`
  2.75rem). **Known exceptions that are not a Fail:** the "JOUER" chip on the squad
  page (about 64 by 32) and the "Signaler" buttons (32 by 32) (PC:140-142). Note
  anything else that is hard to hit. (PROD:395 still says the carousel dots are
  24 by 32; PC:47 later made them 44 by 44, the later report wins.)
- **Covers:** PC:47 (MOB-03), PC:140-142.
- **Result:** iPhone FR [ ] iPhone AR [ ] Android FR [ ] Android AR [ ] **Notes:**

#### K3. Dark mode and the phone's theme

- **Run:** ONE per phone, FR. **Read-only OK.**
- **Steps:** set the phone to dark, open the address (nothing stored). Then Profil,
  "Apparence", choose Clair, Sombre, Système in turn.
- **Expected:** a dark phone gets a dark page from the first paint; a stored choice
  beats the phone; Système follows the phone when you switch it without reloading
  (`tests/e2e/dark-mode-flag.e2e.ts:84-199`, Chromium). Text stays readable
  (contrast was not measured on every new line, PC:83-84).
- **Covers:** PC:83-84, PROD:195-197.
- **Result:** iPhone [ ] Android [ ] **Notes:**

## 3. Screen-reader pass

Do this after section 2, one platform at a time, in French and in Arabic. Turn the
screen reader on, put the phone in your hand and swipe. Sighted helpers: ask the
tester what they hear; do not tell them what the screen shows.

Basic controls: **VoiceOver** swipe right/left to move, double-tap to activate,
three-finger swipe to scroll. **TalkBack** swipe right/left to move, double-tap to
activate, two-finger swipe to scroll. **NVDA** Tab and Shift+Tab, Enter to
activate, arrow keys to read.

### 3.1 Things to listen for (each is a check, SR1 to SR10)

| ID   | Where                               | What to do                                                                            | What you should hear                                                                                                                                                                                                                                                                                                                        | Covers                                        |
| ---- | ----------------------------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| SR1  | Any page, first moves               | Move to the very first item (VoiceOver/TalkBack: swipe right from the top; NVDA: Tab) | A link "Aller au contenu" (`fr:nav.skip_to_content`) / "انتقل إلى المحتوى" (`ar:nav.skip_to_content`); activating it lands on the page title and its own filters, not past them                                                                                                                                                             | PC:49 (MOB-05), PC:209-210                    |
| SR2  | Search                              | Open search, type "wydad" (or a club), move through the results                       | The field is a search field and its results are a list; as the list changes you hear "1 résultat", "2 résultats" or "N résultats"; the moved-to result is named with its kind (Club, Joueur); a failure is spoken ("La recherche est indisponible…"), and "Aucun résultat" for nothing                                                      | PC:46 (MOB-02), PB:42, PB:45                  |
| SR3  | News carousel (Home)                | Move into the carousel                                                                | "carrousel" then "diapositive", and "Article 2 sur 5" style positions (`fr:news.carousel.*`); dots have names (`ar:news.carousel.role` "عرض دوّار", `ar:news.carousel.slide_role` "شريحة")                                                                                                                                                  | PC:47-48, PC:85-86                            |
| SR4  | Pronostics deck and votes           | Move into the deck                                                                    | The role words are French or Arabic, never English "carousel"/"slide"; each dot is a 44 px button with a name                                                                                                                                                                                                                               | PC:47-48 (MOB-03, MOB-04)                     |
| SR5  | Match list and match page           | Move over a match whose score is unknown, and one with a score                        | A known score is read as "Score : A 2, B 1"; an unknown one as "Score indisponible : A contre B" (`fr:matches.a11y.score_unavailable`), not "0" or "dash"; status words ("Match terminé", "Match reporté") are spoken                                                                                                                       | PA:35 (DATA-03), PB:49                        |
| SR6  | Match page tabs                     | Move over Résumé, Stats, Compos, Face à face                                          | Each is a tab and the chosen one is announced as selected; the group is named "Sections du match" (`fr:matches.detail.tabs_label`, `src/components/matches/MatchTabs.tsx:58`, `aria-selected` in `src/components/ui-kit/primitives.tsx:811`)                                                                                                | PC:46                                         |
| SR7  | Saved articles                      | Remove a saved article                                                                | You hear "Article retiré de vos articles enregistrés." (`fr:news.saved.removed_announce`) without moving focus                                                                                                                                                                                                                              | PB:46 (UX-001)                                |
| SR8  | Sign-in errors                      | Sign in with a wrong password                                                         | The error "E-mail ou mot de passe incorrect." is read out at once (the message is an alert, `src/components/auth/AuthShell.tsx:318-337`); the button is announced as available again                                                                                                                                                        | PB:92, PB:43-44                               |
| SR9  | Dialogs: account deletion, sign out | Open "Supprimer mon compte" (then close with "Annuler") and the sign-out question     | Focus moves into the dialog and its title is read; the checkbox is named "Je comprends que la suppression est définitive."; the red button is announced as dimmed or disabled until the box is ticked (`src/routes/profile.tsx:886-897`); closing returns focus to where you were (**owner to confirm**: no document states the focus rule) | PD:228-229, PD:129-130                        |
| SR10 | Language switch                     | Switch French to Arabic from Profil                                                   | After the switch the screen reader changes its voice and direction to Arabic; a failure notice ("L'arabe n'a pas pu être chargé…") is read out, and Retry and Close are reachable and named                                                                                                                                                 | FP:51-53, `src/i18n/language-load-notice.tsx` |

### 3.2 VoiceOver (iPhone, Safari) and TalkBack (Android, Chrome)

Run SR1 to SR10 in French and again in Arabic on each phone. Also listen for these
on every screen. The first bullet is documented; the others are general
expectations that no document fixes, so report anything odd rather than failing
it:

- Icon-only buttons (back, search, bell, bookmark, share, close) have a name; if
  you hear only "button" it is a Fail (PROD:399, names on icon-only buttons).
- Tables and rankings: you can reach the rank, the name and the points of one row
  without losing track.
- Arabic text is read with an Arabic voice and Latin words (club names in Latin
  script, "Fantasy") are not spelt out letter by letter. Report if the screen reader
  switches voice in the middle of a number.
- Toasts ("Lien copié", "Équipe enregistrée") are read out without having to hunt
  for them.
- Nothing "behind" a dialog can be reached while the dialog is open.

### 3.3 NVDA (Windows, desktop browser) — only if O7 is yes

Run SR1, SR2 and SR3 with Tab and the arrow keys. Also check the first Tab stop is
the skip link on the main pages, on the Fantasy pages and on the sign-in pages, and
that the Plus pages, landing page, splash, language chooser and consent page have
**no** skip link (a known gap, PC:116-117).

## 4. Results and how to report a problem

### 4.1 Results table

Write P, F or B in each cell you ran; leave the others empty. Add the report number
(R-01, R-02…) of every F.

| Case | iPhone FR | iPhone AR | Android FR | Android AR | Report |
| ---- | --------- | --------- | ---------- | ---------- | ------ |
| A1   |           |           |            |            |        |
| A2   |           |           |            |            |        |
| A3   |           |           |            |            |        |
| A4   |           |           |            |            |        |
| A5   |           |           |            |            |        |
| A6   |           |           |            |            |        |
| A7   |           |           |            |            |        |
| A8   |           |           |            |            |        |
| B1   |           |           |            |            |        |
| B2   |           |           |            |            |        |
| B3   |           |           |            |            |        |
| B4   |           |           |            |            |        |
| B5   |           |           |            |            |        |
| B6   |           |           |            |            |        |
| B7   |           |           |            |            |        |
| B8   |           |           |            |            |        |
| B9   |           |           |            |            |        |
| C1   |           |           |            |            |        |
| C2   |           |           |            |            |        |
| C3   |           |           |            |            |        |
| C4   |           |           |            |            |        |
| C5   |           |           |            |            |        |
| C6   |           |           |            |            |        |
| C7   |           |           |            |            |        |
| C8   |           |           |            |            |        |
| C9   |           |           |            |            |        |
| C10  |           |           |            |            |        |
| D1   |           |           |            |            |        |
| D2   |           |           |            |            |        |
| D3   |           |           |            |            |        |
| D4   |           |           |            |            |        |
| D5   |           |           |            |            |        |
| D6   |           |           |            |            |        |
| E1   |           |           |            |            |        |
| E2   |           |           |            |            |        |
| E3   |           |           |            |            |        |
| E4   |           |           |            |            |        |
| E5   |           |           |            |            |        |
| E6   |           |           |            |            |        |
| E7   |           |           |            |            |        |
| E8   |           |           |            |            |        |
| E9   |           |           |            |            |        |
| E10  |           |           |            |            |        |
| E11  |           |           |            |            |        |
| F1   |           |           |            |            |        |
| F2   |           |           |            |            |        |
| F3   |           |           |            |            |        |
| F4   |           |           |            |            |        |
| F5   |           |           |            |            |        |
| G1   |           |           |            |            |        |
| G2   |           |           |            |            |        |
| G3   |           |           |            |            |        |
| G4   |           |           |            |            |        |
| H1   |           |           |            |            |        |
| H2   |           |           |            |            |        |
| H3   |           |           |            |            |        |
| H4   |           |           |            |            |        |
| H5   |           |           |            |            |        |
| I1   |           |           |            |            |        |
| I2   |           |           |            |            |        |
| I3   |           |           |            |            |        |
| I4   |           |           |            |            |        |
| I5   |           |           |            |            |        |
| J1   |           |           |            |            |        |
| J2   |           |           |            |            |        |
| J3   |           |           |            |            |        |
| K1   |           |           |            |            |        |
| K2   |           |           |            |            |        |
| K3   |           |           |            |            |        |

Screen readers (write P, F or B; NVDA only if O7 is yes):

| Check | VoiceOver FR | VoiceOver AR | TalkBack FR | TalkBack AR | NVDA | Report |
| ----- | ------------ | ------------ | ----------- | ----------- | ---- | ------ |
| SR1   |              |              |             |             |      |        |
| SR2   |              |              |             |             |      |        |
| SR3   |              |              |             |             |      |        |
| SR4   |              |              |             |             |      |        |
| SR5   |              |              |             |             |      |        |
| SR6   |              |              |             |             |      |        |
| SR7   |              |              |             |             |      |        |
| SR8   |              |              |             |             |      |        |
| SR9   |              |              |             |             |      |        |
| SR10  |              |              |             |             |      |        |

Totals (the tester fills in at the end): cases run [ ], passed [ ], failed [ ],
blocked [ ]. A blocked case is not a pass: list each one with its reason (usually
a missing O or P item) so the owner can re-run it.

### 4.2 How to report a problem

One report per problem, sent to the owner the same day. Copy this block, one per
problem, and number them R-01, R-02…

```text
Report number: R-01
Case number: (for example C6)
Screen (name and, if you can, the address bar text):
Language: French / Arabic
Device and version: (for example iPhone 13, iOS 18.2 / Pixel 7, Android 15)
Browser: Safari / Chrome / other
Screen reader on: no / VoiceOver / TalkBack / NVDA
Signed in as: (the test account's user name, never the password)
Build or release id shown in section 0:
Connection: Wi-Fi / mobile data / airplane mode / very slow
What I did, step by step:
1.
2.
3.
What I expected (copy it from the case):
What happened instead:
How bad: blocks the whole case / wrong text or look / small annoyance
Does it happen every time? yes / no / only once
Screenshot or screen recording attached: yes / no (file name)
Time it happened (hour and minute, so the owner can find it in the logs):
```

Rules for the screenshot: take it at the moment of the problem; on the iPhone press
the side button and the volume-up button together; on Android press power and
volume-down. Do not include the password. For a text-cut-off or direction problem
take the **whole** screen, not a crop.

## 5. Deliberately not tested

| Not tested                                                                                              | Why                                                                                                                                                                                                                                                                                                                                              |
| ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Push notifications** (alerts on the phone)                                                            | No phone build receives them yet: the sending side is off and its dispatcher is not deployed, and the phone app has not been run on a phone (`docs/backend/PUSH_NOTIFICATIONS.md:32-40`, REM:144-146, PROD:30). The browser does not show the push switch (F2).                                                                                  |
| **E-mail delivery** (reminders, recaps, Prospects weekly mail) and how an e-mail looks in a mail client | A separate protocol with its own staging windows and switches (PRO-04): `docs/engineering/REMINDER_DELIVERY_EVIDENCE.md`. Cases F2 and F3 only check that the screens do not over-promise (EMAIL:42-55). PD:135 lists mail rendering as not verified.                                                                                            |
| **Payments**                                                                                            | There are none. BotolaGO+ shows an offer whose checkout button is a stub that says "bientôt" (`docs/product/botolago-plus-screens-brief.md:61`; its status is still mocked, `src/lib/feature-flags.ts:375`), and Fantasy and Pronostics are free (PROD:249). Do not try to buy anything; if a real payment form ever appears, report it at once. |
| **Confirming an account deletion**                                                                      | Irreversible within 7 days. G3 stops before the red button. The first real run of the deletion worker is something the owner watches separately (PLAN section 5).                                                                                                                                                                                |
| **Reading Arabic wording for quality**                                                                  | A native Arabic reader does this from the review sheet: `docs/review/2026-10-16-arabic-wording-review.md` (the ARABIC blocker). This checklist checks that Arabic appears, in the right direction, uncut.                                                                                                                                        |
| **Load, speed, many users at once, sign-up bursts**                                                     | The A8 capacity test (PLAN section 4, A8). Do not repeat actions to "stress" anything.                                                                                                                                                                                                                                                           |
| **Pinch zoom**                                                                                          | The owner decided to keep the zoom cap (`maximum-scale=1`, PD:18, PROD:424-428). Not a bug to report.                                                                                                                                                                                                                                            |
| **Desktop layout**                                                                                      | The owner decided desktop does not matter (PD:21). Only NVDA, if O7 is yes.                                                                                                                                                                                                                                                                      |
| **The admin console, the news editor, prizes admin, player mapping**                                    | Staff screens, not what a first real user meets.                                                                                                                                                                                                                                                                                                 |
| **Two-step sign-in set-up**                                                                             | Optional and not on the audit's list of untested states. Add it if the owner asks; the deletion dialog (G3) and some saves ask for its code when it is on (`fr:auth.step_up.toast`).                                                                                                                                                             |
| **Pronostics boards after scoring, Prospects weekly list, Rivals, Trophées**                            | They need a match to be scored or a weekly edition to be published during the session (PB:53 QA-08), or switches whose state was not read (O8, PLAN section 5).                                                                                                                                                                                  |
| **Anything on the live site that writes**                                                               | See 1.6, rule 2.                                                                                                                                                                                                                                                                                                                                 |

## Appendix A. What the automated tests already cover (so this list does not repeat them)

All of these run in desktop Chromium on sample data or a stub server, or, for the
two marked "staging", only when secret test accounts are provided. None runs on a
phone, on WebKit or with a screen reader (PROD:417-423). The cases in section 2
add the real device, a real account, and the failed and long-list states.

| Automated spec (under `tests/e2e/`)                                                                                    | What it checks                                                                                         | What section 2 adds                          |
| ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | -------------------------------------------- |
| `accessibility-keyboard.e2e.ts`                                                                                        | Skip link by keyboard, 44 px prediction dots, search announcements (French and Arabic)                 | A real screen reader (section 3), K2         |
| `anonymous.acceptance.e2e.ts`                                                                                          | Public pages at 320 to 1440 px, the launch splash                                                      | B1 on real phones                            |
| `built-output.smoke.e2e.ts`                                                                                            | The built pages serve and hydrate against a stub server; unknown address                               | I3 on a phone                                |
| `context-restoration.e2e.ts`                                                                                           | Calendar day, search query, club tab survive Back                                                      | B3, C3, E1 with real data                    |
| `dark-mode-flag.e2e.ts`                                                                                                | Dark and light choice, Système following the phone                                                     | K3 on a real phone                           |
| `empty-states.e2e.ts`                                                                                                  | An empty day offers the latest results                                                                 | B3                                           |
| `fantasy.journey.e2e.ts` (needs a test account)                                                                        | Build and save a squad, captain, one transfer, points navigation, leagues, no stuck loading            | C4 to C8 on phones, in Arabic, with failures |
| `mobile-readability.e2e.ts`                                                                                            | Match tabs, club names, standings columns, search result layout                                        | B4, B6, E9 with real data                    |
| `news-hero-fallback.e2e.ts`                                                                                            | News heroes without images, mirrored cards in Arabic                                                   | E2, E10 with real articles                   |
| `pronostics.e2e.ts`                                                                                                    | Guest picks, claim at sign-in, leagues by code, votes (sample data)                                    | B8 with a real account and a failing network |
| `seo-rendering.e2e.ts`, `legal-brackets.e2e.ts`                                                                        | Server-rendered content, no bracketed blanks in legal text                                             | nothing                                      |
| `staging.acceptance.e2e.ts` (staging)                                                                                  | Wrong password message (French), cloud team save, follow isolation between two users                   | A3, A4, C1, C4, E7 on phones                 |
| `curva.e2e.ts`, `curva-off.e2e.ts`, `pepites.e2e.ts`, `player-mappings.sample.e2e.ts`, `news-cms.authenticated.e2e.ts` | Curva, Prospects and staff screens (note `curva-off.e2e.ts` looks out of date, PC:183-186, PD:204-205) | I4 only                                      |

## Appendix B. Count

- Numbered test cases: 69 (A 8, B 9, C 10, D 6, E 11, F 5, G 4, H 5, I 5, J 3, K 3).
- Screen-reader checks: 10 (SR1 to SR10), run on 2 or 3 platforms in 2 languages.
- Items marked **owner to confirm**: O1 to O8 above, plus the in-case flags in A5
  (which message a used link shows), A8 (whether the providers work), C9 (which
  environment has the Phase B migration), C10 (the round the rating rule starts
  at), E6 (whether an offline banner should exist), J3 (no prepared data for a
  long inbox) and SR9 (the focus rule for dialogs): 15 flags in all.
