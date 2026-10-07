# BG-0155 — Fantasy weekly routine: screen brief

Owner request, 2026-10-07 ("start with 1-6 then stop"), after the Impeccable
critique of every screen (`.impeccable/critique/2026-10-06T22-19-34Z__src-routes.md`,
25/40). These are the six confirmed major (P1) findings on the Fantasy weekly
routine, numbered as in that plan. Branch `claude/brave-gates-to1i3m`, from `main`
at `af8b0a7`.

1. Pick Team: a changed captain, line-up or chip shows its only "Confirmer" in a
   header that scrolls away, and leaving the screen drops the change without a word.
2. Hub: the big score never says which round it is for, can be last round's figure
   under this round's deadline, shows 0 when there is no result, and before the
   deadline the hub has no way to the Points screen.
3. Arabic deadline countdown: minutes under 10 are padded with an Arabic-Indic zero,
   so 4 minutes reads as "40".
4. Private league: no way to invite anyone from the league page, and "Quitter la
   ligue" leaves on the first tap; on the leagues page, creating a league hides
   behind a cog called "Gérer les ligues".
5. Rules page: "a goal by a defender or goalkeeper is 6 points" (the server gives a
   goalkeeper 10), and most of the scoring, the chips and the transfer carry-over
   are missing.
6. Fixture difficulty grid: difficulty is shown by colour alone (a screen reader
   hears none of it), and the French key is the English "FDR".

Inspected before writing this, on untouched `main` (local mock mode, the critique's
276 captures at 390x844 FR/AR/dark and 1440x900): `src/routes/fantasy.team.tsx`,
`fantasy.index.tsx`, `fantasy.points.tsx`, `fantasy.rules.tsx`, `fantasy.fixtures.tsx`,
`fantasy.leagues.tsx`, `fantasy.leagues.$leagueId.tsx`, `fantasy.leagues.join.tsx`;
`src/components/fantasy/FantasyHubPersonal.tsx`, `FantasyHubRound.tsx`,
`DeadlineStrip.tsx`, `DeadlineCard.tsx`, `CreateLeagueInvite.tsx`;
`src/components/fpl/FantasyFrame.tsx`, `TransferConfirmScreen.tsx`,
`SquadBuilderScreen.tsx`; `src/components/predictions/leagues/LeaguePage.tsx` and
`InviteLinkShare.tsx`; `src/lib/use-unsaved-changes-guard.ts`;
`src/services/fantasy-runtime.ts` (`getSummary`, `getRules`),
`src/services/fantasy-next-action.ts`; `api.fantasy_rules` and the v1 ruleset rows
(`supabase/migrations/20260720163222_fantasy_ruleset_v1.sql`),
`api.reset_prediction_league_invite_code`; `docs/backend/FANTASY_RULES_V1.md`.

Measured on main:

- **Pick Team.** Captain changed, then scrolled to the bench: the only Confirmer is
  at y=-158 (off screen); tapping Accueil drops the change with no prompt. In
  Arabic the Confirmer sits top-left, the hardest reach for a right thumb.
- **Hub.** The card's figure is `currentResult?.score ?? 0`, where `currentResult`
  falls back to the latest round with a result; the label is the generic "Points de
  la journée". The card opens `/fantasy/profile`; with the deadline ahead the hub
  has 0 links to `/fantasy/points`. Points opens on the current round, which has no
  result before kick-off.
- **Countdown.** `DeadlineStrip.tsx:33` and `DeadlineCard.tsx:41` pad with "٠"
  while `Intl.NumberFormat("ar-MA")` returns Latin digits, so "٠4" renders as "4٠".
- **Leagues.** The league page's only action is a full-width "Quitter la ligue"
  that calls `leave()` directly. The invite code is shown once at creation; the
  server keeps only a digest. `api.reset_prediction_league_invite_code` already
  issues a new code for any private league the caller owns (Fantasy and Pronostics
  share `app.fantasy_leagues`), and the Pronostics league page already uses it with
  a confirmation and the share buttons.
- **Rules.** `fantasy.rules.scoring_desc` says 6 points for a defender's or
  goalkeeper's goal; the v1 ruleset gives GK 10, DEF 6, MID 5, FWD 4. The server
  already returns `positions` (goal and clean-sheet points per position), `scoring`
  (every other category, with thresholds) and `chips`; the page reads none of them.
  Mock mode returns those three as empty arrays.
- **Fixtures.** A cell prints "FUS (D)"; its screen-reader text is the club and the
  venue; the key's swatches are hidden from screen readers; levels 1/2 and 4/5 differ
  only in shade; the key reads "Légende FDR" in French.

## What must be preserved

- **Every Fantasy rule and the server's authority.** No rule, score, deadline,
  transfer cost or chip behaviour changes. Nothing new is computed in the browser:
  the rules table and the chips list are read from `api.fantasy_rules`; the hub's
  round number comes from the same history row its figure already comes from.
