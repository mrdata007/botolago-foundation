# Fantasy rules, captain choice and first squad: screen brief

Owner request, 2026-10-07: "go" on the plan from the design critique of
2026-10-06 (`.impeccable/critique/2026-10-06T20-00-17Z__src-routes.md`, Priority
issue 2, "Fantasy states wrong rules and hides the key decision"). The owner
named it the top priority of the round. Impeccable commands: `clarify`, then
`onboard`.

Branch `claude/fantasy-rules-and-captain`, from `main` at `1c12b5b0`. Local dev
server on port 5301 against production, read only, signed out. A guest squad was
built in the browser (stored on the device only); nothing was saved to the
server and nobody signed up.

## What was inspected and measured on untouched `main`

Code read: `src/routes/fantasy.rules.tsx`, `fantasy.help.tsx`,
`fantasy.create.tsx`, `fantasy.index.tsx`, `fantasy.fixtures.tsx`,
`fantasy.top-players.tsx`; `src/components/fpl/SquadBuilderScreen.tsx`,
`FplPitch.tsx`, `FplPlayerCard.tsx`, `PlayerActionSheet.tsx`,
`AddPlayerScreen.tsx`; `src/components/fantasy/FantasyHubPersonal.tsx`,
`FantasyGuestIntro.tsx`; `src/components/auth/AuthPromptDialog.tsx`;
`src/services/fantasy-create-service.ts`, `fantasy-drafts-store.ts`,
`fantasy-runtime.ts` (`getRules`), `src/backend/fantasy/contracts.ts`
(`fantasyRulesSchema`); the SQL of `api.fantasy_rules` (migrations
`20260720163222`, `20260927094823`, `20260927120659`); the auth service
(`registerWithEmail`, `verifyCode`, `requestPasswordReset`);
`docs/backend/FANTASY_RULES_V1.md`; the overlapping open pull request #369
(`claude/ios-zoom-and-pitch-lines`), which changes the pitch's row and bench slot
geometry inside `UiPitchSurface`.

Measured (Playwright, Chromium, 390×844 and 1440×900, French and Arabic, light,
French dark):

- **Where the rules come from.** `/fantasy/rules` already calls
  `fantasyService.getRules()`, which is the server's `api.fantasy_rules` for the
  current season (a client copy exists only in mock mode). The response the page
  received from production: ruleset `botolago-fantasy-v1.1` (v1.0's game rules
  plus fixture difficulty); `positions[]` with goal 10/6/5/4 and clean sheet
  4/4/1/0 for GK/DEF/MID/FWD; `scoring[]` with appearance under 60 min 1,
  60 min or more 2, assist 3, every 3 saves 1 (GK), penalty save 5 (GK), every 2
  goals conceded −1 (GK, DEF), penalty miss −2, yellow −1, direct red −3, second
  yellow −3, own goal −2; `chips[]` with Bench Boost, Free Hit, Triple Capitaine
  (once each, from journée 1) and two Jokers (journées 1–15 and 16 to the end);
  `features.bonus_points_enabled: false`; free transfers 1, carry-over 2, hit 4;
  deadline 90 minutes. Every value matches `FANTASY_RULES_V1.md`.
