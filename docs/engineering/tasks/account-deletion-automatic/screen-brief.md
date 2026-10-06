# Screen brief: automatic account deletion

Owner decision 2026-10-06: deleting an account from inside the app must
actually delete it, automatically, with any delay stated and honoured (App
Store guideline 5.1.1(v), Google Play account-deletion policy). This brief
covers the two screens that change; the database and worker side is in
`docs/backend/ACCOUNT_DELETION_RUNBOOK.md`. It was written after inspecting
the current screens and before any interface change (AGENTS.md, "Screen
work", rule 3).

## Screens

1. **Profile > Supprimer le compte** (`src/routes/profile.tsx`,
   `DeleteAccountSection`): the danger-zone row and its confirmation dialog.
2. **New public page `/suppression-compte`** (`src/routes/suppression-compte.tsx`):
   how deletion works, for Google Play's "delete account URL" and for anyone
   who cannot open the app. Linked from the dialog and under the privacy
   policy.

## What exists today (inspected 2026-10-06)

- The danger zone is the last section of the signed-in Profile: a heading
  ("Supprimer le compte"), one row in a card washed in the negative tint, a
  trash disc, "Supprimer mon compte" and a one-line description.
- The row opens a modal: title, body ("Votre profil, votre équipe Fantasy et
  vos préférences seront supprimés définitivement…"), an acknowledgement
  checkbox on a negative plate that unlocks a destructive "Supprimer
  définitivement" button, and "Annuler".
- On success the row turns into a "Suppression demandée" panel with "Annuler
  la suppression"; the copy says the request can be cancelled "tant qu'elle
  n'a pas été traitée". Nothing ever processed it, and no timeline is stated.
- A refused request because the session owes its second factor shows the
  shared step-up notice, not a generic error.

## What must be preserved

- Placement, heading, card tint, row anatomy and icon of the danger zone; it
  stays the last section of Profile and stays visually distinct.
- The modal pattern: the acknowledgement checkbox gates the destructive
  button; "Annuler" closes without effect; the focus ring and tap target on
  the checkbox plate.
- The step-up behaviour: `mfa_required` shows `showStepUpNotice(t)`, every
  other refusal shows `profile.delete_error_toast`.
- BotolaGO's identity: ui-kit components and tokens only, no new colours, no
  new fonts. French and Arabic, with right-to-left layout in Arabic.
- Business logic: nothing about Fantasy rules, scoring, the gameweek
  lifecycle or prizes changes on screen.

## Improvements

1. The row description and the dialog say exactly what happens and when:
   the account is closed immediately (signed out on every device, cannot
   sign in, removed from public rankings), erased for good within 7 days,
   cannot be cancelled; what is kept (paid-prize accounting records, security
   logs for 12 months) is named; a link opens `/suppression-compte`.
2. The pending/cancel panel goes: the account is signed out the moment it
   asks, so there is no session left to show it to, and nothing to cancel.
3. On success the device lands on `/suppression-compte?confirmation=1`, which
   opens with a confirmation panel (closed now, erased within 7 days, a
   confirmation e-mail when it is done).
4. A device that still holds a session when the account was deleted elsewhere
   is signed out and sent to the same page (`AuthProvider` standing check).
5. `/suppression-compte`: public, no sign-in, FR and AR through the i18n
   dictionaries: how to delete in the app (Profil > Supprimer le compte >
   Supprimer mon compte), by e-mail to support@botolago.com from the
   account's address, what is deleted, what is kept and for how long.
6. The privacy policy page gets a short link to `/suppression-compte` under
   the document (the generated policy text itself is not edited).

## Acceptance criteria

Visual:

- Danger zone and modal look as before apart from the text; no layout
  shift, no overflow at 320 px, 390 px and 1280 px wide, in FR and AR.
- Arabic renders right to left on both screens (dialog text, list bullets,
  page headings), with Latin e-mail addresses kept readable.
- `/suppression-compte` uses the app shell and ui-kit typography like the
  legal pages; it is readable signed out.

Functional:

- Confirming calls `api.request_account_deletion()` once; on success the
  device is signed out and navigates to `/suppression-compte?confirmation=1`.
- `mfa_required` shows the step-up notice and leaves the user signed in.
- No code path calls `cancelAccountDeletion` or reads a pending state.
- `/suppression-compte` is reachable while a second factor is owed, is in the
  sitemap, and has FR metadata server-side like `/privacy`.
- Every new string exists in both dictionaries (the i18n gate passes).

Tests: `bun test` for the touched services, routes and dictionaries,
`bun run typecheck`, eslint and prettier on touched files.