- **The look.** Kit tokens and primitives only (`src/components/ui-kit`), no new
  colours, shadows or radii, the action gradient only where it already is.
  Logical (start/end) layout; Latin digits in both languages; dark mode through the
  kit tokens. Pépites and the rest of the app are untouched.
- **Pick Team.** The pitch, chips row, navy strip, "Terrain | Liste", list view,
  the substitution flow and its own fixed "Annuler — Remplacer" bar, the cloud draft
  (a signed-in draft still comes back on return), validation and the save and chip
  paths are unchanged.
- **Hub.** The team card stays the action-gradient card with the same name, manager,
  rank, the Moyenne / Meilleur / Total strip and the live pill. The next-action
  button, the deadline card and every other hub section are unchanged.
- **Leagues.** Standings tables, report-a-name, cups tabs and the join flow are
  unchanged. Creating a league still uses the same call and name rules.
- **Rules.** The illustration, the title, the four key-number tiles, the squad,
  budget, formation, captaincy, deadline and tiebreak cards and the
  `#scoring-policy` card stay, in the same order.
- **Fixtures.** The grid's layout, the sort buttons, the colour scale and the
  `data-fdr-*` markers the tests count are unchanged.
- **Out of scope** (critique items not approved now): the reminder bell and email
  promises, chip one-tap activation, the hub's button count, the Matches and Home
  layout, News, Pépites, sign-in, admin.

## The improvements

1. **Pick Team keeps unsaved work in view and asks before dropping it.** While a
   line-up, captain or chip change is pending, a bar sticks just above the bottom
   menu (the Transfers confirmation bar's pattern: bar surface, top hairline,
   raised shadow): a status line, then "Annuler" (soft) and "Confirmer" (ink).
   - Status line: "Modifications non enregistrées" / "تعديلات غير محفوظة"; for a
     chip, "{chip} : à confirmer" / "{chip}: بانتظار التأكيد".
   - The header keeps its back pill while changes are pending (the ✕ and ✓ move to
     the bar), so there is one Confirmer, in thumb reach.
   - While a substitute is being chosen, only the existing substitution bar shows.
   - Leaving with changes pending asks first (`useUnsavedChangesGuard`): "Vos
     changements ne sont pas confirmés et ne compteront pas pour cette journée.
     Quitter quand même ?" / "لم تُؤكَّد تغييراتك ولن تُحتسب في هذه الجولة. هل تريد
     المغادرة رغم ذلك؟". Nothing pending, no prompt.
   - From `md` the bar sticks too (`FantasyFrame stickyBottomBar`).
