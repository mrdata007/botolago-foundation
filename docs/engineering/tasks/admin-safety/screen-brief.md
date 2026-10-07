# Screen brief: admin console safety and wording

Owner request 2026-10-07: "go" on the plan from the design critique of
2026-10-06 (`.impeccable/critique/2026-10-06T20-00-17Z__src-routes.md`, admin
review: no route back to the dashboard, one-press Publier, a stale sign-in
loses the typed motive, raw slugs and English states). This lane covers the
admin console only (`src/routes/admin*.tsx`, `src/components/admin/`), with
the Impeccable commands `harden`, `layout` and `clarify`. It was written after
inspecting the current screens and before any interface change (AGENTS.md,
"Screen work", rule 3).

- Branch: `claude/admin-safety`, from `origin/main` at `1c12b5b0`.
- Signed-in screens were **not rendered**. The console needs a staff session
  with a second factor, and this lane must not create one. They were read from
  source; what was rendered is listed below.

## What was inspected and measured on untouched main

Rendered (dev server on port 5306, production data read-only, nothing signed
in or submitted; Playwright, Chromium, 390×844 and 1440×900, French and
Arabic, light, plus dark on the phone):

- `/admin` and a deep link `/admin/news/<id>`, signed out. Both show the same
  panel: "Authentification requise", a gradient button **"Se réauthentifier"**
  (Arabic "إعادة المصادقة") for a visitor who never signed in, and a reference
  chip `unauthenticated/missing_token` in monospace. The button goes to
  `/auth/login?next=/admin` from both pages, so the deep link is lost. No
  horizontal overflow (element boxes measured; 0 outside the viewport), `dir`
  is `rtl` in Arabic, the button is 44px tall.
- The in-memory player-mapping sample (`/dev/player-mappings-sample`), which
  renders the console's real confirm component (`AdminDestructiveAction`) with
  invented data and no network. With the sample's own hook set to "sign-in
  older than 15 minutes", proposing a mapping with a typed motive ends in
  "Reconnectez-vous : une authentification récente est requise." with no link,
  the confirm step closes and the motive is gone (nothing in storage either).

Read from source (signed in, not rendered):

- **Navigation** (`admin-console-contracts.ts`, `admin.tsx`): ten section
  chips in the order Personnel, Approbations, Audit, Sécurité, Actualités,
  Utilisateurs, Lots, Pépites, Données joueurs, Rapprochement joueurs. At
  390px only the first three or four fit, so Actualités is off-screen. No chip
  goes back to `/admin`; the wordmark goes to the public site. The Arabic
  Pépites chip reads "Pépites" in Latin script.
- **Dashboard** (`AdminAnalyticsDashboard.tsx`): stat tiles are plain cards.
  "Comptes", "Comptes bannis" and "Articles publiés" count things that have a
  list with a matching filter chip (`/admin/users`: Bannis; `/admin/news`:
  Publié), but neither list can be opened already filtered.
- **Article editor** (`admin.news.$articleEditionId.tsx`): Publier,
  Dépublier, Archiver and Refuser run on one press. With unsaved edits every
  status button asks a native `window.confirm("Modifications non
  enregistrées. Continuer ?")`, and "OK" publishes the last **saved** text,
  not what is on screen. The sticky toolbar holds Enregistrer and Aperçu
  only; the status buttons sit at the foot of a long form. Errors append raw
  codes: "Changement de statut impossible : … (editorial_forbidden)",
  "Chargement de l’article impossible: data_unavailable".
- **Stale sign-in** (`users/user-presentation.ts` and every route using
  `AdminDestructiveAction`): the refusal says "Déconnectez-vous,
  reconnectez-vous, puis réessayez" with no link, and the confirm step resets
  on failure, so the motive typed for the action is lost. Approvals, staff
  and the staff dossier print it as "Transition refusée: recent_auth_required".
- **Raw values**: approvals show `staff.assign_platform_admin`, `pending`,
  `not_started` and the description "Phase 7D est limitée à l’affectation
  platform_admin." Sécurité shows "Queued", "Processing", "Retry",
  "Dead-letter", "n pending" and "not_requested". Audit prints the ISO
  timestamp as is (`2026-10-06T21:14:03.123+00:00`) and the outcome in
  English. The route loading panel is labelled "Loading" for screen readers.

## What must be preserved

- Every server call, permission and the 15-minute recent-authentication rule.
  No migration, no RPC change, no change to what the database checks.
  `NEXT_STATUSES`, `FORWARD_TRANSITION`, `EDITABLE_STATUSES` and the editorial
  state machine stay as they are; the transition and save calls keep their
  arguments.
- The arming model of `destructive-action.ts`: one armed action, a motive
  stored only under the key it was typed for, reset on settle, no motive ever
  reaching another row. The confirm step still needs its own press.
