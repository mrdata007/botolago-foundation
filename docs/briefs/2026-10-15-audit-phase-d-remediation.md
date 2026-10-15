# Audit remediation, Phase D (screen brief)

Owner request, 2026-10-15: after Phase C was merged (pull request 495), start
Phase D of the 2026-10-14 audit roadmap: engagement and longer-term
differentiation, plus the saved-articles follow-up left open in Phase B. This
brief covers every interface change in that work (AGENTS.md, "Screen work").

Branch `claude/friendly-turing-ry5fcs` (restarted from `main` after the merge),
with one short-lived lane branch per topic merged into it. Nothing is merged to
`main`, deployed or applied to a database without the owner's approval. No
production data, job or setting is touched.

## Owner decisions given on 2026-10-15

- Pinch zoom: keep the cap as it is (MOB-01 closed, no change).
- First paint in Arabic: keep today's behaviour (LOC-05, no code).
- Legal text (الرقاقات): keep as it is.
- Notification language: French by default.
- Phase C wording was read and accepted by the owner.
- The owner runs the database scripts; no lane applies a migration.

## What must be preserved

- Every Fantasy scoring rule, guard, deadline and the server's authority; the
  Phase A, B and C fixes (see `docs/audits/`).
- The brand identity, design tokens, French and Arabic (right-to-left) layouts.
- Analytics stays production-host-only, name-only and privacy-preserving: no
  user, team, token, email, league or query-string identifier is ever sent.
- Free-play commitments: no checkout, price or paid tier is inferred or added.
- Published copy never carries an AI-authorship notice.
- No database writes; a migration may be written as a new file only if a lane
  cannot do without one, and is never run. A lane that thinks it needs one
  stops and reports.

## Improvements

| Lane | Finding / item                  | Change                                                                                                                                                                                                 |
| ---- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| D0   | Phase B follow-up (news.ts cap) | The saved-articles list says honestly when an account has more than 2,000 saved articles, and never treats a partial set as the whole one.                                                             |
| D1   | UX-011, PRO-02                  | The first-visit landing offers an immediate, explicit "see today's matches" action next to the game call to action; `/jouer` stays the explicit Fantasy destination. The route for `/` is not changed. |
| D2   | PRO-05                          | Define "active management" and its denominators; add name-only events for server-confirmed management actions only if the existing events cannot answer it; read-only queries written, not run.        |
| D5   | Sharing (roadmap D5)            | Invite and recap links return to the right context and privacy state; copy/file fallbacks work; fix defects found.                                                                                     |
| DN   | Owner decision: French default  | A new account's notification language defaults to French, not to the device language; stored language wins for existing accounts.                                                                      |
| DR   | Roadmap D3, D4, D6              | Written protocols and evidence checklists (delivery evidence, Curva comprehension test, Botola depth): documents only, no code.                                                                        |

Not in this work: VIS-002 to VIS-005 (need product input and image rights),
MOB-01, LOC-09, and the Phase A to C launch blockers (capacity and release
evidence, SEC-01 outside the lease, owner-run database scripts).

## Acceptance criteria

- French and Arabic copy exist for every new or changed string, with matching
  keys and placeholders in both dictionaries.
- Right-to-left: no new physical left/right styles; numbers, scores and codes
  stay readable inside Arabic text.
- Mobile and desktop: no new overflow (measured by element bounds, not
  `scrollWidth`); every new or changed control keeps a 44px target.
- Each fixed finding has a regression test that fails on the old code and
  passes on the new, and the existing tests of the touched area still pass.
- `bun run typecheck`, the i18n gate (baselines must match what it measures),
  eslint and prettier on touched files pass.
- Anything that cannot be verified here (a real device, a screen reader, real
  supporters, a native Arabic read, a deployed backend) is reported as not run,
  never as passed, and no conversion or retention gain is claimed without a
  measurement.

## Lane D1 notes: first-visit match path (UX-011, PRO-02)

Written before any interface change, after inspecting the landing on fresh
storage (no `botolago.welcomed`), signed out, in French and Arabic at 320, 390
and 1440 px wide, in a local development server (sample data, not production).

**What the first visit shows today.** The hero holds the kicker, the promise,
the gradient game button ("Créer mon équipe" / "إنشاء فريقي"), a ringed
"Comment ça marche" / "كيف تلعب؟" button that scrolls to the page's own
explanation, and the demonstration pitch. The real matches ("En ce moment")
start below the hero: at 390 px the section starts about 1,224 px down (a
viewport of 800 px), the first match card about 1,470 px down; at 320 px about
1,367 and 1,655 px; at 1440 px about 800 px and 1,017 px. The only links to
`/matches` are inside that section ("Tout le calendrier") and at the very
bottom of the page ("Voir les matchs", about 4,200 to 4,800 px down on phones).
So a visitor who came for today's football meets the game's call to action
first, and reaches a match after scrolling about two screens on a phone.

**What must be preserved.** The route logic for `/` (the landing shows only to
an anonymous first visit; the server renders Home); the game button as the
page's one primary action, with its states, tracking and placements; `/jouer`
as the explicit Fantasy destination; the "how it works" anchor; the matches and
table block, the bottom "Voir les matchs" invitation; name-only, production-only
analytics; no claim of any effect on sign-ups; the French and Arabic layouts.

**The change.** One explicit secondary action in the hero, directly under the
game button: "Voir les matchs du jour" / "شاهد مباريات اليوم", a link to
`/matches` (which opens on the current match day). It takes the ringed
secondary style; "Comment ça marche" becomes a quieter text link so the hero
keeps three levels (game, matches, explanation) and the game button stays the
only filled one. Leaving the landing by it counts as the welcome, like every
other link on the page (`onLeave`). Logical styles only, a 44 px target, an
accessible name that is its visible text.

**Analytics.** The funnel counts only the game button (`landing_cta_*` fire for
the "create" action). A matches click is not a funnel step, no existing event
covers it, and none is added in this lane: adding one is a measurement
decision for the owner, and nothing here claims a conversion gain.

**Acceptance criteria.**

- A rendered test finds the new link with `href="/matches"` in the hero in
  French and Arabic and fails on the old code; French and Arabic keys match.
- Steps from a first visit to the day's match list: before, scroll about two
  screens then a tap (on a match card or on "Tout le calendrier"); after, one
  tap, no scroll, from the first screen at 320, 390 and 1440 px.
- The game button is still first in the hero and the only gradient button; the
  new link and the anchor keep 44 px or more in height; no hero element leaves
  the viewport sideways at 320, 390 or 1440 px in French or Arabic (measured by
  element bounds); the hero's reserved height does not shift when the session
  arrives.
- `landing-cta-*` tracking tests and the landing and i18n tests still pass.