2. **The hub's score names its round and leads to Points.**
   - The summary carries the round its points belong to (`pointsGameweek`, the
     history row's `sequence`; `null` when no round has a result).
   - Under the figure: "Points · J{n}" / "نقاط الجولة {n}". With no result: "–"
     and "Aucun point pour l'instant" / "لا نقاط بعد", never 0. Live keeps the
     live pill.
   - The card holds two links instead of one: the team block (name, manager, rank)
     opens the team profile as today; the points block opens Points at that round
     (`/fantasy/points?gw={n}`), named "Voir mes points de la journée {n}" /
     "عرض نقاطي في الجولة {n}". Each is at least 44px tall with its own focus ring.
   - Points accepts `?gw=` and, without it, opens on the same round as the hub's
     figure (the latest round with a result for this team), or on the current
     round when no round has one yet.
3. **The Arabic countdown uses Latin digits throughout.** Both pads use "0" in both
   languages, so 4 minutes is "04" in French and in Arabic.
4. **A private league can invite, and leaving asks first.**
   - League page, owner: "Inviter des amis" / "ادعُ أصدقاءك" opens a confirmation
     ("Un nouveau code est créé pour inviter vos amis. L'ancien code ne fonctionnera
     plus." / "سيُنشأ رمز جديد لدعوة أصدقائك، ولن يعمل الرمز القديم بعد الآن."),
     then the share buttons (phone share sheet, WhatsApp, copy) with a Fantasy
     link, reusing the Pronostics reset call and share component. A refusal is said
     in words, never silently.
   - League page, member: one quiet line, "Seul le créateur de la ligue peut
     inviter de nouveaux membres." / "وحده منشئ الدوري يمكنه دعوة أعضاء جدد."
   - "Quitter la ligue" stays at the foot and opens a confirmation that names the
     league: "Quitter « {league} » ?" with "Vous disparaîtrez de son classement.
     Pour revenir, il vous faudra un nouveau code d'invitation." / "مغادرة
     «{league}»؟" with "ستختفي من ترتيبه، ولن تعود إليه إلا برمز دعوة جديد.";
     buttons "Quitter la ligue" (destructive) and "Annuler".
   - Leagues page: the cog "Gérer les ligues" toggle becomes "Créer une ligue" /
     "إنشاء دوري" with a plus; its submit button reads "Créer" / "إنشاء"; after
     creation the share buttons appear under the code. The join screen's line
     pointing to « Gérer les ligues » names « Créer une ligue ».
5. **The rules page states the real scoring, read from the server.**
   - "Barème de points" becomes a table, one row per event and one column per
     position (GB / DEF / MIL / ATT, the app's own position labels), built from
     `positions` and `scoring`: appearance under / at least 60 minutes, goal,
     assist, clean sheet, saves (per {n}), penalty save, goals conceded (per {n}),
     penalty miss, yellow card, direct red, second-yellow dismissal, own goal. "—"
     where an event does not apply to a position. Arabic mirrors the table.
   - Transfers: "{free} transfert gratuit par journée, cumulable jusqu'à {max}.
     Chaque transfert supplémentaire coûte {hit} points." / "{free} انتقال مجاني في
     كل جولة، يمكن ادخاره حتى {max}. كل انتقال إضافي يكلّف {hit} نقاط.", from the
     ruleset's own numbers.
   - A chips card lists the four chips under their recorded names (Joker, Triple
     Capitaine, Free Hit, Bench Boost / الورقة الحرة، القائد الثلاثي، الضربة الحرة،
     تعزيز الاحتياط), what each does and the rounds each can be played in, from
     `chips`.
   - Mock mode returns the v1 ruleset's positions, scoring and chips, so local runs
     show the same table production does.
   - If the server ever returns no scoring rows, the table is replaced by one plain
     line saying the detailed scale is unavailable, never by invented numbers.
6. **Difficulty is readable without colour.**
   - Each cell shows its difficulty number beside the club token, legible on all
     five fills in both themes; the cell keeps its width.
   - A screen reader hears "{club} ({venue}), difficulté {n} sur 5" /
     "{club} ({venue})، الصعوبة {n} من 5".
   - The key reads "Difficulté" / keeps "مفتاح الصعوبة"; its panel adds "D = à
     domicile · E = à l'extérieur" / "م = على أرضه · خ = خارج أرضه".

## Acceptance criteria

Measured, not asserted (CLAUDE.md, Evidence): boxes read from the page, overflow
per element (not `scrollWidth`, because of `overflow-x: clip`), contrast from
rendered pixels. 390x844 and 1440x900, French and Arabic, light and dark, against
this branch's own dev server on its own port.

1. **Pick Team.** After changing the captain and scrolling to the bench, the
   Confirmer's box is fully inside the viewport and above the bottom menu's top
   edge, in FR and AR, light and dark. Confirm saves (same toast as today); Annuler
   restores the saved team. With a change pending, Back, a bottom-menu tab and the
   browser Back each ask first; declining keeps the change on screen; accepting
   leaves. With nothing pending nothing asks. The header shows its back pill and
   only one Confirmer exists on the screen. Substituting shows only the
   substitution bar. At 1440x900 the bar sticks to the column's foot.
2. **Hub.** In mock mode (the sample's points are J13's) the card reads "58 pts"
   with "Points · J13" / "نقاط الجولة 13". With no result the figure is "–" and no
   0 appears. The points block links to `/fantasy/points?gw=13`, which opens on J13;
   the team block still opens `/fantasy/profile`. Both links are ≥44px tall and
   keyboard-focusable with a visible ring. Points without `?gw` opens on the
   hub figure's round (J13 in mock mode).
3. **Countdown.** In Arabic with 4 minutes left, the strip and the card show "04",
   never "٠" and never "40"; French unchanged. A unit test pins both components in
   both languages for minutes 0-9.
4. **Leagues.** As owner: "Inviter des amis" → confirmation → share buttons with a
   `/fantasy` invite link; as member: the quiet line and no invite button. "Quitter
   la ligue" opens a confirmation naming the league; Annuler leaves membership
   untouched (no request sent). The leagues page shows "Créer une ligue" with a
   plus and the share buttons after creation. All in FR and AR.
5. **Rules.** The table reads GB goal 10, DEF 6, MID 5, ATT 4, and every row of
   `FANTASY_RULES_V1.md` §Scoring, in FR and AR, mirrored in Arabic, fitting 390px
   with no clipped cell. The string "défenseur ou gardien : 6 pts" no longer exists
   in either dictionary. Transfers say 1 free, carried up to 2, −4 per extra. The
   chips card lists four chips with their rounds.
6. **Fixtures.** Every fixture cell shows its number; the accessible name of a cell
   includes "difficulté {n} sur 5" / "الصعوبة {n} من 5"; the number reads at ≥4.5:1
   on each of the five fills in light and dark (rendered pixels); the key says
   "Difficulté" and explains D/E; `[data-fdr-fixture]` counts are unchanged.
7. **Everywhere.** `bun run typecheck`, `bun run lint`, the i18n gate, the ui-kit
   contract test and the existing Fantasy tests pass; new behaviour has tests.
   Before/after screenshots of the six screens at 390x844 FR/AR/dark and 1440x900.