- The nav stays driven by the contract list and filtered on the caller's
  permissions; every link is a link, never an authority.
- The auth redirect rules: only the existing sanitiser (`authNextSearch`,
  `sanitizeAuthCallbackNext`) decides where a sign-in returns; no new
  redirect path.
- BotolaGO's identity: kit tokens and primitives only (`UiModal`, `UiButton`,
  `UiLinkButton`, `UiAlert`, `UiChip`), no new colours or fonts, logical
  properties, 44px tap floor, no Arabic letter-spacing, dark mode on.
- Business logic: nothing about Fantasy, scoring, gameweeks, prizes or
  moderation changes. The Pépites "Publier maintenant" prompt text is another
  lane's and is not touched.

## Improvements being made

1. **Navigation.** A "Tableau de bord" chip first (لوحة المتابعة, to
   `/admin`, current only on `/admin` itself), then the sections by how often
   the owner uses them: Actualités, Lots, Utilisateurs, Pépites, Données
   joueurs, Rapprochement joueurs, then Personnel, Approbations, Audit,
   Sécurité. The Arabic Pépites chip reads جواهر, as the bottom nav does.
   Dashboard tiles that count a list become links to it, already filtered
   where the list has that filter: Comptes → Utilisateurs, Comptes bannis →
   Utilisateurs (Bannis), Articles publiés → Actualités (Publié). The two
   lists accept that filter as `?status=` on arrival; a link appears only for
   staff who can open the list.
2. **Publishing is a deliberate step.** Publier, Dépublier, Archiver and
   Refuser open the kit dialog (`UiModal`) that names the headline and says
   what happens on the site (visible now in the Actualités of its language /
   disappears from the site / not published, back through Brouillon). With
   unsaved edits, every status move opens the same dialog offering
   "Enregistrer et publier" (or "Enregistrer et …" for the move asked):
   it saves, then moves only if the save succeeded. The native
   `window.confirm` and its stale publish are gone. The step forward
   (Publier, Envoyer en relecture) is also in the sticky toolbar, on its own
   row on a phone; only one gradient button is lit at a time (Enregistrer
   while there are unsaved edits, the step forward otherwise).
3. **A stale sign-in keeps the owner's work.** When the server refuses an
   action because the sign-in is older than 15 minutes, the action shows "Se
   reconnecter" under it. It goes to the existing sign-in page with
   `next` = the current page, so a password and the second-factor code bring
   the owner back where they were. The motive typed for that action is kept
   as a draft in `sessionStorage` (recorded with the page and the action's
   own key, so it can only come back to the same action on the same object),
   restored and re-armed on return, prefilled when the same action is armed
   again, and cleared once the action succeeds or is abandoned.
4. **French and Arabic, not codes.** Approval operations, states and
   execution states in words, with the role named in the approval prompts
   ("administrateur de la plateforme") and the account it concerns; the
   approvals description rewritten; Sécurité queue and request states in
   words; Audit times in Morocco time with the app's helper, outcomes in
   words; the loading panel labelled in the reader's language; editor errors
   described without the code appended; known admin refusals described in
   words rather than as codes. The signed-out panel says **"Se connecter"**
   when no session was sent, "Se reconnecter" when the session expired, and
   keeps "Se réauthentifier" for the second-factor and recent-sign-in states;
   it returns to the page that was asked for, and the support reference is
   no longer shown to a visitor who simply is not signed in (kept for every
   other refusal, where it serves diagnosis).

## Acceptance criteria (visual and functional)

Visual:

- `/admin` signed out shows "Se connecter" / "تسجيل الدخول", no reference
  chip, no overflow at 390px and 1440px, French and Arabic, light and dark.
- The reconnect prompt under a refused action is a kit alert with a 44px
  "Se reconnecter" button, readable in light and dark, right-to-left in
  Arabic, no overflow at 390px.
- Nav: the dashboard chip is first; on `/admin` it is the selected chip and on
  a section only that section's chip is selected (source and test, not
  rendered).
- The publish dialog is the kit modal (title, description naming the
  headline, a commit button and "Abandonner"), in both languages (source and
  render test).

Functional:

- No status move runs on the first press for published, unpublished,
  archived and rejected; with unsaved edits no move runs without saving
  first, and a failed save stops the move. No `window.confirm` remains in
  the status flow.
- The same transition and save repository calls as before, with the same
  arguments.
- After a recent-sign-in refusal, the motive is in `sessionStorage`; pressing
  "Se reconnecter" goes to `/auth/login?next=<current path>`; returning to the
  page re-arms that action with the motive. A success or "Abandonner" clears
  the draft. A motive is never restored into another action or another row.
- Every new string exists in French and Arabic; tests updated deliberately,
  none removed.