- **What the page says instead.** The scoring card is one sentence,
  `fantasy.rules.scoring_desc`: "défenseur ou gardien : 6 pts" (the goalkeeper's
  goal is 10) and "Cage inviolée : 4 pts (D/GK)" (the midfielder's 1 is missing).
  Assists, cards, saves, penalties, goals conceded, own goals, the chips and the
  carry-over of free transfers are nowhere on the page.
- **Help.** "Je n'arrive pas à me connecter" says a new account is activated "via
  le lien reçu par e-mail" (Arabic: الرابط). Sign-up confirms with a 6-digit code
  typed on the "Vérification" screen (`verifyOtp`). The password-reset line (a
  link) is correct. The other answers agree with the rulebook and the app.
- **Builder strip, first selection.** "TRANSFERTS GRATUITS Illimité · COÛT 0 ·
  BANQUE 13,5", while the name step's strip already reads "EFFECTIF 15/15 joueurs
  · RESTE EN BANQUE 13,5".
- **Captain chosen silently.** After 15 picks the goalkeeper in slot 1 carries
  "C" and the first defender "V" (`withDefaultCaptaincy` in
  `fantasy-create-service.ts` gives the armband to the first two starters on every
  pick). The name step only displays them. Replacing the captain hands the "C" to
  the incoming player of that slot.
- **Bench invisible.** The pitch shows all 15 in four rows (2/5/5/3); slots 12–15
  (the bench) look like starters. A bench player's sheet (Khalid Baba, slot 15)
  lists Remplacer, Retirer, Informations joueur — no captain action and no reason.
- **Picker default sort:** "Prix" (highest price first). The pool already carries
  each player's season points (`totalPoints`), and "Points" is one of the sort
  options.
- **Sign-up box after "Entrer l'effectif".** Primary (gradient) "Se connecter",
  outline "Créer un compte", ghost "Continuer à explorer".
- **Hub with a 15/15 guest draft on the device:** the first-time card says
  "Créer mon équipe" and nothing about the draft.
- **Plain words.** "Entrer l'effectif" (save button), "LÉGENDE FDR"
  (`/fantasy/fixtures` legend pill), "Clean sheets" (`/fantasy/top-players`,
  Pépites player statistics) and "Clean sheet" (the points breakdown) in the
  French interface; the Arabic already says شباك نظيفة.
- No sideways page scroll on any of these screens at 390 or 1440.

## What must be preserved

- **Business rules, untouched.** Squad size and quotas, budget, three per club,
  the 4-4-2 creation layout and its slot numbering (1–11 starters, 12–15 bench in
  GK, DEF, MID, FWD order), formations, captain ×2 and Triple Captain ×3, chips,
  transfers, deadlines, the gameweek lifecycle. The server keeps validating
  exactly as today; no RPC, migration or payload changes. The save payload
  (`draftToSquad`) is the same shape.
- **One source for the rules.** The rules page shows what the server returns for
  the season. No scoring value is typed into a component or a dictionary.
- **The builder's flow and look.** Header, navy strip with the deadline line,
  Terrain/Liste toggle, the pitch card, the Add/Next dock, the picker and its
  refusals, the name step, the guest draft kept on the device and adopted after
  sign-in. The transfers screen, which shares `SquadBuilderScreen` and
  `AddPlayerScreen`, keeps its stats, its 15-on-the-pitch layout and its price
  sort.
- **The sign-in prompt everywhere else** keeps "Se connecter" as its main
  action; only the squad-saving prompt changes emphasis.
- **Pitch geometry.** `UiPitchSurface` is not edited (pull request #369 changes
  its row and bench slots); the builder only passes it a bench.
- Identity: kit tokens and primitives, Changa ≤ 800, logical properties, 44px tap
  floor, no Arabic letter-spacing, the Ink Is Paint and Selected State rules, dark
  mode, the Two Blues rule.

## Improvements being made

1. **Rules page from the server's ruleset.** The scoring becomes a table, event ×
   Gardien / Défenseur / Milieu / Attaquant, built from `positions[]` and
   `scoring[]` (thresholds such as "every 3 saves" come from the data). A new
   "Jetons" section lists the four chips from `chips[]`, with when each can be
   played (the two Jokers' windows from the data), one per journée, not
   cancellable. The transfers card says 1 free per journée, carried over up to 2,
   −4 per extra, from the same payload. The figures and the table share the page's
   loading and error states (skeleton, "Réessayer"). A pure mapping module turns
   the payload into rows; a unit test feeds it the production payload and checks
   every cell against the table in `FANTASY_RULES_V1.md`, parsed from the file.
2. **Help corrected.** New accounts are confirmed with the 6-digit code from the
   e-mail (French and Arabic).
3. **Builder, first selection.** The strip shows "Effectif n/15 joueurs" and
   "Reste en banque", as the name step does (transfers keep their own stats). The
   save button reads "Enregistrer mon équipe". The picker opens sorted by points.
   "Légende FDR" becomes "Difficulté"; "Clean sheet(s)" becomes "Cage(s)
   inviolée(s)".
4. **Captain is the manager's choice.** No armband is given automatically any
   more; replacing or removing a player also takes his armband away. The last step
   gets a section "Choisissez votre capitaine — ses points comptent double" with
   two rows, Capitaine and Vice-capitaine ("À choisir" until chosen), each opening
   a sheet listing the 11 starters only. "Enregistrer mon équipe" stays disabled
   until name, captain and vice-captain are set. "Nommer capitaine" on a starter's
   sheet keeps working.
5. **Bench visible.** The builder's pitch shows the 11 starters (1-4-4-2) and the
   4 substitutes on the white bench strip under it, labelled as on "Mon équipe"
   (GB, 1. DEF, 2. MIL, 3. ATT). Empty bench slots show a visible outline on
   white. A substitute's sheet shows "Nommer capitaine" and "Nommer
   vice-capitaine" as unavailable, with "Titulaires uniquement".
6. **Sign-up box after building a squad.** "Créer un compte gratuit" becomes the
   gradient main action, "Se connecter" the outline one, "Continuer à explorer"
   stays.
7. **Hub remembers the draft.** With a guest squad draft on the device, the hub
   opens with a "Reprendre mon équipe (n/15)" card leading back to the builder;
   the first-time explanation follows it without a second gradient button.

## Acceptance criteria (visual and functional)

- `/fantasy/rules` shows a table whose 52 cells equal `FANTASY_RULES_V1.md`
  (a dash where the rulebook has 0 or — for that position), the four chips with
  the Joker windows 1–15 and 16 to the end, and the transfer rule (1, 2, −4).
  While the request runs the page shows a skeleton; on failure, "Réessayer".
  At 390×844 the table fits without sideways scroll in French and Arabic; numbers
  keep their minus sign in front in Arabic.
- `/fantasy/help`: no answer says a new account is activated by a link.
- `/fantasy/create` during a first selection: the strip reads "Effectif n/15
  joueurs · Reste en banque"; no "Illimité" or "Coût". The picker's sort control
  reads "Points" on opening. Pitch rows 1/4/4/2, four plates (or empty slots) on
  the bench strip, visible in light and dark.
- After 15 picks no plate carries C or V. The last step shows the captain section
  with both rows "À choisir" and a disabled save button; choosing in each sheet
  (11 rows, starters only) fills the row and the pitch marker; then "Enregistrer
  mon équipe" is enabled. A bench player's sheet shows both captain actions
  disabled with "Titulaires uniquement".
- Pressing "Enregistrer mon équipe" as a guest opens the box with "Créer un compte
  gratuit" (gradient) first, "Se connecter" (outline) second and "Continuer à
  explorer". Every other `requireAuth` prompt is unchanged.
- `/fantasy` with a guest draft shows "Reprendre mon équipe (n/15)" first, linking
  to `/fantasy/create`; with no draft the hub is as before.
- French and Arabic (right to left), 390 and 1440, light, and French dark for the
  builder, bench, sheets and rules table. No sideways page scroll (measured with
  descendants of deliberate scrollers excluded). Typecheck, lint, the relevant
  tests and the full `bun run test` pass.

Not checked here: signed-in screens ("Mon équipe" also uses the action sheet, so
its bench players get the same unavailable captain rows), real devices, WebKit.
