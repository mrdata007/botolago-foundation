# Subtext and UX copy overhaul (screen brief)

Owner request, 2026-10-16: the supporting text across BotolaGO (subtitles,
descriptions, helper lines, empty-state and error sentences) reads generic,
repetitive or over-explained, and some of it weakens the screens. Audit every
screen, then fix it. This brief covers every interface change in that work
(AGENTS.md, "Screen work").

Branch `claude/clever-heisenberg-pcbpxo`. Nothing is merged to `main`, deployed,
or applied to a database without the owner's approval. No database, migration,
Edge Function, production setting or production data is touched.

## How the audit was done

The running app (sample data, mock sign-in) was rendered in French and Arabic,
mobile and desktop: 101 of 108 screens and states were captured and looked at.
Six independent read-only reviews followed (screen inventory, UX writing in five
slices, sports editorial, French/Arabic localization, visual and typography,
independent critic). One writer applies the result.

## What must be preserved

- Every Fantasy rule, scoring value, deadline, price, limit and entitlement.
  Shorter wording is allowed, a different meaning is not.
- BotolaGO+ and payment wording keeps what is and is not included.
- Account deletion, security and consent statements keep their exact scope.
- Legal text (`src/content/legal/**`, privacy and terms pages): not touched.
- The brand identity, design tokens and typography. No new features and no copy
  that implies a feature that does not exist.
- French addresses the reader with _vous_ (about 500 strings against fewer than
  30 _tu_). The _tu_ share and invite messages stay as they are: owner decision.
- Arabic stays in the product's current address form (masculine singular).
- The tests that guard a rule are not edited to pass: `match-empty-states`
  (no promises before kick-off, fixed prefix), `plus.render` (banned
  vocabulary), `prospects-rename` (the Prospects naming), `delivery-promise`,
  `wording-phase-c1`, `fantasy-glossary-ar`, `launch-copy`, the SEO e2e. Only
  tests that pin a string we deliberately change are updated with that string.
- No AI-authorship notice on public content (AGENTS.md, public editorial rule).

## Improvements

1. Remove supporting text that repeats its title, repeats the screen around it
   or states the obvious, together with the spacing that belonged to it.
2. Rewrite or shorten what is kept: concrete, football-first, no marketing
   register, no "Découvrir / Explorer / Vivez", no exclamation marks.
3. One word per concept in French and in Arabic (journée / الجولة,
   Joker, créateur, règles, moments forts, and so on).
4. Correct copy that is wrong or promises something the app does not do.
5. Fix Arabic wording that reads as a literal translation, and the places where
   French and Arabic said different things.

## Not in scope (reported, not changed)

- Emails, push text and the notification templates seeded by migrations: they
  need an Edge deploy or a migration, which needs the owner's approval.
- Dead dictionary keys (about 250): not shown to anyone, and deleting them moves
  the i18n gate baselines. A separate cleanup.
- Decisions that belong to the owner (listed in the final report): _tu_ for
  Fantasy, "أفضل 10" versus "توب 10", the lifecycle words (Verrouillée,
  Clôturée, Définitive), "Saison" versus "accès", the "gratuit" claim next to a
  paid Saison, the account-deletion retention sentence.

## Changes beyond text (declared, each small)

Found while removing text; kept because the screen was wrong without them.
Each one is listed here so the reviewer can ask for any to be reverted.

- Positive badge text colour (`UiBadge` tone `positive`, `ui-kit/primitives.tsx`):
  the "Score exact · 3 pts" chip measured 3.64:1 (light theme); it now reads
  5.69:1 (dark: 7.26:1 to 8.52:1). The same tone is used by the fixture
  "double" badge, the fixture prediction card and the Curva rating-change chip.
- League join screen: the disabled "Classique / Face à face" control is gone,
  because it advertised a mode that does not exist.
- Club page: a live match is labelled "En direct", not "Prochain match"; the
  News section is hidden for a club with no article.
- Prospects title and Pronostics header: the separator no longer dangles at a
  line end (`PepitesSplitTitle`, a stacked layout under 640 px).
- Landing: the hero keeps a reserved height only where it needs one, and the
  Arabic deadline date and time stay in one unit.
- Copy bugs: resending a verification code confirms with its own message
  (new key `auth.verify.resend_done`); the saved-articles sign-in reason goes
  through the dictionary (new key `news.saved.sign_in_reason`) so Arabic readers
  no longer see French; one Prospects compare prompt has a new key.

Reverted after the final review because they changed behaviour: the success
toasts after sign-in and password update, and the error handling of four
components that are not mounted anywhere.

## Acceptance criteria

Functional: no behaviour change; `tsc`, ESLint, the i18n gate and the existing
tests pass, apart from the one Morocco Ramadan clock test that already fails on
`main`. Before and after: every dictionary key keeps the same placeholders in
French and Arabic.

Visual: on mobile (390 px) and desktop (1366 px), in French and Arabic, the
changed screens show no hole where text was removed, no overflow or truncation,
no orphaned separator, and a clear hierarchy (title, then the action). Arabic
keeps its right-to-left alignment and its number and Latin-text isolation.
Evidence: before and after screenshots of the changed screens.
